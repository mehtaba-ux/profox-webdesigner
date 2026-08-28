-- Verified Zoho Mail organization OAuth and automatic professional mailbox provisioning.
-- ProFox remains authoritative; Google Calendar/Meet and Brevo are not replaced by this migration.

alter table public.staff_professional_accounts
  add column if not exists mail_provider_generation integer not null default 1,
  add column if not exists initial_password_secret_id uuid,
  add column if not exists first_login_credentials_retrieved_at timestamptz;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='staff_professional_accounts_mail_provider_generation_check'
      and conrelid='public.staff_professional_accounts'::regclass
  ) then
    alter table public.staff_professional_accounts
      add constraint staff_professional_accounts_mail_provider_generation_check
      check (mail_provider_generation > 0);
  end if;
end $do$;

update public.system_configuration
set config_value=coalesce(config_value,'{}'::jsonb)||jsonb_build_object(
      'mailProviderGeneration',
      case when coalesce(config_value->>'mailProviderGeneration','') ~ '^[1-9][0-9]*$'
           then (config_value->>'mailProviderGeneration')::integer else 1 end
    ),
    updated_at=now()
where config_key='professional_integrations';

create table if not exists public.zoho_organization_mail_connection (
  singleton_key text primary key default 'primary' check (singleton_key='primary'),
  connected_by uuid references public.user_profiles(id) on delete set null,
  organization_id text not null,
  data_center text not null,
  refresh_secret_id uuid,
  scopes text[] not null default '{}',
  status text not null default 'disconnected' check (status in ('disconnected','connected','reconnect_required','error')),
  last_verified_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.zoho_organization_mail_connection enable row level security;
revoke all on table public.zoho_organization_mail_connection from anon,authenticated;

create table if not exists public.zoho_mail_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  admin_user_id uuid not null references public.user_profiles(id) on delete cascade,
  organization_id text not null,
  data_center text not null,
  redirect_uri text not null,
  expires_at timestamptz not null default (now()+interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists zoho_mail_oauth_states_expires_idx on public.zoho_mail_oauth_states(expires_at);
alter table public.zoho_mail_oauth_states enable row level security;
revoke all on table public.zoho_mail_oauth_states from anon,authenticated;

create table if not exists public.professional_mailbox_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  provider text not null default 'zoho' check (provider='zoho'),
  status text not null default 'pending' check (status in ('pending','processing','retry','succeeded','skipped','dead_letter')),
  requested_reason text not null default 'staff_activation',
  requested_by uuid references public.user_profiles(id) on delete set null,
  idempotency_key text not null unique,
  mail_provider_generation integer not null default 1 check (mail_provider_generation > 0),
  correlation_id uuid not null default gen_random_uuid(),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists professional_mailbox_jobs_claim_idx
  on public.professional_mailbox_provisioning_jobs(status,next_attempt_at,created_at)
  where status in ('pending','retry');
create index if not exists professional_mailbox_jobs_user_idx
  on public.professional_mailbox_provisioning_jobs(user_id,mail_provider_generation,status);
alter table public.professional_mailbox_provisioning_jobs enable row level security;
revoke all on table public.professional_mailbox_provisioning_jobs from anon,authenticated;

create or replace function public.service_professional_mailbox_eligible(p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  select exists(
    select 1 from public.user_profiles p
    where p.id=p_user_id
      and lower(coalesce(p.status,''))='active'
      and lower(coalesce(p.onboarding_status,''))='completed'
      and lower(coalesce(p.role,'')) not in ('','customer','client','pending')
  );
$function$;

create or replace function public.queue_professional_mailbox_provisioning(
  p_user_id uuid,
  p_reason text default 'staff_activation'::text,
  p_requested_by uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_cfg jsonb:='{}'::jsonb;
  v_generation integer:=1;
  v_job uuid;
  v_key text;
begin
  if not public.service_professional_mailbox_eligible(p_user_id) then return null; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration where config_key='professional_integrations';
  if coalesce((v_cfg->>'zohoEnabled')::boolean,false) is not true
     or coalesce((v_cfg->>'zohoMailEnabled')::boolean,false) is not true
     or coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false) is not true
     or coalesce(v_cfg->>'defaultMailProvider','none')<>'zoho'
     or not exists(select 1 from public.zoho_organization_mail_connection where singleton_key='primary' and status='connected')
  then return null; end if;
  if coalesce(v_cfg->>'mailProviderGeneration','') ~ '^[1-9][0-9]*$' then
    v_generation:=(v_cfg->>'mailProviderGeneration')::integer;
  end if;
  if exists(select 1 from public.staff_professional_accounts where user_id=p_user_id and mailbox_status='active' and nullif(btrim(work_email),'') is not null) then return null; end if;

  insert into public.staff_professional_accounts(user_id,mail_provider,mailbox_status,mail_provider_generation,updated_at)
  values(p_user_id,'zoho','provisioning',v_generation,now())
  on conflict(user_id) do update set
    mail_provider='zoho',
    mailbox_status=case when public.staff_professional_accounts.mailbox_status='active' then 'active' else 'provisioning' end,
    mail_provider_generation=v_generation,
    last_error=case when public.staff_professional_accounts.mailbox_status='active' then public.staff_professional_accounts.last_error else null end,
    updated_at=now();

  v_key:='zoho-mail:provision:'||p_user_id::text||':g'||v_generation::text;
  insert into public.professional_mailbox_provisioning_jobs(user_id,requested_reason,requested_by,idempotency_key,mail_provider_generation)
  values(p_user_id,left(coalesce(nullif(btrim(p_reason),''),'staff_activation'),120),p_requested_by,v_key,v_generation)
  on conflict(idempotency_key) do update set
    status=case when public.professional_mailbox_provisioning_jobs.status in ('dead_letter','skipped') then 'pending' else public.professional_mailbox_provisioning_jobs.status end,
    next_attempt_at=case when public.professional_mailbox_provisioning_jobs.status in ('dead_letter','skipped') then now() else public.professional_mailbox_provisioning_jobs.next_attempt_at end,
    completed_at=case when public.professional_mailbox_provisioning_jobs.status in ('dead_letter','skipped') then null else public.professional_mailbox_provisioning_jobs.completed_at end,
    last_error=case when public.professional_mailbox_provisioning_jobs.status in ('dead_letter','skipped') then null else public.professional_mailbox_provisioning_jobs.last_error end,
    updated_at=now()
  returning id into v_job;
  return v_job;
end;
$function$;

create or replace function public.service_reconcile_professional_mailboxes(p_reason text default 'zoho_connection_verified'::text)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare r record; v_id uuid; v_count integer:=0;
begin
  for r in
    select id from public.user_profiles
    where lower(coalesce(status,''))='active'
      and lower(coalesce(onboarding_status,''))='completed'
      and lower(coalesce(role,'')) not in ('','customer','client','pending')
  loop
    v_id:=public.queue_professional_mailbox_provisioning(r.id,p_reason,null);
    if v_id is not null then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$function$;

create or replace function public.trigger_queue_professional_mailbox_on_staff_activation()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if public.service_professional_mailbox_eligible(new.id)
     and (tg_op='INSERT' or old.status is distinct from new.status or old.onboarding_status is distinct from new.onboarding_status or old.role is distinct from new.role)
  then
    perform public.queue_professional_mailbox_provisioning(new.id,'staff_activation',null);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_queue_professional_mailbox_on_staff_activation on public.user_profiles;
create trigger trg_queue_professional_mailbox_on_staff_activation
after insert or update of status,onboarding_status,role on public.user_profiles
for each row execute function public.trigger_queue_professional_mailbox_on_staff_activation();

create or replace function public.service_claim_professional_mailbox_jobs(p_limit integer default 10)
returns setof public.professional_mailbox_provisioning_jobs
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_cfg jsonb:='{}'::jsonb; v_generation integer:=1; v_enabled boolean:=false;
begin
  update public.professional_mailbox_provisioning_jobs
  set status='retry',next_attempt_at=now(),locked_at=null,updated_at=now()
  where status='processing' and locked_at<now()-interval '10 minutes';

  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  if coalesce(v_cfg->>'mailProviderGeneration','') ~ '^[1-9][0-9]*$' then v_generation:=(v_cfg->>'mailProviderGeneration')::integer; end if;
  v_enabled:=coalesce((v_cfg->>'zohoEnabled')::boolean,false)
    and coalesce((v_cfg->>'zohoMailEnabled')::boolean,false)
    and coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false)
    and coalesce(v_cfg->>'defaultMailProvider','none')='zoho'
    and exists(select 1 from public.zoho_organization_mail_connection where singleton_key='primary' and status='connected');

  update public.professional_mailbox_provisioning_jobs j
  set status='skipped',locked_at=null,completed_at=now(),updated_at=now(),
      last_error=case when not v_enabled then 'Provisioning is disabled or Zoho Mail is not connected.' else 'Provider configuration changed after this job was queued.' end
  where j.status in ('pending','retry') and (not v_enabled or j.mail_provider_generation<>v_generation or not public.service_professional_mailbox_eligible(j.user_id));

  update public.staff_professional_accounts a
  set mailbox_status='not_configured',last_error=null,updated_at=now()
  where a.mailbox_status='provisioning' and a.work_email is null
    and not exists(select 1 from public.professional_mailbox_provisioning_jobs j where j.user_id=a.user_id and j.status in ('pending','retry','processing'));

  return query
  with picked as (
    select j.id from public.professional_mailbox_provisioning_jobs j
    where j.status in ('pending','retry') and j.next_attempt_at<=now()
      and j.mail_provider_generation=v_generation and v_enabled
      and public.service_professional_mailbox_eligible(j.user_id)
    order by j.next_attempt_at,j.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit,10),1),50)
  )
  update public.professional_mailbox_provisioning_jobs j
  set status='processing',attempts=j.attempts+1,locked_at=now(),updated_at=now()
  from picked p where j.id=p.id returning j.*;
