alter table public.zoho_organization_mail_connection
  add column if not exists oauth_client_kind text not null default 'legacy'
  check (oauth_client_kind in ('legacy','instance_org'));

create or replace function public.service_zoho_org_mail_instance_scopes_ready(p_scopes text[])
returns boolean
language sql
immutable
set search_path=public,pg_temp
as $$
  select array[
    'ZohoMail.organization.accounts.ALL',
    'ZohoMail.accounts.READ',
    'ZohoMail.messages.CREATE',
    'ZohoMail.messages.READ',
    'ZohoMail.folders.READ'
  ]::text[] <@ coalesce(p_scopes,'{}'::text[]);
$$;

create or replace function public.service_get_zoho_mail_org_provider_credentials()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare v_client_id text:=''; v_client_secret text:='';
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_mail_org_client_id' limit 1;
  select coalesce(decrypted_secret,'') into v_client_secret from vault.decrypted_secrets where name='profox_zoho_mail_org_client_secret' limit 1;
  return jsonb_build_object('clientId',v_client_id,'clientSecret',v_client_secret);
end;
$$;
revoke all on function public.service_get_zoho_mail_org_provider_credentials() from public,anon,authenticated;
grant execute on function public.service_get_zoho_mail_org_provider_credentials() to service_role;

create or replace function public.admin_set_zoho_mail_org_provider(p_client_id text,p_client_secret text default '')
returns jsonb
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_client_id text:=btrim(coalesce(p_client_id,''));
  v_secret text:=btrim(coalesce(p_client_secret,''));
  v_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if v_client_id='' then select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_mail_org_client_id' limit 1; end if;
  if char_length(coalesce(v_client_id,'')) not between 10 and 500 then raise exception 'Enter a valid Zoho ORG OAuth client ID.'; end if;
  if v_secret<>'' and char_length(v_secret) not between 8 and 500 then raise exception 'Zoho ORG OAuth client secret is invalid.'; end if;

  select id into v_id from vault.secrets where name='profox_zoho_mail_org_client_id' limit 1;
  if v_id is null then
    perform vault.create_secret(v_client_id,'profox_zoho_mail_org_client_id','Zoho Mail ORG OAuth client ID',null);
  else
    perform vault.update_secret(v_id,v_client_id,'profox_zoho_mail_org_client_id','Zoho Mail ORG OAuth client ID',null);
  end if;

  select id into v_id from vault.secrets where name='profox_zoho_mail_org_client_secret' limit 1;
  if v_secret<>'' then
    if v_id is null then
      perform vault.create_secret(v_secret,'profox_zoho_mail_org_client_secret','Zoho Mail ORG OAuth client secret',null);
    else
      perform vault.update_secret(v_id,v_secret,'profox_zoho_mail_org_client_secret','Zoho Mail ORG OAuth client secret',null);
    end if;
  elsif v_id is null then
    raise exception 'Enter the Zoho ORG OAuth client secret for the first setup.';
  end if;

  return public.admin_get_professional_integrations();
end;
$$;
revoke all on function public.admin_set_zoho_mail_org_provider(text,text) from public,anon;
grant execute on function public.admin_set_zoho_mail_org_provider(text,text) to authenticated,service_role;

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
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_client_id' limit 1;
  select exists(select 1 from vault.secrets where name='profox_zoho_client_secret') into v_has_secret;
  select coalesce(decrypted_secret,'') into v_mail_client_id from vault.decrypted_secrets where name='profox_zoho_mail_org_client_id' limit 1;
  select exists(select 1 from vault.secrets where name='profox_zoho_mail_org_client_secret') into v_mail_has_secret;
  select status,oauth_client_kind,scopes,last_verified_at into v_mail_status,v_mail_kind,v_mail_scopes,v_verified from public.zoho_organization_mail_connection where singleton_key='primary';

  return v_cfg||jsonb_build_object(
    'zohoProviderConfigured',v_client_id<>'' and v_has_secret and coalesce(v_cfg->>'zohoOrganizationId','')<>'',
    'zohoClientIdHint',case when v_client_id='' then '' else left(v_client_id,8)||'...'||right(v_client_id,6) end,
    'zohoClientSecretStored',v_has_secret,
    'zohoMailOrgProviderConfigured',v_mail_client_id<>'' and v_mail_has_secret and coalesce(v_cfg->>'zohoOrganizationId','')<>'',
    'zohoMailOrgClientIdHint',case when v_mail_client_id='' then '' else left(v_mail_client_id,8)||'...'||right(v_mail_client_id,6) end,
    'zohoMailOrgClientSecretStored',v_mail_has_secret,
    'zohoMailAuthorizationMode',coalesce(v_mail_kind,'legacy'),
    'zohoMailScopesReady',public.service_zoho_org_mail_instance_scopes_ready(v_mail_scopes),
    'zohoMailConnectionStatus',coalesce(v_mail_status,'disconnected'),
    'zohoMailConnected',coalesce(v_mail_status='connected',false) and coalesce(v_mail_kind='instance_org',false) and public.service_zoho_org_mail_instance_scopes_ready(v_mail_scopes) and v_mail_client_id<>'' and v_mail_has_secret,
    'zohoMailLastVerifiedAt',v_verified
  );
