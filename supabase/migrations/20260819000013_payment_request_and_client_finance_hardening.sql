-- Payment request integrity and explicit client-account finance isolation.

DROP POLICY IF EXISTS quotations_select ON public.quotations;
CREATE POLICY quotations_select ON public.quotations
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR salesperson_id=auth.uid()
  OR public.has_active_role(ARRAY['project_manager'])
  OR EXISTS (
    SELECT 1 FROM public.projects p JOIN public.project_team pt ON pt.project_id=p.id
    WHERE p.quotation_id=quotations.id AND pt.user_id=auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id=quotations.client_id AND c.linked_user_id=auth.uid())
);

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR salesperson_id=auth.uid()
  OR public.has_active_role(ARRAY['project_manager'])
  OR EXISTS (
    SELECT 1 FROM public.projects p JOIN public.project_team pt ON pt.project_id=p.id
    WHERE (p.quotation_id=payments.quotation_id OR p.source_opportunity_id=payments.opportunity_id)
      AND pt.user_id=auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id=payments.client_id AND c.linked_user_id=auth.uid())
);

CREATE OR REPLACE FUNCTION public.validate_payment_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_quote public.quotations%ROWTYPE; v_product_code text; v_pct numeric;
BEGIN
  IF COALESCE(NEW.amount_due,0)<0 THEN RAISE EXCEPTION 'Payment amount cannot be negative.'; END IF;
  IF TG_OP='INSERT' THEN
    IF public.is_admin() THEN
      IF COALESCE(NEW.amount_due,0)<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero.'; END IF;
      RETURN NEW;
    END IF;
    IF NOT public.has_active_role(ARRAY['sales']) OR NEW.salesperson_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the assigned active salesperson or an Admin may create a payment request.';
    END IF;
    IF NEW.quotation_id IS NULL THEN RAISE EXCEPTION 'Payment request must be linked to an accepted quotation.'; END IF;
    SELECT * INTO v_quote FROM public.quotations WHERE id=NEW.quotation_id;
    IF NOT FOUND OR v_quote.status<>'Accepted' THEN RAISE EXCEPTION 'Payment request requires an accepted quotation.'; END IF;
    IF v_quote.salesperson_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You may create payment requests only for your own accepted quotations.'; END IF;
    SELECT qi.product_code_snapshot INTO v_product_code FROM public.quotation_items qi
    WHERE qi.quotation_id=v_quote.id AND qi.item_type='package' ORDER BY qi.sort_order,qi.created_at LIMIT 1;
    IF v_product_code IS NULL THEN RAISE EXCEPTION 'Quotation package was not found.'; END IF;

    IF NEW.payment_type='Full Payment' THEN v_pct:=100;
    ELSIF v_product_code='PF-WEB-LAUNCH' THEN v_pct:=CASE NEW.payment_type WHEN 'Advance' THEN 50 WHEN 'Final Payment' THEN 50 ELSE NULL END;
    ELSIF v_product_code='PF-WEB-GROWTH' THEN v_pct:=CASE NEW.payment_type WHEN 'Advance' THEN 50 WHEN 'Design Milestone' THEN 30 WHEN 'Final Payment' THEN 20 ELSE NULL END;
    ELSIF v_product_code='PF-WEB-SCALE' THEN v_pct:=CASE NEW.payment_type WHEN 'Advance' THEN 40 WHEN 'Design Milestone' THEN 30 WHEN 'Staging Milestone' THEN 20 WHEN 'Final Payment' THEN 10 ELSE NULL END;
    ELSIF v_product_code='PF-DISCOVERY' THEN v_pct:=CASE NEW.payment_type WHEN 'Advance' THEN 100 WHEN 'Full Payment' THEN 100 ELSE NULL END;
    ELSIF v_product_code='PF-CUSTOM' THEN RAISE EXCEPTION 'Custom project payment milestones require Admin-approved milestone amounts.';
    ELSE RAISE EXCEPTION 'No approved payment schedule exists for package %.',v_product_code;
    END IF;
    IF v_pct IS NULL THEN RAISE EXCEPTION 'Payment type % is not valid for package %.',NEW.payment_type,v_product_code; END IF;

    NEW.opportunity_id:=v_quote.opportunity_id;
    NEW.salesperson_id:=v_quote.salesperson_id;
    NEW.client_id:=v_quote.client_id;
    NEW.customer_name:=v_quote.customer_name;
    NEW.customer_email:=COALESCE(v_quote.email,'');
    NEW.currency:=v_quote.currency;
    NEW.amount_due:=round((v_quote.total*v_pct/100.0)::numeric,2);
    NEW.amount_paid:=0;
    NEW.verified_at:=NULL;
    NEW.verified_by:=NULL;
    IF NEW.status NOT IN ('Draft','Ready','Sent','Pending','Verification Pending') THEN NEW.status:='Draft'; END IF;
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NOT public.has_active_role(ARRAY['sales']) OR OLD.salesperson_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized payment update.'; END IF;
  IF OLD.status IN ('Verified','Refunded','Partially Refunded','Failed') THEN RAISE EXCEPTION 'Settled or terminal payment records may only be changed by an Admin.'; END IF;
  IF NEW.quotation_id IS DISTINCT FROM OLD.quotation_id OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
    OR NEW.payment_type IS DISTINCT FROM OLD.payment_type OR NEW.milestone_number IS DISTINCT FROM OLD.milestone_number
    OR NEW.milestone_label IS DISTINCT FROM OLD.milestone_label OR NEW.amount_due IS DISTINCT FROM OLD.amount_due
    OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.verified_at IS DISTINCT FROM OLD.verified_at OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    RAISE EXCEPTION 'Core payment amount, ownership and verification fields are locked for Sales.';
  END IF;
  IF NEW.status NOT IN ('Draft','Ready','Sent','Pending','Verification Pending','Cancelled') THEN RAISE EXCEPTION 'Sales cannot set settlement status %.',NEW.status; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_request ON public.payments;
CREATE TRIGGER trg_validate_payment_request BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_request();
REVOKE ALL ON FUNCTION public.validate_payment_request() FROM PUBLIC,anon,authenticated;
