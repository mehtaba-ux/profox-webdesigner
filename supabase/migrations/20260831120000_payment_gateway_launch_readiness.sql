-- Never expose a provider to public checkout merely because credentials exist.
-- A production provider must be enabled, use live credentials, have webhook
-- verification configured, and have passed a recent server-side connection test.

create or replace function public.payment_gateway_provider_ready(
  p_provider text,
  p_config jsonb
)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select
    lower(btrim(coalesce(p_provider,''))) in ('razorpay','paypal')
    and coalesce((p_config->>'enabled')::boolean,false)
    and coalesce((p_config->>'configured')::boolean,false)
    and coalesce((p_config->>'webhookConfigured')::boolean,false)
    and coalesce((p_config->>'lastTestSuccess')::boolean,false)
    and nullif(p_config->>'lastTestAt','') is not null
    and (p_config->>'lastTestAt')::timestamptz >= now()-interval '30 days'
    and lower(coalesce(p_config->>'mode',''))='live'
    and (
      lower(btrim(coalesce(p_provider,'')))<>'razorpay'
      or coalesce(p_config->>'keyId','') ~ '^rzp_live_[A-Za-z0-9]+$'
    );
$$;

revoke all on function public.payment_gateway_provider_ready(text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_gateway_provider_ready(text,jsonb) to service_role;

create or replace function public.payment_gateway_settings_safe()
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_cfg jsonb;
  v_provider text;
  v_pc jsonb;
begin
  select coalesce(
    (select config_value from public.system_configuration where config_key='payment_gateway_settings'),
    '{}'::jsonb
  ) into v_cfg;

  foreach v_provider in array array['razorpay','paypal'] loop
    v_pc:=coalesce(v_cfg->v_provider,'{}'::jsonb);
    v_pc:=v_pc||jsonb_build_object(
      'enabled',public.payment_gateway_provider_ready(v_provider,v_pc),
      'productionReady',public.payment_gateway_provider_ready(v_provider,v_pc)
    );
    v_cfg:=jsonb_set(v_cfg,array[v_provider],v_pc,true);
  end loop;
  return v_cfg;
end;
$$;

revoke all on function public.payment_gateway_settings_safe() from public,anon,authenticated;
grant execute on function public.payment_gateway_settings_safe() to service_role;

create or replace function public.admin_get_payment_gateway_status()
returns jsonb
language plpgsql
security definer
set search_path='public','vault','pg_temp'
as $$
declare
  v_cfg jsonb;
  v_r jsonb;
  v_p jsonb;
  v_r_mode text;
  v_p_mode text;
  v_r_secret boolean;
  v_r_webhook boolean;
  v_p_secret boolean;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration where config_key='payment_gateway_settings';
  v_cfg:=coalesce(v_cfg,'{}'::jsonb);
  v_r:=coalesce(v_cfg->'razorpay','{}'::jsonb);
  v_p:=coalesce(v_cfg->'paypal','{}'::jsonb);
  v_r_mode:=case when lower(coalesce(v_r->>'mode','test'))='live' then 'live' else 'test' end;
  v_p_mode:=case when lower(coalesce(v_p->>'mode','sandbox'))='live' then 'live' else 'sandbox' end;
  select exists(select 1 from vault.secrets where name=public.payment_gateway_secret_name('razorpay',v_r_mode,'api_secret')) into v_r_secret;
  select exists(select 1 from vault.secrets where name=public.payment_gateway_secret_name('razorpay',v_r_mode,'webhook_secret')) into v_r_webhook;
  select exists(select 1 from vault.secrets where name=public.payment_gateway_secret_name('paypal',v_p_mode,'client_secret')) into v_p_secret;
  v_r:=v_r||jsonb_build_object(
    'configured',v_r_secret and coalesce(nullif(trim(v_r->>'keyId'),''),'')<>'',
    'webhookConfigured',v_r_webhook
  );
  v_p:=v_p||jsonb_build_object(
    'configured',v_p_secret and coalesce(nullif(trim(v_p->>'clientId'),''),'')<>'',
    'webhookConfigured',coalesce(nullif(trim(v_p->>'webhookId'),''),'')<>''
  );
  v_r:=v_r||jsonb_build_object('productionReady',public.payment_gateway_provider_ready('razorpay',v_r));
  v_p:=v_p||jsonb_build_object('productionReady',public.payment_gateway_provider_ready('paypal',v_p));
  return (v_cfg-'razorpay'-'paypal')||jsonb_build_object(
    'razorpay',v_r,
    'paypal',v_p,
    'canConfigure',true
  );
end;
$$;

-- Preserve credentials in Vault, but require a fresh connection test after any
-- provider save. This also prevents a rotated/incorrect secret from remaining
-- silently available to customers under an older successful test result.
create or replace function public.admin_set_payment_gateway_provider(
  p_provider text,
  p_enabled boolean,
  p_mode text,
  p_public_id text,
  p_secret text default '',
  p_webhook_secret text default '',
  p_webhook_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path='public','vault','pg_temp'
as $$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_mode text:=lower(trim(coalesce(p_mode,'')));
  v_public text:=trim(coalesce(p_public_id,''));
  v_cfg jsonb;
  v_pc jsonb;
  v_secret_name text;
  v_webhook_name text;
  v_secret_id uuid;
  v_has_secret boolean:=false;
  v_has_webhook boolean:=false;
  v_webhook_id text:=trim(coalesce(p_webhook_id,''));
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if v_provider not in ('razorpay','paypal') then raise exception 'Unsupported payment provider.'; end if;
  if (v_provider='razorpay' and v_mode not in ('test','live'))
     or (v_provider='paypal' and v_mode not in ('sandbox','live')) then
    raise exception 'Unsupported provider mode.';
  end if;
  if v_provider='razorpay' and v_public<>'' and v_public !~ '^rzp_(test|live)_[A-Za-z0-9]+$' then
    raise exception 'Enter a valid Razorpay Key ID.';
  end if;
  if v_provider='razorpay' and v_mode='live' and v_public<>'' and v_public !~ '^rzp_live_[A-Za-z0-9]+$' then
    raise exception 'Razorpay Live mode requires an rzp_live_ Key ID.';
  end if;
  if v_provider='razorpay' and v_mode='test' and v_public<>'' and v_public !~ '^rzp_test_[A-Za-z0-9]+$' then
    raise exception 'Razorpay Test mode requires an rzp_test_ Key ID.';
  end if;
  if v_provider='paypal' and length(v_public)>300 then raise exception 'PayPal Client ID is too long.'; end if;

  v_secret_name:=public.payment_gateway_secret_name(
    v_provider,v_mode,case when v_provider='razorpay' then 'api_secret' else 'client_secret' end
  );
  select id into v_secret_id from vault.secrets where name=v_secret_name limit 1;
  if trim(coalesce(p_secret,''))<>'' then
    if v_secret_id is null then
      perform vault.create_secret(trim(p_secret),v_secret_name,'ProFox '||v_provider||' '||v_mode||' server API secret',null);
    else
      perform vault.update_secret(v_secret_id,trim(p_secret),v_secret_name,'ProFox '||v_provider||' '||v_mode||' server API secret',null);
    end if;
  end if;
  select exists(select 1 from vault.secrets where name=v_secret_name) into v_has_secret;

  if v_provider='razorpay' then
    v_webhook_name:=public.payment_gateway_secret_name(v_provider,v_mode,'webhook_secret');
    select id into v_secret_id from vault.secrets where name=v_webhook_name limit 1;
    if trim(coalesce(p_webhook_secret,''))<>'' then
      if v_secret_id is null then
        perform vault.create_secret(trim(p_webhook_secret),v_webhook_name,'ProFox Razorpay webhook verification secret',null);
      else
        perform vault.update_secret(v_secret_id,trim(p_webhook_secret),v_webhook_name,'ProFox Razorpay webhook verification secret',null);
      end if;
    end if;
    select exists(select 1 from vault.secrets where name=v_webhook_name) into v_has_webhook;
  else
    v_has_webhook:=v_webhook_id<>'';
  end if;

  if coalesce(p_enabled,false) and (v_public='' or not v_has_secret or not v_has_webhook) then
    raise exception 'Provider cannot be enabled until its public ID, API secret and webhook verification configuration are complete.';
  end if;

  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration where config_key='payment_gateway_settings';
  v_cfg:=coalesce(v_cfg,'{}'::jsonb);
  v_pc:=coalesce(v_cfg->v_provider,'{}'::jsonb)||jsonb_build_object(
    'enabled',coalesce(p_enabled,false),
    'mode',v_mode,
    'configured',v_has_secret and v_public<>'',
    'webhookConfigured',v_has_webhook,
    'lastTestSuccess',false,
    'lastTestAt',null,
    'lastTestMessage','A new connection test is required after saving provider settings.'
  );
  if v_provider='razorpay' then
    v_pc:=v_pc||jsonb_build_object('keyId',v_public);
  else
    v_pc:=v_pc||jsonb_build_object('clientId',v_public,'webhookId',v_webhook_id);
  end if;
  v_cfg:=jsonb_set(v_cfg,array[v_provider],v_pc,true);
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('payment_gateway_settings',v_cfg,'ProFox payment collection provider settings. Secrets are stored only in Supabase Vault.',auth.uid(),now())
  on conflict(config_key) do update set
    config_value=excluded.config_value,
    description=excluded.description,
    updated_by=auth.uid(),
    updated_at=now();
  return public.admin_get_payment_gateway_status();
end;
$$;

revoke all on function public.admin_get_payment_gateway_status() from public,anon;
revoke all on function public.admin_set_payment_gateway_provider(text,boolean,text,text,text,text,text) from public,anon;
grant execute on function public.admin_get_payment_gateway_status() to authenticated,service_role;
grant execute on function public.admin_set_payment_gateway_provider(text,boolean,text,text,text,text,text) to authenticated,service_role;

-- Fail closed immediately for any provider that is presently marked enabled but
-- cannot satisfy the production-readiness rule. Credentials remain in Vault.
update public.system_configuration
set config_value=jsonb_set(
      config_value,
      '{razorpay,enabled}',
      'false'::jsonb,
      true
    )||jsonb_build_object('launchSafetyUpdatedAt',now()),
    updated_at=now()
where config_key='payment_gateway_settings'
  and coalesce((config_value->'razorpay'->>'enabled')::boolean,false)
  and not public.payment_gateway_provider_ready('razorpay',config_value->'razorpay');

