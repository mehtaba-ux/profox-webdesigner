-- Secure project-chat performance hardening.
-- Keeps the existing project-scoped authorization model intact while reducing polling,
-- preventing message floods, maintaining O(1) unread counts, and strengthening grant integrity.

-- 1) Complete the centralized Delivery role family used by project chat.
create or replace function public.internal_chat_is_delivery_role(p_role text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select public.internal_chat_normalize_role(p_role) = any (
    array[
      'content_writer','contentwriter','content_creator','contentcreator','editor',
      'developer','web_developer','webdeveloper','developer_designer',
      'uiux_designer','uiuxdesigner','ui_designer','ux_designer','web_designer','website_designer','designer',
      'qa','qa_engineer','quality_assurance','quality_assurance_engineer'
    ]::text[]
  );
$function$;

-- 2) Maintain unread counters on the thread so list rendering does not COUNT messages per thread.
alter table public.internal_chat_threads
  add column if not exists participant_one_unread_count integer not null default 0,
  add column if not exists participant_two_unread_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='internal_chat_threads_participant_one_unread_nonnegative'
      and conrelid='public.internal_chat_threads'::regclass
  ) then
    alter table public.internal_chat_threads
      add constraint internal_chat_threads_participant_one_unread_nonnegative
      check (participant_one_unread_count >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='internal_chat_threads_participant_two_unread_nonnegative'
      and conrelid='public.internal_chat_threads'::regclass
  ) then
    alter table public.internal_chat_threads
      add constraint internal_chat_threads_participant_two_unread_nonnegative
      check (participant_two_unread_count >= 0);
  end if;
end;
$$;

update public.internal_chat_threads t
set
  participant_one_unread_count = coalesce((
    select count(*)::integer
    from public.internal_chat_messages m
    where m.thread_id=t.id
      and m.sender_id<>t.participant_one
      and m.created_at>t.participant_one_last_read_at
  ),0),
  participant_two_unread_count = coalesce((
    select count(*)::integer
    from public.internal_chat_messages m
    where m.thread_id=t.id
      and m.sender_id<>t.participant_two
      and m.created_at>t.participant_two_last_read_at
  ),0);

-- 3) Internal message flood protection. One row per user means no unbounded rate-limit table growth.
create table if not exists public.internal_chat_message_rate_limits (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  message_count integer not null default 0,
  last_message_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint internal_chat_message_rate_limits_count check (message_count between 0 and 30)
);

alter table public.internal_chat_message_rate_limits enable row level security;
revoke all on table public.internal_chat_message_rate_limits from public, anon, authenticated;
grant select on table public.internal_chat_message_rate_limits to service_role;

create or replace function public.internal_chat_consume_message_rate_limit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rate public.internal_chat_message_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Authentication required.';
  end if;

  insert into public.internal_chat_message_rate_limits(user_id, window_started_at, message_count, updated_at)
  values (p_user_id, v_now, 0, v_now)
  on conflict (user_id) do nothing;

  select * into v_rate
  from public.internal_chat_message_rate_limits
  where user_id=p_user_id
  for update;

  if v_rate.window_started_at <= v_now - interval '1 minute' then
    update public.internal_chat_message_rate_limits
    set window_started_at=v_now,
        message_count=1,
        last_message_at=v_now,
        updated_at=v_now
    where user_id=p_user_id;
  else
    if v_rate.message_count >= 30 then
      raise exception 'Too many chat messages. Please wait a moment and try again.';
    end if;
    update public.internal_chat_message_rate_limits
    set message_count=message_count+1,
        last_message_at=v_now,
        updated_at=v_now
    where user_id=p_user_id;
  end if;
end;
$function$;

revoke all on function public.internal_chat_consume_message_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.internal_chat_consume_message_rate_limit(uuid) to service_role;