end;
$$;

create or replace function public.service_store_verified_zoho_org_mail_connection(
  p_admin_user_id uuid,
  p_refresh_token text,
  p_organization_id text,
  p_data_center text,
  p_scopes text[] default array['ZohoMail.organization.accounts.ALL'::text]
)
returns jsonb
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_secret_id uuid;
  v_cfg jsonb:='{}'::jsonb;
  v_refresh text:=btrim(coalesce(p_refresh_token,''));
  v_org text:=btrim(coalesce(p_organization_id,''));
  v_dc text:=lower(btrim(coalesce(p_data_center,'')));
  v_kind text:='legacy';
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if v_refresh='' then raise exception 'Zoho refresh token is required.'; end if;
  if v_org='' then raise exception 'Zoho organization ID is required.'; end if;
  if v_dc not in ('com','in','eu','com.au','jp','ca','sa') then raise exception 'Unsupported Zoho data center.'; end if;
  if not exists(select 1 from public.user_profiles where id=p_admin_user_id and lower(coalesce(status,''))='active' and lower(coalesce(role,''))='admin') then raise exception 'Active Admin account required.'; end if;

  if public.service_zoho_org_mail_instance_scopes_ready(p_scopes) then v_kind:='instance_org'; end if;

  select id into v_secret_id from vault.secrets where name='profox_zoho_org_mail_refresh' limit 1;
  if v_secret_id is null then
    v_secret_id:=vault.create_secret(v_refresh,'profox_zoho_org_mail_refresh','Zoho organization Mail OAuth refresh token.',null);
  else
    perform vault.update_secret(v_secret_id,v_refresh,'profox_zoho_org_mail_refresh','Zoho organization Mail OAuth refresh token.',null);
  end if;

  insert into public.zoho_organization_mail_connection(singleton_key,connected_by,organization_id,data_center,refresh_secret_id,scopes,status,oauth_client_kind,last_verified_at,last_attempt_at,last_error,updated_at)
  values('primary',p_admin_user_id,v_org,v_dc,v_secret_id,coalesce(p_scopes,'{}'::text[]),'connected',v_kind,now(),now(),null,now())
  on conflict(singleton_key) do update set
    connected_by=excluded.connected_by,
    organization_id=excluded.organization_id,
    data_center=excluded.data_center,
    refresh_secret_id=excluded.refresh_secret_id,
    scopes=excluded.scopes,
    status='connected',
    oauth_client_kind=excluded.oauth_client_kind,
    last_verified_at=now(),
    last_attempt_at=now(),
    last_error=null,
    updated_at=now();

  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations' for update;
  v_cfg:=v_cfg||jsonb_build_object('zohoOrganizationId',v_org,'zohoDataCenter',v_dc);
  update public.system_configuration set config_value=v_cfg,updated_by=p_admin_user_id,updated_at=now() where config_key='professional_integrations';

  return jsonb_build_object(
    'connected',true,
    'authorizationMode',v_kind,
    'scopesReady',public.service_zoho_org_mail_instance_scopes_ready(p_scopes),
    'queuedEmployees',0,
    'zohoEnabled',coalesce((v_cfg->>'zohoEnabled')::boolean,false),
    'zohoMailEnabled',coalesce((v_cfg->>'zohoMailEnabled')::boolean,false),
    'mailProvisioningEnabled',coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false),
    'professionalEmailRequired',coalesce((v_cfg->>'professionalEmailRequired')::boolean,false),
    'defaultMailProvider',coalesce(v_cfg->>'defaultMailProvider','none')
  );