end;
$function$;

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
  v_secret_id uuid;
  v_secret_name text;
  v_email text:=lower(btrim(coalesce(p_work_email,'')));
begin
  if p_status not in ('succeeded','retry','dead_letter','skipped') then raise exception 'Unsupported mailbox job result.'; end if;
  select * into v_job from public.professional_mailbox_provisioning_jobs where id=p_job_id for update;
  if not found then return; end if;

  if p_status='succeeded' then
    if v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'A valid professional email is required for success.'; end if;
    if nullif(coalesce(p_initial_password,''),'') is not null then
      v_secret_name:='profox_zoho_first_login_'||v_job.user_id::text;
      select id into v_secret_id from vault.secrets where name=v_secret_name limit 1;
      if v_secret_id is null then
        v_secret_id:=vault.create_secret(p_initial_password,v_secret_name,'One-time Zoho Mail first-login password. Revealed once to the owning employee.',null);
      else
        perform vault.update_secret(v_secret_id,p_initial_password,v_secret_name,'One-time Zoho Mail first-login password. Revealed once to the owning employee.',null);
      end if;
    end if;
    insert into public.staff_professional_accounts(
      user_id,work_email,mail_provider,mailbox_status,provider_user_id,provider_account_id,mail_provider_generation,
      initial_password_secret_id,first_login_credentials_retrieved_at,provisioned_at,last_error,updated_at
    ) values(
      v_job.user_id,v_email,'zoho','active',nullif(btrim(coalesce(p_provider_user_id,'')),''),nullif(btrim(coalesce(p_provider_account_id,'')),''),v_job.mail_provider_generation,
      v_secret_id,null,now(),null,now()
    )
    on conflict(user_id) do update set
      work_email=excluded.work_email,mail_provider='zoho',mailbox_status='active',provider_user_id=excluded.provider_user_id,
      provider_account_id=excluded.provider_account_id,mail_provider_generation=excluded.mail_provider_generation,
      initial_password_secret_id=coalesce(excluded.initial_password_secret_id,public.staff_professional_accounts.initial_password_secret_id),
      first_login_credentials_retrieved_at=case when excluded.initial_password_secret_id is not null then null else public.staff_professional_accounts.first_login_credentials_retrieved_at end,
      provisioned_at=coalesce(public.staff_professional_accounts.provisioned_at,now()),last_error=null,updated_at=now();
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

