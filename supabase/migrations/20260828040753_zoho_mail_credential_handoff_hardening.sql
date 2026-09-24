-- Harden one-time Zoho credential reconciliation and make employee credential handoff part of Sales setup readiness.

create or replace function public.service_finish_professional_mailbox_job(
  p_job_id uuid,
  p_status text,
  p_work_email text default null::text,
  p_provider_user_id text default null::text,
  p_provider_account_id text default null::text,
  p_initial_password text default null::text,
  p_error text default null::text,
  p_retry_seconds integer default null::integer
)
returns void
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_job public.professional_mailbox_provisioning_jobs%rowtype;
  v_account public.staff_professional_accounts%rowtype;
  v_account_exists boolean:=false;
  v_preserve_existing_credential boolean:=false;
  v_secret_id uuid;
  v_secret_name text;
  v_email text:=lower(btrim(coalesce(p_work_email,'')));
begin
  if p_status not in ('succeeded','retry','dead_letter','skipped') then raise exception 'Unsupported mailbox job result.'; end if;
  select * into v_job from public.professional_mailbox_provisioning_jobs where id=p_job_id for update;
  if not found then return; end if;

  if p_status='succeeded' then
    if v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'A valid professional email is required for success.'; end if;

    select * into v_account from public.staff_professional_accounts where user_id=v_job.user_id for update;
    v_account_exists:=found;
    v_preserve_existing_credential:=v_account_exists
      and v_account.mailbox_status='active'
      and lower(btrim(coalesce(v_account.work_email,'')))=v_email;

    if nullif(coalesce(p_initial_password,''),'') is not null then
      v_secret_name:='profox_zoho_first_login_'||v_job.user_id::text;
      select id into v_secret_id from vault.secrets where name=v_secret_name limit 1;
      if v_secret_id is null then
        v_secret_id:=vault.create_secret(p_initial_password,v_secret_name,'One-time Zoho Mail first-login password. Revealed once to the owning employee.',null);
      else
        perform vault.update_secret(v_secret_id,p_initial_password,v_secret_name,'One-time Zoho Mail first-login password. Revealed once to the owning employee.',null);
      end if;
      if v_account_exists and v_account.initial_password_secret_id is not null and v_account.initial_password_secret_id<>v_secret_id then
        delete from vault.secrets where id=v_account.initial_password_secret_id;
      end if;
    elsif not v_preserve_existing_credential then
      if v_account_exists and v_account.initial_password_secret_id is not null then
        delete from vault.secrets where id=v_account.initial_password_secret_id;
      end if;
      v_secret_id:=null;
    end if;

    insert into public.staff_professional_accounts(
      user_id,work_email,mail_provider,mailbox_status,provider_user_id,provider_account_id,mail_provider_generation,
      initial_password_secret_id,first_login_credentials_retrieved_at,provisioned_at,last_error,updated_at
    ) values(
      v_job.user_id,v_email,'zoho','active',nullif(btrim(coalesce(p_provider_user_id,'')),''),nullif(btrim(coalesce(p_provider_account_id,'')),''),v_job.mail_provider_generation,
      v_secret_id,null,now(),null,now()
    )
    on conflict(user_id) do update set
      work_email=excluded.work_email,
      mail_provider='zoho',
      mailbox_status='active',
      provider_user_id=excluded.provider_user_id,
      provider_account_id=excluded.provider_account_id,
      mail_provider_generation=excluded.mail_provider_generation,
      initial_password_secret_id=case
        when v_preserve_existing_credential then public.staff_professional_accounts.initial_password_secret_id
        else excluded.initial_password_secret_id
      end,
      first_login_credentials_retrieved_at=case
        when excluded.initial_password_secret_id is not null then null
        else public.staff_professional_accounts.first_login_credentials_retrieved_at
      end,
      provisioned_at=coalesce(public.staff_professional_accounts.provisioned_at,now()),
      last_error=null,
      updated_at=now();
  elsif p_status='retry' then
    update public.staff_professional_accounts set mailbox_status='provisioning',last_error=left(coalesce(p_error,''),1000),updated_at=now() where user_id=v_job.user_id and mailbox_status<>'active';
  elsif p_status='dead_letter' then
    update public.staff_professional_accounts set mailbox_status='error',last_error=left(coalesce(p_error,''),1000),updated_at=now() where user_id=v_job.user_id and mailbox_status<>'active';
  elsif p_status='skipped' then
    update public.staff_professional_accounts set mailbox_status='not_configured',last_error=null,updated_at=now() where user_id=v_job.user_id and work_email is null and mailbox_status<>'active';
  end if;

  update public.professional_mailbox_provisioning_jobs set
    status=p_status,
    last_error=case when p_status='succeeded' then null else left(coalesce(p_error,''),2000) end,
    locked_at=null,
    next_attempt_at=case when p_status='retry' then now()+make_interval(secs=>least(greatest(coalesce(p_retry_seconds,60),10),21600)) else next_attempt_at end,
    completed_at=case when p_status in ('succeeded','dead_letter','skipped') then now() else null end,
    updated_at=now()
  where id=p_job_id;