-- 4) Strengthen delivery/client grant referential integrity and lifecycle metadata.
alter table public.project_delivery_client_chat_grants
  add column if not exists revoked_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='project_delivery_client_chat_grants_customer_user_id_fkey'
      and conrelid='public.project_delivery_client_chat_grants'::regclass
  ) then
    alter table public.project_delivery_client_chat_grants
      add constraint project_delivery_client_chat_grants_customer_user_id_fkey
      foreign key (customer_user_id) references public.user_profiles(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='project_delivery_client_chat_grants_delivery_user_id_fkey'
      and conrelid='public.project_delivery_client_chat_grants'::regclass
  ) then
    alter table public.project_delivery_client_chat_grants
      add constraint project_delivery_client_chat_grants_delivery_user_id_fkey
      foreign key (delivery_user_id) references public.user_profiles(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='project_delivery_client_chat_grants_granted_by_fkey'
      and conrelid='public.project_delivery_client_chat_grants'::regclass
  ) then
    alter table public.project_delivery_client_chat_grants
      add constraint project_delivery_client_chat_grants_granted_by_fkey
      foreign key (granted_by) references public.user_profiles(id) on delete restrict;
  end if;
end;
$$;

create index if not exists project_delivery_client_chat_grants_expiry_idx
  on public.project_delivery_client_chat_grants(expires_at)
  where is_active and expires_at is not null;

create or replace function public.internal_chat_validate_client_chat_grant_row()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_project_client_id uuid;
  v_linked_user_id uuid;
  v_delivery_role text;
begin
  select pr.client_id into v_project_client_id
  from public.projects pr
  where pr.id=new.project_id;

  if v_project_client_id is null or v_project_client_id is distinct from new.client_id then
    raise exception 'Client-chat grant does not match the project client.';
  end if;

  select c.linked_user_id into v_linked_user_id
  from public.clients c
  where c.id=new.client_id;

  if v_linked_user_id is null or v_linked_user_id is distinct from new.customer_user_id then
    raise exception 'Client-chat grant does not match the linked Client Portal identity.';
  end if;

  select p.role into v_delivery_role
  from public.user_profiles p
  where p.id=new.delivery_user_id;

  if not public.internal_chat_is_delivery_role(v_delivery_role) then
    raise exception 'Client-chat grants can only target Delivery roles.';
  end if;

  return new;
end;
$function$;

revoke all on function public.internal_chat_validate_client_chat_grant_row() from public, anon, authenticated;

drop trigger if exists internal_chat_validate_client_chat_grant_row_trg on public.project_delivery_client_chat_grants;
create trigger internal_chat_validate_client_chat_grant_row_trg
before insert or update of project_id, client_id, customer_user_id, delivery_user_id
on public.project_delivery_client_chat_grants
for each row execute function public.internal_chat_validate_client_chat_grant_row();

