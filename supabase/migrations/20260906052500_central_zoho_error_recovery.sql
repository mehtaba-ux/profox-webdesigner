create or replace function public.service_central_zoho_managed()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
    from public.zoho_service_calendar_connection c
    join public.system_configuration s on s.config_key='professional_integrations'
    where c.singleton_key='primary'
      and c.status in ('connected','error','reconnect_required')
      and c.meeting_ready
      and c.refresh_secret_id is not null
      and nullif(c.calendar_id,'') is not null
      and nullif(c.meeting_org_id,'') is not null
      and nullif(c.presenter_zuid,'') is not null
      and coalesce((s.config_value->>'zohoCalendarEnabled')::boolean,false)
      and coalesce((s.config_value->>'zohoMeetingEnabled')::boolean,false)
  );
$$;
revoke all on function public.service_central_zoho_managed() from public,anon,authenticated;
grant execute on function public.service_central_zoho_managed() to service_role;

create or replace function public.service_central_zoho_worker_ready()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
    from public.zoho_service_calendar_connection c
    join public.system_configuration s on s.config_key='professional_integrations'
    where c.singleton_key='primary'
      and c.status in ('connected','error')
      and c.meeting_ready
      and c.refresh_secret_id is not null
      and nullif(c.calendar_id,'') is not null
      and nullif(c.meeting_org_id,'') is not null
      and nullif(c.presenter_zuid,'') is not null
      and coalesce((s.config_value->>'zohoCalendarEnabled')::boolean,false)
      and coalesce((s.config_value->>'zohoMeetingEnabled')::boolean,false)
  );
$$;
revoke all on function public.service_central_zoho_worker_ready() from public,anon,authenticated;
grant execute on function public.service_central_zoho_worker_ready() to service_role;

create or replace function public.service_effective_calendar_provider(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_provider text; v_cfg jsonb:='{}'::jsonb;
begin
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  if coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google')='zoho'
     and coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false)
     and public.service_central_zoho_managed() then
    return 'zoho';
  end if;
  select calendar_provider into v_provider from public.staff_professional_accounts where user_id=p_user_id;
  if v_provider in('google','zoho') then return v_provider; end if;
  v_provider:=coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  if v_provider='zoho' and not public.service_central_zoho_managed() then return 'google'; end if;
  return case when v_provider in('google','zoho') then v_provider else 'google' end;
end;
$$;

