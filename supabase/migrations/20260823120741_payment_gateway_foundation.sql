alter table public.quotations
  add column if not exists payment_schedule_snapshot jsonb,
  add column if not exists payment_schedule_source_code text,
  add column if not exists payment_schedule_snapshotted_at timestamptz;

alter table public.payments
  add column if not exists public_payment_token_hash text,
  add column if not exists public_payment_token_issued_at timestamptz,
  add column if not exists public_payment_token_expires_at timestamptz;

create unique index if not exists idx_payments_public_token_hash
  on public.payments(public_payment_token_hash)
  where public_payment_token_hash is not null;

create unique index if not exists idx_payments_quotation_milestone
  on public.payments(quotation_id,milestone_number)
  where quotation_id is not null and milestone_number is not null;

create table if not exists public.payment_gateway_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  provider text not null check (provider in ('razorpay','paypal')),
  environment text not null,
  status text not null default 'Creating' check (status in ('Creating','Created','Pending','Approved','Captured','Completed','Failed','Cancelled')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null,
  provider_order_id text,
  provider_payment_id text,
  provider_capture_id text,
  checkout_url text,
  idempotency_key text not null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists idx_payment_gateway_attempts_idempotency
  on public.payment_gateway_attempts(idempotency_key);
create unique index if not exists idx_payment_gateway_attempts_provider_order
  on public.payment_gateway_attempts(provider,provider_order_id)
  where provider_order_id is not null;
create unique index if not exists idx_payment_gateway_attempts_provider_payment
  on public.payment_gateway_attempts(provider,provider_payment_id)
  where provider_payment_id is not null;
create index if not exists idx_payment_gateway_attempts_payment
  on public.payment_gateway_attempts(payment_id,created_at desc);

alter table public.payment_gateway_attempts enable row level security;
drop policy if exists payment_gateway_attempts_admin_all on public.payment_gateway_attempts;
create policy payment_gateway_attempts_admin_all on public.payment_gateway_attempts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.payment_gateway_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('razorpay','paypal')),
  provider_event_id text not null,
  event_type text not null,
  payment_id uuid references public.payments(id) on delete set null,
  attempt_id uuid references public.payment_gateway_attempts(id) on delete set null,
  verified boolean not null default false,
  processed boolean not null default false,
  error_message text,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider,provider_event_id)
);

create index if not exists idx_payment_gateway_events_payment
  on public.payment_gateway_events(payment_id,received_at desc);
alter table public.payment_gateway_events enable row level security;
drop policy if exists payment_gateway_events_admin_all on public.payment_gateway_events;
create policy payment_gateway_events_admin_all on public.payment_gateway_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.system_configuration(config_key,config_value,description,updated_at)
values(
  'payment_gateway_settings',
  jsonb_build_object(
    'checkoutBaseUrl','https://www.profoxwebdesigner.com',
    'firstPaymentDueDays',7,
    'milestoneDueDays',5,
    'razorpay',jsonb_build_object('enabled',false,'mode','test','keyId','','configured',false,'webhookConfigured',false),
    'paypal',jsonb_build_object('enabled',false,'mode','sandbox','clientId','','webhookId','','configured',false,'webhookConfigured',false)
  ),
  'ProFox payment collection provider settings. Secrets are stored only in Supabase Vault.',
  now()
)
on conflict(config_key) do nothing;

create or replace function public.payment_gateway_secret_name(p_provider text,p_mode text,p_kind text)
returns text language plpgsql immutable set search_path='public','pg_temp' as $$
declare v_provider text:=lower(trim(coalesce(p_provider,''))); v_mode text:=lower(trim(coalesce(p_mode,''))); v_kind text:=lower(trim(coalesce(p_kind,'')));
begin
  if v_provider='razorpay' and v_mode in ('test','live') and v_kind in ('api_secret','webhook_secret') then
    return 'profox_payment_razorpay_'||v_mode||'_'||v_kind;
  elsif v_provider='paypal' and v_mode in ('sandbox','live') and v_kind='client_secret' then
    return 'profox_payment_paypal_'||v_mode||'_client_secret';
  end if;
  raise exception 'Unsupported payment provider secret selector.';
end; $$;

