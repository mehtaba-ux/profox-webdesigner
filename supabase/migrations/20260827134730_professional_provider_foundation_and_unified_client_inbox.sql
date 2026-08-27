-- Provider-neutral professional identity, Zoho-ready integration foundation, and unified Client Inbox.
-- Google remains the existing/default provider. Zoho stays disabled until explicitly configured and enabled.

create table if not exists public.staff_professional_accounts (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  work_email text unique,
  mail_provider text not null default 'none' check (mail_provider in ('none','zoho')),
  calendar_provider text not null default 'google' check (calendar_provider in ('google','zoho')),
  meeting_provider text not null default 'google_meet' check (meeting_provider in ('google_meet','zoho_meeting')),
  mailbox_status text not null default 'not_configured' check (mailbox_status in ('not_configured','provisioning','active','suspended','error')),
  provider_user_id text,
  provider_account_id text,
  provisioned_at timestamptz,
  suspended_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_professional_accounts enable row level security;
revoke all on table public.staff_professional_accounts from anon, authenticated;

create table if not exists public.zoho_connections (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  account_email text,
  zoho_account_id text,
  zoho_user_id text,
  data_center text,
  status text not null default 'disconnected' check (status in ('disconnected','connected','reconnect_required','error')),
  scopes text[] not null default '{}',
  refresh_secret_id uuid,
  calendar_id text,
  calendar_timezone text,
  meeting_ready boolean not null default false,
  last_auth_at timestamptz,
  last_successful_sync_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.zoho_connections enable row level security;
revoke all on table public.zoho_connections from anon, authenticated;

create table if not exists public.client_email_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sales_chat_conversations(id) on delete cascade,
  provider text not null check (provider in ('zoho')),
  provider_message_id text not null,
  provider_thread_id text,
  direction text not null check (direction in ('inbound','outbound')),
  employee_user_id uuid references public.user_profiles(id) on delete set null,
  from_email text not null,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  bcc_emails text[] not null default '{}',
  subject text not null default '',
  body_text text not null default '',
  body_html text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  delivery_status text not null default 'received',
  sent_or_received_at timestamptz not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_message_id)
);
create index if not exists client_email_messages_conversation_time_idx on public.client_email_messages(conversation_id,sent_or_received_at,id);
create index if not exists client_email_messages_provider_thread_idx on public.client_email_messages(provider,provider_thread_id) where provider_thread_id is not null;
alter table public.client_email_messages enable row level security;
revoke all on table public.client_email_messages from anon, authenticated;

insert into public.system_configuration(config_key,config_value,description,updated_at)
values(
  'professional_integrations',
  jsonb_build_object(
    'zohoEnabled',false,
    'zohoMailEnabled',false,
    'zohoCalendarEnabled',false,
    'zohoMeetingEnabled',false,
    'mailProvisioningEnabled',false,
    'professionalEmailRequired',false,
    'defaultMailProvider','none',
    'defaultCalendarProvider','google',
    'defaultMeetingProvider','google_meet',
    'zohoOrganizationId','',
    'zohoDataCenter',''
  ),
  'Professional staff identity and external mail/calendar/meeting provider policy. Google remains the default until Zoho is explicitly enabled.',
  now()
)
on conflict(config_key) do nothing;

create or replace function public.service_get_zoho_provider_credentials()
returns jsonb
language sql
stable security definer
set search_path=public,vault,pg_temp
as $$
  select jsonb_build_object(
    'clientId',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_zoho_client_id' limit 1),''),
    'clientSecret',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_zoho_client_secret' limit 1),'')
  );
$$;
revoke all on function public.service_get_zoho_provider_credentials() from public,anon,authenticated;
grant execute on function public.service_get_zoho_provider_credentials() to service_role;

create or replace function public.admin_get_professional_integrations()
returns jsonb
language plpgsql
stable security definer
set search_path=public,vault,pg_temp
as $$
declare v_cfg jsonb:='{}'::jsonb; v_client_id text:=''; v_has_secret boolean:=false;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_client_id' limit 1;
  select exists(select 1 from vault.secrets where name='profox_zoho_client_secret') into v_has_secret;
  return v_cfg || jsonb_build_object(
    'zohoProviderConfigured',v_client_id<>'' and v_has_secret and coalesce(v_cfg->>'zohoOrganizationId','')<>'',
    'zohoClientIdHint',case when v_client_id='' then '' else left(v_client_id,8)||'...'||right(v_client_id,6) end,
    'zohoClientSecretStored',v_has_secret
  );
