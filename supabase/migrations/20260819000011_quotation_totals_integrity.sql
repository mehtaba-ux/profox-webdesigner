-- Quotation financial integrity.
-- Line-item prices are validated server-side and quotation totals are derived from line items.

CREATE OR REPLACE FUNCTION public.validate_quotation_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.sales_products%ROWTYPE;
  v_is_admin boolean := public.is_admin();
BEGIN
  IF COALESCE(NEW.quantity,0) <= 0 THEN RAISE EXCEPTION 'Quotation item quantity must be greater than zero.'; END IF;
  IF COALESCE(NEW.unit_price,0) < 0 THEN RAISE EXCEPTION 'Quotation item price cannot be negative.'; END IF;

  IF NEW.sales_product_id IS NULL THEN
    IF NOT v_is_admin AND NEW.item_type <> 'custom' THEN RAISE EXCEPTION 'Non-catalog quotation items must be custom items.'; END IF;
    NEW.line_total := round((NEW.quantity * NEW.unit_price)::numeric, 2);
    RETURN NEW;
  END IF;

  SELECT * INTO v_product FROM public.sales_products WHERE id = NEW.sales_product_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales product is missing or inactive.'; END IF;

  NEW.product_code_snapshot := v_product.code;
  NEW.product_name_snapshot := v_product.name;
  NEW.item_type := v_product.product_type;

  IF NOT v_is_admin THEN
    IF v_product.price_mode='fixed' AND NEW.unit_price<>v_product.base_price THEN
      RAISE EXCEPTION 'Fixed catalog price cannot be changed.';
    ELSIF v_product.price_mode='starting_at' AND NEW.unit_price<v_product.base_price THEN
      RAISE EXCEPTION 'Price cannot be below the approved starting price.';
    END IF;
  END IF;

  NEW.line_total := round((NEW.quantity * NEW.unit_price)::numeric, 2);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_quotation_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_quotation_id uuid; v_total numeric;
BEGIN
  v_quotation_id := COALESCE(NEW.quotation_id, OLD.quotation_id);
  IF v_quotation_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(round(sum(line_total)::numeric,2),0) INTO v_total
  FROM public.quotation_items WHERE quotation_id=v_quotation_id;
  UPDATE public.quotations SET subtotal=v_total,total=v_total,updated_at=now() WHERE id=v_quotation_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_quotation_totals ON public.quotation_items;
CREATE TRIGGER trg_recalculate_quotation_totals
AFTER INSERT OR UPDATE OR DELETE ON public.quotation_items
FOR EACH ROW EXECUTE FUNCTION public.recalculate_quotation_totals();

CREATE OR REPLACE FUNCTION public.protect_quotation_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF OLD.status IN ('Approved','Sent','Accepted','Rejected','Expired','Cancelled') AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'Locked quotation may only be changed by an Admin.';
  END IF;
  IF NEW.status NOT IN ('Draft','Ready for Approval') THEN
    RAISE EXCEPTION 'Sales may only keep quotations in Draft or submit them Ready for Approval.';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'Approval and acceptance fields are privileged.';
  END IF;
  IF pg_trigger_depth()=1 AND (NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.total IS DISTINCT FROM OLD.total) THEN
    RAISE EXCEPTION 'Quotation totals are calculated from line items and cannot be edited directly.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_quotation_atomic(p_quotation jsonb, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid; v_salesperson uuid; v_item jsonb;
