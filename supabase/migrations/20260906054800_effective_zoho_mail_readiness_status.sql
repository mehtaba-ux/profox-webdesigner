create or replace function public.service_zoho_org_mail_effective_status()
returns text
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_status text:='disconnected';
  v_kind text:='legacy';
  v_scopes text[]='{}'::text[];
  v_has_id boolean:=false;
  v_has_secret boolean:=false;
begin
  select status,oauth_client_kind,scopes
    into v_status,v_kind,v_scopes
  from public.zoho_organization_mail_connection
  where singleton_key='primary';

  if not found then return 'disconnected'; end if;

  select exists(select 1 from vault.secrets where name='profox_zoho_mail_org_client_id') into v_has_id;
  select exists(select 1 from vault.secrets where name='profox_zoho_mail_org_client_secret') into v_has_secret;

  if v_status='connected'
     and coalesce(v_kind,'legacy')='instance_org'
     and public.service_zoho_org_mail_instance_scopes_ready(v_scopes)
     and v_has_id and v_has_secret then
    return 'connected';
  end if;

  if v_status in ('error','reconnect_required') and coalesce(v_kind,'legacy')='instance_org' then
    return v_status;
  end if;

  return 'disconnected';
end;
$$;
revoke all on function public.service_zoho_org_mail_effective_status() from public,anon,authenticated;
grant execute on function public.service_zoho_org_mail_effective_status() to service_role;

create or replace function public.admin_get_professional_integrations()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_cfg jsonb:='{}'::jsonb;
  v_client_id text:='';
  v_has_secret boolean:=false;
  v_mail_client_id text:='';
  v_mail_has_secret boolean:=false;
  v_mail_status text:='disconnected';
  v_mail_kind text:='legacy';
  v_mail_scopes text[]:='{}'::text[];
  v_verified timestamptz;
  v_mail_ready boolean:=false;
  v_effective_mail_status text:='disconnected';
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_client_id' limit 1;
  select exists(select 1 from vault.secrets where name='profox_zoho_client_secret') into v_has_secret;
  select coalesce(decrypted_secret,'') into v_mail_client_id from vault.decrypted_secrets where name='profox_zoho_mail_org_client_id' limit 1;
  select exists(select 1 from vault.secrets where name='profox_zoho_mail_org_client_secret') into v_mail_has_secret;
  select status,oauth_client_kind,scopes,last_verified_at into v_mail_status,v_mail_kind,v_mail_scopes,v_verified from public.zoho_organization_mail_connection where singleton_key='primary';

  v_mail_ready:=coalesce(v_mail_status='connected',false)
    and coalesce(v_mail_kind='instance_org',false)
    and public.service_zoho_org_mail_instance_scopes_ready(v_mail_scopes)
    and v_mail_client_id<>'' and v_mail_has_secret;
  v_effective_mail_status:=case
    when v_mail_ready then 'connected'
    when coalesce(v_mail_kind,'legacy')='instance_org' and v_mail_status in ('error','reconnect_required') then v_mail_status
    else 'disconnected'
  end;

  return v_cfg||jsonb_build_object(
    'zohoProviderConfigured',v_client_id<>'' and v_has_secret and coalesce(v_cfg->>'zohoOrganizationId','')<>'',
    'zohoClientIdHint',case when v_client_id='' then '' else left(v_client_id,8)||'...'||right(v_client_id,6) end,
    'zohoClientSecretStored',v_has_secret,
    'zohoMailOrgProviderConfigured',v_mail_client_id<>'' and v_mail_has_secret and coalesce(v_cfg->>'zohoOrganizationId','')<>'',
    'zohoMailOrgClientIdHint',case when v_mail_client_id='' then '' else left(v_mail_client_id,8)||'...'||right(v_mail_client_id,6) end,
    'zohoMailOrgClientSecretStored',v_mail_has_secret,
    'zohoMailAuthorizationMode',coalesce(v_mail_kind,'legacy'),
    'zohoMailScopesReady',public.service_zoho_org_mail_instance_scopes_ready(v_mail_scopes),
    'zohoMailConnectionStatus',v_effective_mail_status,
    'zohoMailConnected',v_mail_ready,
    'zohoMailLastVerifiedAt',v_verified
  );
