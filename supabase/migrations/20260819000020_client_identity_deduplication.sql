-- Prevent duplicate client records when multiple verified sales resolve to the same business.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_normalized_identity
ON public.clients ((lower(trim(email))), (lower(trim(company_name))))
WHERE trim(COALESCE(email,''))<>'' AND trim(COALESCE(company_name,''))<>'';

CREATE OR REPLACE FUNCTION public.verify_payment_atomic(p_payment_id uuid, p_admin_id uuid DEFAULT NULL, p_notes text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_opp public.crm_opportunities%ROWTYPE;
  v_quote public.quotations%ROWTYPE;
  v_client_id uuid;
  v_identity text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may verify payments.'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found.'; END IF;
  IF v_payment.status='Verified' THEN PERFORM public.generate_commission_for_verified_payment(p_payment_id); RETURN v_payment.client_id; END IF;
  IF v_payment.status IN ('Cancelled','Failed','Refunded') THEN RAISE EXCEPTION 'A cancelled, failed, or refunded payment cannot be verified.'; END IF;
  IF COALESCE(v_payment.amount_due,0)<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero.'; END IF;

  IF v_payment.quotation_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.quotations WHERE id=v_payment.quotation_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quotation linked to payment was not found.'; END IF;
  END IF;
  IF v_payment.payment_type IN ('Advance','Full Payment') THEN
    IF v_payment.quotation_id IS NULL OR v_quote.status<>'Accepted' THEN RAISE EXCEPTION 'Advance/full payment may only be verified against an accepted quotation.'; END IF;
    IF v_payment.opportunity_id IS NULL OR v_quote.opportunity_id IS DISTINCT FROM v_payment.opportunity_id THEN RAISE EXCEPTION 'Payment opportunity must match the accepted quotation.'; END IF;
  END IF;

  UPDATE public.payments SET status='Verified',amount_paid=CASE WHEN amount_paid>0 THEN amount_paid ELSE amount_due END,
    verified_at=now(),verified_by=auth.uid(),notes=COALESCE(NULLIF(trim(p_notes),''),notes),updated_at=now()
  WHERE id=p_payment_id RETURNING * INTO v_payment;

  IF v_payment.payment_type IN ('Advance','Full Payment') AND v_payment.opportunity_id IS NOT NULL THEN
    SELECT * INTO v_opp FROM public.crm_opportunities WHERE id=v_payment.opportunity_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity linked to payment was not found.'; END IF;
    UPDATE public.crm_opportunities SET status='Won',stage='Won',won_at=COALESCE(won_at,now()),updated_at=now() WHERE id=v_opp.id;
    v_client_id:=v_opp.client_id;

    IF v_client_id IS NULL THEN
      IF trim(COALESCE(v_opp.email,''))<>'' AND trim(COALESCE(v_opp.company_name,''))<>'' THEN
        v_identity:=lower(trim(v_opp.email))||'|'||lower(trim(v_opp.company_name));
        PERFORM pg_advisory_xact_lock(hashtextextended(v_identity,0));
      END IF;
      SELECT id INTO v_client_id FROM public.clients
      WHERE lower(trim(COALESCE(email,'')))=lower(trim(COALESCE(v_opp.email,'')))
        AND lower(trim(COALESCE(company_name,'')))=lower(trim(COALESCE(v_opp.company_name,'')))
      ORDER BY created_at LIMIT 1;
      IF v_client_id IS NULL THEN
        INSERT INTO public.clients(company_name,primary_contact_name,email,phone,website,country,industry,salesperson_id,source_opportunity_id,first_quotation_id,total_sales_value,currency,status)
        VALUES(COALESCE(NULLIF(trim(v_opp.company_name),''),v_opp.name),COALESCE(NULLIF(trim(v_opp.contact_name),''),NULLIF(trim(v_opp.company_name),''),v_opp.name),COALESCE(v_opp.email,''),v_opp.phone,v_opp.website,v_opp.country,v_opp.industry,v_opp.salesperson_id,v_opp.id,v_payment.quotation_id,COALESCE(v_quote.total,v_opp.expected_value,0),COALESCE(v_quote.currency,v_opp.currency,'USD'),'Active')
        RETURNING id INTO v_client_id;
      END IF;
      UPDATE public.crm_opportunities SET client_id=v_client_id,updated_at=now() WHERE id=v_opp.id;
      UPDATE public.quotations SET client_id=v_client_id,updated_at=now() WHERE opportunity_id=v_opp.id;
    END IF;
    UPDATE public.payments SET client_id=v_client_id,updated_at=now() WHERE id=p_payment_id RETURNING * INTO v_payment;
  END IF;

  PERFORM public.generate_commission_for_verified_payment(p_payment_id);
  RETURN v_client_id;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_payment_atomic(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verify_payment_atomic(uuid,uuid,text) TO authenticated;