end;
$$;

create or replace function public.service_get_zoho_org_mail_runtime()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_conn public.zoho_organization_mail_connection%rowtype;
  v_client_id text:='';
  v_client_secret text:='';
  v_refresh text:='';
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  select * into v_conn from public.zoho_organization_mail_connection where singleton_key='primary';
  if coalesce(v_conn.oauth_client_kind,'legacy')='instance_org' then
    select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_mail_org_client_id' limit 1;
    select coalesce(decrypted_secret,'') into v_client_secret from vault.decrypted_secrets where name='profox_zoho_mail_org_client_secret' limit 1;
  else
    select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_client_id' limit 1;
    select coalesce(decrypted_secret,'') into v_client_secret from vault.decrypted_secrets where name='profox_zoho_client_secret' limit 1;
  end if;
  if v_conn.refresh_secret_id is not null then select coalesce(decrypted_secret,'') into v_refresh from vault.decrypted_secrets where id=v_conn.refresh_secret_id limit 1; end if;
  return jsonb_build_object(
    'status',coalesce(v_conn.status,'disconnected'),
    'authorizationMode',coalesce(v_conn.oauth_client_kind,'legacy'),
    'organizationId',coalesce(v_conn.organization_id,''),
    'dataCenter',coalesce(v_conn.data_center,''),
    'clientId',v_client_id,
    'clientSecret',v_client_secret,
    'refreshToken',v_refresh,
    'scopes',coalesce(to_jsonb(v_conn.scopes),'[]'::jsonb),
    'instanceScopesReady',public.service_zoho_org_mail_instance_scopes_ready(v_conn.scopes)
  );
end;
$$;
revoke all on function public.service_get_zoho_org_mail_runtime() from public,anon,authenticated;
grant execute on function public.service_get_zoho_org_mail_runtime() to service_role;

create or replace function public.service_zoho_org_mail_instance_ready()
returns boolean
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare v_conn public.zoho_organization_mail_connection%rowtype; v_has_id boolean:=false; v_has_secret boolean:=false;
begin
  select * into v_conn from public.zoho_organization_mail_connection where singleton_key='primary';
  select exists(select 1 from vault.secrets where name='profox_zoho_mail_org_client_id') into v_has_id;
  select exists(select 1 from vault.secrets where name='profox_zoho_mail_org_client_secret') into v_has_secret;
  return found and v_conn.status='connected' and v_conn.oauth_client_kind='instance_org' and public.service_zoho_org_mail_instance_scopes_ready(v_conn.scopes) and v_has_id and v_has_secret and v_conn.refresh_secret_id is not null;
end;
$$;
revoke all on function public.service_zoho_org_mail_instance_ready() from public,anon;
grant execute on function public.service_zoho_org_mail_instance_ready() to authenticated,service_role;