end;
$$;
revoke all on function public.admin_get_professional_integrations() from public,anon;
grant execute on function public.admin_get_professional_integrations() to authenticated;

create or replace function public.admin_set_zoho_provider(
  p_client_id text,
  p_client_secret text default '',
  p_organization_id text default '',
  p_data_center text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_client_id text:=btrim(coalesce(p_client_id,''));
  v_secret text:=btrim(coalesce(p_client_secret,''));
  v_org text:=btrim(coalesce(p_organization_id,''));
  v_dc text:=lower(btrim(coalesce(p_data_center,'')));
  v_id uuid; v_cfg jsonb:='{}'::jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if v_client_id='' then select decrypted_secret into v_client_id from vault.decrypted_secrets where name='profox_zoho_client_id' limit 1; end if;
  if char_length(coalesce(v_client_id,'')) not between 10 and 500 then raise exception 'Enter a valid Zoho OAuth client ID.'; end if;
  if v_secret<>'' and char_length(v_secret) not between 8 and 500 then raise exception 'Zoho OAuth client secret is invalid.'; end if;
  if v_org='' or char_length(v_org)>200 then raise exception 'Enter the Zoho organization ID before enabling the provider.'; end if;
  if v_dc not in ('com','in','eu','com.au','jp','ca','sa') then raise exception 'Choose a supported Zoho data center.'; end if;

  select id into v_id from vault.secrets where name='profox_zoho_client_id' limit 1;
  if v_id is null then perform vault.create_secret(v_client_id,'profox_zoho_client_id','Zoho OAuth client ID',null);
  else perform vault.update_secret(v_id,v_client_id,'profox_zoho_client_id','Zoho OAuth client ID',null); end if;

  select id into v_id from vault.secrets where name='profox_zoho_client_secret' limit 1;
  if v_secret<>'' then
    if v_id is null then perform vault.create_secret(v_secret,'profox_zoho_client_secret','Zoho OAuth client secret',null);
    else perform vault.update_secret(v_id,v_secret,'profox_zoho_client_secret','Zoho OAuth client secret',null); end if;
  elsif v_id is null then raise exception 'Enter the Zoho OAuth client secret for the first setup.'; end if;

  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  v_cfg:=v_cfg||jsonb_build_object('zohoOrganizationId',v_org,'zohoDataCenter',v_dc);
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('professional_integrations',v_cfg,'Professional staff identity and external mail/calendar/meeting provider policy.',auth.uid(),now())
  on conflict(config_key) do update set config_value=excluded.config_value,updated_by=auth.uid(),updated_at=now();
  return public.admin_get_professional_integrations();
end;
$$;
revoke all on function public.admin_set_zoho_provider(text,text,text,text) from public,anon;
grant execute on function public.admin_set_zoho_provider(text,text,text,text) to authenticated;

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
set search_path=public,vault,pg_temp
as $$
declare v_cfg jsonb:='{}'::jsonb; v_status jsonb; v_any_zoho boolean;
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
  v_cfg:=v_cfg||jsonb_build_object(
    'zohoEnabled',coalesce(p_zoho_enabled,false),
    'zohoMailEnabled',coalesce(p_zoho_mail_enabled,false),
    'zohoCalendarEnabled',coalesce(p_zoho_calendar_enabled,false),
    'zohoMeetingEnabled',coalesce(p_zoho_meeting_enabled,false),
    'mailProvisioningEnabled',coalesce(p_mail_provisioning_enabled,false),
    'professionalEmailRequired',coalesce(p_professional_email_required,false),
    'defaultMailProvider',p_default_mail_provider,
    'defaultCalendarProvider',p_default_calendar_provider,
    'defaultMeetingProvider',p_default_meeting_provider
  );
  update public.system_configuration set config_value=v_cfg,updated_by=auth.uid(),updated_at=now() where config_key='professional_integrations';
  return public.admin_get_professional_integrations();
end;
$$;
revoke all on function public.admin_set_professional_integrations(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) from public,anon;
grant execute on function public.admin_set_professional_integrations(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) to authenticated;

create or replace function public.admin_set_staff_professional_account(
  p_user_id uuid,
  p_work_email text,
  p_mail_provider text,
  p_calendar_provider text,
  p_meeting_provider text,
  p_mailbox_status text default 'not_configured'
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_email text:=lower(btrim(coalesce(p_work_email,''))); v_from text; v_domain text; v_row public.staff_professional_accounts%rowtype;
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
  insert into public.staff_professional_accounts(user_id,work_email,mail_provider,calendar_provider,meeting_provider,mailbox_status,updated_at)
  values(p_user_id,nullif(v_email,''),p_mail_provider,p_calendar_provider,p_meeting_provider,p_mailbox_status,now())
  on conflict(user_id) do update set work_email=excluded.work_email,mail_provider=excluded.mail_provider,calendar_provider=excluded.calendar_provider,meeting_provider=excluded.meeting_provider,mailbox_status=excluded.mailbox_status,updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.admin_set_staff_professional_account(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.admin_set_staff_professional_account(uuid,text,text,text,text,text) to authenticated;

create or replace function public.get_my_professional_integration_status()
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_profile public.user_profiles%rowtype; v_account public.staff_professional_accounts%rowtype; v_google public.google_calendar_connections%rowtype; v_zoho public.zoho_connections%rowtype; v_cfg jsonb:='{}'::jsonb; v_cal text; v_meet text; v_mail text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_profile from public.user_profiles where id=v_uid and status='active';
  if not found or v_profile.role in ('customer','pending') then raise exception 'Active staff access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  select * into v_account from public.staff_professional_accounts where user_id=v_uid;
  select * into v_google from public.google_calendar_connections where user_id=v_uid;
  select * into v_zoho from public.zoho_connections where user_id=v_uid;
  v_mail:=coalesce(v_account.mail_provider,nullif(v_cfg->>'defaultMailProvider',''),'none');
  v_cal:=coalesce(v_account.calendar_provider,nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  v_meet:=coalesce(v_account.meeting_provider,nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet');
  return jsonb_build_object(
    'userId',v_uid,'workEmail',coalesce(v_account.work_email,''),'mailProvider',v_mail,'calendarProvider',v_cal,'meetingProvider',v_meet,'mailboxStatus',coalesce(v_account.mailbox_status,'not_configured'),
    'professionalEmailRequired',coalesce((v_cfg->>'professionalEmailRequired')::boolean,false),
    'professionalEmailReady',coalesce((v_cfg->>'professionalEmailRequired')::boolean,false) is false or (coalesce(v_account.mailbox_status='active',false) and coalesce(length(btrim(v_account.work_email)),0)>0),
    'zohoEnabled',coalesce((v_cfg->>'zohoEnabled')::boolean,false),'zohoMailEnabled',coalesce((v_cfg->>'zohoMailEnabled')::boolean,false),'zohoCalendarEnabled',coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false),'zohoMeetingEnabled',coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false),'mailProvisioningEnabled',coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false),
    'google',jsonb_build_object('connected',coalesce(v_google.status='connected',false),'status',coalesce(v_google.status,'disconnected'),'accountEmail',coalesce(v_google.account_email,''),'calendarTimezone',coalesce(v_google.calendar_timezone,''),'meetReady',coalesce(v_google.status='connected' and v_google.create_meet,false)),
    'zoho',jsonb_build_object('connected',coalesce(v_zoho.status='connected',false),'status',coalesce(v_zoho.status,'disconnected'),'accountEmail',coalesce(v_zoho.account_email,''),'calendarTimezone',coalesce(v_zoho.calendar_timezone,''),'meetingReady',coalesce(v_zoho.status='connected' and v_zoho.meeting_ready,false))
  );
end;
$$;
revoke all on function public.get_my_professional_integration_status() from public,anon;
grant execute on function public.get_my_professional_integration_status() to authenticated;

create or replace function public.get_my_sales_account_setup_status()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid(); v_profile public.user_profiles%rowtype; v_state public.sales_account_setup_state%rowtype; v_calendar public.user_calendar_settings%rowtype;
  v_pi jsonb; v_photo boolean:=false; v_timezone boolean:=false; v_email_req boolean:=false; v_email_ready boolean:=true; v_calendar_ready boolean:=false; v_meeting_ready boolean:=false; v_availability boolean:=false; v_crm boolean:=false; v_ready boolean:=false; v_progress integer:=0; v_cal_provider text; v_meet_provider text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_profile from public.user_profiles where id=v_uid;
  if not found or v_profile.status<>'active' or v_profile.role not in ('sales','sales_rep','sales_team') then raise exception 'Active Sales Representative access required.'; end if;
  insert into public.sales_account_setup_state(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_state from public.sales_account_setup_state where user_id=v_uid for update;
  select * into v_calendar from public.user_calendar_settings where user_id=v_uid;
  v_pi:=public.get_my_professional_integration_status();
  v_cal_provider:=coalesce(v_pi->>'calendarProvider','google'); v_meet_provider:=coalesce(v_pi->>'meetingProvider','google_meet');
  v_photo:=coalesce(length(btrim(v_profile.avatar_url)),0)>0; v_timezone:=coalesce(length(btrim(v_profile.timezone)),0)>0;
  v_email_req:=coalesce((v_pi->>'professionalEmailRequired')::boolean,false); v_email_ready:=coalesce((v_pi->>'professionalEmailReady')::boolean,not v_email_req);
  v_calendar_ready:=case when v_cal_provider='zoho' then coalesce((v_pi->'zoho'->>'connected')::boolean,false) and coalesce((v_pi->>'zohoCalendarEnabled')::boolean,false) else coalesce((v_pi->'google'->>'connected')::boolean,false) end;
  v_meeting_ready:=case when v_meet_provider='zoho_meeting' then coalesce((v_pi->'zoho'->>'meetingReady')::boolean,false) and coalesce((v_pi->>'zohoMeetingEnabled')::boolean,false) else coalesce((v_pi->'google'->>'meetReady')::boolean,false) end;
  v_availability:=coalesce(v_calendar.active,false) and coalesce(array_length(v_calendar.working_days,1),0)>0 and v_calendar.work_start is not null and v_calendar.work_end is not null and v_calendar.work_end>v_calendar.work_start;
  v_crm:=coalesce(v_state.crm_tour_completed_at is not null or v_state.crm_tour_step>=6,false);
  v_ready:=v_photo and v_timezone and v_email_ready and v_calendar_ready and v_meeting_ready and v_availability and v_crm;
  if v_ready and v_state.completed_at is null then update public.sales_account_setup_state set completed_at=now(),updated_at=now() where user_id=v_uid returning * into v_state;
  elsif not v_ready and v_state.completed_at is not null then update public.sales_account_setup_state set completed_at=null,updated_at=now() where user_id=v_uid returning * into v_state; end if;
  if v_email_req then
    v_progress:=least(100,(case when v_photo then 15 else 0 end)+(case when v_timezone then 10 else 0 end)+(case when v_email_ready then 10 else 0 end)+(case when v_calendar_ready then 15 else 0 end)+(case when v_meeting_ready then 10 else 0 end)+(case when v_availability then 15 else 0 end)+round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer);
  else
    v_progress:=least(100,(case when v_photo then 15 else 0 end)+(case when v_timezone then 10 else 0 end)+(case when v_calendar_ready then 20 else 0 end)+(case when v_meeting_ready then 15 else 0 end)+(case when v_availability then 15 else 0 end)+round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer);
  end if;
  return jsonb_build_object(
    'userId',v_uid,'profilePhotoReady',v_photo,'timezoneReady',v_timezone,
    'professionalEmailRequired',v_email_req,'professionalEmailReady',v_email_ready,'workEmail',coalesce(v_pi->>'workEmail',''),'mailProvider',coalesce(v_pi->>'mailProvider','none'),
    'calendarProvider',v_cal_provider,'meetingProvider',v_meet_provider,'calendarConnected',v_calendar_ready,'meetingReady',v_meeting_ready,
    'googleCalendarConnected',coalesce((v_pi->'google'->>'connected')::boolean,false),'googleMeetReady',coalesce((v_pi->'google'->>'meetReady')::boolean,false),'googleAccountEmail',coalesce(v_pi->'google'->>'accountEmail',''),'googleCalendarTimezone',coalesce(v_pi->'google'->>'calendarTimezone',''),
    'zohoCalendarConnected',coalesce((v_pi->'zoho'->>'connected')::boolean,false),'zohoMeetingReady',coalesce((v_pi->'zoho'->>'meetingReady')::boolean,false),'zohoAccountEmail',coalesce(v_pi->'zoho'->>'accountEmail',''),'zohoCalendarTimezone',coalesce(v_pi->'zoho'->>'calendarTimezone',''),'zohoEnabled',coalesce((v_pi->>'zohoEnabled')::boolean,false),
    'availabilityReady',v_availability,'workingDays',coalesce(v_calendar.working_days,'{}'::integer[]),'workStart',case when v_calendar.work_start is null then null else to_char(v_calendar.work_start,'HH24:MI') end,'workEnd',case when v_calendar.work_end is null then null else to_char(v_calendar.work_end,'HH24:MI') end,
    'crmTourStep',v_state.crm_tour_step,'crmTourCompleted',v_crm,'setupCompleted',v_state.completed_at is not null and v_ready,'completedAt',v_state.completed_at,'startedAt',v_state.started_at,'progressPercent',v_progress
  );
end;
$$;

create or replace function public.advance_my_sales_crm_setup_tour(p_step integer)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_status jsonb; v_state public.sales_account_setup_state%rowtype; v_cal text; v_meet text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_step<1 or p_step>6 then raise exception 'CRM tour step must be between 1 and 6.'; end if;
  v_status:=public.get_my_sales_account_setup_status(); v_cal:=coalesce(v_status->>'calendarProvider','google'); v_meet:=coalesce(v_status->>'meetingProvider','google_meet');
  if coalesce((v_status->>'profilePhotoReady')::boolean,false) is not true then raise exception 'Upload your professional profile photo before starting the CRM tour.'; end if;
  if coalesce((v_status->>'timezoneReady')::boolean,false) is not true then raise exception 'Confirm your timezone before starting the CRM tour.'; end if;
  if coalesce((v_status->>'professionalEmailReady')::boolean,false) is not true then raise exception 'Activate your professional ProFox email before starting the CRM tour.'; end if;
  if coalesce((v_status->>'calendarConnected')::boolean,false) is not true then raise exception 'Connect your configured % calendar before starting the CRM tour.',initcap(v_cal); end if;
  if coalesce((v_status->>'meetingReady')::boolean,false) is not true then raise exception 'Enable your configured % meeting provider before starting the CRM tour.',replace(initcap(v_meet),'_',' '); end if;
  if coalesce((v_status->>'availabilityReady')::boolean,false) is not true then raise exception 'Configure your working availability before starting the CRM tour.'; end if;
  select * into v_state from public.sales_account_setup_state where user_id=v_uid for update;
  if p_step<=v_state.crm_tour_step then return public.get_my_sales_account_setup_status(); end if;
  if p_step<>v_state.crm_tour_step+1 then raise exception 'Complete the CRM setup tour in order. Your next step is %.',v_state.crm_tour_step+1; end if;
  update public.sales_account_setup_state set crm_tour_step=p_step,crm_tour_completed_at=case when p_step=6 then coalesce(crm_tour_completed_at,now()) else crm_tour_completed_at end,updated_at=now() where user_id=v_uid;
  return public.get_my_sales_account_setup_status();
end;
$$;

create or replace function public.admin_get_sales_account_setup_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  -- Avoid impersonating auth: compose from canonical rows instead by calling a dedicated status body is unsafe.
  -- Return the stored/professional provider facts explicitly.
  select jsonb_build_object(
    'userId',p.id,'profilePhotoReady',coalesce(length(btrim(p.avatar_url)),0)>0,'timezoneReady',coalesce(length(btrim(p.timezone)),0)>0,
    'professionalEmailRequired',coalesce((cfg.config_value->>'professionalEmailRequired')::boolean,false),
    'professionalEmailReady',coalesce((cfg.config_value->>'professionalEmailRequired')::boolean,false) is false or (coalesce(sp.mailbox_status='active',false) and coalesce(length(btrim(sp.work_email)),0)>0),
    'workEmail',coalesce(sp.work_email,''),'mailProvider',coalesce(sp.mail_provider,cfg.config_value->>'defaultMailProvider','none'),
    'calendarProvider',coalesce(sp.calendar_provider,cfg.config_value->>'defaultCalendarProvider','google'),'meetingProvider',coalesce(sp.meeting_provider,cfg.config_value->>'defaultMeetingProvider','google_meet'),
    'googleCalendarConnected',coalesce(g.status='connected',false),'googleMeetReady',coalesce(g.status='connected' and g.create_meet,false),
    'zohoCalendarConnected',coalesce(z.status='connected',false),'zohoMeetingReady',coalesce(z.status='connected' and z.meeting_ready,false),
    'availabilityReady',coalesce(c.active,false) and coalesce(array_length(c.working_days,1),0)>0 and c.work_start is not null and c.work_end is not null and c.work_end>c.work_start,
    'crmTourStep',coalesce(s.crm_tour_step,0),'crmTourCompleted',coalesce(s.crm_tour_completed_at is not null,false),'setupCompleted',coalesce(s.completed_at is not null,false),'completedAt',s.completed_at
  ) into v_result
  from public.user_profiles p
  left join public.staff_professional_accounts sp on sp.user_id=p.id
  left join public.google_calendar_connections g on g.user_id=p.id
  left join public.zoho_connections z on z.user_id=p.id
  left join public.user_calendar_settings c on c.user_id=p.id
  left join public.sales_account_setup_state s on s.user_id=p.id
  left join public.system_configuration cfg on cfg.config_key='professional_integrations'
  where p.id=p_user_id;
  if v_result is null then raise exception 'Sales profile not found.'; end if;
  return v_result;
end;
$$;

-- Preserve Brevo for transactional delivery, but prefer an active professional work address as human Reply-To.
create or replace function public.service_build_customer_communication_payload(p_owner_id uuid default null::uuid, p_contact_name text default ''::text, p_company_name text default ''::text, p_context jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare
  v_comm jsonb:='{}'::jsonb; v_notification jsonb:='{}'::jsonb; v_owner public.user_profiles%rowtype; v_has_owner boolean:=false;
  v_owner_name text:=''; v_owner_first text:=''; v_owner_email text:=''; v_work_email text:=''; v_from_email text:=''; v_from_name text:='ProFox'; v_from_domain text:=''; v_reply text:='';
  v_contact text:=trim(coalesce(p_contact_name,'')); v_contact_first text:=''; v_company text:=trim(coalesce(p_company_name,'')); v_human_sender boolean:=true;
begin
  select coalesce(config_value,'{}'::jsonb) into v_comm from public.system_configuration where config_key='communication_settings';
  select coalesce(config_value,'{}'::jsonb) into v_notification from public.system_configuration where config_key='notification_settings';
  v_from_email:=lower(trim(coalesce(v_notification->>'fromEmail','contact@profoxwebdesigner.com'))); v_from_name:=coalesce(nullif(trim(v_notification->>'fromName'),''),'ProFox'); v_from_domain:=split_part(v_from_email,'@',2); v_human_sender:=coalesce((v_comm->>'humanSenderEnabled')::boolean,true);
  if p_owner_id is not null then select * into v_owner from public.user_profiles where id=p_owner_id and status='active' and role not in ('pending','customer') limit 1; v_has_owner:=found; end if;
  if v_has_owner then
    v_owner_name:=trim(coalesce(v_owner.full_name,'')); if lower(v_owner_name) in ('','admin user','administrator','user') then v_owner_name:=''; end if;
    v_owner_email:=lower(trim(coalesce(v_owner.email,'')));
    select lower(trim(coalesce(work_email,''))) into v_work_email from public.staff_professional_accounts where user_id=p_owner_id and mailbox_status='active' limit 1;
  end if;
  if v_owner_name<>'' then v_owner_first:=split_part(v_owner_name,' ',1); end if; if v_contact<>'' then v_contact_first:=split_part(v_contact,' ',1); else v_contact_first:='there'; end if; if v_company='' then v_company:='your business'; end if;
  v_reply:=lower(trim(coalesce(v_comm->>'defaultReplyTo',v_notification->>'replyTo',v_from_email)));
  if coalesce(v_work_email,'')<>'' and split_part(v_work_email,'@',2)=v_from_domain then v_reply:=v_work_email;
  elsif v_owner_email<>'' and split_part(v_owner_email,'@',2)=v_from_domain then v_reply:=v_owner_email; end if;
  if v_reply='' or split_part(v_reply,'@',2)<>v_from_domain then v_reply:=v_from_email; end if;
  return coalesce(p_context,'{}'::jsonb)||jsonb_build_object('communicationAudience','customer','contactName',coalesce(nullif(v_contact,''),'there'),'contactFirstName',v_contact_first,'companyName',v_company,'ownerName',coalesce(nullif(v_owner_name,''),'ProFox team'),'ownerFirstName',coalesce(nullif(v_owner_first,''),'ProFox team'),'humanSenderName',case when v_human_sender and v_owner_first<>'' then v_owner_first||' at ProFox' else v_from_name end,'replyToEmail',v_reply,'professionalSenderEmail',coalesce(nullif(v_work_email,''),''),'supportEmail',v_from_email,'brandLine',coalesce(nullif(v_comm->>'brandLine',''),'From site to system.'),'websiteUrl',coalesce(nullif(v_comm->>'websiteUrl',''),nullif(v_notification->>'publicBaseUrl',''),'https://www.profoxwebdesigner.com'));
end;
$$;

create or replace function public.sales_client_inbox_timeline(p_conversation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  select coalesce(jsonb_agg(x.item order by x.at,x.tie),'[]'::jsonb) into v_result
  from (
    select m.created_at at,m.id::text tie,jsonb_build_object('id',m.id,'channel','chat','direction',case when m.sender_type='customer' then 'inbound' else 'outbound' end,'senderType',m.sender_type,'senderName',m.sender_name,'messageText',m.message_text,'subject','','isInternalNote',m.is_internal_note,'createdAt',m.created_at) item
    from public.sales_chat_messages m where m.conversation_id=p_conversation_id
    union all
    select e.sent_or_received_at,e.id::text,jsonb_build_object('id',e.id,'channel','email','provider',e.provider,'direction',e.direction,'senderType',case when e.direction='inbound' then 'customer' else 'staff' end,'senderName',e.from_email,'fromEmail',e.from_email,'toEmails',e.to_emails,'ccEmails',e.cc_emails,'subject',e.subject,'messageText',e.body_text,'bodyHtml',e.body_html,'attachments',e.attachments,'deliveryStatus',e.delivery_status,'providerThreadId',e.provider_thread_id,'isInternalNote',false,'createdAt',e.sent_or_received_at) item
    from public.client_email_messages e where e.conversation_id=p_conversation_id
  ) x;
  return v_result;
end;
$$;
revoke all on function public.sales_client_inbox_timeline(uuid) from public,anon;
grant execute on function public.sales_client_inbox_timeline(uuid) to authenticated;

create or replace function public.service_upsert_client_email_message(
  p_conversation_id uuid,p_provider text,p_provider_message_id text,p_provider_thread_id text,p_direction text,p_employee_user_id uuid,p_from_email text,p_to_emails text[],p_cc_emails text[],p_bcc_emails text[],p_subject text,p_body_text text,p_body_html text,p_attachments jsonb,p_delivery_status text,p_sent_or_received_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if p_provider<>'zoho' then raise exception 'Unsupported email provider.'; end if;
  if p_direction not in ('inbound','outbound') then raise exception 'Unsupported email direction.'; end if;
  if not exists(select 1 from public.sales_chat_conversations where id=p_conversation_id) then raise exception 'Client conversation not found.'; end if;
  insert into public.client_email_messages(conversation_id,provider,provider_message_id,provider_thread_id,direction,employee_user_id,from_email,to_emails,cc_emails,bcc_emails,subject,body_text,body_html,attachments,delivery_status,sent_or_received_at,updated_at)
  values(p_conversation_id,p_provider,btrim(p_provider_message_id),nullif(btrim(coalesce(p_provider_thread_id,'')),''),p_direction,p_employee_user_id,lower(btrim(p_from_email)),coalesce(p_to_emails,'{}'),coalesce(p_cc_emails,'{}'),coalesce(p_bcc_emails,'{}'),coalesce(p_subject,''),coalesce(p_body_text,''),coalesce(p_body_html,''),coalesce(p_attachments,'[]'::jsonb),coalesce(nullif(btrim(p_delivery_status),''),case when p_direction='inbound' then 'received' else 'sent' end),coalesce(p_sent_or_received_at,now()),now())
  on conflict(provider,provider_message_id) do update set conversation_id=excluded.conversation_id,provider_thread_id=excluded.provider_thread_id,direction=excluded.direction,employee_user_id=excluded.employee_user_id,from_email=excluded.from_email,to_emails=excluded.to_emails,cc_emails=excluded.cc_emails,bcc_emails=excluded.bcc_emails,subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,attachments=excluded.attachments,delivery_status=excluded.delivery_status,sent_or_received_at=excluded.sent_or_received_at,synced_at=now(),updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.service_upsert_client_email_message(uuid,text,text,text,text,uuid,text,text[],text[],text[],text,text,text,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.service_upsert_client_email_message(uuid,text,text,text,text,uuid,text,text[],text[],text[],text,text,text,jsonb,text,timestamptz) to service_role;
