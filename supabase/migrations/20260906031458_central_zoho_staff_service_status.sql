create or replace function public.get_my_professional_integration_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_account public.staff_professional_accounts%rowtype;
  v_google public.google_calendar_connections%rowtype;
  v_zoho public.zoho_service_calendar_connection%rowtype;
  v_cfg jsonb:='{}'::jsonb;
  v_cal text;
  v_meet text;
  v_mail text;
  v_mailbox_eligible boolean:=false;
  v_email_required boolean:=false;
  v_mail_provisioning boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_profile from public.user_profiles where id=v_uid and lower(coalesce(status,''))='active';
  if not found or lower(coalesce(v_profile.role,'')) in ('customer','client','pending','talent_partner') then raise exception 'Active staff access required.'; end if;

  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  select * into v_account from public.staff_professional_accounts where user_id=v_uid;
  select * into v_google from public.google_calendar_connections where user_id=v_uid;
  select * into v_zoho from public.zoho_service_calendar_connection where singleton_key='primary';

  v_mailbox_eligible:=public.service_professional_mailbox_eligible(v_uid);
  v_email_required:=v_mailbox_eligible and coalesce((v_cfg->>'professionalEmailRequired')::boolean,false);
  v_mail_provisioning:=v_mailbox_eligible and coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false);
  v_mail:=case when v_mailbox_eligible then coalesce(v_account.mail_provider,nullif(v_cfg->>'defaultMailProvider',''),'none') else coalesce(v_account.mail_provider,'none') end;
  v_cal:=coalesce(v_account.calendar_provider,nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  v_meet:=coalesce(v_account.meeting_provider,nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet');

  return jsonb_build_object(
    'userId',v_uid,
    'professionalMailboxEligible',v_mailbox_eligible,
    'workEmail',coalesce(v_account.work_email,''),
    'mailProvider',v_mail,
    'calendarProvider',v_cal,
    'meetingProvider',v_meet,
    'mailboxStatus',coalesce(v_account.mailbox_status,'not_configured'),
    'professionalEmailRequired',v_email_required,
    'professionalEmailReady',not v_email_required or (
      coalesce(v_account.mailbox_status='active',false)
      and coalesce(length(btrim(v_account.work_email)),0)>0
    ),
    'zohoEnabled',coalesce((v_cfg->>'zohoEnabled')::boolean,false),
    'zohoMailEnabled',coalesce((v_cfg->>'zohoMailEnabled')::boolean,false),
    'zohoCalendarEnabled',coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false),
    'zohoMeetingEnabled',coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false),
    'mailProvisioningEnabled',v_mail_provisioning,
    'google',jsonb_build_object(
      'connected',coalesce(v_google.status='connected',false),
      'status',coalesce(v_google.status,'disconnected'),
      'accountEmail',coalesce(v_google.account_email,''),
      'calendarTimezone',coalesce(v_google.calendar_timezone,''),
      'meetReady',coalesce(v_google.status='connected' and v_google.create_meet,false)
    ),
    'zoho',jsonb_build_object(
      'connected',coalesce(v_zoho.status='connected',false) and coalesce(nullif(v_zoho.calendar_id,''),'')<>'',
      'status',coalesce(v_zoho.status,'disconnected'),
      'accountEmail',coalesce(v_zoho.account_email,''),
      'calendarTimezone',coalesce(v_zoho.calendar_timezone,''),
      'meetingReady',coalesce(v_zoho.status='connected' and v_zoho.meeting_ready,false),
      'managedByProFox',true,
      'sellerAuthorizationRequired',false,
      'lastSuccessfulSyncAt',v_zoho.last_successful_sync_at,
      'lastError',v_zoho.last_error
    )
  );
end;
$$;
revoke all on function public.get_my_professional_integration_status() from public,anon;
grant execute on function public.get_my_professional_integration_status() to authenticated,service_role;

