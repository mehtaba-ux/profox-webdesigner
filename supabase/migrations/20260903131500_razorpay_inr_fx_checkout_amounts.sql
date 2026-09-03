alter table public.payment_gateway_attempts
  add column if not exists provider_amount numeric,
  add column if not exists provider_currency text,
  add column if not exists fx_rate numeric,
  add column if not exists fx_source text,
  add column if not exists fx_quoted_at timestamptz;

alter table public.payment_gateway_attempts
  drop constraint if exists payment_gateway_attempts_provider_amount_positive,
  add constraint payment_gateway_attempts_provider_amount_positive
    check (provider_amount is null or provider_amount > 0),
  drop constraint if exists payment_gateway_attempts_provider_currency_format,
  add constraint payment_gateway_attempts_provider_currency_format
    check (provider_currency is null or provider_currency ~ '^[A-Z]{3}$'),
  drop constraint if exists payment_gateway_attempts_fx_rate_positive,
  add constraint payment_gateway_attempts_fx_rate_positive
    check (fx_rate is null or fx_rate > 0);

create or replace function public.service_store_payment_gateway_quote(
  p_attempt_id uuid,
  p_provider_amount numeric,
  p_provider_currency text,
  p_fx_rate numeric default null,
  p_fx_source text default null,
  p_fx_quoted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_a public.payment_gateway_attempts%rowtype;
  v_currency text := upper(trim(coalesce(p_provider_currency,'')));
begin
  if p_attempt_id is null then raise exception 'Gateway attempt is required.'; end if;
  if p_provider_amount is null or p_provider_amount <= 0 then raise exception 'Provider charge amount must be positive.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Provider charge currency is invalid.'; end if;

  select * into v_a
  from public.payment_gateway_attempts
  where id=p_attempt_id
  for update;
  if not found then raise exception 'Gateway attempt not found.'; end if;

  if v_a.status in ('Completed','Captured','Cancelled') then
    return jsonb_build_object(
      'attemptId',v_a.id,'providerAmount',v_a.provider_amount,'providerCurrency',v_a.provider_currency,
      'fxRate',v_a.fx_rate,'fxSource',v_a.fx_source,'fxQuotedAt',v_a.fx_quoted_at,'status',v_a.status
    );
  end if;

  if v_a.provider_amount is not null or v_a.provider_currency is not null then
    if round(v_a.provider_amount,2) <> round(p_provider_amount,2)
       or upper(coalesce(v_a.provider_currency,'')) <> v_currency then
      raise exception 'Provider charge quote is already locked for this checkout attempt.';
    end if;
    return jsonb_build_object(
      'attemptId',v_a.id,'providerAmount',v_a.provider_amount,'providerCurrency',v_a.provider_currency,
      'fxRate',v_a.fx_rate,'fxSource',v_a.fx_source,'fxQuotedAt',v_a.fx_quoted_at,'status',v_a.status
    );
  end if;

  if upper(v_a.currency) <> v_currency and (p_fx_rate is null or p_fx_rate <= 0) then
    raise exception 'A positive FX rate is required for converted gateway charges.';
  end if;

  update public.payment_gateway_attempts
  set provider_amount=round(p_provider_amount,2),
      provider_currency=v_currency,
      fx_rate=case when upper(currency)=v_currency then 1 else p_fx_rate end,
      fx_source=left(nullif(trim(coalesce(p_fx_source,'')),''),160),
      fx_quoted_at=coalesce(p_fx_quoted_at,now()),
      updated_at=now()
  where id=p_attempt_id
  returning * into v_a;

  return jsonb_build_object(
    'attemptId',v_a.id,'providerAmount',v_a.provider_amount,'providerCurrency',v_a.provider_currency,
    'fxRate',v_a.fx_rate,'fxSource',v_a.fx_source,'fxQuotedAt',v_a.fx_quoted_at,'status',v_a.status
  );
end;
$function$;

revoke all on function public.service_store_payment_gateway_quote(uuid,numeric,text,numeric,text,timestamptz) from public, anon, authenticated;
grant execute on function public.service_store_payment_gateway_quote(uuid,numeric,text,numeric,text,timestamptz) to service_role;

create or replace function public.service_prepare_payment_gateway_checkout(p_token text, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare v_provider text:=lower(trim(coalesce(p_provider,''))); v_hash text; v_p public.payments%rowtype; v_cfg jsonb; v_pc jsonb; v_outstanding numeric; v_attempt public.payment_gateway_attempts%rowtype; v_generation int; v_mode text; v_key text;
begin
  if v_provider not in ('razorpay','paypal') then raise exception 'Unsupported payment provider.'; end if;
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Payment link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_p from public.payments where public_payment_token_hash=v_hash for update;
  if not found then raise exception 'Payment link is invalid.'; end if;
  if v_p.public_payment_token_expires_at is not null and v_p.public_payment_token_expires_at<now() then raise exception 'Payment link has expired.'; end if;
  if v_p.status='Verified' then return jsonb_build_object('alreadyPaid',true,'paymentId',v_p.id,'paymentReference',v_p.payment_reference,'amountDue',v_p.amount_due,'amountPaid',v_p.amount_paid,'currency',v_p.currency); end if;
  if v_p.status not in ('Sent','Pending','Partially Paid') then raise exception 'This payment milestone is not currently payable.'; end if;
  v_outstanding:=round(greatest(coalesce(v_p.amount_due,0)-coalesce(v_p.amount_paid,0),0)::numeric,2); if v_outstanding<=0 then raise exception 'This payment has no outstanding balance.'; end if;
  v_cfg:=public.payment_gateway_settings_safe(); v_pc:=coalesce(v_cfg->v_provider,'{}'::jsonb);
  if not coalesce((v_pc->>'enabled')::boolean,false) or not coalesce((v_pc->>'configured')::boolean,false) or not coalesce((v_pc->>'webhookConfigured')::boolean,false) then raise exception 'Selected payment provider is not enabled and fully configured.'; end if;
  v_mode:=lower(coalesce(v_pc->>'mode',case when v_provider='razorpay' then 'test' else 'sandbox' end));

  select * into v_attempt from public.payment_gateway_attempts where payment_id=v_p.id and provider=v_provider and status in ('Creating','Created','Pending','Approved') and amount=v_outstanding and currency=v_p.currency and created_at>now()-interval '2 hours' order by created_at desc limit 1 for update;
  if found then
    return jsonb_build_object('attemptId',v_attempt.id,'paymentId',v_p.id,'paymentReference',v_p.payment_reference,'provider',v_provider,'environment',v_attempt.environment,'amount',v_attempt.amount,'currency',v_attempt.currency,'providerAmount',v_attempt.provider_amount,'providerCurrency',v_attempt.provider_currency,'fxRate',v_attempt.fx_rate,'fxSource',v_attempt.fx_source,'fxQuotedAt',v_attempt.fx_quoted_at,'providerOrderId',v_attempt.provider_order_id,'checkoutUrl',v_attempt.checkout_url,'paymentLink',v_p.payment_link,'customerName',v_p.customer_name,'customerEmail',v_p.customer_email,'publicId',case when v_provider='razorpay' then v_pc->>'keyId' else v_pc->>'clientId' end,'reused',true);
  end if;

  update public.payment_gateway_attempts set status='Failed',error_code='ATTEMPT_EXPIRED',error_message='Superseded by a new checkout attempt.',updated_at=now() where payment_id=v_p.id and provider=v_provider and status in ('Creating','Created','Pending','Approved') and created_at<=now()-interval '2 hours';
  select count(*)+1 into v_generation from public.payment_gateway_attempts where payment_id=v_p.id and provider=v_provider;
  v_key:=v_p.id::text||':'||v_provider||':'||v_p.currency||':'||trim(to_char(v_outstanding,'FM9999999999990.00'))||':'||v_generation;
  insert into public.payment_gateway_attempts(payment_id,provider,environment,status,amount,currency,idempotency_key)
  values(v_p.id,v_provider,v_mode,'Creating',v_outstanding,v_p.currency,v_key) returning * into v_attempt;
  perform set_config('profox.payment_plan_sync','1',true);
  update public.payments set status='Pending',payment_provider=v_provider,payment_method='Online Checkout',updated_at=now() where id=v_p.id and status in ('Sent','Partially Paid');
  perform set_config('profox.payment_plan_sync','',true);
  return jsonb_build_object('attemptId',v_attempt.id,'paymentId',v_p.id,'paymentReference',v_p.payment_reference,'provider',v_provider,'environment',v_mode,'amount',v_outstanding,'currency',v_p.currency,'providerAmount',null,'providerCurrency',null,'fxRate',null,'fxSource',null,'fxQuotedAt',null,'paymentLink',v_p.payment_link,'customerName',v_p.customer_name,'customerEmail',v_p.customer_email,'publicId',case when v_provider='razorpay' then v_pc->>'keyId' else v_pc->>'clientId' end,'reused',false);
exception when others then perform set_config('profox.payment_plan_sync','',true); raise;
end;
$function$;

create or replace function public.service_authorize_payment_gateway_attempt(p_token text, p_attempt_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare v_hash text; v_a public.payment_gateway_attempts%rowtype; v_p public.payments%rowtype;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 or p_attempt_id is null then raise exception 'Invalid payment checkout request.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select a.* into v_a from public.payment_gateway_attempts a join public.payments p on p.id=a.payment_id where a.id=p_attempt_id and p.public_payment_token_hash=v_hash and (p.public_payment_token_expires_at is null or p.public_payment_token_expires_at>=now());
  if not found then raise exception 'Payment checkout attempt does not belong to this payment link.'; end if;
  select * into v_p from public.payments where id=v_a.payment_id;
  return jsonb_build_object('attemptId',v_a.id,'paymentId',v_a.payment_id,'provider',v_a.provider,'environment',v_a.environment,'status',v_a.status,'amount',v_a.amount,'currency',v_a.currency,'providerAmount',v_a.provider_amount,'providerCurrency',v_a.provider_currency,'fxRate',v_a.fx_rate,'fxSource',v_a.fx_source,'fxQuotedAt',v_a.fx_quoted_at,'providerOrderId',v_a.provider_order_id,'providerPaymentId',v_a.provider_payment_id,'providerCaptureId',v_a.provider_capture_id,'checkoutUrl',v_a.checkout_url,'paymentLink',v_p.payment_link,'paymentReference',v_p.payment_reference,'paymentStatus',v_p.status,'amountPaid',v_p.amount_paid,'amountDue',v_p.amount_due);
end;
$function$;

create or replace function public.service_get_payment_gateway_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_a public.payment_gateway_attempts%rowtype; v_p public.payments%rowtype;
begin
  select * into v_a from public.payment_gateway_attempts where id=p_attempt_id; if not found then raise exception 'Gateway attempt not found.'; end if;
  select * into v_p from public.payments where id=v_a.payment_id;
  return jsonb_build_object('attemptId',v_a.id,'paymentId',v_a.payment_id,'provider',v_a.provider,'environment',v_a.environment,'status',v_a.status,'amount',v_a.amount,'currency',v_a.currency,'providerAmount',v_a.provider_amount,'providerCurrency',v_a.provider_currency,'fxRate',v_a.fx_rate,'fxSource',v_a.fx_source,'fxQuotedAt',v_a.fx_quoted_at,'providerOrderId',v_a.provider_order_id,'providerPaymentId',v_a.provider_payment_id,'providerCaptureId',v_a.provider_capture_id,'checkoutUrl',v_a.checkout_url,'paymentLink',v_p.payment_link,'paymentReference',v_p.payment_reference,'paymentStatus',v_p.status,'amountPaid',v_p.amount_paid,'amountDue',v_p.amount_due);
end;
$function$;

revoke all on function public.service_prepare_payment_gateway_checkout(text,text) from public, anon, authenticated;
grant execute on function public.service_prepare_payment_gateway_checkout(text,text) to service_role;
revoke all on function public.service_authorize_payment_gateway_attempt(text,uuid) from public, anon, authenticated;
grant execute on function public.service_authorize_payment_gateway_attempt(text,uuid) to service_role;
revoke all on function public.service_get_payment_gateway_attempt(uuid) from public, anon, authenticated;
grant execute on function public.service_get_payment_gateway_attempt(uuid) to service_role;