end;
$function$;

create or replace function public.get_my_sales_account_setup_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_state public.sales_account_setup_state%rowtype;
  v_calendar public.user_calendar_settings%rowtype;
  v_pi jsonb;
  v_photo boolean:=false;
  v_timezone boolean:=false;
  v_email_req boolean:=false;
  v_email_ready boolean:=true;
  v_credential_pending boolean:=false;
  v_calendar_ready boolean:=false;
  v_meeting_ready boolean:=false;
  v_availability boolean:=false;
  v_crm boolean:=false;
  v_ready boolean:=false;
  v_progress integer:=0;
  v_cal_provider text;
  v_meet_provider text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_profile from public.user_profiles where id=v_uid;
  if not found or v_profile.status<>'active' or v_profile.role not in ('sales','sales_rep','sales_team') then raise exception 'Active Sales Representative access required.'; end if;

  insert into public.sales_account_setup_state(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_state from public.sales_account_setup_state where user_id=v_uid for update;
  select * into v_calendar from public.user_calendar_settings where user_id=v_uid;
  v_pi:=public.get_my_professional_integration_status();
  v_cal_provider:=coalesce(v_pi->>'calendarProvider','google');
  v_meet_provider:=coalesce(v_pi->>'meetingProvider','google_meet');

  v_photo:=coalesce(length(btrim(v_profile.avatar_url)),0)>0;
  v_timezone:=coalesce(length(btrim(v_profile.timezone)),0)>0;
  v_email_req:=coalesce((v_pi->>'professionalEmailRequired')::boolean,false);
  v_email_ready:=coalesce((v_pi->>'professionalEmailReady')::boolean,not v_email_req);
  select exists(
    select 1
    from public.staff_professional_accounts a
    where a.user_id=v_uid
      and a.mail_provider='zoho'
      and a.mailbox_status='active'
      and a.initial_password_secret_id is not null
      and a.first_login_credentials_retrieved_at is null
  ) into v_credential_pending;
  v_calendar_ready:=case when v_cal_provider='zoho' then coalesce((v_pi->'zoho'->>'connected')::boolean,false) and coalesce((v_pi->>'zohoCalendarEnabled')::boolean,false) else coalesce((v_pi->'google'->>'connected')::boolean,false) end;
  v_meeting_ready:=case when v_meet_provider='zoho_meeting' then coalesce((v_pi->'zoho'->>'meetingReady')::boolean,false) and coalesce((v_pi->>'zohoMeetingEnabled')::boolean,false) else coalesce((v_pi->'google'->>'meetReady')::boolean,false) end;
  v_availability:=coalesce(v_calendar.active,false) and coalesce(array_length(v_calendar.working_days,1),0)>0 and v_calendar.work_start is not null and v_calendar.work_end is not null and v_calendar.work_end>v_calendar.work_start;
  v_crm:=coalesce(v_state.crm_tour_completed_at is not null or v_state.crm_tour_step>=6,false);
  v_ready:=v_photo and v_timezone and v_email_ready and not v_credential_pending and v_calendar_ready and v_meeting_ready and v_availability and v_crm;

  if v_ready and v_state.completed_at is null then
    update public.sales_account_setup_state set completed_at=now(),updated_at=now() where user_id=v_uid returning * into v_state;
  elsif not v_ready and v_state.completed_at is not null then
    update public.sales_account_setup_state set completed_at=null,updated_at=now() where user_id=v_uid returning * into v_state;
  end if;

  if v_email_req then
    v_progress:=least(100,(case when v_photo then 15 else 0 end)+(case when v_timezone then 10 else 0 end)+(case when v_email_ready then 10 else 0 end)+(case when v_calendar_ready then 15 else 0 end)+(case when v_meeting_ready then 10 else 0 end)+(case when v_availability then 15 else 0 end)+round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer);
  else
    v_progress:=least(100,(case when v_photo then 15 else 0 end)+(case when v_timezone then 10 else 0 end)+(case when v_calendar_ready then 20 else 0 end)+(case when v_meeting_ready then 15 else 0 end)+(case when v_availability then 15 else 0 end)+round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer);
  end if;
  if v_credential_pending then v_progress:=least(v_progress,95); end if;

  return jsonb_build_object(
    'userId',v_uid,
    'profilePhotoReady',v_photo,
    'timezoneReady',v_timezone,
    'professionalEmailRequired',v_email_req,
    'professionalEmailReady',v_email_ready,
    'professionalEmailCredentialPending',v_credential_pending,
    'workEmail',coalesce(v_pi->>'workEmail',''),
    'mailProvider',coalesce(v_pi->>'mailProvider','none'),
    'calendarProvider',v_cal_provider,
    'meetingProvider',v_meet_provider,
    'calendarConnected',v_calendar_ready,
    'meetingReady',v_meeting_ready,
    'googleCalendarConnected',coalesce((v_pi->'google'->>'connected')::boolean,false),
    'googleMeetReady',coalesce((v_pi->'google'->>'meetReady')::boolean,false),
    'googleAccountEmail',coalesce(v_pi->'google'->>'accountEmail',''),
    'googleCalendarTimezone',coalesce(v_pi->'google'->>'calendarTimezone',''),
    'zohoCalendarConnected',coalesce((v_pi->'zoho'->>'connected')::boolean,false),
    'zohoMeetingReady',coalesce((v_pi->'zoho'->>'meetingReady')::boolean,false),
    'zohoAccountEmail',coalesce(v_pi->'zoho'->>'accountEmail',''),
    'zohoCalendarTimezone',coalesce(v_pi->'zoho'->>'calendarTimezone',''),
    'zohoEnabled',coalesce((v_pi->>'zohoEnabled')::boolean,false),
    'availabilityReady',v_availability,
    'workingDays',coalesce(v_calendar.working_days,'{}'::integer[]),
    'workStart',case when v_calendar.work_start is null then null else to_char(v_calendar.work_start,'HH24:MI') end,
    'workEnd',case when v_calendar.work_end is null then null else to_char(v_calendar.work_end,'HH24:MI') end,
    'crmTourStep',v_state.crm_tour_step,
    'crmTourCompleted',v_crm,
    'setupCompleted',v_state.completed_at is not null and v_ready,
    'completedAt',v_state.completed_at,
    'startedAt',v_state.started_at,
    'progressPercent',v_progress
  );
end;
$function$;

revoke all on function public.service_finish_professional_mailbox_job(uuid,text,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.service_finish_professional_mailbox_job(uuid,text,text,text,text,text,text,integer) to service_role,postgres;
revoke all on function public.get_my_sales_account_setup_status() from public,anon;
grant execute on function public.get_my_sales_account_setup_status() to authenticated,service_role,postgres;