create or replace function public.get_zoho_service_calendar_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_row public.zoho_service_calendar_connection%rowtype;
  v_cfg jsonb:='{}'::jsonb;
  v_provider_id boolean:=false;
  v_provider_secret boolean:=false;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_profile from public.user_profiles where id=v_user and lower(coalesce(status,''))='active';
  if not found or lower(coalesce(v_profile.role,'')) in ('customer','client','pending','talent_partner') then raise exception 'Active staff access required.'; end if;
  select * into v_row from public.zoho_service_calendar_connection where singleton_key='primary';
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  select exists(select 1 from vault.secrets where name='profox_zoho_client_id') into v_provider_id;
  select exists(select 1 from vault.secrets where name='profox_zoho_client_secret') into v_provider_secret;
  return jsonb_build_object(
    'connected',found and v_row.status='connected',
    'status',coalesce(v_row.status,'disconnected'),
    'accountEmail',coalesce(v_row.account_email,''),
    'calendarId',coalesce(v_row.calendar_id,''),
    'calendarTimezone',coalesce(v_row.calendar_timezone,''),
    'meetingReady',coalesce(v_row.meeting_ready,false),
    'lastAuthAt',v_row.last_auth_at,
    'lastSuccessfulSyncAt',v_row.last_successful_sync_at,
    'lastError',v_row.last_error,
    'calendarEnabled',coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false),
    'meetingEnabled',coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false),
    'defaultCalendarProvider',coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google'),
    'defaultMeetingProvider',coalesce(nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet'),
    'providerConfigured',v_provider_id and v_provider_secret,
    'managedByProFox',true,
    'sellerAuthorizationRequired',false
  );
end;
$$;
revoke all on function public.get_zoho_service_calendar_status() from public,anon;
grant execute on function public.get_zoho_service_calendar_status() to authenticated,service_role;