create or replace function public.admin_get_payment_gateway_status()
returns jsonb language plpgsql security definer set search_path='public','vault','pg_temp' as $$
declare v_cfg jsonb; v_r jsonb; v_p jsonb; v_r_mode text; v_p_mode text; v_r_secret boolean; v_r_webhook boolean; v_p_secret boolean;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='payment_gateway_settings';
  v_cfg:=coalesce(v_cfg,'{}'::jsonb);
  v_r:=coalesce(v_cfg->'razorpay','{}'::jsonb); v_p:=coalesce(v_cfg->'paypal','{}'::jsonb);
  v_r_mode:=case when lower(coalesce(v_r->>'mode','test'))='live' then 'live' else 'test' end;
  v_p_mode:=case when lower(coalesce(v_p->>'mode','sandbox'))='live' then 'live' else 'sandbox' end;
  select exists(select 1 from vault.secrets where name=public.payment_gateway_secret_name('razorpay',v_r_mode,'api_secret')) into v_r_secret;
  select exists(select 1 from vault.secrets where name=public.payment_gateway_secret_name('razorpay',v_r_mode,'webhook_secret')) into v_r_webhook;
  select exists(select 1 from vault.secrets where name=public.payment_gateway_secret_name('paypal',v_p_mode,'client_secret')) into v_p_secret;
  v_r:=v_r||jsonb_build_object('configured',v_r_secret and coalesce(nullif(trim(v_r->>'keyId'),''),'')<>'','webhookConfigured',v_r_webhook);
  v_p:=v_p||jsonb_build_object('configured',v_p_secret and coalesce(nullif(trim(v_p->>'clientId'),''),'')<>'','webhookConfigured',coalesce(nullif(trim(v_p->>'webhookId'),''),'')<>'');
  return (v_cfg-'razorpay'-'paypal')||jsonb_build_object('razorpay',v_r,'paypal',v_p,'canConfigure',true);
end; $$;

create or replace function public.admin_set_payment_gateway_general(p_checkout_base_url text,p_first_payment_due_days integer default 7,p_milestone_due_days integer default 5)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_cfg jsonb; v_url text:=rtrim(trim(coalesce(p_checkout_base_url,'')),'/'); v_first int:=least(greatest(coalesce(p_first_payment_due_days,7),0),90); v_later int:=least(greatest(coalesce(p_milestone_due_days,5),0),90);
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if v_url !~* '^https://[a-z0-9.-]+(?::[0-9]+)?(?:/.*)?$' then raise exception 'Checkout base URL must be a valid HTTPS URL.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='payment_gateway_settings';
  v_cfg:=coalesce(v_cfg,'{}'::jsonb)||jsonb_build_object('checkoutBaseUrl',v_url,'firstPaymentDueDays',v_first,'milestoneDueDays',v_later);
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('payment_gateway_settings',v_cfg,'ProFox payment collection provider settings. Secrets are stored only in Supabase Vault.',auth.uid(),now())
  on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=auth.uid(),updated_at=now();
  return public.admin_get_payment_gateway_status();
end; $$;

create or replace function public.admin_set_payment_gateway_provider(
  p_provider text,
  p_enabled boolean,
  p_mode text,
  p_public_id text,
  p_secret text default '',
  p_webhook_secret text default '',
  p_webhook_id text default ''
)
returns jsonb language plpgsql security definer set search_path='public','vault','pg_temp' as $$
declare
  v_provider text:=lower(trim(coalesce(p_provider,''))); v_mode text:=lower(trim(coalesce(p_mode,''))); v_public text:=trim(coalesce(p_public_id,''));
  v_cfg jsonb; v_pc jsonb; v_secret_name text; v_webhook_name text; v_secret_id uuid; v_has_secret boolean:=false; v_has_webhook boolean:=false; v_webhook_id text:=trim(coalesce(p_webhook_id,''));
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if v_provider not in ('razorpay','paypal') then raise exception 'Unsupported payment provider.'; end if;
  if (v_provider='razorpay' and v_mode not in ('test','live')) or (v_provider='paypal' and v_mode not in ('sandbox','live')) then raise exception 'Unsupported provider mode.'; end if;
  if v_provider='razorpay' and v_public<>'' and v_public !~ '^rzp_(test|live)_[A-Za-z0-9]+$' then raise exception 'Enter a valid Razorpay Key ID.'; end if;
  if v_provider='paypal' and length(v_public)>300 then raise exception 'PayPal Client ID is too long.'; end if;

  v_secret_name:=public.payment_gateway_secret_name(v_provider,v_mode,case when v_provider='razorpay' then 'api_secret' else 'client_secret' end);
  select id into v_secret_id from vault.secrets where name=v_secret_name limit 1;
  if trim(coalesce(p_secret,''))<>'' then
    if v_secret_id is null then perform vault.create_secret(trim(p_secret),v_secret_name,'ProFox '||v_provider||' '||v_mode||' server API secret',null);
    else perform vault.update_secret(v_secret_id,trim(p_secret),v_secret_name,'ProFox '||v_provider||' '||v_mode||' server API secret',null); end if;
  end if;
  select exists(select 1 from vault.secrets where name=v_secret_name) into v_has_secret;

  if v_provider='razorpay' then
    v_webhook_name:=public.payment_gateway_secret_name(v_provider,v_mode,'webhook_secret');
    select id into v_secret_id from vault.secrets where name=v_webhook_name limit 1;
    if trim(coalesce(p_webhook_secret,''))<>'' then
      if v_secret_id is null then perform vault.create_secret(trim(p_webhook_secret),v_webhook_name,'ProFox Razorpay webhook verification secret',null);
      else perform vault.update_secret(v_secret_id,trim(p_webhook_secret),v_webhook_name,'ProFox Razorpay webhook verification secret',null); end if;
    end if;
    select exists(select 1 from vault.secrets where name=v_webhook_name) into v_has_webhook;
  else
    v_has_webhook:=v_webhook_id<>'';
  end if;

  if coalesce(p_enabled,false) and (v_public='' or not v_has_secret or not v_has_webhook) then
    raise exception 'Provider cannot be enabled until its public ID, API secret and webhook verification configuration are complete.';
  end if;

  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='payment_gateway_settings'; v_cfg:=coalesce(v_cfg,'{}'::jsonb);
  v_pc:=coalesce(v_cfg->v_provider,'{}'::jsonb)||jsonb_build_object('enabled',coalesce(p_enabled,false),'mode',v_mode,'configured',v_has_secret and v_public<>'','webhookConfigured',v_has_webhook);
  if v_provider='razorpay' then v_pc:=v_pc||jsonb_build_object('keyId',v_public);
  else v_pc:=v_pc||jsonb_build_object('clientId',v_public,'webhookId',v_webhook_id); end if;
  v_cfg:=jsonb_set(v_cfg,array[v_provider],v_pc,true);
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('payment_gateway_settings',v_cfg,'ProFox payment collection provider settings. Secrets are stored only in Supabase Vault.',auth.uid(),now())
  on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=auth.uid(),updated_at=now();
  return public.admin_get_payment_gateway_status();
