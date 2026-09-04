-- Bridge an already-authorized public payment link into the existing quotation
-- conversation. This deliberately reuses quotation conversation resolution and
-- customer-link issuance so repeated clicks do not create duplicate chats.

create or replace function public.open_public_payment_support_chat(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_hash text;
  v_payment public.payments%rowtype;
  v_conversation_id uuid;
  v_url text;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 256 then
    raise exception 'Payment link is invalid.';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_payment
  from public.payments
  where public_payment_token_hash = v_hash
    and public_payment_token_issued_at is not null;

  if not found then
    raise exception 'Payment link is invalid or no longer available.';
  end if;

  if v_payment.public_payment_token_expires_at is not null
     and v_payment.public_payment_token_expires_at < now()
     and v_payment.status <> 'Verified' then
    raise exception 'Payment link has expired. Please contact ProFox for a refreshed payment link.';
  end if;

  if v_payment.quotation_id is null then
    raise exception 'Secure Sales chat is not available for this payment.';
  end if;

  v_conversation_id := public.quotation_conversation_resolve(v_payment.quotation_id);
  v_url := public.service_sales_chat_customer_link_url(v_conversation_id, null);

  if btrim(coalesce(v_url, '')) = '' then
    raise exception 'Secure Sales chat could not be opened.';
  end if;

  return jsonb_build_object('conversationUrl', v_url);
end;
$$;

revoke all on function public.open_public_payment_support_chat(text) from public;
grant execute on function public.open_public_payment_support_chat(text) to anon, authenticated;