create or replace function public.get_my_sales_account_setup_status()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_state public.sales_account_setup_state%rowtype;
  v_calendar public.user_calendar_settings%rowtype;
  v_mail_account public.staff_professional_accounts%rowtype;
  v_pi jsonb;
  v_mail_status jsonb;
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
  select * into v_profile from public.user_profiles where id=v_uid;
  if not found or v_profile.status<>'active' or v_profile.role not in ('sales','sales_rep','sales_team') then raise exception 'Active Sales Representative access required.'; end if;

  insert into public.sales_account_setup_state(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_state from public.sales_account_setup_state where user_id=v_uid for update;
  select * into v_calendar from public.user_calendar_settings where user_id=v_uid;
  select * into v_mail_account from public.staff_professional_accounts where user_id=v_uid;

  v_pi:=public.get_my_professional_integration_status();
  v_mail_status:=public.get_my_professional_mail_send_status();
  v_cal_provider:=coalesce(v_pi->>'calendarProvider','google');
  v_meet_provider:=coalesce(v_pi->>'meetingProvider','google_meet');
  v_photo:=coalesce(length(btrim(v_profile.avatar_url)),0)>0;
  v_timezone:=coalesce(length(btrim(v_profile.timezone)),0)>0;
  v_email_req:=coalesce((v_pi->>'professionalEmailRequired')::boolean,false);
  v_email_ready:=coalesce((v_pi->>'professionalEmailReady')::boolean,not v_email_req);

  select exists(
    select 1 from public.staff_professional_accounts a
    where a.user_id=v_uid and a.mail_provider='zoho' and a.mailbox_status='active'
      and a.initial_password_secret_id is not null and a.first_login_credentials_retrieved_at is null
  ) into v_credential_pending;

  v_email_send_connected:=coalesce((v_mail_status->>'sendConnected')::boolean,false);
  v_email_authorized_once:=v_email_send_connected;
  v_email_connection_status:=coalesce(nullif(v_mail_status->>'sendConnectionStatus',''),'disconnected');

  v_calendar_ready:=case
    when v_cal_provider='zoho' then coalesce((v_pi->'zoho'->>'connected')::boolean,false) and coalesce((v_pi->>'zohoCalendarEnabled')::boolean,false)
    else coalesce((v_pi->'google'->>'connected')::boolean,false)
  end;
  v_meeting_ready:=case
    when v_meet_provider='zoho_meeting' then coalesce((v_pi->'zoho'->>'meetingReady')::boolean,false) and coalesce((v_pi->>'zohoMeetingEnabled')::boolean,false)
    else coalesce((v_pi->'google'->>'meetReady')::boolean,false)
  end;

  v_availability:=coalesce(v_calendar.active,false) and coalesce(array_length(v_calendar.working_days,1),0)>0 and v_calendar.work_start is not null and v_calendar.work_end is not null and v_calendar.work_end>v_calendar.work_start;
  v_crm:=coalesce(v_state.crm_tour_completed_at is not null or v_state.crm_tour_step>=6,false);
  v_non_email_ready:=v_photo and v_timezone and v_calendar_ready and v_meeting_ready and v_availability and v_crm;
  v_email_onboarding_ready:=not v_email_req or (v_email_ready and v_email_send_connected);
  v_initial_ready:=v_non_email_ready and v_email_onboarding_ready;

  if v_state.completed_at is null and v_initial_ready then
    update public.sales_account_setup_state set completed_at=now(),updated_at=now() where user_id=v_uid returning * into v_state;
  elsif v_state.completed_at is not null and not v_non_email_ready then
    update public.sales_account_setup_state set completed_at=null,updated_at=now() where user_id=v_uid returning * into v_state;
  end if;
  v_setup_completed:=v_state.completed_at is not null and v_non_email_ready;

  if v_email_req and v_state.completed_at is null then
    v_progress:=least(100,
      (case when v_photo then 15 else 0 end)+(case when v_timezone then 10 else 0 end)
      +(case when v_email_ready then 5 else 0 end)+(case when v_email_send_connected then 5 else 0 end)
      +(case when v_calendar_ready then 15 else 0 end)+(case when v_meeting_ready then 10 else 0 end)
      +(case when v_availability then 15 else 0 end)+round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer);
  elsif v_email_req then
    v_progress:=least(100,
      (case when v_photo then 15 else 0 end)+(case when v_timezone then 10 else 0 end)+10
      +(case when v_calendar_ready then 15 else 0 end)+(case when v_meeting_ready then 10 else 0 end)
      +(case when v_availability then 15 else 0 end)+round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer);
  else
    v_progress:=least(100,
      (case when v_photo then 15 else 0 end)+(case when v_timezone then 10 else 0 end)
      +(case when v_calendar_ready then 20 else 0 end)+(case when v_meeting_ready then 15 else 0 end)
      +(case when v_availability then 15 else 0 end)+round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer);
  end if;

  return jsonb_build_object(
    'userId',v_uid,'profilePhotoReady',v_photo,'timezoneReady',v_timezone,
    'professionalEmailRequired',v_email_req,'professionalEmailReady',v_email_ready,
    'professionalEmailCredentialPending',v_credential_pending,
    'professionalEmailAuthorizedOnce',v_email_authorized_once,
    'professionalEmailSendConnected',v_email_send_connected,
    'professionalEmailSendConnectionStatus',v_email_connection_status,
    'professionalEmailAdminManaged',true,
    'workEmail',coalesce(v_pi->>'workEmail',''),'mailProvider',coalesce(v_pi->>'mailProvider','none'),
    'calendarProvider',v_cal_provider,'meetingProvider',v_meet_provider,
    'calendarConnected',v_calendar_ready,'meetingReady',v_meeting_ready,
    'googleCalendarConnected',coalesce((v_pi->'google'->>'connected')::boolean,false),
    'googleMeetReady',coalesce((v_pi->'google'->>'meetReady')::boolean,false),
    'googleAccountEmail',coalesce(v_pi->'google'->>'accountEmail',''),
    'googleCalendarTimezone',coalesce(v_pi->'google'->>'calendarTimezone',''),
    'zohoCalendarConnected',coalesce((v_pi->'zoho'->>'connected')::boolean,false),
    'zohoMeetingReady',coalesce((v_pi->'zoho'->>'meetingReady')::boolean,false),
    'zohoAccountEmail',coalesce(v_pi->'zoho'->>'accountEmail',''),
    'zohoCalendarTimezone',coalesce(v_pi->'zoho'->>'calendarTimezone',''),
    'zohoEnabled',coalesce((v_pi->>'zohoEnabled')::boolean,false),
    'availabilityReady',v_availability,'workingDays',coalesce(v_calendar.working_days,'{}'::integer[]),
    'workStart',case when v_calendar.work_start is null then null else to_char(v_calendar.work_start,'HH24:MI') end,
    'workEnd',case when v_calendar.work_end is null then null else to_char(v_calendar.work_end,'HH24:MI') end,
    'crmTourStep',v_state.crm_tour_step,'crmTourCompleted',v_crm,'setupCompleted',v_setup_completed,
    'completedAt',v_state.completed_at,'startedAt',v_state.started_at,'progressPercent',v_progress
  );
end;
$$;
revoke all on function public.get_my_sales_account_setup_status() from public,anon;
grant execute on function public.get_my_sales_account_setup_status() to authenticated,service_role;

create or replace function public.admin_get_integration_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_google_connected integer:=0; v_google_active integer:=0; v_google_pending integer:=0; v_google_retry integer:=0; v_google_processing integer:=0; v_google_reconnect integer:=0; v_google_failed integer:=0; v_google_dead integer:=0; v_google_skipped integer:=0; v_oldest_pending timestamptz;
  v_zoho_connected integer:=0; v_zoho_error integer:=0; v_org_mail_status text:='disconnected'; v_org_mail_verified timestamptz;
  v_mail_active integer:=0; v_mail_provisioning integer:=0; v_mail_error integer:=0; v_mail_suspended integer:=0; v_mail_pending integer:=0; v_mail_retry integer:=0; v_mail_processing integer:=0; v_mail_dead integer:=0; v_mail_oldest timestamptz;
  v_inbox_24h integer:=0; v_inbox_delivery_issues integer:=0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select count(*) filter(where status='connected' and sync_enabled),count(*) filter(where status='connected' and sync_enabled and public.service_effective_calendar_provider(user_id)='google') into v_google_connected,v_google_active from public.google_calendar_connections;
  select count(*) filter(where status='pending'),count(*) filter(where status='retry'),count(*) filter(where status='processing'),count(*) filter(where status='reconnect_required'),count(*) filter(where status='failed'),count(*) filter(where status='dead_letter'),count(*) filter(where status='skipped'),min(next_attempt_at) filter(where status in('pending','retry')) into v_google_pending,v_google_retry,v_google_processing,v_google_reconnect,v_google_failed,v_google_dead,v_google_skipped,v_oldest_pending from public.google_calendar_sync_jobs;
  select count(*) filter(where status='connected'),count(*) filter(where status in ('error','reconnect_required')) into v_zoho_connected,v_zoho_error from public.zoho_service_calendar_connection;
  select status,last_verified_at into v_org_mail_status,v_org_mail_verified from public.zoho_organization_mail_connection where singleton_key='primary';
  select count(*) filter(where mailbox_status='active'),count(*) filter(where mailbox_status='provisioning'),count(*) filter(where mailbox_status='error'),count(*) filter(where mailbox_status='suspended') into v_mail_active,v_mail_provisioning,v_mail_error,v_mail_suspended from public.staff_professional_accounts;
  select count(*) filter(where status='pending'),count(*) filter(where status='retry'),count(*) filter(where status='processing'),count(*) filter(where status='dead_letter'),min(next_attempt_at) filter(where status in('pending','retry')) into v_mail_pending,v_mail_retry,v_mail_processing,v_mail_dead,v_mail_oldest from public.professional_mailbox_provisioning_jobs;
  select count(*) filter(where sent_or_received_at>=now()-interval '24 hours'),count(*) filter(where lower(coalesce(delivery_status,'')) in('failed','bounced','rejected','error')) into v_inbox_24h,v_inbox_delivery_issues from public.client_email_messages;
  return jsonb_build_object(
    'generatedAt',now(),
    'google',jsonb_build_object('connectedAccounts',v_google_connected,'activeProviderAccounts',v_google_active,'pending',v_google_pending,'retry',v_google_retry,'processing',v_google_processing,'reconnectRequired',v_google_reconnect,'failedHistorical',v_google_failed,'deadLetter',v_google_dead,'skipped',v_google_skipped,'oldestPendingAt',v_oldest_pending),
    'zoho',jsonb_build_object('connectedAccounts',v_zoho_connected,'errorAccounts',v_zoho_error,'organizationMailStatus',coalesce(v_org_mail_status,'disconnected'),'organizationMailConnected',public.service_zoho_org_mail_instance_ready(),'organizationMailLastVerifiedAt',v_org_mail_verified),
    'mailboxes',jsonb_build_object('active',v_mail_active,'provisioning',v_mail_provisioning,'error',v_mail_error,'suspended',v_mail_suspended,'queuePending',v_mail_pending,'queueRetry',v_mail_retry,'queueProcessing',v_mail_processing,'queueDeadLetter',v_mail_dead,'oldestQueuedAt',v_mail_oldest),
    'clientInbox',jsonb_build_object('messagesLast24Hours',v_inbox_24h,'deliveryIssues',v_inbox_delivery_issues)
  );
end;
$$;