create or replace function public.service_get_zoho_central_mail_user_runtime(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_account public.staff_professional_accounts%rowtype;
  v_conn public.zoho_organization_mail_connection%rowtype;
  v_client_id text:='';
  v_client_secret text:='';
  v_refresh text:='';
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if p_user_id is null or not public.service_professional_mailbox_eligible(p_user_id) then raise exception 'Professional Email is not enabled for this user.'; end if;
  select * into v_account from public.staff_professional_accounts where user_id=p_user_id;
  if not found or v_account.mailbox_status<>'active' or v_account.mail_provider<>'zoho' or nullif(btrim(coalesce(v_account.work_email,'')),'') is null or nullif(btrim(coalesce(v_account.provider_account_id,'')),'') is null then raise exception 'An active mapped Zoho professional mailbox is required.'; end if;
  select * into v_conn from public.zoho_organization_mail_connection where singleton_key='primary';
  if not found or v_conn.status<>'connected' or v_conn.oauth_client_kind<>'instance_org' or not public.service_zoho_org_mail_instance_scopes_ready(v_conn.scopes) then raise exception 'The Administrator-managed Zoho Mail service is not ready.'; end if;
  select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_mail_org_client_id' limit 1;
  select coalesce(decrypted_secret,'') into v_client_secret from vault.decrypted_secrets where name='profox_zoho_mail_org_client_secret' limit 1;
  if v_conn.refresh_secret_id is not null then select coalesce(decrypted_secret,'') into v_refresh from vault.decrypted_secrets where id=v_conn.refresh_secret_id limit 1; end if;
  if v_client_id='' or v_client_secret='' or v_refresh='' then raise exception 'The Administrator-managed Zoho Mail credentials are incomplete.'; end if;
  return jsonb_build_object(
    'dataCenter',v_conn.data_center,
    'organizationId',v_conn.organization_id,
    'clientId',v_client_id,
    'clientSecret',v_client_secret,
    'refreshToken',v_refresh,
    'accountId',v_account.provider_account_id,
    'workEmail',lower(btrim(v_account.work_email)),
    'scopes',to_jsonb(v_conn.scopes),
    'authorizationMode','instance_org'
  );
end;
$$;
revoke all on function public.service_get_zoho_central_mail_user_runtime(uuid) from public,anon,authenticated;
grant execute on function public.service_get_zoho_central_mail_user_runtime(uuid) to service_role;

create or replace function public.service_mark_zoho_org_mail_connection_error(p_status text,p_error text default null)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if p_status not in ('reconnect_required','error','disconnected','connected') then raise exception 'Invalid Zoho Mail connection state.'; end if;
  update public.zoho_organization_mail_connection
  set status=p_status,last_attempt_at=now(),last_error=case when p_status='connected' then null else left(coalesce(p_error,''),1200) end,updated_at=now()
  where singleton_key='primary';
end;
$$;
revoke all on function public.service_mark_zoho_org_mail_connection_error(text,text) from public,anon,authenticated;
grant execute on function public.service_mark_zoho_org_mail_connection_error(text,text) to service_role;

create or replace function public.get_my_professional_mail_send_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_account public.staff_professional_accounts%rowtype;
  v_conn public.zoho_organization_mail_connection%rowtype;
  v_eligible boolean:=false;
  v_central_ready boolean:=false;
  v_status text:='disconnected';
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_eligible:=public.service_professional_mailbox_eligible(v_uid);
  select * into v_account from public.staff_professional_accounts where user_id=v_uid;
  select * into v_conn from public.zoho_organization_mail_connection where singleton_key='primary';
  v_central_ready:=public.service_zoho_org_mail_instance_ready();
  v_status:=case
    when not v_eligible then 'disconnected'
    when v_central_ready then 'connected'
    when coalesce(v_conn.status,'') in ('error','reconnect_required') then v_conn.status
    when v_account.mailbox_status='active' then 'reconnect_required'
    else 'disconnected'
  end;
  return jsonb_build_object(
    'userId',v_uid,
    'eligible',v_eligible,
    'workEmail',case when v_account.mailbox_status='active' then coalesce(v_account.work_email,'') else '' end,
    'mailboxStatus',coalesce(v_account.mailbox_status,'not_configured'),
    'mailProvider',coalesce(v_account.mail_provider,'none'),
    'providerAccountReady',coalesce(nullif(btrim(v_account.provider_account_id),''),'')<>'',
    'sendConnectionStatus',v_status,
    'sendConnected',(
      v_eligible and v_central_ready and v_account.mailbox_status='active' and v_account.mail_provider='zoho'
      and coalesce(nullif(btrim(v_account.work_email),''),'')<>''
      and coalesce(nullif(btrim(v_account.provider_account_id),''),'')<>''
    ),
    'lastVerifiedAt',v_conn.last_verified_at,
    'lastError',v_conn.last_error,
    'adminManaged',true,
    'authorizationRequired',false
  );
end;
$$;
revoke all on function public.get_my_professional_mail_send_status() from public,anon;
grant execute on function public.get_my_professional_mail_send_status() to authenticated,service_role;