-- 5) Permit revocation even after a Delivery assignment has already ended, while keeping grants strict.
create or replace function public.internal_chat_set_delivery_client_access(
  p_project_id uuid,
  p_delivery_user_id uuid,
  p_allow boolean,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_customer_user_id uuid;
  v_delivery_role text;
  v_grant_id uuid;
  v_thread_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  if p_project_id is null or p_delivery_user_id is null then
    raise exception 'Project and delivery member are required.';
  end if;
  if not public.internal_chat_can_manage_client_chat(p_project_id, v_uid) then
    raise exception 'You are not authorized to manage client chat for this project.';
  end if;

  select pr.client_id, c.linked_user_id
    into v_client_id, v_customer_user_id
  from public.projects pr
  join public.clients c on c.id=pr.client_id
  where pr.id=p_project_id;

  if v_client_id is null or v_customer_user_id is null then
    raise exception 'This project does not have an active linked Client Portal identity.';
  end if;

  if coalesce(p_allow,false) then
    if not public.internal_chat_customer_has_project_access(p_project_id, v_customer_user_id) then
      raise exception 'The linked customer is not currently eligible for project chat.';
    end if;

    select p.role into v_delivery_role
    from public.user_profiles p
    where p.id=p_delivery_user_id
      and lower(coalesce(p.status,''))='active';

    if not public.internal_chat_is_delivery_role(v_delivery_role)
       or not public.internal_chat_user_has_project_access(p_project_id,p_delivery_user_id) then
      raise exception 'Choose an active delivery member assigned to this project.';
    end if;

    if p_expires_at is not null and p_expires_at<=now() then
      raise exception 'Expiry must be in the future.';
    end if;

    insert into public.project_delivery_client_chat_grants (
      project_id, client_id, customer_user_id, delivery_user_id, granted_by,
      is_active, granted_at, revoked_at, expires_at, revoked_reason, updated_at
    ) values (
      p_project_id, v_client_id, v_customer_user_id, p_delivery_user_id, v_uid,
      true, now(), null, p_expires_at, null, now()
    )
    on conflict (project_id, customer_user_id, delivery_user_id)
    do update set
      client_id=excluded.client_id,
      granted_by=excluded.granted_by,
      is_active=true,
      granted_at=now(),
      revoked_at=null,
      expires_at=excluded.expires_at,
      revoked_reason=null,
      updated_at=now()
    returning id into v_grant_id;

    perform public.internal_chat_record_access_audit(
      'client_chat_granted', p_project_id, p_delivery_user_id,
      'project_delivery_client_chat_grants', v_grant_id,
      v_customer_user_id, null,
      jsonb_build_object('expires_at',p_expires_at)
    );
  else
    update public.project_delivery_client_chat_grants g
    set is_active=false,
        revoked_at=now(),
        revoked_reason='manual',
        updated_at=now()
    where g.project_id=p_project_id
      and g.customer_user_id=v_customer_user_id
      and g.delivery_user_id=p_delivery_user_id
      and g.is_active
    returning g.id into v_grant_id;

    if v_grant_id is null then
      raise exception 'No active client-chat grant exists for this delivery member.';
    end if;

    select t.id into v_thread_id
    from public.internal_chat_threads t
    where t.project_id=p_project_id
      and v_customer_user_id in (t.participant_one,t.participant_two)
      and p_delivery_user_id in (t.participant_one,t.participant_two)
    limit 1;

    perform public.internal_chat_record_access_audit(
      'client_chat_revoked', p_project_id, p_delivery_user_id,
      'project_delivery_client_chat_grants', v_grant_id,
      v_customer_user_id, v_thread_id,
      jsonb_build_object('reason','manual')
    );
  end if;

  return v_grant_id;
end;
$function$;

revoke all on function public.internal_chat_set_delivery_client_access(uuid,uuid,boolean,timestamptz) from public, anon;
grant execute on function public.internal_chat_set_delivery_client_access(uuid,uuid,boolean,timestamptz) to authenticated;

-- 6) Automatic cleanup for expired or no-longer-valid client-chat grants.
create or replace function public.internal_chat_reconcile_client_chat_grants()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row record;
  v_count integer := 0;
  v_reason text;
begin
  for v_row in
    select g.*
    from public.project_delivery_client_chat_grants g
    where g.is_active
      and (
        (g.expires_at is not null and g.expires_at<=now())
        or not public.internal_chat_customer_has_project_access(g.project_id,g.customer_user_id)
        or not public.internal_chat_user_has_project_access(g.project_id,g.delivery_user_id)
      )
    for update
  loop
    v_reason := case
      when v_row.expires_at is not null and v_row.expires_at<=now() then 'expired'
      else 'project_access_ended'
    end;

    update public.project_delivery_client_chat_grants
    set is_active=false,
        revoked_at=now(),
        revoked_reason=v_reason,
        updated_at=now()
    where id=v_row.id;

    perform public.internal_chat_record_access_audit(
      case when v_reason='expired' then 'client_chat_expired' else 'client_chat_auto_revoked' end,
      v_row.project_id,
      v_row.delivery_user_id,
      'project_delivery_client_chat_grants',
      v_row.id,
      v_row.customer_user_id,
      null,
      jsonb_build_object('reason',v_reason)
    );

    v_count := v_count+1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.internal_chat_reconcile_client_chat_grants() from public, anon, authenticated;
grant execute on function public.internal_chat_reconcile_client_chat_grants() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='profox-internal-chat-grant-reconcile' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'profox-internal-chat-grant-reconcile',
    '*/15 * * * *',
    'select public.internal_chat_reconcile_client_chat_grants();'
  );
end;
$$;