create or replace function public.service_get_professional_mailbox_cron_secret()
returns text
language sql
stable security definer
set search_path to 'vault','pg_temp'
as $function$
  select coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_professional_mailbox_cron_token' limit 1),'');
$function$;

create or replace function public.service_get_zoho_org_mail_runtime()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare v_conn public.zoho_organization_mail_connection%rowtype; v_client_id text:=''; v_client_secret text:=''; v_refresh text:='';
begin
  select * into v_conn from public.zoho_organization_mail_connection where singleton_key='primary';
  select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_client_id' limit 1;
  select coalesce(decrypted_secret,'') into v_client_secret from vault.decrypted_secrets where name='profox_zoho_client_secret' limit 1;
  if v_conn.refresh_secret_id is not null then select coalesce(decrypted_secret,'') into v_refresh from vault.decrypted_secrets where id=v_conn.refresh_secret_id limit 1; end if;
  return jsonb_build_object('status',coalesce(v_conn.status,'disconnected'),'organizationId',coalesce(v_conn.organization_id,''),'dataCenter',coalesce(v_conn.data_center,''),'clientId',v_client_id,'clientSecret',v_client_secret,'refreshToken',v_refresh,'scopes',coalesce(to_jsonb(v_conn.scopes),'[]'::jsonb));