BEGIN
  IF NOT public.has_active_role(ARRAY['admin','sales']) THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
  v_salesperson := NULLIF(p_quotation->>'salesperson_id','')::uuid;
  IF NOT public.is_admin() AND v_salesperson IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sales representatives may create quotations only for themselves.'; END IF;

  INSERT INTO public.quotations(opportunity_id,salesperson_id,customer_name,contact_name,email,phone,country,currency,status,valid_until,payment_terms,scope_summary,exclusions,customer_notes,internal_notes,subtotal,total,created_by)
  VALUES(NULLIF(p_quotation->>'opportunity_id','')::uuid,v_salesperson,COALESCE(NULLIF(p_quotation->>'customer_name',''),'Customer'),NULLIF(p_quotation->>'contact_name',''),NULLIF(p_quotation->>'email',''),NULLIF(p_quotation->>'phone',''),NULLIF(p_quotation->>'country',''),COALESCE(NULLIF(p_quotation->>'currency',''),'USD'),COALESCE(NULLIF(p_quotation->>'status',''),'Draft'),NULLIF(p_quotation->>'valid_until','')::date,NULLIF(p_quotation->>'payment_terms',''),NULLIF(p_quotation->>'scope_summary',''),NULLIF(p_quotation->>'exclusions',''),NULLIF(p_quotation->>'customer_notes',''),NULLIF(p_quotation->>'internal_notes',''),0,0,auth.uid()) RETURNING id INTO v_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
    INSERT INTO public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order)
    VALUES(v_id,NULLIF(v_item->>'sales_product_id','')::uuid,COALESCE(v_item->>'product_code_snapshot','CUSTOM'),COALESCE(v_item->>'product_name_snapshot','Custom Item'),NULLIF(v_item->>'description_snapshot',''),COALESCE((v_item->>'quantity')::int,1),COALESCE((v_item->>'unit_price')::numeric,0),0,COALESCE(v_item->>'item_type','custom'),COALESCE((v_item->>'sort_order')::int,0));
  END LOOP;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_quotation_atomic(p_quotation_id uuid, p_updates jsonb, p_items jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_q public.quotations%ROWTYPE; v_item jsonb; v_new_status text;
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found.'; END IF;
  IF NOT public.is_admin() AND (NOT public.has_active_role(ARRAY['sales']) OR v_q.salesperson_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
  IF NOT public.is_admin() AND v_q.status IN ('Approved','Sent','Accepted','Rejected','Expired','Cancelled') THEN RAISE EXCEPTION 'Locked quotation may not be edited by Sales.'; END IF;
  v_new_status:=COALESCE(NULLIF(p_updates->>'status',''),v_q.status);
  IF NOT public.is_admin() AND v_new_status NOT IN ('Draft','Ready for Approval') THEN RAISE EXCEPTION 'Sales may only move quotations between Draft and Ready for Approval.'; END IF;

  UPDATE public.quotations SET
    customer_name=COALESCE(NULLIF(p_updates->>'customer_name',''),customer_name),
    contact_name=CASE WHEN p_updates ? 'contact_name' THEN NULLIF(p_updates->>'contact_name','') ELSE contact_name END,
    email=CASE WHEN p_updates ? 'email' THEN NULLIF(p_updates->>'email','') ELSE email END,
    phone=CASE WHEN p_updates ? 'phone' THEN NULLIF(p_updates->>'phone','') ELSE phone END,
    country=CASE WHEN p_updates ? 'country' THEN NULLIF(p_updates->>'country','') ELSE country END,
    currency=COALESCE(NULLIF(p_updates->>'currency',''),currency),status=v_new_status,
    valid_until=CASE WHEN p_updates ? 'valid_until' THEN NULLIF(p_updates->>'valid_until','')::date ELSE valid_until END,
    payment_terms=CASE WHEN p_updates ? 'payment_terms' THEN NULLIF(p_updates->>'payment_terms','') ELSE payment_terms END,
    scope_summary=CASE WHEN p_updates ? 'scope_summary' THEN NULLIF(p_updates->>'scope_summary','') ELSE scope_summary END,
    exclusions=CASE WHEN p_updates ? 'exclusions' THEN NULLIF(p_updates->>'exclusions','') ELSE exclusions END,
    customer_notes=CASE WHEN p_updates ? 'customer_notes' THEN NULLIF(p_updates->>'customer_notes','') ELSE customer_notes END,
    internal_notes=CASE WHEN p_updates ? 'internal_notes' THEN NULLIF(p_updates->>'internal_notes','') ELSE internal_notes END,
    updated_at=now()
  WHERE id=p_quotation_id;

  IF p_items IS NOT NULL THEN
    DELETE FROM public.quotation_items WHERE quotation_id=p_quotation_id;
    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
      INSERT INTO public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order)
      VALUES(p_quotation_id,NULLIF(v_item->>'sales_product_id','')::uuid,COALESCE(v_item->>'product_code_snapshot','CUSTOM'),COALESCE(v_item->>'product_name_snapshot','Custom Item'),NULLIF(v_item->>'description_snapshot',''),COALESCE((v_item->>'quantity')::int,1),COALESCE((v_item->>'unit_price')::numeric,0),0,COALESCE(v_item->>'item_type','custom'),COALESCE((v_item->>'sort_order')::int,0));
    END LOOP;
  END IF;
END;
$$;

UPDATE public.quotations q
SET subtotal=x.total,total=x.total,updated_at=now()
FROM (
  SELECT q2.id,COALESCE(round(sum(qi.line_total)::numeric,2),0) AS total
  FROM public.quotations q2 LEFT JOIN public.quotation_items qi ON qi.quotation_id=q2.id
  GROUP BY q2.id
) x
WHERE q.id=x.id AND (q.subtotal IS DISTINCT FROM x.total OR q.total IS DISTINCT FROM x.total);

REVOKE ALL ON FUNCTION public.recalculate_quotation_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_quotation_item_price() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_atomic(jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_quotation_atomic(uuid,jsonb,jsonb) TO authenticated;