-- 7) Replace message and read RPCs with rate-limited/unread-counter versions.
create or replace function public.internal_chat_send_message(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body,''));
  v_message_id uuid;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  if not public.internal_chat_can_access_thread(p_thread_id) then
    raise exception 'Conversation access denied.';
  end if;
  if char_length(v_body)<1 or char_length(v_body)>4000 then
    raise exception 'Message must be between 1 and 4000 characters.';
  end if;

  perform public.internal_chat_consume_message_rate_limit(v_uid);

  insert into public.internal_chat_messages(thread_id,sender_id,body,created_at)
  values (p_thread_id,v_uid,v_body,v_now)
  returning id into v_message_id;

  update public.internal_chat_threads
  set
    last_message_preview=left(v_body,180),
    last_message_sender_id=v_uid,
    last_message_at=v_now,
    updated_at=v_now,
    participant_one_last_read_at=case when participant_one=v_uid then v_now else participant_one_last_read_at end,
    participant_two_last_read_at=case when participant_two=v_uid then v_now else participant_two_last_read_at end,
    participant_one_unread_count=case
      when participant_one=v_uid then 0
      else least(participant_one_unread_count+1,2147483647)
    end,
    participant_two_unread_count=case
      when participant_two=v_uid then 0
      else least(participant_two_unread_count+1,2147483647)
    end
  where id=p_thread_id;

  return v_message_id;
end;
$function$;

create or replace function public.internal_chat_mark_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null or not public.internal_chat_can_access_thread(p_thread_id) then
    raise exception 'Conversation access denied.';
  end if;

  update public.internal_chat_threads
  set
    participant_one_last_read_at=case when participant_one=v_uid then v_now else participant_one_last_read_at end,
    participant_two_last_read_at=case when participant_two=v_uid then v_now else participant_two_last_read_at end,
    participant_one_unread_count=case when participant_one=v_uid then 0 else participant_one_unread_count end,
    participant_two_unread_count=case when participant_two=v_uid then 0 else participant_two_unread_count end,
    updated_at=v_now
  where id=p_thread_id;
end;
$function$;

-- O(1) unread rendering from maintained counters.
drop function if exists public.internal_chat_list_threads();
create function public.internal_chat_list_threads()
returns table(
  project_id uuid,
  project_name text,
  thread_id uuid,
  other_user_id uuid,
  other_full_name text,
  other_role text,
  other_department text,
  other_avatar_url text,
  last_message_preview text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  select
    t.project_id,
    pr.project_name::text,
    t.id,
    other.id,
    coalesce(nullif(other.full_name,''),other.email,'Project contact')::text,
    other.role::text,
    case when public.internal_chat_is_customer_role(other.role) then 'Client'
         else coalesce(other.department,'General') end::text,
    coalesce(other.avatar_url,'')::text,
    coalesce(t.last_message_preview,'')::text,
    t.last_message_sender_id,
    t.last_message_at,
    case
      when t.participant_one=v_uid then t.participant_one_unread_count::bigint
      else t.participant_two_unread_count::bigint
    end
  from public.internal_chat_threads t
  join public.projects pr on pr.id=t.project_id
  join public.user_profiles other
    on other.id=case when t.participant_one=v_uid then t.participant_two else t.participant_one end
  where v_uid in (t.participant_one,t.participant_two)
    and public.internal_chat_can_access_thread(t.id)
  order by coalesce(t.last_message_at,t.created_at) desc;
end;
$function$;

revoke all on function public.internal_chat_list_threads() from public, anon;
grant execute on function public.internal_chat_list_threads() to authenticated, service_role;
revoke all on function public.internal_chat_send_message(uuid,text) from public, anon;
grant execute on function public.internal_chat_send_message(uuid,text) to authenticated, service_role;
revoke all on function public.internal_chat_mark_read(uuid) from public, anon;
grant execute on function public.internal_chat_mark_read(uuid) to authenticated, service_role;

-- 8) Publish only the RLS-protected chat tables required for Realtime UI updates.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='internal_chat_messages'
  ) then
    alter publication supabase_realtime add table public.internal_chat_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='internal_chat_threads'
  ) then
    alter publication supabase_realtime add table public.internal_chat_threads;
  end if;
end;
$$;
