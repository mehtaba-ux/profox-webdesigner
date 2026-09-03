-- Allow a verified Razorpay Test-mode configuration to be used for end-to-end
-- customer checkout testing without ever representing it as production-ready.
-- Also expose the customer's own payable links inside the authenticated portal.

create or replace function public.payment_gateway_provider_checkout_enabled(
  p_provider text,
  p_config jsonb
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    case lower(btrim(coalesce(p_provider,'')))
      when 'razorpay' then
        coalesce((p_config->>'enabled')::boolean,false)
        and coalesce((p_config->>'configured')::boolean,false)
        and coalesce((p_config->>'webhookConfigured')::boolean,false)
        and coalesce((p_config->>'lastTestSuccess')::boolean,false)
        and nullif(p_config->>'lastTestAt','') is not null
        and (p_config->>'lastTestAt')::timestamptz >= now()-interval '30 days'
        and (
          (
            lower(coalesce(p_config->>'mode',''))='test'
            and coalesce(p_config->>'keyId','') ~ '^rzp_test_[A-Za-z0-9]+$'
          )
          or
          (
            lower(coalesce(p_config->>'mode',''))='live'
            and coalesce(p_config->>'keyId','') ~ '^rzp_live_[A-Za-z0-9]+$'
          )
        )
      when 'paypal' then public.payment_gateway_provider_ready('paypal',p_config)
      else false
    end;
$$;

revoke all on function public.payment_gateway_provider_checkout_enabled(text,jsonb) from public, anon, authenticated;

create or replace function public.payment_gateway_settings_safe()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cfg jsonb;
  v_provider text;
  v_pc jsonb;
  v_checkout_enabled boolean;
  v_production_ready boolean;
begin
  select coalesce(
    (select config_value from public.system_configuration where config_key='payment_gateway_settings'),
    '{}'::jsonb
  ) into v_cfg;

  foreach v_provider in array array['razorpay','paypal'] loop
    v_pc:=coalesce(v_cfg->v_provider,'{}'::jsonb);
    v_checkout_enabled:=public.payment_gateway_provider_checkout_enabled(v_provider,v_pc);
    v_production_ready:=public.payment_gateway_provider_ready(v_provider,v_pc);
    v_pc:=v_pc||jsonb_build_object(
      'enabled',v_checkout_enabled,
      'productionReady',v_production_ready,
      'testMode',v_checkout_enabled and not v_production_ready
    );
    v_cfg:=jsonb_set(v_cfg,array[v_provider],v_pc,true);
  end loop;
  return v_cfg;
end;
$$;

create or replace function public.admin_get_payment_gateway_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'vault', 'pg_temp'
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
  v_r_checkout_ready boolean;
  v_p_checkout_ready boolean;
  v_r_production_ready boolean;
  v_p_production_ready boolean;
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
  v_r_checkout_ready:=public.payment_gateway_provider_checkout_enabled('razorpay',v_r);
  v_p_checkout_ready:=public.payment_gateway_provider_checkout_enabled('paypal',v_p);
  v_r_production_ready:=public.payment_gateway_provider_ready('razorpay',v_r);
  v_p_production_ready:=public.payment_gateway_provider_ready('paypal',v_p);
  v_r:=v_r||jsonb_build_object(
    'checkoutReady',v_r_checkout_ready,
    'productionReady',v_r_production_ready,
    'testMode',v_r_checkout_ready and not v_r_production_ready
  );
  v_p:=v_p||jsonb_build_object(
    'checkoutReady',v_p_checkout_ready,
    'productionReady',v_p_production_ready,
    'testMode',v_p_checkout_ready and not v_p_production_ready
  );
  return (v_cfg-'razorpay'-'paypal')||jsonb_build_object(
    'razorpay',v_r,
    'paypal',v_p,
    'canConfigure',true
  );
end;
$$;

create or replace function public.open_public_payment(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_hash text;
  v_p public.payments%rowtype;
  v_q public.quotations%rowtype;
  v_cfg jsonb;
  v_r jsonb;
  v_pp jsonb;
  v_outstanding numeric;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Payment link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_p from public.payments where public_payment_token_hash=v_hash and public_payment_token_issued_at is not null;
  if not found then raise exception 'Payment link is invalid or no longer available.'; end if;
  if v_p.public_payment_token_expires_at is not null and v_p.public_payment_token_expires_at<now() and v_p.status<>'Verified' then raise exception 'Payment link has expired. Please contact ProFox for a refreshed payment link.'; end if;
  if v_p.quotation_id is not null then select * into v_q from public.quotations where id=v_p.quotation_id; end if;
  v_cfg:=public.payment_gateway_settings_safe();
  v_r:=coalesce(v_cfg->'razorpay','{}'::jsonb);
  v_pp:=coalesce(v_cfg->'paypal','{}'::jsonb);
  v_outstanding:=greatest(round(coalesce(v_p.amount_due,0)-coalesce(v_p.amount_paid,0),2),0);
  return jsonb_build_object(
    'paymentId',v_p.id,'paymentReference',v_p.payment_reference,'quotationNumber',v_q.quotation_number,'customerName',v_p.customer_name,'customerEmail',v_p.customer_email,
    'paymentType',v_p.payment_type,'milestoneNumber',v_p.milestone_number,'milestoneLabel',v_p.milestone_label,'amountDue',v_p.amount_due,'amountPaid',v_p.amount_paid,'outstanding',v_outstanding,
    'currency',v_p.currency,'status',v_p.status,'dueDate',v_p.due_date,'paidAt',v_p.paid_at,'verifiedAt',v_p.verified_at,
    'payable',(v_outstanding>0 and v_p.status in ('Sent','Pending','Partially Paid','Verification Pending')),
    'providers',jsonb_build_array(
      jsonb_build_object(
        'id','razorpay','label','Razorpay',
        'enabled',coalesce((v_r->>'enabled')::boolean,false),
        'mode',coalesce(v_r->>'mode','test'),
        'productionReady',coalesce((v_r->>'productionReady')::boolean,false),
        'testMode',coalesce((v_r->>'testMode')::boolean,false)
      ),
      jsonb_build_object(
        'id','paypal','label','PayPal',
        'enabled',coalesce((v_pp->>'enabled')::boolean,false),
        'mode',coalesce(v_pp->>'mode','sandbox'),
        'productionReady',coalesce((v_pp->>'productionReady')::boolean,false),
        'testMode',coalesce((v_pp->>'testMode')::boolean,false)
      )
    )
  );
end;
$$;

create or replace function public.client_get_payment_actions()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_identity_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(
    select 1 from public.user_profiles p
    where p.id=v_uid and p.role='customer' and p.status='active'
  ) then
    raise exception 'Active customer portal access required.';
  end if;

  select ci.id into v_identity_id
  from public.customer_identities ci
  where ci.linked_user_id=v_uid;

  if v_identity_id is null then
    raise exception 'No customer relationship is linked to this portal account.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,
      'paymentReference',p.payment_reference,
      'quotationId',p.quotation_id,
      'paymentType',p.payment_type,
      'milestoneLabel',p.milestone_label,
      'amountDue',p.amount_due,
      'amountPaid',p.amount_paid,
      'outstanding',greatest(round(coalesce(p.amount_due,0)-coalesce(p.amount_paid,0),2),0),
      'currency',p.currency,
      'status',p.status,
      'dueDate',p.due_date,
      'paymentLink',case
        when p.status in ('Sent','Pending','Partially Paid','Verification Pending')
          and coalesce(p.amount_paid,0)<coalesce(p.amount_due,0)
        then p.payment_link
        else null
      end,
      'payable',
        p.status in ('Sent','Pending','Partially Paid','Verification Pending')
        and coalesce(p.amount_paid,0)<coalesce(p.amount_due,0)
        and coalesce(p.payment_link,'')<>''
    ) order by p.created_at desc)
    from public.payments p
    where p.customer_identity_id=v_identity_id
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.client_get_payment_actions() from public, anon;
grant execute on function public.client_get_payment_actions() to authenticated;