end;
$function$;

create or replace function public.service_reconcile_professional_mailboxes(p_reason text default 'zoho_connection_verified'::text)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare r record; v_id uuid; v_count integer:=0;
begin
  for r in
    select id from public.user_profiles
    where lower(coalesce(status,''))='active'
      and lower(coalesce(onboarding_status,''))='completed'
      and lower(coalesce(role,'')) not in ('','customer','client','pending')
  loop
    v_id:=public.queue_professional_mailbox_provisioning(r.id,p_reason,null);
    if v_id is not null then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$function$;

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
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_secret_id uuid; v_cfg jsonb:='{}'::jsonb; v_generation integer:=1; v_count integer:=0;
  v_refresh text:=btrim(coalesce(p_refresh_token,'')); v_org text:=btrim(coalesce(p_organization_id,'')); v_dc text:=lower(btrim(coalesce(p_data_center,'')));
begin
  if v_refresh='' then raise exception 'Zoho refresh token is required.'; end if;
  if v_org='' then raise exception 'Zoho organization ID is required.'; end if;
  if v_dc not in ('com','in','eu','com.au','jp','ca','sa') then raise exception 'Unsupported Zoho data center.'; end if;
  if not exists(select 1 from public.user_profiles where id=p_admin_user_id and lower(coalesce(status,''))='active' and lower(coalesce(role,''))='admin') then raise exception 'Active Admin account required.'; end if;

  select id into v_secret_id from vault.secrets where name='profox_zoho_org_mail_refresh' limit 1;
  if v_secret_id is null then
    v_secret_id:=vault.create_secret(v_refresh,'profox_zoho_org_mail_refresh','Zoho organization Mail OAuth refresh token.',null);
  else
    perform vault.update_secret(v_secret_id,v_refresh,'profox_zoho_org_mail_refresh','Zoho organization Mail OAuth refresh token.',null);
  end if;

  insert into public.zoho_organization_mail_connection(singleton_key,connected_by,organization_id,data_center,refresh_secret_id,scopes,status,last_verified_at,last_attempt_at,last_error,updated_at)
  values('primary',p_admin_user_id,v_org,v_dc,v_secret_id,coalesce(p_scopes,'{}'::text[]),'connected',now(),now(),null,now())
  on conflict(singleton_key) do update set connected_by=excluded.connected_by,organization_id=excluded.organization_id,data_center=excluded.data_center,refresh_secret_id=excluded.refresh_secret_id,scopes=excluded.scopes,status='connected',last_verified_at=now(),last_attempt_at=now(),last_error=null,updated_at=now();

  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations' for update;
  if coalesce(v_cfg->>'mailProviderGeneration','') ~ '^[1-9][0-9]*$' then v_generation:=(v_cfg->>'mailProviderGeneration')::integer; end if;
  v_generation:=v_generation+1;
  v_cfg:=v_cfg||jsonb_build_object(
    'zohoEnabled',true,
    'zohoMailEnabled',true,
    'mailProvisioningEnabled',true,
    'defaultMailProvider','zoho',
    'zohoOrganizationId',v_org,
    'zohoDataCenter',v_dc,
    'mailProviderGeneration',v_generation
  );
  update public.system_configuration set config_value=v_cfg,updated_by=p_admin_user_id,updated_at=now() where config_key='professional_integrations';
  v_count:=public.service_reconcile_professional_mailboxes('zoho_connection_verified');
  return jsonb_build_object('connected',true,'mailProviderGeneration',v_generation,'queuedEmployees',v_count,'professionalEmailRequired',coalesce((v_cfg->>'professionalEmailRequired')::boolean,false));
