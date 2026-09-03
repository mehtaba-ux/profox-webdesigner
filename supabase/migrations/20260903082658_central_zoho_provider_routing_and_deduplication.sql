create or replace function public.service_effective_calendar_provider(p_user_id uuid)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_provider text; v_cfg jsonb:='{}'::jsonb;
begin
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  if coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google')='zoho' and coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false) and public.service_central_zoho_ready() then return 'zoho'; end if;
  select calendar_provider into v_provider from public.staff_professional_accounts where user_id=p_user_id;
  if v_provider in('google','zoho') then return v_provider; end if;
  v_provider:=coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  if v_provider='zoho' and not public.service_central_zoho_ready() then return 'google'; end if;
  return case when v_provider in('google','zoho') then v_provider else 'google' end;
end;$$;

create or replace function public.service_effective_meeting_provider(p_user_id uuid)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_provider text; v_cfg jsonb:='{}'::jsonb;
begin
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  if coalesce(nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet')='zoho_meeting' and coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false) and public.service_central_zoho_ready() then return 'zoho_meeting'; end if;
  select meeting_provider into v_provider from public.staff_professional_accounts where user_id=p_user_id;
  if v_provider in('google_meet','zoho_meeting') then return v_provider; end if;
  v_provider:=coalesce(nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet');
  if v_provider='zoho_meeting' and not public.service_central_zoho_ready() then return 'google_meet'; end if;
  return case when v_provider in('google_meet','zoho_meeting') then v_provider else 'google_meet' end;
end;$$;

create or replace function public.service_effective_calendar_provider_generation(p_user_id uuid)
returns integer language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_generation integer; v_cfg jsonb:='{}'::jsonb; v_raw text;
begin
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  if coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google')='zoho' and public.service_central_zoho_ready() then
    v_raw:=coalesce(v_cfg->>'calendarProviderGeneration',''); if v_raw ~ '^[1-9][0-9]*$' then return v_raw::integer; end if; return 1;
  end if;
  select calendar_provider_generation into v_generation from public.staff_professional_accounts where user_id=p_user_id;
  if v_generation is not null and v_generation>0 then return v_generation; end if;
  v_raw:=coalesce(v_cfg->>'calendarProviderGeneration',''); if v_raw ~ '^[1-9][0-9]*$' then return v_raw::integer; end if; return 1;
end;$$;

create or replace function public.service_meeting_external_provider(p_meeting_id uuid)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_owner uuid; v_provider text;
begin
  select salesperson_id into v_owner from public.sales_meetings where id=p_meeting_id; if not found then return null; end if;
  if exists(select 1 from public.google_calendar_event_links where meeting_id=p_meeting_id) then return 'google'; end if;
  if exists(select 1 from public.zoho_calendar_event_links where meeting_id=p_meeting_id) then return 'zoho'; end if;
  if public.service_central_zoho_ready() then return 'zoho'; end if;
  v_provider:=public.service_effective_calendar_provider(v_owner); return case when v_provider in('google','zoho') then v_provider else null end;
end;$$;
revoke all on function public.service_meeting_external_provider(uuid) from public,anon,authenticated;
grant execute on function public.service_meeting_external_provider(uuid) to service_role;

create or replace function public.service_upsert_google_event_link(p_meeting_id uuid,p_user_id uuid,p_calendar_id text,p_event_id text,p_conference_request_id text,p_meet_url text,p_etag text,p_conference_status text,p_operation text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_conference_status not in('none','pending','success','failed') then raise exception 'Invalid conference state.'; end if;
  if not exists(select 1 from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id) then raise exception 'Meeting does not belong to this Google connection.'; end if;
  if exists(select 1 from public.zoho_calendar_event_links where meeting_id=p_meeting_id) then raise exception 'Meeting is already locked to Zoho. Duplicate external calendar events are not allowed.'; end if;
  insert into public.google_calendar_event_links(meeting_id,user_id,calendar_id,external_event_id,conference_request_id,meet_url,etag,conference_status,last_operation,last_synced_at,updated_at)
  values(p_meeting_id,p_user_id,coalesce(nullif(p_calendar_id,''),'primary'),p_event_id,p_conference_request_id,coalesce(p_meet_url,''),coalesce(p_etag,''),p_conference_status,p_operation,now(),now())
  on conflict(meeting_id) do update set calendar_id=excluded.calendar_id,external_event_id=excluded.external_event_id,conference_request_id=excluded.conference_request_id,meet_url=excluded.meet_url,etag=excluded.etag,conference_status=excluded.conference_status,last_operation=excluded.last_operation,last_synced_at=now(),updated_at=now();
  update public.sales_meetings set external_calendar_id=coalesce(nullif(p_calendar_id,''),'primary'),external_event_id=p_event_id,meeting_url=case when trim(coalesce(p_meet_url,''))<>'' then p_meet_url else meeting_url end,sync_status='Synced',sync_error=null,updated_at=now() where id=p_meeting_id and salesperson_id=p_user_id;
  update public.crm_opportunities o set meeting_url=m.meeting_url,updated_at=now() from public.sales_meetings m where m.id=p_meeting_id and o.id=m.opportunity_id and trim(coalesce(m.meeting_url,''))<>'';
end;$$;

create or replace function public.service_upsert_zoho_event_link(p_meeting_id uuid,p_user_id uuid,p_calendar_id text,p_event_id text,p_etag text,p_meeting_url text,p_operation text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id) then raise exception 'Meeting does not belong to this Zoho service.'; end if;
  if exists(select 1 from public.google_calendar_event_links where meeting_id=p_meeting_id) then raise exception 'Meeting is already locked to Google. Duplicate external calendar events are not allowed.'; end if;
  insert into public.zoho_calendar_event_links(meeting_id,user_id,calendar_id,external_event_id,etag,meeting_url,last_operation,last_synced_at,updated_at)
  values(p_meeting_id,p_user_id,coalesce(nullif(p_calendar_id,''),'primary'),p_event_id,coalesce(p_etag,''),coalesce(p_meeting_url,''),p_operation,now(),now())
  on conflict(meeting_id) do update set calendar_id=excluded.calendar_id,external_event_id=excluded.external_event_id,etag=excluded.etag,meeting_url=excluded.meeting_url,last_operation=excluded.last_operation,last_synced_at=now(),updated_at=now();
  update public.sales_meetings set external_calendar_id=coalesce(nullif(p_calendar_id,''),'primary'),external_event_id=p_event_id,meeting_url=case when trim(coalesce(p_meeting_url,''))<>'' then p_meeting_url else meeting_url end,sync_status='Synced',sync_error=null,updated_at=now() where id=p_meeting_id and salesperson_id=p_user_id;
  update public.crm_opportunities o set meeting_url=m.meeting_url,updated_at=now() from public.sales_meetings m where m.id=p_meeting_id and o.id=m.opportunity_id and trim(coalesce(m.meeting_url,''))<>'';
end;$$;

create or replace function public.service_delete_zoho_event_link(p_meeting_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id) then raise exception 'Meeting does not belong to this Zoho service.'; end if;
  delete from public.zoho_calendar_event_links where meeting_id=p_meeting_id and user_id=p_user_id;
  delete from public.meeting_provider_private_links where meeting_id=p_meeting_id and provider='zoho_meeting';
  update public.sales_meetings set external_calendar_id=null,external_event_id=null,meeting_url=null,sync_status='Synced',sync_error=null,updated_at=now() where id=p_meeting_id and salesperson_id=p_user_id;
end;$$;

create or replace function public.queue_zoho_calendar_sync(p_user_id uuid,p_job_type text,p_meeting_id uuid default null,p_force boolean default false)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_meeting public.sales_meetings%rowtype; v_cfg jsonb:='{}'::jsonb; v_basis text; v_key text; v_id bigint; v_generation integer; v_provider text;
begin
  if p_job_type not in('refresh_busy','upsert_event','delete_event','reconcile_event') then raise exception 'Invalid Zoho sync job type.'; end if;
  if public.service_central_zoho_ready() then
    if p_job_type='refresh_busy' then return null; end if;
    if p_meeting_id is null then raise exception 'Meeting is required for event synchronization.'; end if;
    select * into v_meeting from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id; if not found then raise exception 'Meeting does not belong to this salesperson.'; end if;
    v_provider:=public.service_meeting_external_provider(p_meeting_id); if v_provider<>'zoho' then return null; end if;
  else
    if public.service_effective_calendar_provider(p_user_id)<>'zoho' then return null; end if;
    select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
    if coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false) is not true then return null; end if;
    if not exists(select 1 from public.zoho_connections c where c.user_id=p_user_id and c.status='connected') then return null; end if;
    if p_job_type<>'refresh_busy' then
      if p_meeting_id is null then raise exception 'Meeting is required for event synchronization.'; end if;
      select * into v_meeting from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id; if not found then raise exception 'Meeting does not belong to this Zoho connection.'; end if;
    end if;
  end if;
  v_generation:=public.service_effective_calendar_provider_generation(p_user_id);
  if p_job_type<>'refresh_busy' then v_basis:=concat_ws('|',v_generation::text,v_meeting.id::text,v_meeting.start_at::text,v_meeting.end_at::text,v_meeting.title,v_meeting.description,v_meeting.attendee_name,v_meeting.attendee_email,v_meeting.status,p_job_type);
  else v_basis:=concat_ws('|',v_generation::text,p_user_id::text,p_job_type,to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI')); end if;
  v_key:=p_user_id::text||':'||p_job_type||':z'||v_generation::text||':'||md5(v_basis);
  insert into public.zoho_calendar_sync_jobs(user_id,meeting_id,job_type,dedupe_key,status,next_attempt_at,calendar_provider_generation,updated_at)
  values(p_user_id,p_meeting_id,p_job_type,v_key,'pending',now(),v_generation,now())
  on conflict(dedupe_key) do update set status=case when p_force then 'pending' else public.zoho_calendar_sync_jobs.status end,next_attempt_at=case when p_force then now() else public.zoho_calendar_sync_jobs.next_attempt_at end,last_error=case when p_force then null else public.zoho_calendar_sync_jobs.last_error end,completed_at=case when p_force then null else public.zoho_calendar_sync_jobs.completed_at end,updated_at=now() returning id into v_id;
  if p_meeting_id is not null then update public.sales_meetings set sync_status='Pending',sync_error=null where id=p_meeting_id; end if; return v_id;
end;$$;

create or replace function public.service_claim_zoho_sync_jobs(p_limit integer default 20)
returns setof public.zoho_calendar_sync_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.zoho_calendar_sync_jobs set status='retry',next_attempt_at=now(),locked_at=null,updated_at=now() where status='processing' and locked_at<now()-interval '10 minutes';
  update public.zoho_calendar_sync_jobs j set status='skipped',last_error='Skipped because this ProFox meeting is not assigned to the active Zoho service.',locked_at=null,completed_at=now(),updated_at=now()
  where j.status in('pending','retry') and (
    j.calendar_provider_generation<>public.service_effective_calendar_provider_generation(j.user_id)
    or (j.meeting_id is not null and public.service_meeting_external_provider(j.meeting_id)<>'zoho')
    or (not public.service_central_zoho_ready() and (public.service_effective_calendar_provider(j.user_id)<>'zoho' or not exists(select 1 from public.zoho_connections c where c.user_id=j.user_id and c.status='connected')))
  );
  return query with picked as(
    select j.id from public.zoho_calendar_sync_jobs j where j.status in('pending','retry') and j.next_attempt_at<=now() and j.calendar_provider_generation=public.service_effective_calendar_provider_generation(j.user_id)
      and ((public.service_central_zoho_ready() and j.meeting_id is not null and public.service_meeting_external_provider(j.meeting_id)='zoho') or (not public.service_central_zoho_ready() and public.service_effective_calendar_provider(j.user_id)='zoho' and exists(select 1 from public.zoho_connections c where c.user_id=j.user_id and c.status='connected')))
    order by j.next_attempt_at,j.id for update skip locked limit least(greatest(coalesce(p_limit,20),1),100)
  ) update public.zoho_calendar_sync_jobs j set status='processing',attempts=j.attempts+1,locked_at=now(),updated_at=now() from picked p where j.id=p.id returning j.*;
end;$$;

create or replace function public.service_finish_zoho_sync_job(p_job_id bigint,p_status text,p_error text default null,p_retry_seconds integer default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.zoho_calendar_sync_jobs%rowtype; v_final text; v_available boolean;
begin
  if p_status not in('succeeded','retry','reconnect_required','failed','skipped','dead_letter') then raise exception 'Invalid sync job result.'; end if;
  select * into v_job from public.zoho_calendar_sync_jobs where id=p_job_id for update; if not found then return; end if;
  v_available:=case when public.service_central_zoho_ready() then v_job.meeting_id is not null and public.service_meeting_external_provider(v_job.meeting_id)='zoho' else public.service_effective_calendar_provider(v_job.user_id)='zoho' and exists(select 1 from public.zoho_connections c where c.user_id=v_job.user_id and c.status='connected') end;
  v_final:=p_status; if p_status='failed' then if not v_available or v_job.calendar_provider_generation<>public.service_effective_calendar_provider_generation(v_job.user_id) then v_final:='skipped'; else v_final:='dead_letter'; end if; end if;
  update public.zoho_calendar_sync_jobs set status=v_final,last_error=case when v_final='succeeded' then null else left(coalesce(p_error,''),2000) end,locked_at=null,next_attempt_at=case when v_final='retry' then now()+make_interval(secs=>least(greatest(coalesce(p_retry_seconds,60),5),21600)) else next_attempt_at end,completed_at=case when v_final in('succeeded','reconnect_required','failed','skipped','dead_letter') then now() else null end,updated_at=now() where id=p_job_id;
  if v_job.meeting_id is not null then update public.sales_meetings set sync_status=case when v_final='succeeded' then 'Synced' when v_final='retry' then 'Pending' when v_final='skipped' then 'Not Connected' else 'Error' end,sync_error=case when v_final in('succeeded','skipped') then null else left(coalesce(p_error,''),2000) end where id=v_job.meeting_id; end if;
end;$$;

create or replace function public.service_queue_due_zoho_busy_refreshes()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; v_count integer:=0;
begin
  if public.service_central_zoho_ready() then return 0; end if;
  for r in select c.user_id from public.zoho_connections c where c.status='connected' and public.service_effective_calendar_provider(c.user_id)='zoho' and (c.last_successful_sync_at is null or c.last_successful_sync_at<now()-interval '10 minutes') loop
    if public.queue_zoho_calendar_sync(r.user_id,'refresh_busy',null,false) is not null then v_count:=v_count+1; end if;
  end loop; return v_count;
end;$$;

create or replace function public.request_zoho_calendar_sync_now()
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); r record; v_job bigint; v_first bigint;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.service_central_zoho_ready() then
    for r in select id from public.sales_meetings where salesperson_id=v_user and status in('Scheduled','Rescheduled') and public.service_meeting_external_provider(id)='zoho' order by start_at loop
      v_job:=public.queue_zoho_calendar_sync(v_user,'upsert_event',r.id,true); if v_first is null and v_job is not null then v_first:=v_job; end if;
    end loop; return v_first;
  end if;
  return public.queue_zoho_calendar_sync(v_user,'refresh_busy',null,true);
end;$$;

create or replace function public.guard_google_busy_sales_meeting()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status not in('Scheduled','Rescheduled') then return new; end if;
  if tg_op='UPDATE' and new.start_at=old.start_at and new.end_at=old.end_at and new.salesperson_id=old.salesperson_id then return new; end if;
  if exists(select 1 from public.google_calendar_connections c where c.user_id=new.salesperson_id and c.status='connected' and c.sync_enabled)
     and public.has_google_calendar_conflict(new.salesperson_id,new.start_at,new.end_at,case when tg_op='UPDATE' then old.id else null end)
  then raise exception 'This time conflicts with the connected optional Google Calendar.' using errcode='P0001'; end if;
  if not public.service_central_zoho_ready() and public.service_effective_calendar_provider(new.salesperson_id)='zoho' and exists(select 1 from public.zoho_connections c where c.user_id=new.salesperson_id and c.status='connected') and public.has_zoho_calendar_conflict(new.salesperson_id,new.start_at,new.end_at,case when tg_op='UPDATE' then old.id else null end)
  then raise exception 'This time conflicts with the connected Zoho Calendar.' using errcode='P0001'; end if;
  return new;
end;$$;

create or replace function public.queue_google_sync_from_meeting()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_provider text;
begin
  v_provider:=public.service_meeting_external_provider(new.id);
  if v_provider='google' then
    if not exists(select 1 from public.google_calendar_connections c where c.user_id=new.salesperson_id and c.status='connected' and c.sync_enabled) then return new; end if;
    if tg_op='INSERT' then if new.status in('Scheduled','Rescheduled') then perform public.queue_google_calendar_sync(new.salesperson_id,'upsert_event',new.id,false); end if; return new; end if;
    if new.status='Cancelled' and old.status is distinct from 'Cancelled' then perform public.queue_google_calendar_sync(new.salesperson_id,'delete_event',new.id,false);
    elsif new.status in('Scheduled','Rescheduled') and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at or new.title is distinct from old.title or new.description is distinct from old.description or new.attendee_name is distinct from old.attendee_name or new.attendee_email is distinct from old.attendee_email or new.status is distinct from old.status) then perform public.queue_google_calendar_sync(new.salesperson_id,'upsert_event',new.id,false); end if;
  elsif v_provider='zoho' then
    if not public.service_central_zoho_ready() and not exists(select 1 from public.zoho_connections c where c.user_id=new.salesperson_id and c.status='connected') then return new; end if;
    if tg_op='INSERT' then if new.status in('Scheduled','Rescheduled') then perform public.queue_zoho_calendar_sync(new.salesperson_id,'upsert_event',new.id,false); end if; return new; end if;
    if new.status='Cancelled' and old.status is distinct from 'Cancelled' then perform public.queue_zoho_calendar_sync(new.salesperson_id,'delete_event',new.id,false);
    elsif new.status in('Scheduled','Rescheduled') and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at or new.title is distinct from old.title or new.description is distinct from old.description or new.attendee_name is distinct from old.attendee_name or new.attendee_email is distinct from old.attendee_email or new.status is distinct from old.status) then perform public.queue_zoho_calendar_sync(new.salesperson_id,'upsert_event',new.id,false); end if;
  end if; return new;
end;$$;

create or replace function public.service_queue_existing_unsynced_meetings_for_central_zoho()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; v_count integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if not public.service_central_zoho_ready() then return 0; end if;
  for r in select m.id,m.salesperson_id from public.sales_meetings m where m.status in('Scheduled','Rescheduled') and not exists(select 1 from public.google_calendar_event_links g where g.meeting_id=m.id) and not exists(select 1 from public.zoho_calendar_event_links z where z.meeting_id=m.id) loop
    if public.queue_zoho_calendar_sync(r.salesperson_id,'upsert_event',r.id,false) is not null then v_count:=v_count+1; end if;
  end loop; return v_count;
end;$$;
revoke all on function public.service_queue_existing_unsynced_meetings_for_central_zoho() from public,anon,authenticated;
grant execute on function public.service_queue_existing_unsynced_meetings_for_central_zoho() to service_role;

create or replace function public.admin_set_professional_integrations(p_zoho_enabled boolean,p_zoho_mail_enabled boolean,p_zoho_calendar_enabled boolean,p_zoho_meeting_enabled boolean,p_mail_provisioning_enabled boolean,p_professional_email_required boolean,p_default_mail_provider text,p_default_calendar_provider text,p_default_meeting_provider text)
returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_cfg jsonb:='{}'::jsonb; v_status jsonb; v_any_zoho boolean; v_mail_requested boolean; v_mail_verified boolean:=false; v_calendar_verified boolean:=false; v_old_calendar text; v_calendar_generation integer:=1; v_calendar_raw text; v_old_mail text; v_old_mail_enabled boolean:=false; v_old_provisioning boolean:=false; v_mail_generation integer:=1; v_mail_raw text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_default_mail_provider not in('none','zoho') then raise exception 'Unsupported mail provider.'; end if;
  if p_default_calendar_provider not in('google','zoho') then raise exception 'Unsupported calendar provider.'; end if;
  if p_default_meeting_provider not in('google_meet','zoho_meeting') then raise exception 'Unsupported meeting provider.'; end if;
  v_status:=public.admin_get_professional_integrations();
  v_any_zoho:=coalesce(p_zoho_enabled,false) or coalesce(p_zoho_mail_enabled,false) or coalesce(p_zoho_calendar_enabled,false) or coalesce(p_zoho_meeting_enabled,false) or coalesce(p_mail_provisioning_enabled,false) or p_default_mail_provider='zoho' or p_default_calendar_provider='zoho' or p_default_meeting_provider='zoho_meeting';
  if v_any_zoho and coalesce((v_status->>'zohoProviderConfigured')::boolean,false) is not true then raise exception 'Configure the Zoho organization and OAuth provider before enabling Zoho services.'; end if;
  v_mail_requested:=coalesce(p_zoho_mail_enabled,false) or coalesce(p_mail_provisioning_enabled,false) or coalesce(p_professional_email_required,false) or p_default_mail_provider='zoho';
  select exists(select 1 from public.zoho_organization_mail_connection where singleton_key='primary' and status='connected') into v_mail_verified;
  if v_mail_requested and not v_mail_verified then raise exception 'Connect and verify Zoho Mail organization OAuth before enabling professional Mail, provisioning, or the Zoho default mail provider.'; end if;
  select exists(select 1 from public.zoho_service_calendar_connection where singleton_key='primary' and status='connected' and meeting_ready and nullif(calendar_id,'') is not null and nullif(meeting_org_id,'') is not null and nullif(presenter_zuid,'') is not null) into v_calendar_verified;
  if (coalesce(p_zoho_calendar_enabled,false) or coalesce(p_zoho_meeting_enabled,false) or p_default_calendar_provider='zoho' or p_default_meeting_provider='zoho_meeting') and not v_calendar_verified then raise exception 'Authorize and verify the central ProFox Zoho Calendar and Meeting service before enabling it.'; end if;
  if coalesce(p_zoho_meeting_enabled,false) and not coalesce(p_zoho_calendar_enabled,false) then raise exception 'Zoho Meeting requires the central Zoho Calendar service to be enabled.'; end if;
  if p_default_calendar_provider='zoho' and not coalesce(p_zoho_calendar_enabled,false) then raise exception 'Zoho cannot be the default calendar until the central Zoho Calendar service is enabled.'; end if;
  if p_default_meeting_provider='zoho_meeting' and not coalesce(p_zoho_meeting_enabled,false) then raise exception 'Zoho Meeting cannot be the default until the central Zoho Meeting service is enabled.'; end if;
  if coalesce(p_professional_email_required,false) and not coalesce(p_zoho_mail_enabled,false) then raise exception 'Professional email cannot be mandatory until Zoho Mail is enabled.'; end if;
  if coalesce(p_mail_provisioning_enabled,false) and not coalesce(p_zoho_mail_enabled,false) then raise exception 'Mailbox provisioning requires Zoho Mail to be enabled.'; end if;
  if p_default_mail_provider='zoho' and not coalesce(p_zoho_mail_enabled,false) then raise exception 'Zoho cannot be the default mail provider until Zoho Mail is enabled.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations' for update;
  v_old_calendar:=coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google'); v_calendar_raw:=coalesce(v_cfg->>'calendarProviderGeneration',''); if v_calendar_raw ~ '^[1-9][0-9]*$' then v_calendar_generation:=v_calendar_raw::integer; end if; if v_old_calendar is distinct from p_default_calendar_provider then v_calendar_generation:=v_calendar_generation+1; end if;
  v_old_mail:=coalesce(nullif(v_cfg->>'defaultMailProvider',''),'none'); v_old_mail_enabled:=coalesce((v_cfg->>'zohoMailEnabled')::boolean,false); v_old_provisioning:=coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false); v_mail_raw:=coalesce(v_cfg->>'mailProviderGeneration',''); if v_mail_raw ~ '^[1-9][0-9]*$' then v_mail_generation:=v_mail_raw::integer; end if; if v_old_mail is distinct from p_default_mail_provider or v_old_mail_enabled is distinct from coalesce(p_zoho_mail_enabled,false) or v_old_provisioning is distinct from coalesce(p_mail_provisioning_enabled,false) then v_mail_generation:=v_mail_generation+1; end if;
  v_cfg:=v_cfg||jsonb_build_object('zohoEnabled',coalesce(p_zoho_enabled,false),'zohoMailEnabled',coalesce(p_zoho_mail_enabled,false),'zohoCalendarEnabled',coalesce(p_zoho_calendar_enabled,false),'zohoMeetingEnabled',coalesce(p_zoho_meeting_enabled,false),'mailProvisioningEnabled',coalesce(p_mail_provisioning_enabled,false),'professionalEmailRequired',coalesce(p_professional_email_required,false),'defaultMailProvider',p_default_mail_provider,'defaultCalendarProvider',p_default_calendar_provider,'defaultMeetingProvider',p_default_meeting_provider,'calendarProviderGeneration',v_calendar_generation,'mailProviderGeneration',v_mail_generation);
  update public.system_configuration set config_value=v_cfg,updated_by=auth.uid(),updated_at=now() where config_key='professional_integrations'; return public.admin_get_professional_integrations();
end;$$;