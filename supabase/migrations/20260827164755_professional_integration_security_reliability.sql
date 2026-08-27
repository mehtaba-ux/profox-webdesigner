-- ProFox professional integration security and reliability hardening.
-- Additive by design: preserve Google behavior while preventing stale/cross-provider work.

-- 1) Least-privilege cleanup for internal/authenticated-only SECURITY DEFINER RPCs.
revoke all on function public.queue_due_sales_academy_deadline_notifications() from public, anon, authenticated;
grant execute on function public.queue_due_sales_academy_deadline_notifications() to service_role, postgres;

revoke all on function public.get_my_sales_academy_deadline() from public, anon;
grant execute on function public.get_my_sales_academy_deadline() to authenticated, service_role, postgres;

revoke all on function public.start_sales_academy_training() from public, anon;
grant execute on function public.start_sales_academy_training() to authenticated, service_role, postgres;

revoke all on function public.admin_record_and_process_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) from public, anon;
grant execute on function public.admin_record_and_process_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) to authenticated, service_role, postgres;

-- 2) Make configuration audit append-only from clients. Writes continue through trusted SECURITY DEFINER triggers.
drop policy if exists configuration_audit_admin_insert on public.configuration_audit_log;
revoke insert, update, delete on table public.configuration_audit_log from anon, authenticated;

-- 3) Provider generation prevents stale jobs from a previous provider assignment from executing.
alter table public.staff_professional_accounts
  add column if not exists calendar_provider_generation integer not null default 1;
alter table public.google_calendar_sync_jobs
  add column if not exists calendar_provider_generation integer not null default 1;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname='staff_professional_accounts_calendar_provider_generation_check' and conrelid='public.staff_professional_accounts'::regclass) then
    alter table public.staff_professional_accounts add constraint staff_professional_accounts_calendar_provider_generation_check check (calendar_provider_generation > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='google_calendar_sync_jobs_calendar_provider_generation_check' and conrelid='public.google_calendar_sync_jobs'::regclass) then
    alter table public.google_calendar_sync_jobs add constraint google_calendar_sync_jobs_calendar_provider_generation_check check (calendar_provider_generation > 0);
  end if;
end $do$;

update public.system_configuration
set config_value = coalesce(config_value,'{}'::jsonb) || jsonb_build_object(
      'calendarProviderGeneration',
      case when coalesce(config_value->>'calendarProviderGeneration','') ~ '^[1-9][0-9]*$'
           then (config_value->>'calendarProviderGeneration')::integer else 1 end
    ),
    updated_at = now()
where config_key='professional_integrations';