end; $$;

create or replace function public.service_get_payment_gateway_provider(p_provider text)
returns jsonb language plpgsql security definer set search_path='public','vault','pg_temp' as $$
declare v_provider text:=lower(trim(coalesce(p_provider,''))); v_cfg jsonb; v_pc jsonb; v_mode text; v_secret text; v_webhook_secret text:='';
begin
  if v_provider not in ('razorpay','paypal') then raise exception 'Unsupported payment provider.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='payment_gateway_settings'; v_cfg:=coalesce(v_cfg,'{}'::jsonb);
  v_pc:=coalesce(v_cfg->v_provider,'{}'::jsonb);
  v_mode:=lower(coalesce(v_pc->>'mode',case when v_provider='razorpay' then 'test' else 'sandbox' end));
  select decrypted_secret into v_secret from vault.decrypted_secrets where name=public.payment_gateway_secret_name(v_provider,v_mode,case when v_provider='razorpay' then 'api_secret' else 'client_secret' end) limit 1;
  if v_provider='razorpay' then select decrypted_secret into v_webhook_secret from vault.decrypted_secrets where name=public.payment_gateway_secret_name(v_provider,v_mode,'webhook_secret') limit 1; end if;
  return (v_pc-'configured'-'webhookConfigured')||jsonb_build_object('provider',v_provider,'mode',v_mode,'apiSecret',coalesce(v_secret,''),'webhookSecret',coalesce(v_webhook_secret,''));
end; $$;

create or replace function public.service_record_payment_gateway_test(p_provider text,p_success boolean,p_message text default '')
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_provider text:=lower(trim(coalesce(p_provider,''))); v_cfg jsonb; v_pc jsonb;
begin
  if v_provider not in ('razorpay','paypal') then raise exception 'Unsupported payment provider.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='payment_gateway_settings'; v_cfg:=coalesce(v_cfg,'{}'::jsonb);
  v_pc:=coalesce(v_cfg->v_provider,'{}'::jsonb)||jsonb_build_object('lastTestAt',now(),'lastTestSuccess',coalesce(p_success,false),'lastTestMessage',left(coalesce(p_message,''),500));
  v_cfg:=jsonb_set(v_cfg,array[v_provider],v_pc,true);
  update public.system_configuration set config_value=v_cfg,updated_at=now() where config_key='payment_gateway_settings';
end; $$;

revoke all on function public.payment_gateway_secret_name(text,text,text) from public,anon,authenticated;
revoke all on function public.admin_get_payment_gateway_status() from public,anon;
revoke all on function public.admin_set_payment_gateway_general(text,integer,integer) from public,anon;
revoke all on function public.admin_set_payment_gateway_provider(text,boolean,text,text,text,text,text) from public,anon;
revoke all on function public.service_get_payment_gateway_provider(text) from public,anon,authenticated;
revoke all on function public.service_record_payment_gateway_test(text,boolean,text) from public,anon,authenticated;
grant execute on function public.admin_get_payment_gateway_status() to authenticated,service_role;
grant execute on function public.admin_set_payment_gateway_general(text,integer,integer) to authenticated,service_role;
grant execute on function public.admin_set_payment_gateway_provider(text,boolean,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.service_get_payment_gateway_provider(text) to service_role;
grant execute on function public.service_record_payment_gateway_test(text,boolean,text) to service_role;

grant select,insert,update on public.payment_gateway_attempts to service_role;
grant select,insert,update on public.payment_gateway_events to service_role;