end;
$function$;

create or replace function public.service_mark_zoho_org_mail_connection_error(p_status text,p_error text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if p_status not in ('reconnect_required','error','disconnected','connected') then raise exception 'Invalid Zoho Mail connection state.'; end if;
  update public.zoho_organization_mail_connection set status=p_status,last_attempt_at=now(),last_error=case when p_status='connected' then null else left(coalesce(p_error,''),1200) end,updated_at=now() where singleton_key='primary';
end;
$function$;

create or replace function public.get_my_professional_mailbox_first_login()
returns jsonb
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_row public.staff_professional_accounts%rowtype;
  v_password text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_row from public.staff_professional_accounts where user_id=v_uid for update;
  if not found or v_row.mailbox_status<>'active' or nullif(btrim(coalesce(v_row.work_email,'')),'') is null then
    return jsonb_build_object('available',false,'workEmail',coalesce(v_row.work_email,''),'reason','mailbox_not_active');
  end if;
  if v_row.initial_password_secret_id is null or v_row.first_login_credentials_retrieved_at is not null then
    return jsonb_build_object('available',false,'workEmail',v_row.work_email,'reason','already_retrieved_or_existing_account');
  end if;
  select decrypted_secret into v_password from vault.decrypted_secrets where id=v_row.initial_password_secret_id limit 1;
  if coalesce(v_password,'')='' then
    update public.staff_professional_accounts set initial_password_secret_id=null,updated_at=now() where user_id=v_uid;
    return jsonb_build_object('available',false,'workEmail',v_row.work_email,'reason','credential_unavailable');
  end if;
  delete from vault.secrets where id=v_row.initial_password_secret_id;
  update public.staff_professional_accounts
  set initial_password_secret_id=null,first_login_credentials_retrieved_at=now(),updated_at=now()
  where user_id=v_uid;
  return jsonb_build_object('available',true,'workEmail',v_row.work_email,'temporaryPassword',v_password,'oneTimePassword',true);
end;
$function$;

create or replace function public.admin_get_professional_integrations()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare v_cfg jsonb:='{}'::jsonb; v_client_id text:=''; v_has_secret boolean:=false; v_mail_status text:='disconnected'; v_verified timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  select coalesce(decrypted_secret,'') into v_client_id from vault.decrypted_secrets where name='profox_zoho_client_id' limit 1;
  select exists(select 1 from vault.secrets where name='profox_zoho_client_secret') into v_has_secret;
  select status,last_verified_at into v_mail_status,v_verified from public.zoho_organization_mail_connection where singleton_key='primary';
  return v_cfg||jsonb_build_object(
    'zohoProviderConfigured',v_client_id<>'' and v_has_secret and coalesce(v_cfg->>'zohoOrganizationId','')<>'',
    'zohoClientIdHint',case when v_client_id='' then '' else left(v_client_id,8)||'...'||right(v_client_id,6) end,
    'zohoClientSecretStored',v_has_secret,
    'zohoMailConnectionStatus',coalesce(v_mail_status,'disconnected'),
    'zohoMailConnected',coalesce(v_mail_status='connected',false),
    'zohoMailLastVerifiedAt',v_verified
  );
end;
$function$;

create or replace function public.admin_get_integration_health()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_google_connected integer:=0; v_google_active integer:=0; v_google_pending integer:=0; v_google_retry integer:=0; v_google_processing integer:=0; v_google_reconnect integer:=0; v_google_failed integer:=0; v_google_dead integer:=0; v_google_skipped integer:=0; v_oldest_pending timestamptz;
  v_zoho_connected integer:=0; v_zoho_error integer:=0; v_org_mail_status text:='disconnected'; v_org_mail_verified timestamptz;
  v_mail_active integer:=0; v_mail_provisioning integer:=0; v_mail_error integer:=0; v_mail_suspended integer:=0; v_mail_pending integer:=0; v_mail_retry integer:=0; v_mail_processing integer:=0; v_mail_dead integer:=0; v_mail_oldest timestamptz;
  v_inbox_24h integer:=0; v_inbox_delivery_issues integer:=0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select count(*) filter(where status='connected' and sync_enabled),count(*) filter(where status='connected' and sync_enabled and public.service_effective_calendar_provider(user_id)='google') into v_google_connected,v_google_active from public.google_calendar_connections;
  select count(*) filter(where status='pending'),count(*) filter(where status='retry'),count(*) filter(where status='processing'),count(*) filter(where status='reconnect_required'),count(*) filter(where status='failed'),count(*) filter(where status='dead_letter'),count(*) filter(where status='skipped'),min(next_attempt_at) filter(where status in('pending','retry')) into v_google_pending,v_google_retry,v_google_processing,v_google_reconnect,v_google_failed,v_google_dead,v_google_skipped,v_oldest_pending from public.google_calendar_sync_jobs;
  select count(*) filter(where status='connected'),count(*) filter(where status='error') into v_zoho_connected,v_zoho_error from public.zoho_connections;
  select status,last_verified_at into v_org_mail_status,v_org_mail_verified from public.zoho_organization_mail_connection where singleton_key='primary';
  select count(*) filter(where mailbox_status='active'),count(*) filter(where mailbox_status='provisioning'),count(*) filter(where mailbox_status='error'),count(*) filter(where mailbox_status='suspended') into v_mail_active,v_mail_provisioning,v_mail_error,v_mail_suspended from public.staff_professional_accounts;
  select count(*) filter(where status='pending'),count(*) filter(where status='retry'),count(*) filter(where status='processing'),count(*) filter(where status='dead_letter'),min(next_attempt_at) filter(where status in('pending','retry')) into v_mail_pending,v_mail_retry,v_mail_processing,v_mail_dead,v_mail_oldest from public.professional_mailbox_provisioning_jobs;
  select count(*) filter(where sent_or_received_at>=now()-interval '24 hours'),count(*) filter(where lower(coalesce(delivery_status,'')) in('failed','bounced','rejected','error')) into v_inbox_24h,v_inbox_delivery_issues from public.client_email_messages;
  return jsonb_build_object(
    'generatedAt',now(),
    'google',jsonb_build_object('connectedAccounts',v_google_connected,'activeProviderAccounts',v_google_active,'pending',v_google_pending,'retry',v_google_retry,'processing',v_google_processing,'reconnectRequired',v_google_reconnect,'failedHistorical',v_google_failed,'deadLetter',v_google_dead,'skipped',v_google_skipped,'oldestPendingAt',v_oldest_pending),
    'zoho',jsonb_build_object('connectedAccounts',v_zoho_connected,'errorAccounts',v_zoho_error,'organizationMailStatus',coalesce(v_org_mail_status,'disconnected'),'organizationMailConnected',coalesce(v_org_mail_status='connected',false),'organizationMailLastVerifiedAt',v_org_mail_verified),
    'mailboxes',jsonb_build_object('active',v_mail_active,'provisioning',v_mail_provisioning,'error',v_mail_error,'suspended',v_mail_suspended,'queuePending',v_mail_pending,'queueRetry',v_mail_retry,'queueProcessing',v_mail_processing,'queueDeadLetter',v_mail_dead,'oldestQueuedAt',v_mail_oldest),
    'clientInbox',jsonb_build_object('messagesLast24Hours',v_inbox_24h,'deliveryIssues',v_inbox_delivery_issues)
  );
end;
$function$;

revoke all on function public.service_professional_mailbox_eligible(uuid) from public,anon,authenticated;
revoke all on function public.queue_professional_mailbox_provisioning(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.service_reconcile_professional_mailboxes(text) from public,anon,authenticated;
revoke all on function public.trigger_queue_professional_mailbox_on_staff_activation() from public,anon,authenticated;
revoke all on function public.service_claim_professional_mailbox_jobs(integer) from public,anon,authenticated;
revoke all on function public.service_finish_professional_mailbox_job(uuid,text,text,text,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.service_get_professional_mailbox_cron_secret() from public,anon,authenticated;
revoke all on function public.service_get_zoho_org_mail_runtime() from public,anon,authenticated;
revoke all on function public.service_store_verified_zoho_org_mail_connection(uuid,text,text,text,text[]) from public,anon,authenticated;
revoke all on function public.service_mark_zoho_org_mail_connection_error(text,text) from public,anon,authenticated;
revoke all on function public.get_my_professional_mailbox_first_login() from public,anon;
revoke all on function public.admin_get_professional_integrations() from public,anon;
revoke all on function public.admin_get_integration_health() from public,anon;

grant execute on function public.service_professional_mailbox_eligible(uuid) to service_role,postgres;
grant execute on function public.queue_professional_mailbox_provisioning(uuid,text,uuid) to service_role,postgres;
grant execute on function public.service_reconcile_professional_mailboxes(text) to service_role,postgres;
grant execute on function public.trigger_queue_professional_mailbox_on_staff_activation() to service_role,postgres;
grant execute on function public.service_claim_professional_mailbox_jobs(integer) to service_role,postgres;
grant execute on function public.service_finish_professional_mailbox_job(uuid,text,text,text,text,text,text,integer) to service_role,postgres;
grant execute on function public.service_get_professional_mailbox_cron_secret() to service_role,postgres;
grant execute on function public.service_get_zoho_org_mail_runtime() to service_role,postgres;
grant execute on function public.service_store_verified_zoho_org_mail_connection(uuid,text,text,text,text[]) to service_role,postgres;
grant execute on function public.service_mark_zoho_org_mail_connection_error(text,text) to service_role,postgres;
grant execute on function public.get_my_professional_mailbox_first_login() to authenticated,service_role,postgres;
grant execute on function public.admin_get_professional_integrations() to authenticated,service_role,postgres;
grant execute on function public.admin_get_integration_health() to authenticated,service_role,postgres;

do $do$
begin
  if not exists(select 1 from vault.secrets where name='profox_professional_mailbox_cron_token') then
    perform vault.create_secret(md5(gen_random_uuid()::text||clock_timestamp()::text)||md5(gen_random_uuid()::text),'profox_professional_mailbox_cron_token','Cron authentication token for the professional mailbox provisioning worker.',null);
  end if;
end $do$;

do $do$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='profox-professional-mailbox-provisioning' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'profox-professional-mailbox-provisioning',
    '*/2 * * * *',
    $cron$
      select net.http_post(
        url := 'https://calabtayklhltyiriiwo.supabase.co/functions/v1/process-professional-mailbox-provisioning',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-profox-mailbox-cron-token',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_professional_mailbox_cron_token' limit 1),'')
        ),
        body := jsonb_build_object('source','supabase-cron','requestedAt',now()),
        timeout_milliseconds := 30000
      );
    $cron$
  );
end $do$;
