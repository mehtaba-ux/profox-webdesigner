-- Expired Zoho sessions cannot be edited. When an ended ProFox meeting is
-- rescheduled into the future, preserve the internal meeting/interview identity
-- but rotate the provider mapping so the worker creates a fresh Zoho session/event.

create table if not exists public.meeting_provider_rotations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.sales_meetings(id) on delete cascade,
  provider text not null,
  reason text not null,
  old_start_at timestamptz,
  old_end_at timestamptz,
  new_start_at timestamptz,
  new_end_at timestamptz,
  old_external_event_id text,
  old_external_meeting_id text,
  old_join_url text,
  old_host_url text,
  rotated_at timestamptz not null default now()
);

create index if not exists idx_meeting_provider_rotations_meeting
  on public.meeting_provider_rotations(meeting_id, rotated_at desc);

alter table public.meeting_provider_rotations enable row level security;
revoke all on table public.meeting_provider_rotations from public, anon, authenticated;

create or replace function public.rotate_expired_zoho_provider_links_before_reschedule()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_event_id text;
  v_external_meeting_id text;
  v_join_url text;
  v_host_url text;
begin
  -- Only a genuine move from an already-ended meeting into the future needs
  -- a provider rotation. Ordinary future reschedules continue updating the
  -- existing Zoho session/event.
  if new.start_at is not distinct from old.start_at
     or old.end_at > now()
     or new.start_at <= now()
     or new.status not in ('Scheduled','Rescheduled') then
    return new;
  end if;

  -- Never disturb a meeting explicitly locked to Google.
  if exists(
    select 1 from public.google_calendar_event_links g
    where g.meeting_id=old.id
  ) then
    return new;
  end if;

  select z.external_event_id
  into v_event_id
  from public.zoho_calendar_event_links z
  where z.meeting_id=old.id;

  select p.external_meeting_id,p.join_url,p.host_url
  into v_external_meeting_id,v_join_url,v_host_url
  from public.meeting_provider_private_links p
  where p.meeting_id=old.id and p.provider='zoho_meeting';

  if nullif(coalesce(v_event_id,''),'') is null
     and nullif(coalesce(v_external_meeting_id,''),'') is null then
    return new;
  end if;

  insert into public.meeting_provider_rotations(
    meeting_id,provider,reason,
    old_start_at,old_end_at,new_start_at,new_end_at,
    old_external_event_id,old_external_meeting_id,old_join_url,old_host_url
  )
  values(
    old.id,'zoho','expired_session_rescheduled',
    old.start_at,old.end_at,new.start_at,new.end_at,
    v_event_id,v_external_meeting_id,v_join_url,v_host_url
  );

  -- These mappings represent the expired provider occurrence. Removing only
  -- the active mappings lets the existing sync worker safely create a fresh
  -- upcoming Zoho Meeting and Calendar event for the same ProFox meeting.
  delete from public.zoho_calendar_event_links
  where meeting_id=old.id;

  delete from public.meeting_provider_private_links
  where meeting_id=old.id and provider='zoho_meeting';

  new.external_calendar_id:=null;
  new.external_event_id:=null;
  new.meeting_url:='';
  new.sync_status:='Pending';
  new.sync_error:=null;

  return new;
end;
$$;

revoke all on function public.rotate_expired_zoho_provider_links_before_reschedule()
  from public,anon,authenticated;

drop trigger if exists sales_meetings_00_rotate_expired_zoho_provider_links
  on public.sales_meetings;

create trigger sales_meetings_00_rotate_expired_zoho_provider_links
before update of start_at,end_at,status on public.sales_meetings
for each row
execute function public.rotate_expired_zoho_provider_links_before_reschedule();

-- Repair any future meeting currently stuck because an earlier reschedule
-- attempted to edit an expired Zoho session. Preserve the old provider
-- metadata in the audit table, clear only the active mappings, and force the
-- existing deduplicated sync job back to pending.
do $$
declare
  r record;
  v_event_id text;
  v_external_meeting_id text;
  v_join_url text;
  v_host_url text;
begin
  for r in
    select distinct
      m.id,
      m.salesperson_id,
      m.start_at,
      m.end_at
    from public.sales_meetings m
    join public.zoho_calendar_sync_jobs j on j.meeting_id=m.id
    where m.status in ('Scheduled','Rescheduled')
      and m.start_at>now()
      and j.status='dead_letter'
      and j.last_error ilike '%Past sessions cannot be edited%'
  loop
    select z.external_event_id
    into v_event_id
    from public.zoho_calendar_event_links z
    where z.meeting_id=r.id;

    select p.external_meeting_id,p.join_url,p.host_url
    into v_external_meeting_id,v_join_url,v_host_url
    from public.meeting_provider_private_links p
    where p.meeting_id=r.id and p.provider='zoho_meeting';

    if nullif(coalesce(v_event_id,''),'') is not null
       or nullif(coalesce(v_external_meeting_id,''),'') is not null then
      insert into public.meeting_provider_rotations(
        meeting_id,provider,reason,
        old_start_at,old_end_at,new_start_at,new_end_at,
        old_external_event_id,old_external_meeting_id,old_join_url,old_host_url
      )
      values(
        r.id,'zoho','repair_after_expired_session_reschedule',
        null,null,r.start_at,r.end_at,
        v_event_id,v_external_meeting_id,v_join_url,v_host_url
      );

      delete from public.zoho_calendar_event_links where meeting_id=r.id;
      delete from public.meeting_provider_private_links
      where meeting_id=r.id and provider='zoho_meeting';

      update public.sales_meetings
      set external_calendar_id=null,
          external_event_id=null,
          meeting_url='',
          sync_status='Pending',
          sync_error=null,
          updated_at=now()
      where id=r.id;
    end if;

    perform public.queue_zoho_calendar_sync(
      r.salesperson_id,'upsert_event',r.id,true
    );
  end loop;
end;
$$;
