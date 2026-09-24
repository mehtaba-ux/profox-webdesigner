-- Close the legacy public quotation decision path after the consent-enforced V2 flow is live.
-- V2 remains SECURITY DEFINER and may call the legacy helper internally, while direct
-- client execution of the legacy accept/reject RPC is removed.

revoke execute on function public.respond_public_quotation(text, text, text) from public;
revoke execute on function public.respond_public_quotation(text, text, text) from anon;
revoke execute on function public.respond_public_quotation(text, text, text) from authenticated;

-- Keep the consent-enforced public surface explicitly available.
grant execute on function public.open_public_quotation_v2(text) to anon, authenticated;
grant execute on function public.respond_public_quotation_v2(text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.get_public_quotation_payment(text) to anon, authenticated;