create or replace function public.service_effective_meeting_provider(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_provider text; v_cfg jsonb:='{}'::jsonb;
begin
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  if coalesce(nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet')='zoho_meeting'
     and coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false)
     and public.service_central_zoho_managed() then
    return 'zoho_meeting';
  end if;
  select meeting_provider into v_provider from public.staff_professional_accounts where user_id=p_user_id;
  if v_provider in('google_meet','zoho_meeting') then return v_provider; end if;
  v_provider:=coalesce(nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet');
  if v_provider='zoho_meeting' and not public.service_central_zoho_managed() then return 'google_meet'; end if;
  return case when v_provider in('google_meet','zoho_meeting') then v_provider else 'google_meet' end;
end;
$$;

create or replace function public.service_meeting_external_provider(p_meeting_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_owner uuid; v_provider text;
begin
  select salesperson_id into v_owner from public.sales_meetings where id=p_meeting_id;
  if not found then return null; end if;
  if exists(select 1 from public.google_calendar_event_links where meeting_id=p_meeting_id) then return 'google'; end if;
  if exists(select 1 from public.zoho_calendar_event_links where meeting_id=p_meeting_id) then return 'zoho'; end if;
  if public.service_central_zoho_managed() then return 'zoho'; end if;
  v_provider:=public.service_effective_calendar_provider(v_owner);
  return case when v_provider in('google','zoho') then v_provider else null end;
end;
$$;

create or replace function public.queue_zoho_calendar_sync(p_user_id uuid,p_job_type text,p_meeting_id uuid default null,p_force boolean default false)
returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_meeting public.sales_meetings%rowtype; v_cfg jsonb:='{}'::jsonb; v_basis text; v_key text; v_id bigint; v_generation integer; v_provider text;
begin
  if p_job_type not in('refresh_busy','upsert_event','delete_event','reconcile_event') then raise exception 'Invalid Zoho sync job type.'; end if;
  if public.service_central_zoho_managed() then
    if p_job_type='refresh_busy' then return null; end if;
    if p_meeting_id is null then raise exception 'Meeting is required for event synchronization.'; end if;
    select * into v_meeting from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id;
    if not found then raise exception 'Meeting does not belong to this salesperson.'; end if;
    v_provider:=public.service_meeting_external_provider(p_meeting_id);
    if v_provider<>'zoho' then return null; end if;
  else
    if public.service_effective_calendar_provider(p_user_id)<>'zoho' then return null; end if;
    select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
    if coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false) is not true then return null; end if;
    if not exists(select 1 from public.zoho_connections c where c.user_id=p_user_id and c.status='connected') then return null; end if;
    if p_job_type<>'refresh_busy' then
      if p_meeting_id is null then raise exception 'Meeting is required for event synchronization.'; end if;
      select * into v_meeting from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id;
      if not found then raise exception 'Meeting does not belong to this Zoho connection.'; end if;
    end if;
  end if;
  v_generation:=public.service_effective_calendar_provider_generation(p_user_id);
  if p_job_type<>'refresh_busy' then
    v_basis:=concat_ws('|',v_generation::text,v_meeting.id::text,v_meeting.start_at::text,v_meeting.end_at::text,v_meeting.title,v_meeting.description,v_meeting.attendee_name,v_meeting.attendee_email,v_meeting.status,p_job_type);
  else
    v_basis:=concat_ws('|',v_generation::text,p_user_id::text,p_job_type,to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI'));
  end if;
  v_key:=p_user_id::text||':'||p_job_type||':z'||v_generation::text||':'||md5(v_basis);
  insert into public.zoho_calendar_sync_jobs(user_id,meeting_id,job_type,dedupe_key,status,next_attempt_at,calendar_provider_generation,updated_at)
  values(p_user_id,p_meeting_id,p_job_type,v_key,'pending',now(),v_generation,now())
  on conflict(dedupe_key) do update set
    status=case when p_force then 'pending' else public.zoho_calendar_sync_jobs.status end,
    next_attempt_at=case when p_force then now() else public.zoho_calendar_sync_jobs.next_attempt_at end,
    last_error=case when p_force then null else public.zoho_calendar_sync_jobs.last_error end,
    completed_at=case when p_force then null else public.zoho_calendar_sync_jobs.completed_at end,
    updated_at=now()
  returning id into v_id;
  if p_meeting_id is not null then update public.sales_meetings set sync_status='Pending',sync_error=null where id=p_meeting_id; end if;
  return v_id;
end;
$$;

create or replace function public.request_zoho_calendar_sync_now()
returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); r record; v_job bigint; v_first bigint;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.service_central_zoho_managed() then
    for r in
      select id from public.sales_meetings
      where salesperson_id=v_user and status in('Scheduled','Rescheduled') and start_at>now()
        and public.service_meeting_external_provider(id)='zoho'
      order by start_at
    loop
      v_job:=public.queue_zoho_calendar_sync(v_user,'upsert_event',r.id,true);
      if v_first is null and v_job is not null then v_first:=v_job; end if;
    end loop;
    return v_first;
  end if;
  return public.queue_zoho_calendar_sync(v_user,'refresh_busy',null,true);
end;
$$;

create or replace function public.service_claim_zoho_sync_jobs(p_limit integer default 20)
returns setof public.zoho_calendar_sync_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update public.zoho_calendar_sync_jobs
  set status='retry',next_attempt_at=now(),locked_at=null,updated_at=now()
  where status='processing' and locked_at<now()-interval '10 minutes';

  update public.zoho_calendar_sync_jobs j
  set status='skipped',last_error='Skipped because the scheduled meeting start time is already in the past.',locked_at=null,completed_at=now(),updated_at=now()
  where j.status in('pending','retry') and j.job_type<>'delete_event'
    and exists(select 1 from public.sales_meetings m where m.id=j.meeting_id and m.status in('Scheduled','Rescheduled') and m.start_at<=now());

  update public.zoho_calendar_sync_jobs j
  set status='skipped',last_error='Skipped because this ProFox meeting is not assigned to the active Zoho service.',locked_at=null,completed_at=now(),updated_at=now()
  where j.status in('pending','retry')
    and (
      j.calendar_provider_generation<>public.service_effective_calendar_provider_generation(j.user_id)
      or (j.meeting_id is not null and public.service_meeting_external_provider(j.meeting_id)<>'zoho')
      or (
        not public.service_central_zoho_managed()
        and (
          public.service_effective_calendar_provider(j.user_id)<>'zoho'
          or not exists(select 1 from public.zoho_connections c where c.user_id=j.user_id and c.status='connected')
        )
      )
    );

  return query
  with picked as (
    select j.id
    from public.zoho_calendar_sync_jobs j
    where j.status in('pending','retry')
      and j.next_attempt_at<=now()
      and j.calendar_provider_generation=public.service_effective_calendar_provider_generation(j.user_id)
      and not (
        j.job_type<>'delete_event'
        and exists(select 1 from public.sales_meetings m where m.id=j.meeting_id and m.status in('Scheduled','Rescheduled') and m.start_at<=now())
      )
      and (
        (
          public.service_central_zoho_worker_ready()
          and j.meeting_id is not null
          and public.service_meeting_external_provider(j.meeting_id)='zoho'
        )
        or (
          not public.service_central_zoho_managed()
          and public.service_effective_calendar_provider(j.user_id)='zoho'
          and exists(select 1 from public.zoho_connections c where c.user_id=j.user_id and c.status='connected')
        )
      )
    order by j.next_attempt_at,j.id
    for update skip locked
    limit least(greatest(coalesce(p_limit,20),1),100)
  )
  update public.zoho_calendar_sync_jobs j
  set status='processing',attempts=j.attempts+1,locked_at=now(),updated_at=now()
  from picked p
  where j.id=p.id
  returning j.*;
end;
$$;

create or replace function public.service_queue_due_zoho_busy_refreshes()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare r record; v_count integer:=0;
begin
  if public.service_central_zoho_managed() then return 0; end if;
  for r in
    select c.user_id from public.zoho_connections c
    where c.status='connected' and public.service_effective_calendar_provider(c.user_id)='zoho'
      and (c.last_successful_sync_at is null or c.last_successful_sync_at<now()-interval '10 minutes')
  loop
    if public.queue_zoho_calendar_sync(r.user_id,'refresh_busy',null,false) is not null then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.queue_google_sync_from_meeting()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_provider text;
begin
  v_provider:=public.service_meeting_external_provider(new.id);
  if v_provider='google' then
    if not exists(select 1 from public.google_calendar_connections c where c.user_id=new.salesperson_id and c.status='connected' and c.sync_enabled) then return new; end if;
    if tg_op='INSERT' then
      if new.status in('Scheduled','Rescheduled') then perform public.queue_google_calendar_sync(new.salesperson_id,'upsert_event',new.id,false); end if;
      return new;
    end if;
    if new.status='Cancelled' and old.status is distinct from 'Cancelled' then
      perform public.queue_google_calendar_sync(new.salesperson_id,'delete_event',new.id,false);
    elsif new.status in('Scheduled','Rescheduled') and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at or new.title is distinct from old.title or new.description is distinct from old.description or new.attendee_name is distinct from old.attendee_name or new.attendee_email is distinct from old.attendee_email or new.status is distinct from old.status) then
      perform public.queue_google_calendar_sync(new.salesperson_id,'upsert_event',new.id,false);
    end if;
  elsif v_provider='zoho' then
    if not public.service_central_zoho_managed()
       and not exists(select 1 from public.zoho_connections c where c.user_id=new.salesperson_id and c.status='connected') then
      return new;
    end if;
    if tg_op='INSERT' then
      if new.status in('Scheduled','Rescheduled') then perform public.queue_zoho_calendar_sync(new.salesperson_id,'upsert_event',new.id,false); end if;
      return new;
    end if;
    if new.status='Cancelled' and old.status is distinct from 'Cancelled' then
      perform public.queue_zoho_calendar_sync(new.salesperson_id,'delete_event',new.id,false);
    elsif new.status in('Scheduled','Rescheduled') and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at or new.title is distinct from old.title or new.description is distinct from old.description or new.attendee_name is distinct from old.attendee_name or new.attendee_email is distinct from old.attendee_email or new.status is distinct from old.status) then
      perform public.queue_zoho_calendar_sync(new.salesperson_id,'upsert_event',new.id,false);
    end if;
  end if;
  return new;
end;
$$;