end;
$$;

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
  v_org_mail_ready boolean:=false;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select count(*) filter(where status='connected' and sync_enabled),count(*) filter(where status='connected' and sync_enabled and public.service_effective_calendar_provider(user_id)='google') into v_google_connected,v_google_active from public.google_calendar_connections;
  select count(*) filter(where status='pending'),count(*) filter(where status='retry'),count(*) filter(where status='processing'),count(*) filter(where status='reconnect_required'),count(*) filter(where status='failed'),count(*) filter(where status='dead_letter'),count(*) filter(where status='skipped'),min(next_attempt_at) filter(where status in('pending','retry')) into v_google_pending,v_google_retry,v_google_processing,v_google_reconnect,v_google_failed,v_google_dead,v_google_skipped,v_oldest_pending from public.google_calendar_sync_jobs;
  select count(*) filter(where status='connected'),count(*) filter(where status in ('error','reconnect_required')) into v_zoho_connected,v_zoho_error from public.zoho_service_calendar_connection;
  select last_verified_at into v_org_mail_verified from public.zoho_organization_mail_connection where singleton_key='primary';
  v_org_mail_ready:=public.service_zoho_org_mail_instance_ready();
  v_org_mail_status:=public.service_zoho_org_mail_effective_status();
  select count(*) filter(where mailbox_status='active'),count(*) filter(where mailbox_status='provisioning'),count(*) filter(where mailbox_status='error'),count(*) filter(where mailbox_status='suspended') into v_mail_active,v_mail_provisioning,v_mail_error,v_mail_suspended from public.staff_professional_accounts;
  select count(*) filter(where status='pending'),count(*) filter(where status='retry'),count(*) filter(where status='processing'),count(*) filter(where status='dead_letter'),min(next_attempt_at) filter(where status in('pending','retry')) into v_mail_pending,v_mail_retry,v_mail_processing,v_mail_dead,v_mail_oldest from public.professional_mailbox_provisioning_jobs;
  select count(*) filter(where sent_or_received_at>=now()-interval '24 hours'),count(*) filter(where lower(coalesce(delivery_status,'')) in('failed','bounced','rejected','error')) into v_inbox_24h,v_inbox_delivery_issues from public.client_email_messages;
  return jsonb_build_object(
    'generatedAt',now(),
    'google',jsonb_build_object('connectedAccounts',v_google_connected,'activeProviderAccounts',v_google_active,'pending',v_google_pending,'retry',v_google_retry,'processing',v_google_processing,'reconnectRequired',v_google_reconnect,'failedHistorical',v_google_failed,'deadLetter',v_google_dead,'skipped',v_google_skipped,'oldestPendingAt',v_oldest_pending),
    'zoho',jsonb_build_object('connectedAccounts',v_zoho_connected,'errorAccounts',v_zoho_error,'organizationMailStatus',v_org_mail_status,'organizationMailConnected',v_org_mail_ready,'organizationMailLastVerifiedAt',v_org_mail_verified),
    'mailboxes',jsonb_build_object('active',v_mail_active,'provisioning',v_mail_provisioning,'error',v_mail_error,'suspended',v_mail_suspended,'queuePending',v_mail_pending,'queueRetry',v_mail_retry,'queueProcessing',v_mail_processing,'queueDeadLetter',v_mail_dead,'oldestQueuedAt',v_mail_oldest),
    'clientInbox',jsonb_build_object('messagesLast24Hours',v_inbox_24h,'deliveryIssues',v_inbox_delivery_issues)
  );
end;
$$;