create or replace function public.service_effective_calendar_provider(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_provider text; v_cfg jsonb:='{}'::jsonb;
begin
  select calendar_provider into v_provider from public.staff_professional_accounts where user_id=p_user_id;
  if v_provider in ('google','zoho') then return v_provider; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  v_provider:=coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  return case when v_provider in ('google','zoho') then v_provider else 'google' end;
end;
$function$;
revoke all on function public.service_effective_calendar_provider(uuid) from public, anon, authenticated;
grant execute on function public.service_effective_calendar_provider(uuid) to service_role, postgres;

create or replace function public.service_effective_calendar_provider_generation(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_generation integer; v_cfg jsonb:='{}'::jsonb; v_raw text;
begin
  select calendar_provider_generation into v_generation from public.staff_professional_accounts where user_id=p_user_id;
  if v_generation is not null and v_generation>0 then return v_generation; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  v_raw:=coalesce(v_cfg->>'calendarProviderGeneration','');
  if v_raw ~ '^[1-9][0-9]*$' then return v_raw::integer; end if;
  return 1;
end;
$function$;
revoke all on function public.service_effective_calendar_provider_generation(uuid) from public, anon, authenticated;
grant execute on function public.service_effective_calendar_provider_generation(uuid) to service_role, postgres;

-- Preserve existing staff-account contract while versioning calendar-provider changes.
create or replace function public.admin_set_staff_professional_account(
  p_user_id uuid,
  p_work_email text,
  p_mail_provider text,
  p_calendar_provider text,
  p_meeting_provider text,
  p_mailbox_status text default 'not_configured'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_email text:=lower(btrim(coalesce(p_work_email,'')));
  v_from text; v_domain text; v_row public.staff_professional_accounts%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if not exists(select 1 from public.user_profiles where id=p_user_id and role not in ('customer','pending')) then raise exception 'Staff profile not found.'; end if;
  if p_mail_provider not in ('none','zoho') or p_calendar_provider not in ('google','zoho') or p_meeting_provider not in ('google_meet','zoho_meeting') then raise exception 'Unsupported professional provider selection.'; end if;
  if p_mailbox_status not in ('not_configured','provisioning','active','suspended','error') then raise exception 'Unsupported mailbox status.'; end if;
  select lower(btrim(coalesce(config_value->>'fromEmail',''))) into v_from from public.system_configuration where config_key='notification_settings';
  v_domain:=split_part(v_from,'@',2);
  if v_email<>'' and (v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or split_part(v_email,'@',2) is distinct from v_domain) then
    raise exception 'Professional email must use the verified ProFox sender domain.';
  end if;
  insert into public.staff_professional_accounts(user_id,work_email,mail_provider,calendar_provider,meeting_provider,mailbox_status,calendar_provider_generation,updated_at)
  values(p_user_id,nullif(v_email,''),p_mail_provider,p_calendar_provider,p_meeting_provider,p_mailbox_status,1,now())
  on conflict(user_id) do update set
    work_email=excluded.work_email,
    mail_provider=excluded.mail_provider,
    calendar_provider=excluded.calendar_provider,
    meeting_provider=excluded.meeting_provider,
    mailbox_status=excluded.mailbox_status,
    calendar_provider_generation=case
      when public.staff_professional_accounts.calendar_provider is distinct from excluded.calendar_provider
        then public.staff_professional_accounts.calendar_provider_generation+1
      else public.staff_professional_accounts.calendar_provider_generation end,
    updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;
revoke all on function public.admin_set_staff_professional_account(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.admin_set_staff_professional_account(uuid,text,text,text,text,text) to authenticated, service_role, postgres;

-- Version the global default calendar provider for staff without an explicit provider row.
create or replace function public.admin_set_professional_integrations(
  p_zoho_enabled boolean,
  p_zoho_mail_enabled boolean,
  p_zoho_calendar_enabled boolean,
  p_zoho_meeting_enabled boolean,
  p_mail_provisioning_enabled boolean,
  p_professional_email_required boolean,
  p_default_mail_provider text,
  p_default_calendar_provider text,
  p_default_meeting_provider text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_cfg jsonb:='{}'::jsonb; v_status jsonb; v_any_zoho boolean;
  v_old_calendar text; v_generation integer:=1; v_raw text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_default_mail_provider not in ('none','zoho') then raise exception 'Unsupported mail provider.'; end if;
  if p_default_calendar_provider not in ('google','zoho') then raise exception 'Unsupported calendar provider.'; end if;
  if p_default_meeting_provider not in ('google_meet','zoho_meeting') then raise exception 'Unsupported meeting provider.'; end if;
  v_status:=public.admin_get_professional_integrations();
  v_any_zoho:=coalesce(p_zoho_enabled,false) or coalesce(p_zoho_mail_enabled,false) or coalesce(p_zoho_calendar_enabled,false) or coalesce(p_zoho_meeting_enabled,false) or coalesce(p_mail_provisioning_enabled,false) or p_default_mail_provider='zoho' or p_default_calendar_provider='zoho' or p_default_meeting_provider='zoho_meeting';
  if v_any_zoho and coalesce((v_status->>'zohoProviderConfigured')::boolean,false) is not true then
    raise exception 'Configure the Zoho organization and OAuth provider before enabling Zoho services.';
  end if;
  if coalesce(p_professional_email_required,false) and not coalesce(p_zoho_mail_enabled,false) then
    raise exception 'Professional email cannot be mandatory until Zoho Mail is enabled.';
  end if;
  if coalesce(p_mail_provisioning_enabled,false) and not coalesce(p_zoho_mail_enabled,false) then
    raise exception 'Mailbox provisioning requires Zoho Mail to be enabled.';
  end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  v_old_calendar:=coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  v_raw:=coalesce(v_cfg->>'calendarProviderGeneration','');
  if v_raw ~ '^[1-9][0-9]*$' then v_generation:=v_raw::integer; end if;
  if v_old_calendar is distinct from p_default_calendar_provider then v_generation:=v_generation+1; end if;
  v_cfg:=v_cfg||jsonb_build_object(
    'zohoEnabled',coalesce(p_zoho_enabled,false),
    'zohoMailEnabled',coalesce(p_zoho_mail_enabled,false),
    'zohoCalendarEnabled',coalesce(p_zoho_calendar_enabled,false),
    'zohoMeetingEnabled',coalesce(p_zoho_meeting_enabled,false),
    'mailProvisioningEnabled',coalesce(p_mail_provisioning_enabled,false),
    'professionalEmailRequired',coalesce(p_professional_email_required,false),
    'defaultMailProvider',p_default_mail_provider,
    'defaultCalendarProvider',p_default_calendar_provider,
    'defaultMeetingProvider',p_default_meeting_provider,
    'calendarProviderGeneration',v_generation
  );
  update public.system_configuration set config_value=v_cfg,updated_by=auth.uid(),updated_at=now() where config_key='professional_integrations';
  return public.admin_get_professional_integrations();
end;
$function$;
revoke all on function public.admin_set_professional_integrations(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) from public, anon;
grant execute on function public.admin_set_professional_integrations(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) to authenticated, service_role, postgres;

-- Audit staff provider/mailbox policy changes without creating a second audit subsystem.
create or replace function public.audit_staff_professional_account_change()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid:=coalesce(new.user_id,old.user_id); v_old jsonb; v_new jsonb;
begin
  if tg_op='INSERT' then
    v_old:=null;
  else
    v_old:=jsonb_build_object(
      'workEmail',old.work_email,'mailProvider',old.mail_provider,'calendarProvider',old.calendar_provider,
      'meetingProvider',old.meeting_provider,'mailboxStatus',old.mailbox_status,
      'calendarProviderGeneration',old.calendar_provider_generation);
  end if;
  if tg_op='DELETE' then
    v_new:=null;
  else
    v_new:=jsonb_build_object(
      'workEmail',new.work_email,'mailProvider',new.mail_provider,'calendarProvider',new.calendar_provider,
      'meetingProvider',new.meeting_provider,'mailboxStatus',new.mailbox_status,
      'calendarProviderGeneration',new.calendar_provider_generation);
  end if;
  insert into public.configuration_audit_log(config_key,old_value,new_value,changed_by)
  values('staff_professional_account:'||v_user::text,v_old,v_new,auth.uid());
  return coalesce(new,old);
end;
$function$;
revoke all on function public.audit_staff_professional_account_change() from public, anon, authenticated;
grant execute on function public.audit_staff_professional_account_change() to service_role, postgres;

drop trigger if exists trg_audit_staff_professional_account_change on public.staff_professional_accounts;
create trigger trg_audit_staff_professional_account_change
after insert or update or delete on public.staff_professional_accounts
for each row execute function public.audit_staff_professional_account_change();

-- 4) Extend terminal job states. 'skipped' is expected/benign; 'dead_letter' requires attention.
alter table public.google_calendar_sync_jobs drop constraint if exists google_calendar_sync_jobs_status_check;
alter table public.google_calendar_sync_jobs add constraint google_calendar_sync_jobs_status_check
  check (status = any(array['pending','processing','retry','succeeded','reconnect_required','failed','skipped','dead_letter']::text[]));

create index if not exists idx_google_sync_jobs_provider_generation
  on public.google_calendar_sync_jobs(user_id,calendar_provider_generation,status,next_attempt_at);

-- Existing jobs belong to the provider generation that was current when this migration was installed.
update public.google_calendar_sync_jobs j
set calendar_provider_generation=public.service_effective_calendar_provider_generation(j.user_id)
where j.calendar_provider_generation=1;

-- 5) Google queue is now provider-aware and generation-aware while preserving its public signature.
create or replace function public.queue_google_calendar_sync(p_user_id uuid, p_job_type text, p_meeting_id uuid default null::uuid, p_force boolean default false)
returns bigint
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_connection public.google_calendar_connections%rowtype; v_meeting public.sales_meetings%rowtype;
  v_basis text; v_key text; v_id bigint; v_generation integer;
begin
  if p_job_type not in('refresh_busy','upsert_event','delete_event','reconcile_event') then raise exception 'Invalid Google sync job type.'; end if;
  if public.service_effective_calendar_provider(p_user_id)<>'google' then return null; end if;
  v_generation:=public.service_effective_calendar_provider_generation(p_user_id);
  select * into v_connection from public.google_calendar_connections where user_id=p_user_id;
  if not found or v_connection.status<>'connected' or v_connection.sync_enabled is not true then return null; end if;
  if p_job_type<>'refresh_busy' then
    if p_meeting_id is null then raise exception 'Meeting is required for event synchronization.'; end if;
    select * into v_meeting from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id;
    if not found then raise exception 'Meeting does not belong to this Google connection.'; end if;
    v_basis:=concat_ws('|',v_generation::text,v_meeting.id::text,v_meeting.start_at::text,v_meeting.end_at::text,v_meeting.title,v_meeting.description,v_meeting.attendee_name,v_meeting.attendee_email,v_meeting.status,p_job_type);
  else
    v_basis:=concat_ws('|',v_generation::text,p_user_id::text,p_job_type,to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI'));
  end if;
  v_key:=p_user_id::text||':'||p_job_type||':g'||v_generation::text||':'||md5(v_basis);
  insert into public.google_calendar_sync_jobs(user_id,meeting_id,job_type,dedupe_key,status,next_attempt_at,calendar_provider_generation,updated_at)
  values(p_user_id,p_meeting_id,p_job_type,v_key,'pending',now(),v_generation,now())
  on conflict(dedupe_key) do update set
    status=case when p_force then 'pending' else public.google_calendar_sync_jobs.status end,
    next_attempt_at=case when p_force then now() else public.google_calendar_sync_jobs.next_attempt_at end,
    last_error=case when p_force then null else public.google_calendar_sync_jobs.last_error end,
    completed_at=case when p_force then null else public.google_calendar_sync_jobs.completed_at end,
    updated_at=now()
  returning id into v_id;
  if p_meeting_id is not null and p_job_type in('upsert_event','delete_event','reconcile_event') then
    update public.sales_meetings set sync_status='Pending',sync_error=null where id=p_meeting_id;
  end if;
  return v_id;
end;
$function$;
revoke all on function public.queue_google_calendar_sync(uuid,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.queue_google_calendar_sync(uuid,text,uuid,boolean) to service_role, postgres;

-- Google busy data is relevant only while Google is the user's active calendar provider.
create or replace function public.has_google_calendar_conflict(p_user_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_ignore_meeting_id uuid default null::uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_before integer:=0; v_after integer:=0; v_old_start timestamptz; v_old_end timestamptz; v_external text;
begin
  if p_user_id is null or p_start_at is null or p_end_at is null or p_end_at<=p_start_at then return true; end if;
  if public.service_effective_calendar_provider(p_user_id)<>'google' then return false; end if;
  if not exists(select 1 from public.google_calendar_connections c where c.user_id=p_user_id and c.status='connected' and c.sync_enabled) then return false; end if;
  select coalesce(buffer_before_minutes,0),coalesce(buffer_after_minutes,0) into v_before,v_after from public.user_calendar_settings where user_id=p_user_id;
  if p_ignore_meeting_id is not null then select start_at,end_at,external_event_id into v_old_start,v_old_end,v_external from public.sales_meetings where id=p_ignore_meeting_id; end if;
  return exists(select 1 from public.google_calendar_busy_blocks b
    where b.user_id=p_user_id
      and b.start_at<p_end_at+make_interval(mins=>greatest(v_after,0))
      and b.end_at>p_start_at-make_interval(mins=>greatest(v_before,0))
      and not(p_ignore_meeting_id is not null and nullif(v_external,'') is not null and b.start_at=v_old_start and b.end_at=v_old_end));
end;
$function$;
revoke all on function public.has_google_calendar_conflict(uuid,timestamptz,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.has_google_calendar_conflict(uuid,timestamptz,timestamptz,uuid) to service_role, postgres;

create or replace function public.request_google_calendar_sync_now()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid:=auth.uid(); v_busy bigint; v_event_count integer:=0; v_m record;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and not public.has_active_role(array['sales','editor','site_manager']::text[]) then
    raise exception 'Calendar integration is available only to authorized active staff and Administrators.';
  end if;
  if public.service_effective_calendar_provider(v_user)<>'google' then raise exception 'Google Calendar is not the active calendar provider for this account.'; end if;
  if not exists(select 1 from public.google_calendar_connections c where c.user_id=v_user and c.status='connected' and c.sync_enabled) then raise exception 'Google Calendar is not connected and enabled.'; end if;
  v_busy:=public.queue_google_calendar_sync(v_user,'refresh_busy',null,true);
  for v_m in select id from public.sales_meetings where salesperson_id=v_user and status in('Scheduled','Rescheduled') and end_at>=now() order by start_at limit 200 loop
    perform public.queue_google_calendar_sync(v_user,'reconcile_event',v_m.id,true); v_event_count:=v_event_count+1;
  end loop;
  return jsonb_build_object('busyJobId',v_busy,'meetingJobs',v_event_count);
end;
$function$;
revoke all on function public.request_google_calendar_sync_now() from public, anon;
grant execute on function public.request_google_calendar_sync_now() to authenticated, service_role, postgres;

create or replace function public.service_queue_due_google_busy_refreshes()
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_minutes integer:=5; v_row record; v_count integer:=0;
begin
  select least(greatest(coalesce((config_value->>'busyRefreshMinutes')::integer,5),2),60) into v_minutes from public.system_configuration where config_key='google_calendar_settings';
  v_minutes:=coalesce(v_minutes,5);
  for v_row in
    select c.user_id from public.google_calendar_connections c
    join public.user_profiles p on p.id=c.user_id
    where c.status='connected' and c.sync_enabled is true and p.status='active' and p.role in('sales','admin')
      and public.service_effective_calendar_provider(c.user_id)='google'
      and(c.last_successful_sync_at is null or c.last_successful_sync_at<now()-make_interval(mins=>v_minutes))
  loop
    if public.queue_google_calendar_sync(v_row.user_id,'refresh_busy',null,false) is not null then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.service_queue_due_google_busy_refreshes() from public, anon, authenticated;
grant execute on function public.service_queue_due_google_busy_refreshes() to service_role, postgres;

-- Before claiming work, neutralize jobs that belong to a disconnected or previous provider generation.
create or replace function public.service_claim_google_sync_jobs(p_limit integer default 20)
returns setof public.google_calendar_sync_jobs
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  update public.google_calendar_sync_jobs
  set status='retry',next_attempt_at=now(),locked_at=null,updated_at=now()
  where status='processing' and locked_at<now()-interval '10 minutes';

  update public.google_calendar_sync_jobs j
  set status='skipped',
      last_error=case
        when public.service_effective_calendar_provider(j.user_id)<>'google' then 'Skipped because Google is no longer the active calendar provider.'
        when j.calendar_provider_generation<>public.service_effective_calendar_provider_generation(j.user_id) then 'Skipped because the calendar provider assignment changed after this job was queued.'
        else 'Skipped because Google Calendar is no longer connected/enabled.' end,
      locked_at=null,completed_at=now(),updated_at=now()
  where j.status in('pending','retry')
    and (
      public.service_effective_calendar_provider(j.user_id)<>'google'
      or j.calendar_provider_generation<>public.service_effective_calendar_provider_generation(j.user_id)
      or not exists(select 1 from public.google_calendar_connections c where c.user_id=j.user_id and c.status='connected' and c.sync_enabled is true)
    );

  update public.sales_meetings m
  set sync_status='Not Connected',sync_error=null
  where m.status in('Scheduled','Rescheduled')
    and (
      public.service_effective_calendar_provider(m.salesperson_id)<>'google'
      or not exists(select 1 from public.google_calendar_connections c where c.user_id=m.salesperson_id and c.status='connected' and c.sync_enabled is true)
    )
    and m.sync_status='Pending';

  return query
  with picked as(
    select j.id from public.google_calendar_sync_jobs j
    where j.status in('pending','retry') and j.next_attempt_at<=now()
      and public.service_effective_calendar_provider(j.user_id)='google'
      and j.calendar_provider_generation=public.service_effective_calendar_provider_generation(j.user_id)
    order by j.next_attempt_at,j.id
    for update skip locked
    limit least(greatest(coalesce(p_limit,20),1),100)
  )
  update public.google_calendar_sync_jobs j
  set status='processing',attempts=j.attempts+1,locked_at=now(),updated_at=now()
  from picked p where j.id=p.id returning j.*;
end;
$function$;
revoke all on function public.service_claim_google_sync_jobs(integer) from public, anon, authenticated;
grant execute on function public.service_claim_google_sync_jobs(integer) to service_role, postgres;

create or replace function public.service_finish_google_sync_job(p_job_id bigint, p_status text, p_error text default null::text, p_retry_seconds integer default null::integer)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_job public.google_calendar_sync_jobs%rowtype;
begin
  if p_status not in('succeeded','retry','reconnect_required','failed','skipped','dead_letter') then raise exception 'Invalid sync job result.'; end if;
  select * into v_job from public.google_calendar_sync_jobs where id=p_job_id for update;
  if not found then return; end if;
  update public.google_calendar_sync_jobs set
    status=p_status,
    last_error=case when p_status='succeeded' then null else left(coalesce(p_error,''),2000) end,
    locked_at=null,
    next_attempt_at=case when p_status='retry' then now()+make_interval(secs=>least(greatest(coalesce(p_retry_seconds,60),5),21600)) else next_attempt_at end,
    completed_at=case when p_status in('succeeded','reconnect_required','failed','skipped','dead_letter') then now() else null end,
    updated_at=now()
  where id=p_job_id;
  if v_job.meeting_id is not null then
    update public.sales_meetings set
      sync_status=case when p_status='succeeded' then 'Synced' when p_status='retry' then 'Pending' when p_status='skipped' then 'Not Connected' else 'Error' end,
      sync_error=case when p_status in('succeeded','skipped') then null else left(coalesce(p_error,''),2000) end
    where id=v_job.meeting_id;
  end if;
end;
$function$;
revoke all on function public.service_finish_google_sync_job(bigint,text,text,integer) from public, anon, authenticated;
grant execute on function public.service_finish_google_sync_job(bigint,text,text,integer) to service_role, postgres;

create or replace function public.service_google_sync_maintenance()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_jobs integer; v_audit integer; v_states integer;
begin
  delete from public.google_calendar_sync_jobs where status in('succeeded','skipped') and completed_at<now()-interval '30 days'; get diagnostics v_jobs=row_count;
  delete from public.google_calendar_sync_audit where created_at<now()-interval '90 days'; get diagnostics v_audit=row_count;
  delete from public.google_calendar_oauth_states where expires_at<now()-interval '1 day' or consumed_at<now()-interval '1 day'; get diagnostics v_states=row_count;
  return jsonb_build_object('jobsDeleted',v_jobs,'auditDeleted',v_audit,'oauthStatesDeleted',v_states);
end;
$function$;
revoke all on function public.service_google_sync_maintenance() from public, anon, authenticated;
grant execute on function public.service_google_sync_maintenance() to service_role, postgres;

-- 6) Do not expose untrusted external HTML through the staff timeline until a sanitizer/attachment scanner is in the ingestion path.
create or replace function public.sales_client_inbox_timeline(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  select coalesce(jsonb_agg(x.item order by x.at,x.tie),'[]'::jsonb) into v_result
  from (
    select m.created_at at,m.id::text tie,jsonb_build_object(
      'id',m.id,'channel','chat','direction',case when m.sender_type='customer' then 'inbound' else 'outbound' end,
      'senderType',m.sender_type,'senderName',m.sender_name,'messageText',m.message_text,'subject','',
      'isInternalNote',m.is_internal_note,'createdAt',m.created_at) item
    from public.sales_chat_messages m where m.conversation_id=p_conversation_id
    union all
    select e.sent_or_received_at,e.id::text,jsonb_build_object(
      'id',e.id,'channel','email','provider',e.provider,'direction',e.direction,
      'senderType',case when e.direction='inbound' then 'customer' else 'staff' end,
      'senderName',e.from_email,'fromEmail',e.from_email,'toEmails',e.to_emails,'ccEmails',e.cc_emails,
      'subject',e.subject,'messageText',e.body_text,'bodyHtml','',
      'attachments',e.attachments,'deliveryStatus',e.delivery_status,'providerThreadId',e.provider_thread_id,
      'isInternalNote',false,'createdAt',e.sent_or_received_at,'htmlSuppressed',true) item
    from public.client_email_messages e where e.conversation_id=p_conversation_id
  ) x;
  return v_result;
end;
$function$;
revoke all on function public.sales_client_inbox_timeline(uuid) from public, anon;
grant execute on function public.sales_client_inbox_timeline(uuid) to authenticated, service_role, postgres;

-- 7) Add explicit future-safe assignment metadata for email ingestion; existing rows are explicit matches.
alter table public.client_email_messages add column if not exists assignment_required boolean not null default false;
alter table public.client_email_messages add column if not exists assignment_confidence numeric(4,3) not null default 1.000;
alter table public.client_email_messages add column if not exists assignment_method text not null default 'explicit';

do $do$
begin
  if not exists(select 1 from pg_constraint where conname='client_email_messages_assignment_confidence_check' and conrelid='public.client_email_messages'::regclass) then
    alter table public.client_email_messages add constraint client_email_messages_assignment_confidence_check check (assignment_confidence between 0 and 1);
  end if;
  if not exists(select 1 from pg_constraint where conname='client_email_messages_assignment_method_check' and conrelid='public.client_email_messages'::regclass) then
    alter table public.client_email_messages add constraint client_email_messages_assignment_method_check check (assignment_method in ('explicit','provider_thread','verified_email_owner','manual_review'));
  end if;
end $do$;

create index if not exists idx_client_email_messages_thread_lookup
  on public.client_email_messages(provider,provider_thread_id) where provider_thread_id is not null;

create or replace function public.service_resolve_client_email_conversation(p_provider_thread_id text, p_customer_email text, p_employee_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_thread text:=nullif(btrim(coalesce(p_provider_thread_id,'')),'');
  v_email text:=lower(btrim(coalesce(p_customer_email,'')));
  v_conversation uuid; v_count integer:=0;
begin
  if v_thread is not null then
    select count(distinct conversation_id), min(conversation_id) into v_count,v_conversation
    from public.client_email_messages where provider='zoho' and provider_thread_id=v_thread;
    if v_count=1 then
      return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',1.0,'method','provider_thread');
    elsif v_count>1 then
      return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','ambiguous_provider_thread');
    end if;
  end if;
  if v_email<>'' and p_employee_user_id is not null then
    select count(*), min(id) into v_count,v_conversation
    from public.sales_chat_conversations
    where lower(customer_email)=v_email and current_sales_id=p_employee_user_id and status<>'resolved';
    if v_count=1 then
      return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',0.95,'method','verified_email_owner');
    elsif v_count>1 then
      return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','multiple_open_conversations');
    end if;
  end if;
  return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','no_safe_match');
end;
$function$;
revoke all on function public.service_resolve_client_email_conversation(text,text,uuid) from public, anon, authenticated;
grant execute on function public.service_resolve_client_email_conversation(text,text,uuid) to service_role, postgres;

-- 8) Admin operational health view: counts only, no tokens or provider secrets.
create or replace function public.admin_get_integration_health()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_google_connected integer:=0; v_google_active integer:=0; v_google_pending integer:=0; v_google_retry integer:=0;
  v_google_processing integer:=0; v_google_reconnect integer:=0; v_google_failed integer:=0; v_google_dead integer:=0; v_google_skipped integer:=0;
  v_oldest_pending timestamptz; v_zoho_connected integer:=0; v_zoho_error integer:=0;
  v_mail_active integer:=0; v_mail_provisioning integer:=0; v_mail_error integer:=0; v_mail_suspended integer:=0;
  v_inbox_24h integer:=0; v_inbox_delivery_issues integer:=0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select count(*) filter(where status='connected' and sync_enabled),
         count(*) filter(where status='connected' and sync_enabled and public.service_effective_calendar_provider(user_id)='google')
    into v_google_connected,v_google_active from public.google_calendar_connections;
  select count(*) filter(where status='pending'),count(*) filter(where status='retry'),count(*) filter(where status='processing'),
         count(*) filter(where status='reconnect_required'),count(*) filter(where status='failed'),count(*) filter(where status='dead_letter'),
         count(*) filter(where status='skipped'),min(next_attempt_at) filter(where status in('pending','retry'))
    into v_google_pending,v_google_retry,v_google_processing,v_google_reconnect,v_google_failed,v_google_dead,v_google_skipped,v_oldest_pending
    from public.google_calendar_sync_jobs;
  select count(*) filter(where status='connected'),count(*) filter(where status='error') into v_zoho_connected,v_zoho_error from public.zoho_connections;
  select count(*) filter(where mailbox_status='active'),count(*) filter(where mailbox_status='provisioning'),
         count(*) filter(where mailbox_status='error'),count(*) filter(where mailbox_status='suspended')
    into v_mail_active,v_mail_provisioning,v_mail_error,v_mail_suspended from public.staff_professional_accounts;
  select count(*) filter(where sent_or_received_at>=now()-interval '24 hours'),
         count(*) filter(where lower(coalesce(delivery_status,'')) in('failed','bounced','rejected','error'))
    into v_inbox_24h,v_inbox_delivery_issues from public.client_email_messages;
  return jsonb_build_object(
    'generatedAt',now(),
    'google',jsonb_build_object('connectedAccounts',v_google_connected,'activeProviderAccounts',v_google_active,
      'pending',v_google_pending,'retry',v_google_retry,'processing',v_google_processing,'reconnectRequired',v_google_reconnect,
      'failedHistorical',v_google_failed,'deadLetter',v_google_dead,'skipped',v_google_skipped,'oldestPendingAt',v_oldest_pending),
    'zoho',jsonb_build_object('connectedAccounts',v_zoho_connected,'errorAccounts',v_zoho_error),
    'mailboxes',jsonb_build_object('active',v_mail_active,'provisioning',v_mail_provisioning,'error',v_mail_error,'suspended',v_mail_suspended),
    'clientInbox',jsonb_build_object('messagesLast24Hours',v_inbox_24h,'deliveryIssues',v_inbox_delivery_issues)
  );
end;
$function$;
revoke all on function public.admin_get_integration_health() from public, anon;
grant execute on function public.admin_get_integration_health() to authenticated, service_role, postgres;
