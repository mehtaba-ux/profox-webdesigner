create or replace function public.service_authorize_payment_gateway_attempt(p_token text,p_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','extensions','pg_temp' as $$
declare v_hash text; v_a public.payment_gateway_attempts%rowtype; v_p public.payments%rowtype;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 or p_attempt_id is null then raise exception 'Invalid payment checkout request.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select a.* into v_a from public.payment_gateway_attempts a join public.payments p on p.id=a.payment_id where a.id=p_attempt_id and p.public_payment_token_hash=v_hash and (p.public_payment_token_expires_at is null or p.public_payment_token_expires_at>=now());
  if not found then raise exception 'Payment checkout attempt does not belong to this payment link.'; end if;
  select * into v_p from public.payments where id=v_a.payment_id;
  return jsonb_build_object('attemptId',v_a.id,'paymentId',v_a.payment_id,'provider',v_a.provider,'environment',v_a.environment,'status',v_a.status,'amount',v_a.amount,'currency',v_a.currency,'providerOrderId',v_a.provider_order_id,'providerPaymentId',v_a.provider_payment_id,'providerCaptureId',v_a.provider_capture_id,'checkoutUrl',v_a.checkout_url,'paymentLink',v_p.payment_link,'paymentReference',v_p.payment_reference,'paymentStatus',v_p.status,'amountPaid',v_p.amount_paid,'amountDue',v_p.amount_due);
end; $$;
revoke all on function public.service_authorize_payment_gateway_attempt(text,uuid) from public,anon,authenticated;
grant execute on function public.service_authorize_payment_gateway_attempt(text,uuid) to service_role;