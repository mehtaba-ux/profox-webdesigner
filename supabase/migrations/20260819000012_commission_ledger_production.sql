-- Canonical production commission ledger.
-- UUID relationships, verified-payment generation, Admin-only mutations and canonical package codes.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS approved_commission_rate numeric;

CREATE TABLE IF NOT EXISTS public.commission_rules (
  product_code text PRIMARY KEY,
  product_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  base_rate_percent numeric NOT NULL CHECK (base_rate_percent BETWEEN 0 AND 100),
  min_rate_percent numeric NOT NULL CHECK (min_rate_percent BETWEEN 0 AND 100),
  max_rate_percent numeric NOT NULL CHECK (max_rate_percent BETWEEN 0 AND 100),
  requires_admin_rate boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_rate_percent <= max_rate_percent)
);

CREATE TABLE IF NOT EXISTS public.commission_settings (
  id text PRIMARY KEY DEFAULT 'default',
  self_generated_bonus_percent numeric NOT NULL DEFAULT 5,
  performance_threshold integer NOT NULL DEFAULT 10,
  performance_bonus_percent numeric NOT NULL DEFAULT 2,
  payout_schedule text NOT NULL DEFAULT '15th and last working day of each month',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commission_payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text NOT NULL UNIQUE DEFAULT ('PF-COM-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text),1,6)),
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Approved','Completed','Cancelled')),
  notes text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text,
  total_amount numeric NOT NULL DEFAULT 0,
  total_entries_count integer NOT NULL DEFAULT 0,
  total_salespeople_count integer NOT NULL DEFAULT 0,
  processed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  salesperson_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  product_code text NOT NULL,
  product_name text NOT NULL,
  verified_payment_amount numeric NOT NULL CHECK (verified_payment_amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  base_rate_percent numeric NOT NULL,
  self_generated_bonus_percent numeric NOT NULL DEFAULT 0,
  performance_bonus_percent numeric NOT NULL DEFAULT 0,
  effective_rate_percent numeric NOT NULL,
  commission_amount numeric NOT NULL,
  sale_rank integer NOT NULL DEFAULT 1 CHECK (sale_rank > 0),
  status text NOT NULL DEFAULT 'Earned' CHECK (status IN ('Earned','Under Review','Approved','Paid','Reversed','Disputed')),
  rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payout_batch_id uuid REFERENCES public.commission_payout_batches(id) ON DELETE SET NULL,
  paid_at timestamptz,
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  entry_number text UNIQUE DEFAULT ('COM-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || substr(md5(random()::text),1,4)),
  admin_review_notes text,
  payout_reference text,
  paid_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_commission_entries_salesperson ON public.commission_entries(salesperson_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_entries_status ON public.commission_entries(status);
CREATE INDEX IF NOT EXISTS idx_commission_entries_quotation ON public.commission_entries(quotation_id);
CREATE INDEX IF NOT EXISTS idx_commission_entries_payout_batch ON public.commission_entries(payout_batch_id);

INSERT INTO public.commission_rules(product_code,product_name,enabled,base_rate_percent,min_rate_percent,max_rate_percent,requires_admin_rate)
VALUES
 ('PF-WEB-LAUNCH','ProFox Launch',true,10,10,10,false),
 ('PF-WEB-GROWTH','ProFox Growth',true,12,12,12,false),
 ('PF-WEB-SCALE','ProFox Scale',true,15,15,15,false),
 ('PF-CUSTOM','ProFox Custom Digital Experience & Web Application',true,10,10,15,true),
 ('PF-DISCOVERY','ProFox Solution Blueprint & Discovery Sprint',false,10,10,10,false),
 ('PF-CARE','ProFox Care Plans',false,10,10,10,false)
ON CONFLICT (product_code) DO UPDATE SET
 product_name=EXCLUDED.product_name,
 enabled=EXCLUDED.enabled,
 base_rate_percent=EXCLUDED.base_rate_percent,
 min_rate_percent=EXCLUDED.min_rate_percent,
 max_rate_percent=EXCLUDED.max_rate_percent,
 requires_admin_rate=EXCLUDED.requires_admin_rate,
 updated_at=now();

INSERT INTO public.commission_settings(id,self_generated_bonus_percent,performance_threshold,performance_bonus_percent,payout_schedule)
VALUES('default',5,10,2,'15th and last working day of each month')
ON CONFLICT (id) DO UPDATE SET
 self_generated_bonus_percent=EXCLUDED.self_generated_bonus_percent,
 performance_threshold=EXCLUDED.performance_threshold,
 performance_bonus_percent=EXCLUDED.performance_bonus_percent,
 payout_schedule=EXCLUDED.payout_schedule,
 updated_at=now();

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payout_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_rules_read ON public.commission_rules;
DROP POLICY IF EXISTS commission_rules_admin ON public.commission_rules;
DROP POLICY IF EXISTS commission_settings_read ON public.commission_settings;
DROP POLICY IF EXISTS commission_settings_admin ON public.commission_settings;
DROP POLICY IF EXISTS commission_entries_read ON public.commission_entries;
DROP POLICY IF EXISTS commission_entries_admin ON public.commission_entries;
DROP POLICY IF EXISTS commission_batches_admin ON public.commission_payout_batches;

CREATE POLICY commission_rules_read ON public.commission_rules FOR SELECT TO authenticated USING (public.is_active_staff());
CREATE POLICY commission_rules_admin ON public.commission_rules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY commission_settings_read ON public.commission_settings FOR SELECT TO authenticated USING (public.is_active_staff());
CREATE POLICY commission_settings_admin ON public.commission_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY commission_entries_read ON public.commission_entries FOR SELECT TO authenticated USING (public.is_admin() OR salesperson_id=auth.uid());
CREATE POLICY commission_entries_admin ON public.commission_entries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY commission_batches_admin ON public.commission_payout_batches FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.generate_commission_for_verified_payment(p_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_pay public.payments%ROWTYPE; v_quote public.quotations%ROWTYPE; v_opp public.crm_opportunities%ROWTYPE;
 v_rule public.commission_rules%ROWTYPE; v_set public.commission_settings%ROWTYPE; v_item record;
 v_existing uuid; v_first_rank int; v_rank int; v_base numeric; v_self numeric:=0; v_perf numeric:=0;
 v_rate numeric; v_amount numeric; v_status text:='Earned'; v_new uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: commission generation is restricted to Admin payment verification.'; END IF;
 SELECT id INTO v_existing FROM public.commission_entries WHERE payment_id=p_payment_id;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 SELECT * INTO v_pay FROM public.payments WHERE id=p_payment_id;
 IF NOT FOUND OR v_pay.status<>'Verified' THEN RAISE EXCEPTION 'Verified payment required.'; END IF;
 IF v_pay.salesperson_id IS NULL OR v_pay.quotation_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO v_quote FROM public.quotations WHERE id=v_pay.quotation_id;
 SELECT * INTO v_opp FROM public.crm_opportunities WHERE id=v_pay.opportunity_id;
 SELECT qi.product_code_snapshot,qi.product_name_snapshot INTO v_item
 FROM public.quotation_items qi WHERE qi.quotation_id=v_pay.quotation_id AND qi.item_type='package'
 ORDER BY qi.sort_order,qi.created_at LIMIT 1;
 IF v_item.product_code_snapshot IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO v_rule FROM public.commission_rules WHERE product_code=v_item.product_code_snapshot AND enabled=true;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO v_set FROM public.commission_settings WHERE id='default';
 v_base:=v_rule.base_rate_percent;
 IF v_rule.requires_admin_rate THEN
   IF v_quote.approved_commission_rate IS NULL OR v_quote.approved_commission_rate<v_rule.min_rate_percent OR v_quote.approved_commission_rate>v_rule.max_rate_percent THEN
     v_status:='Under Review'; v_base:=v_rule.min_rate_percent;
   ELSE v_base:=v_quote.approved_commission_rate; END IF;
 END IF;
 IF COALESCE(v_opp.self_generated,false) THEN v_self:=v_set.self_generated_bonus_percent; END IF;
 SELECT min(sale_rank) INTO v_first_rank FROM public.commission_entries
 WHERE quotation_id=v_pay.quotation_id AND salesperson_id=v_pay.salesperson_id AND status<>'Reversed';
 IF v_first_rank IS NOT NULL THEN v_rank:=v_first_rank;
 ELSE
   SELECT count(DISTINCT quotation_id)+1 INTO v_rank FROM public.commission_entries
   WHERE salesperson_id=v_pay.salesperson_id AND status<>'Reversed' AND quotation_id IS NOT NULL
     AND date_trunc('month',created_at)=date_trunc('month',COALESCE(v_pay.verified_at,now()));
 END IF;
 IF v_rank>v_set.performance_threshold THEN v_perf:=v_set.performance_bonus_percent; END IF;
 v_rate:=v_base+v_self+v_perf;
 v_amount:=round((COALESCE(NULLIF(v_pay.amount_paid,0),v_pay.amount_due)*v_rate/100.0)::numeric,2);
 INSERT INTO public.commission_entries(payment_id,quotation_id,opportunity_id,client_id,salesperson_id,product_code,product_name,verified_payment_amount,currency,base_rate_percent,self_generated_bonus_percent,performance_bonus_percent,effective_rate_percent,commission_amount,sale_rank,status,rule_snapshot)
 VALUES(v_pay.id,v_pay.quotation_id,v_pay.opportunity_id,v_pay.client_id,v_pay.salesperson_id,v_item.product_code_snapshot,v_item.product_name_snapshot,COALESCE(NULLIF(v_pay.amount_paid,0),v_pay.amount_due),v_pay.currency,v_base,v_self,v_perf,v_rate,v_amount,v_rank,v_status,jsonb_build_object('baseRate',v_base,'selfGeneratedBonus',v_self,'performanceBonus',v_perf,'saleRank',v_rank,'productCode',v_item.product_code_snapshot,'capturedAt',now()))
 RETURNING id INTO v_new;
 RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_commission_status(p_entry_id uuid,p_status text,p_notes text DEFAULT '',p_payout_reference text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 IF p_status NOT IN ('Earned','Under Review','Approved','Paid','Reversed','Disputed') THEN RAISE EXCEPTION 'Invalid commission status.'; END IF;
 UPDATE public.commission_entries SET
  status=p_status,
  admin_review_notes=CASE WHEN COALESCE(trim(p_notes),'')='' THEN admin_review_notes ELSE concat_ws(' | ',admin_review_notes,p_notes) END,
  payout_reference=CASE WHEN COALESCE(trim(p_payout_reference),'')='' THEN payout_reference ELSE p_payout_reference END,
  paid_at=CASE WHEN p_status='Paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,
  paid_by=CASE WHEN p_status='Paid' THEN COALESCE(paid_by,auth.uid()) ELSE paid_by END,
  updated_at=now()
 WHERE id=p_entry_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Commission entry not found.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_custom_commission_rate(p_quotation_id uuid,p_rate numeric,p_notes text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_rule public.commission_rules%ROWTYPE;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_rule FROM public.commission_rules WHERE product_code='PF-CUSTOM';
 IF p_rate<v_rule.min_rate_percent OR p_rate>v_rule.max_rate_percent THEN
   RAISE EXCEPTION 'Custom commission rate must be between % and %.',v_rule.min_rate_percent,v_rule.max_rate_percent;
 END IF;
 UPDATE public.quotations SET approved_commission_rate=p_rate,updated_at=now() WHERE id=p_quotation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found.'; END IF;
 UPDATE public.commission_entries SET
  base_rate_percent=p_rate,
  effective_rate_percent=p_rate+self_generated_bonus_percent+performance_bonus_percent,
  commission_amount=round((verified_payment_amount*(p_rate+self_generated_bonus_percent+performance_bonus_percent)/100)::numeric,2),
  status='Approved',
  admin_review_notes=CASE WHEN COALESCE(trim(p_notes),'')='' THEN admin_review_notes ELSE concat_ws(' | ',admin_review_notes,p_notes) END,
  rule_snapshot=rule_snapshot||jsonb_build_object('customApprovedBaseRate',p_rate,'customApprovedAt',now(),'customApprovedBy',auth.uid()),
  updated_at=now()
 WHERE quotation_id=p_quotation_id AND product_code='PF-CUSTOM' AND status<>'Reversed';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reverse_commission(p_entry_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 IF COALESCE(trim(p_reason),'')='' THEN RAISE EXCEPTION 'Reversal reason is required.'; END IF;
 UPDATE public.commission_entries SET status='Reversed',reversal_reason=p_reason,updated_at=now()
 WHERE id=p_entry_id AND status<>'Reversed';
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.commission_entries WHERE id=p_entry_id) THEN RAISE EXCEPTION 'Commission entry not found.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_commission_payout_batch(p_scheduled_date date,p_entry_ids uuid[],p_title text DEFAULT NULL,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_total numeric; v_count int; v_people int;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 IF COALESCE(array_length(p_entry_ids,1),0)=0 THEN RAISE EXCEPTION 'At least one commission entry is required.'; END IF;
 IF EXISTS(SELECT 1 FROM public.commission_entries WHERE id=ANY(p_entry_ids) AND (status NOT IN ('Earned','Approved') OR payout_batch_id IS NOT NULL)) THEN
   RAISE EXCEPTION 'Only unbatched Earned or Approved commissions may be batched.';
 END IF;
 SELECT COALESCE(sum(commission_amount),0),count(*),count(DISTINCT salesperson_id)
 INTO v_total,v_count,v_people FROM public.commission_entries WHERE id=ANY(p_entry_ids);
 IF v_count<>array_length(p_entry_ids,1) THEN RAISE EXCEPTION 'One or more commission entries were not found.'; END IF;
 INSERT INTO public.commission_payout_batches(scheduled_date,status,title,total_amount,total_entries_count,total_salespeople_count,notes,created_by,processed_by)
 VALUES(p_scheduled_date,'Approved',COALESCE(NULLIF(trim(p_title),''),'Commission Payout'),v_total,v_count,v_people,p_notes,auth.uid(),auth.uid())
 RETURNING id INTO v_id;
 UPDATE public.commission_entries SET payout_batch_id=v_id,status='Approved',updated_at=now() WHERE id=ANY(p_entry_ids);
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finalize_commission_payout_batch(p_batch_id uuid,p_payout_reference text DEFAULT '',p_notes text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_batch public.commission_payout_batches%ROWTYPE;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_batch FROM public.commission_payout_batches WHERE id=p_batch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payout batch not found.'; END IF;
 IF v_batch.status='Completed' THEN RETURN; END IF;
 IF v_batch.status<>'Approved' THEN RAISE EXCEPTION 'Only Approved payout batches may be completed.'; END IF;
 UPDATE public.commission_entries SET status='Paid',paid_at=COALESCE(paid_at,now()),paid_by=auth.uid(),
  payout_reference=COALESCE(NULLIF(trim(p_payout_reference),''),v_batch.batch_number),updated_at=now()
 WHERE payout_batch_id=p_batch_id AND status<>'Reversed';
 UPDATE public.commission_payout_batches SET status='Completed',completed_at=now(),processed_by=auth.uid(),
  notes=CASE WHEN COALESCE(trim(p_notes),'')='' THEN notes ELSE concat_ws(' | ',notes,p_notes) END,updated_at=now()
 WHERE id=p_batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_payment_atomic(p_payment_id uuid,p_admin_id uuid DEFAULT NULL,p_notes text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_payment public.payments%ROWTYPE; v_opp public.crm_opportunities%ROWTYPE; v_quote public.quotations%ROWTYPE; v_client_id uuid;
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
     SELECT id INTO v_client_id FROM public.clients
     WHERE lower(COALESCE(email,''))=lower(COALESCE(v_opp.email,''))
       AND lower(COALESCE(company_name,''))=lower(COALESCE(v_opp.company_name,''))
     ORDER BY created_at LIMIT 1;
     IF v_client_id IS NULL THEN
       INSERT INTO public.clients(company_name,primary_contact_name,email,phone,website,country,industry,salesperson_id,source_opportunity_id,first_quotation_id,total_sales_value,currency,status)
       VALUES(COALESCE(NULLIF(v_opp.company_name,''),v_opp.name),COALESCE(NULLIF(v_opp.contact_name,''),NULLIF(v_opp.company_name,''),v_opp.name),COALESCE(v_opp.email,''),v_opp.phone,v_opp.website,v_opp.country,v_opp.industry,v_opp.salesperson_id,v_opp.id,v_payment.quotation_id,COALESCE(v_quote.total,v_opp.expected_value,0),COALESCE(v_quote.currency,v_opp.currency,'USD'),'Active')
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

REVOKE ALL ON FUNCTION public.generate_commission_for_verified_payment(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_update_commission_status(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_approve_custom_commission_rate(uuid,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_reverse_commission(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_create_commission_payout_batch(date,uuid[],text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_finalize_commission_payout_batch(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.verify_payment_atomic(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_commission_for_verified_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_commission_status(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_custom_commission_rate(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reverse_commission(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_commission_payout_batch(date,uuid[],text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_commission_payout_batch(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_payment_atomic(uuid,uuid,text) TO authenticated;
