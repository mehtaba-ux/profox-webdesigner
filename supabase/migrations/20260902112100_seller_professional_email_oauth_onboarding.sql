-- Seller professional email onboarding must use the secure per-mailbox Zoho OAuth
-- connection rather than legacy first-login password retrieval.
--
-- Safety rules:
-- 1. Professional email remains optional unless Admin explicitly requires it.
-- 2. When required, a NEW seller must authorize the exact active professional
--    mailbox once before initial account setup can complete.
-- 3. Once the account setup has completed, a later Zoho reconnect/error state
--    blocks professional email operations only; it must not revoke the seller's
--    entire ProFox workspace.
-- 4. Legacy temporary-password handoff state is returned for support/compatibility
--    but no longer participates in readiness or progress.

create or replace function public.get_my_sales_account_setup_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_state public.sales_account_setup_state%rowtype;
  v_calendar public.user_calendar_settings%rowtype;
  v_mail_account public.staff_professional_accounts%rowtype;
  v_mail_connection public.zoho_user_mail_send_connections%rowtype;
  v_pi jsonb;
  v_photo boolean:=false;
  v_timezone boolean:=false;
  v_email_req boolean:=false;
  v_email_ready boolean:=true;
  v_credential_pending boolean:=false;
  v_email_authorized_once boolean:=false;
  v_email_send_connected boolean:=false;
  v_email_connection_status text:='disconnected';
  v_calendar_ready boolean:=false;
  v_meeting_ready boolean:=false;
  v_availability boolean:=false;
  v_crm boolean:=false;
  v_non_email_ready boolean:=false;
  v_email_onboarding_ready boolean:=false;
  v_initial_ready boolean:=false;
  v_setup_completed boolean:=false;
  v_progress integer:=0;
  v_cal_provider text;
  v_meet_provider text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_profile
  from public.user_profiles
  where id=v_uid;

  if not found
     or v_profile.status<>'active'
     or v_profile.role not in ('sales','sales_rep','sales_team')
  then
    raise exception 'Active Sales Representative access required.';
  end if;

  insert into public.sales_account_setup_state(user_id)
  values(v_uid)
  on conflict(user_id) do nothing;

  select * into v_state
  from public.sales_account_setup_state
  where user_id=v_uid
  for update;

  select * into v_calendar
  from public.user_calendar_settings
  where user_id=v_uid;

  select * into v_mail_account
  from public.staff_professional_accounts
  where user_id=v_uid;

  select * into v_mail_connection
  from public.zoho_user_mail_send_connections
  where user_id=v_uid;

  v_pi:=public.get_my_professional_integration_status();
  v_cal_provider:=coalesce(v_pi->>'calendarProvider','google');
  v_meet_provider:=coalesce(v_pi->>'meetingProvider','google_meet');

  v_photo:=coalesce(length(btrim(v_profile.avatar_url)),0)>0;
  v_timezone:=coalesce(length(btrim(v_profile.timezone)),0)>0;
  v_email_req:=coalesce((v_pi->>'professionalEmailRequired')::boolean,false);
  v_email_ready:=coalesce((v_pi->>'professionalEmailReady')::boolean,not v_email_req);

  -- Retained only for backwards-compatible support visibility. It no longer
  -- gates setup completion or caps progress.
  select exists(
    select 1
    from public.staff_professional_accounts a
    where a.user_id=v_uid
      and a.mail_provider='zoho'
      and a.mailbox_status='active'
      and a.initial_password_secret_id is not null
      and a.first_login_credentials_retrieved_at is null
  ) into v_credential_pending;

  -- Durable evidence that the exact CURRENT mailbox identity has successfully
  -- completed Zoho OAuth at least once. A later reconnect_required/error status
  -- leaves connected_at and identity in place, so it does not revoke workspace
  -- setup; professional email operations enforce current connection health.
  v_email_authorized_once := coalesce(
    v_mail_account.user_id=v_uid
    and v_mail_account.mailbox_status='active'
    and v_mail_account.mail_provider='zoho'
    and coalesce(nullif(btrim(v_mail_account.work_email),''),'')<>''
    and coalesce(nullif(btrim(v_mail_account.provider_account_id),''),'')<>''
    and v_mail_connection.user_id=v_uid
    and v_mail_connection.connected_at is not null
    and lower(btrim(v_mail_connection.work_email))=lower(btrim(v_mail_account.work_email))
    and v_mail_connection.provider_account_id=v_mail_account.provider_account_id,
    false
  );

  v_email_connection_status:=coalesce(nullif(btrim(v_mail_connection.status),''),'disconnected');
  v_email_send_connected:=v_email_authorized_once and v_email_connection_status='connected';

  v_calendar_ready:=case
    when v_cal_provider='zoho' then
      coalesce((v_pi->'zoho'->>'connected')::boolean,false)
      and coalesce((v_pi->>'zohoCalendarEnabled')::boolean,false)
    else coalesce((v_pi->'google'->>'connected')::boolean,false)
  end;

  v_meeting_ready:=case
    when v_meet_provider='zoho_meeting' then
      coalesce((v_pi->'zoho'->>'meetingReady')::boolean,false)
      and coalesce((v_pi->>'zohoMeetingEnabled')::boolean,false)
    else coalesce((v_pi->'google'->>'meetReady')::boolean,false)
  end;

  v_availability:=coalesce(v_calendar.active,false)
    and coalesce(array_length(v_calendar.working_days,1),0)>0
    and v_calendar.work_start is not null
    and v_calendar.work_end is not null
    and v_calendar.work_end>v_calendar.work_start;

  v_crm:=coalesce(v_state.crm_tour_completed_at is not null or v_state.crm_tour_step>=6,false);

  v_non_email_ready:=v_photo and v_timezone and v_calendar_ready and v_meeting_ready and v_availability and v_crm;
  v_email_onboarding_ready:=not v_email_req or (v_email_ready and v_email_authorized_once);
  v_initial_ready:=v_non_email_ready and v_email_onboarding_ready;

  -- Initial setup may require professional-mail OAuth. After completion, only
  -- non-email foundational setup can revoke the setup state. Email health is
  -- enforced by the dedicated professional-mail send/sync authorization path.
  if v_state.completed_at is null and v_initial_ready then
    update public.sales_account_setup_state
    set completed_at=now(),updated_at=now()
    where user_id=v_uid
    returning * into v_state;
  elsif v_state.completed_at is not null and not v_non_email_ready then
    update public.sales_account_setup_state
    set completed_at=null,updated_at=now()
    where user_id=v_uid
    returning * into v_state;
  end if;

  v_setup_completed:=v_state.completed_at is not null and v_non_email_ready;

  if v_email_req and v_state.completed_at is null then
    v_progress:=least(100,
      (case when v_photo then 15 else 0 end)
      +(case when v_timezone then 10 else 0 end)
      +(case when v_email_ready then 5 else 0 end)
      +(case when v_email_authorized_once then 5 else 0 end)
      +(case when v_calendar_ready then 15 else 0 end)
      +(case when v_meeting_ready then 10 else 0 end)
      +(case when v_availability then 15 else 0 end)
      +round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer
    );
  elsif v_email_req then
    -- Already-completed sellers are not pushed backwards by a later email
    -- reconnect requirement.
    v_progress:=least(100,
      (case when v_photo then 15 else 0 end)
      +(case when v_timezone then 10 else 0 end)
      +10
      +(case when v_calendar_ready then 15 else 0 end)
      +(case when v_meeting_ready then 10 else 0 end)
      +(case when v_availability then 15 else 0 end)
      +round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer
    );
  else
    v_progress:=least(100,
      (case when v_photo then 15 else 0 end)
      +(case when v_timezone then 10 else 0 end)
      +(case when v_calendar_ready then 20 else 0 end)
      +(case when v_meeting_ready then 15 else 0 end)
      +(case when v_availability then 15 else 0 end)
      +round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer
    );
  end if;

  return jsonb_build_object(
    'userId',v_uid,
    'profilePhotoReady',v_photo,
    'timezoneReady',v_timezone,
    'professionalEmailRequired',v_email_req,
    'professionalEmailReady',v_email_ready,
    'professionalEmailCredentialPending',v_credential_pending,
    'professionalEmailAuthorizedOnce',v_email_authorized_once,
    'professionalEmailSendConnected',v_email_send_connected,
    'professionalEmailSendConnectionStatus',v_email_connection_status,
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
    'setupCompleted',v_setup_completed,
    'completedAt',v_state.completed_at,
    'startedAt',v_state.started_at,
    'progressPercent',v_progress
  );
end;
$function$;
