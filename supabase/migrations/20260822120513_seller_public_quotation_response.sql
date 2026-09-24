-- Public quotation response uses the existing canonical quotation record.
-- The opaque customer token is validated by hash; no customer identity or private fields are exposed.

CREATE OR REPLACE FUNCTION public.respond_public_quotation(
  p_token text,
  p_response text,
  p_note text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp'
AS $function$
DECLARE
  v_hash text;
  v_quote public.quotations%ROWTYPE;
  v_response text := lower(btrim(COALESCE(p_response,'')));
  v_note text := left(btrim(COALESCE(p_note,'')),2000);
BEGIN
  IF p_token IS NULL OR length(p_token)<40 OR length(p_token)>256 THEN
    RAISE EXCEPTION 'Quotation link is invalid.';
  END IF;
  IF v_response NOT IN ('accept','reject') THEN
    RAISE EXCEPTION 'Choose Accept or Decline.';
  END IF;

  v_hash := encode(extensions.digest(p_token,'sha256'),'hex');
  SELECT * INTO v_quote
  FROM public.quotations
  WHERE customer_view_token_hash=v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation link is invalid or no longer available.'; END IF;
  IF v_quote.status='Accepted' AND v_response='accept' THEN
    RETURN jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Accepted','acceptedAt',v_quote.accepted_at);
  END IF;
  IF v_quote.status='Rejected' AND v_response='reject' THEN
    RETURN jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Rejected','rejectedAt',v_quote.rejected_at);
  END IF;
  IF v_quote.status<>'Sent' THEN RAISE EXCEPTION 'This quotation can no longer be changed from this link.'; END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'This quotation has expired. Please contact ProFox for an updated quotation.';
  END IF;

  PERFORM set_config('profox.quotation_atomic_rpc','1',true);
  IF v_response='accept' THEN
    UPDATE public.quotations
    SET status='Accepted',
        accepted_at=COALESCE(accepted_at,now()),
        rejected_at=NULL,
        customer_notes=CASE WHEN v_note='' THEN customer_notes ELSE concat_ws(E'\n',NULLIF(customer_notes,''),'Customer response: '||v_note) END,
        updated_at=now()
    WHERE id=v_quote.id
    RETURNING * INTO v_quote;
  ELSE
    UPDATE public.quotations
    SET status='Rejected',
        rejected_at=COALESCE(rejected_at,now()),
        customer_notes=CASE WHEN v_note='' THEN customer_notes ELSE concat_ws(E'\n',NULLIF(customer_notes,''),'Customer response: '||v_note) END,
        updated_at=now()
    WHERE id=v_quote.id
    RETURNING * INTO v_quote;
  END IF;
  PERFORM set_config('profox.quotation_atomic_rpc','',true);

  RETURN jsonb_build_object(
    'quotationNumber',v_quote.quotation_number,
    'status',v_quote.status,
    'acceptedAt',v_quote.accepted_at,
    'rejectedAt',v_quote.rejected_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.respond_public_quotation(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_public_quotation(text,text,text) TO anon, authenticated;