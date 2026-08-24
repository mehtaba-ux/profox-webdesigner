ALTER TABLE public.career_jobs
  ADD COLUMN IF NOT EXISTS role_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS core_product_codes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS additional_service_codes text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.sales_career_progression_settings (
  id text PRIMARY KEY DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT true,
  public_visible boolean NOT NULL DEFAULT true,
  qualification_mode text NOT NULL DEFAULT 'ANY' CHECK (qualification_mode IN ('ANY','ALL')),
  period_type text NOT NULL DEFAULT 'calendar_month' CHECK (period_type IN ('calendar_month','rolling_30_days','quarter')),
  minimum_total_sales integer NOT NULL DEFAULT 0 CHECK (minimum_total_sales >= 0),
  minimum_active_days integer NOT NULL DEFAULT 0 CHECK (minimum_active_days >= 0),
  public_title text NOT NULL DEFAULT 'A path to a salaried opportunity',
  public_description text NOT NULL DEFAULT 'High-performing representatives can become eligible for management review for a potential monthly salary plus commission or incentive proposal. Meeting the configured criteria does not guarantee employment or an offer.',
  default_monthly_salary numeric(12,2),
  salary_currency text NOT NULL DEFAULT 'USD',
  public_show_salary_amount boolean NOT NULL DEFAULT false,
  incentive_description text NOT NULL DEFAULT 'Commission and incentive terms are defined in the proposal and the current approved commission policy.',
  management_review_required boolean NOT NULL DEFAULT true CHECK (management_review_required = true),
  policy_version integer NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sales_career_progression_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sales_career_progression_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id text NOT NULL DEFAULT 'default' REFERENCES public.sales_career_progression_settings(id) ON DELETE CASCADE,
  product_code text NOT NULL REFERENCES public.sales_products(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  required_sales integer NOT NULL CHECK (required_sales > 0),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (settings_id, product_code)
);

INSERT INTO public.sales_career_progression_thresholds (settings_id, product_code, required_sales, enabled, sort_order)
VALUES
  ('default','PF-WEB-LAUNCH',10,true,1),
  ('default','PF-WEB-GROWTH',5,true,2),
  ('default','PF-WEB-SCALE',3,true,3)
ON CONFLICT (settings_id, product_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sales_career_progression_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  policy_version integer NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'Eligible' CHECK (status IN ('Eligible','Under Review','Proposal Offered','Accepted','Declined','Not Offered','No Longer Eligible')),
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  proposal_monthly_salary numeric(12,2),
  proposal_currency text,
  proposal_incentive_notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salesperson_id, policy_version, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS sales_career_progression_thresholds_product_idx ON public.sales_career_progression_thresholds(product_code) WHERE enabled;
CREATE INDEX IF NOT EXISTS sales_career_progression_reviews_salesperson_idx ON public.sales_career_progression_reviews(salesperson_id, period_start DESC);
CREATE INDEX IF NOT EXISTS sales_career_progression_reviews_status_idx ON public.sales_career_progression_reviews(status, detected_at DESC) WHERE status IN ('Eligible','Under Review','Proposal Offered');
CREATE INDEX IF NOT EXISTS commission_entries_progression_scan_idx ON public.commission_entries(salesperson_id, product_code, created_at DESC) WHERE status IN ('Earned','Under Review','Approved','Paid');

ALTER TABLE public.sales_career_progression_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_career_progression_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_career_progression_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_career_progression_settings FROM anon, authenticated;
REVOKE ALL ON public.sales_career_progression_thresholds FROM anon, authenticated;
REVOKE ALL ON public.sales_career_progression_reviews FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.calculate_sales_career_progression(p_salesperson_id uuid, p_reference_date date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings public.sales_career_progression_settings%ROWTYPE;
  v_period_start date;
  v_period_end date;
  v_created_at timestamptz;
  v_active_days integer := 0;
  v_total_sales integer := 0;
  v_criteria jsonb := '[]'::jsonb;
  v_any_met boolean := false;
  v_all_met boolean := false;
  v_age_ok boolean := true;
  v_total_ok boolean := true;
  v_threshold_ok boolean := false;
  v_eligible boolean := false;
BEGIN
  SELECT * INTO v_settings FROM public.sales_career_progression_settings WHERE id='default';
  IF NOT FOUND THEN RETURN jsonb_build_object('enabled',false,'eligible',false,'reason','Progression policy is not configured'); END IF;
  CASE v_settings.period_type
    WHEN 'rolling_30_days' THEN v_period_start := p_reference_date - 29; v_period_end := p_reference_date;
    WHEN 'quarter' THEN v_period_start := date_trunc('quarter',p_reference_date)::date; v_period_end := (date_trunc('quarter',p_reference_date) + interval '3 months - 1 day')::date;
    ELSE v_period_start := date_trunc('month',p_reference_date)::date; v_period_end := (date_trunc('month',p_reference_date) + interval '1 month - 1 day')::date;
  END CASE;
  SELECT created_at INTO v_created_at FROM public.user_profiles WHERE id=p_salesperson_id;
  IF v_created_at IS NOT NULL THEN v_active_days := GREATEST(0,p_reference_date - v_created_at::date + 1); END IF;

  WITH qualifying AS (
    SELECT ce.product_code, COALESCE(ce.quotation_id::text, ce.opportunity_id::text, ce.payment_id::text) AS sale_key,
           COALESCE(p.verified_at, ce.created_at)::date AS sale_date
    FROM public.commission_entries ce LEFT JOIN public.payments p ON p.id=ce.payment_id
    WHERE ce.salesperson_id=p_salesperson_id AND ce.status IN ('Earned','Under Review','Approved','Paid')
      AND COALESCE(p.verified_at,ce.created_at)::date BETWEEN v_period_start AND v_period_end
  ), distinct_sales AS (
    SELECT DISTINCT product_code,sale_key FROM qualifying WHERE sale_key IS NOT NULL
  ), counts AS (
    SELECT product_code,count(*)::integer AS sale_count FROM distinct_sales GROUP BY product_code
  ), criteria AS (
    SELECT t.product_code,p.name AS product_name,p.base_price,p.currency,p.price_mode,t.required_sales,
           COALESCE(c.sale_count,0)::integer AS current_sales,(COALESCE(c.sale_count,0) >= t.required_sales) AS met,t.sort_order
    FROM public.sales_career_progression_thresholds t JOIN public.sales_products p ON p.code=t.product_code
    LEFT JOIN counts c ON c.product_code=t.product_code
    WHERE t.settings_id='default' AND t.enabled=true ORDER BY t.sort_order,p.name
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('productCode',product_code,'productName',product_name,'basePrice',base_price,'currency',currency,'priceMode',price_mode,'requiredSales',required_sales,'currentSales',current_sales,'met',met) ORDER BY sort_order,product_name),'[]'::jsonb),
         COALESCE(bool_or(met),false),CASE WHEN count(*)=0 THEN false ELSE bool_and(met) END
  INTO v_criteria,v_any_met,v_all_met FROM criteria;

  WITH qualifying AS (
    SELECT DISTINCT COALESCE(ce.quotation_id::text,ce.opportunity_id::text,ce.payment_id::text) AS sale_key
    FROM public.commission_entries ce LEFT JOIN public.payments p ON p.id=ce.payment_id
    WHERE ce.salesperson_id=p_salesperson_id AND ce.status IN ('Earned','Under Review','Approved','Paid')
      AND COALESCE(p.verified_at,ce.created_at)::date BETWEEN v_period_start AND v_period_end
  ) SELECT count(*)::integer INTO v_total_sales FROM qualifying WHERE sale_key IS NOT NULL;

  v_age_ok := v_active_days >= v_settings.minimum_active_days;
  v_total_ok := v_total_sales >= v_settings.minimum_total_sales;
  v_threshold_ok := CASE WHEN v_settings.qualification_mode='ALL' THEN v_all_met ELSE v_any_met END;
  v_eligible := v_settings.enabled AND v_age_ok AND v_total_ok AND v_threshold_ok;
  RETURN jsonb_build_object('enabled',v_settings.enabled,'eligible',v_eligible,'qualificationMode',v_settings.qualification_mode,'periodType',v_settings.period_type,'periodStart',v_period_start,'periodEnd',v_period_end,'policyVersion',v_settings.policy_version,'totalVerifiedSales',v_total_sales,'minimumTotalSales',v_settings.minimum_total_sales,'activeDays',v_active_days,'minimumActiveDays',v_settings.minimum_active_days,'criteria',v_criteria,'managementReviewRequired',true);
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_sales_career_progression(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_sales_career_progression(uuid,date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_sales_career_progression()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid:=auth.uid(); v_progress jsonb; v_review jsonb;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=v_uid AND status='active' AND role IN ('sales','sales_rep','sales_team')) THEN RAISE EXCEPTION 'Active Sales access required'; END IF;
  v_progress:=public.calculate_sales_career_progression(v_uid,current_date);
  SELECT to_jsonb(r) - 'reviewed_by' INTO v_review FROM public.sales_career_progression_reviews r
   WHERE r.salesperson_id=v_uid AND r.policy_version=(v_progress->>'policyVersion')::integer
     AND r.period_start=(v_progress->>'periodStart')::date AND r.period_end=(v_progress->>'periodEnd')::date LIMIT 1;
  RETURN v_progress || jsonb_build_object('review',v_review);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_sales_career_progression() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_sales_career_progression() TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_sales_career_progression_review(p_salesperson_id uuid, p_reference_date date DEFAULT current_date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_progress jsonb; v_review public.sales_career_progression_reviews%ROWTYPE; v_id uuid; v_name text; v_inserted boolean:=false;
BEGIN
  IF p_salesperson_id IS NULL THEN RETURN NULL; END IF;
  v_progress:=public.calculate_sales_career_progression(p_salesperson_id,p_reference_date);
  SELECT * INTO v_review FROM public.sales_career_progression_reviews
   WHERE salesperson_id=p_salesperson_id AND policy_version=(v_progress->>'policyVersion')::integer
     AND period_start=(v_progress->>'periodStart')::date AND period_end=(v_progress->>'periodEnd')::date;
  IF COALESCE((v_progress->>'eligible')::boolean,false) THEN
    IF NOT FOUND THEN
      INSERT INTO public.sales_career_progression_reviews(salesperson_id,policy_version,period_start,period_end,status,metrics_snapshot)
      VALUES(p_salesperson_id,(v_progress->>'policyVersion')::integer,(v_progress->>'periodStart')::date,(v_progress->>'periodEnd')::date,'Eligible',v_progress)
      RETURNING id INTO v_id; v_inserted:=true;
    ELSE
      v_id:=v_review.id;
      UPDATE public.sales_career_progression_reviews SET metrics_snapshot=v_progress,updated_at=now(),status=CASE WHEN status='No Longer Eligible' THEN 'Eligible' ELSE status END WHERE id=v_id;
      IF v_review.status='No Longer Eligible' THEN v_inserted:=true; END IF;
    END IF;
    IF v_inserted THEN
      SELECT COALESCE(NULLIF(trim(full_name),''),'Sales representative') INTO v_name FROM public.user_profiles WHERE id=p_salesperson_id;
      PERFORM public.service_queue_active_admins_operational_notification('career-progression:'||v_id::text,'sales_career_progression_eligible_admin','career_progression_review','Sales career progression review ready',v_name||' reached the configured verified-sales criteria and is ready for management review.','/admin/sales-career-progression',jsonb_build_object('salespersonName',v_name,'periodStart',v_progress->>'periodStart','periodEnd',v_progress->>'periodEnd'),now());
    END IF;
  ELSE
    IF FOUND AND v_review.status IN ('Eligible','Under Review') THEN UPDATE public.sales_career_progression_reviews SET status='No Longer Eligible',metrics_snapshot=v_progress,updated_at=now() WHERE id=v_review.id; v_id:=v_review.id; END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_sales_career_progression_review(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_sales_career_progression_review(uuid,date) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_sync_sales_career_progression()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_date date;
BEGIN
  v_date:=COALESCE((SELECT verified_at::date FROM public.payments WHERE id=NEW.payment_id),NEW.created_at::date,current_date);
  PERFORM public.sync_sales_career_progression_review(NEW.salesperson_id,v_date);
  IF TG_OP='UPDATE' AND OLD.salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN PERFORM public.sync_sales_career_progression_review(OLD.salesperson_id,v_date); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_sync_sales_career_progression() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_sales_career_progression ON public.commission_entries;
CREATE TRIGGER trg_sync_sales_career_progression AFTER INSERT OR UPDATE OF status, salesperson_id, product_code, quotation_id, opportunity_id ON public.commission_entries FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_sales_career_progression();

CREATE OR REPLACE FUNCTION public.admin_get_sales_career_progression()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_settings jsonb; v_thresholds jsonb; v_people jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='admin' AND status='active') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT to_jsonb(s) INTO v_settings FROM public.sales_career_progression_settings s WHERE id='default';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'productCode',t.product_code,'productName',p.name,'basePrice',p.base_price,'currency',p.currency,'priceMode',p.price_mode,'requiredSales',t.required_sales,'enabled',t.enabled,'sortOrder',t.sort_order) ORDER BY t.sort_order,p.name),'[]'::jsonb) INTO v_thresholds FROM public.sales_career_progression_thresholds t JOIN public.sales_products p ON p.code=t.product_code WHERE t.settings_id='default';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',u.id,'name',u.full_name,'email',u.email,'progress',public.calculate_sales_career_progression(u.id,current_date),'review',(SELECT to_jsonb(r) FROM public.sales_career_progression_reviews r WHERE r.salesperson_id=u.id ORDER BY r.detected_at DESC LIMIT 1)) ORDER BY u.full_name),'[]'::jsonb) INTO v_people FROM public.user_profiles u WHERE u.status='active' AND u.role IN ('sales','sales_rep','sales_team');
  RETURN jsonb_build_object('settings',v_settings,'thresholds',v_thresholds,'salespeople',v_people);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_sales_career_progression() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_sales_career_progression() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_sales_career_progression(p_settings jsonb, p_thresholds jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_mode text; v_period text; v_threshold jsonb; v_code text; v_required integer; v_sales record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='admin' AND status='active') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  v_mode:=upper(COALESCE(p_settings->>'qualificationMode','ANY')); IF v_mode NOT IN ('ANY','ALL') THEN RAISE EXCEPTION 'Qualification mode must be ANY or ALL'; END IF;
  v_period:=COALESCE(p_settings->>'periodType','calendar_month'); IF v_period NOT IN ('calendar_month','rolling_30_days','quarter') THEN RAISE EXCEPTION 'Invalid period type'; END IF;
  IF jsonb_typeof(COALESCE(p_thresholds,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Thresholds must be an array'; END IF;
  IF jsonb_array_length(COALESCE(p_thresholds,'[]'::jsonb))=0 THEN RAISE EXCEPTION 'At least one career progression threshold is required'; END IF;
  UPDATE public.sales_career_progression_settings SET enabled=COALESCE((p_settings->>'enabled')::boolean,enabled),public_visible=COALESCE((p_settings->>'publicVisible')::boolean,public_visible),qualification_mode=v_mode,period_type=v_period,minimum_total_sales=GREATEST(0,COALESCE((p_settings->>'minimumTotalSales')::integer,0)),minimum_active_days=GREATEST(0,COALESCE((p_settings->>'minimumActiveDays')::integer,0)),public_title=COALESCE(NULLIF(trim(p_settings->>'publicTitle'),''),public_title),public_description=COALESCE(NULLIF(trim(p_settings->>'publicDescription'),''),public_description),default_monthly_salary=CASE WHEN NULLIF(p_settings->>'defaultMonthlySalary','') IS NULL THEN NULL ELSE GREATEST(0,(p_settings->>'defaultMonthlySalary')::numeric) END,salary_currency=COALESCE(NULLIF(upper(trim(p_settings->>'salaryCurrency')),''),salary_currency),public_show_salary_amount=COALESCE((p_settings->>'publicShowSalaryAmount')::boolean,false),incentive_description=COALESCE(NULLIF(trim(p_settings->>'incentiveDescription'),''),incentive_description),policy_version=policy_version+1,updated_by=auth.uid(),updated_at=now() WHERE id='default';
  DELETE FROM public.sales_career_progression_thresholds WHERE settings_id='default';
  FOR v_threshold IN SELECT * FROM jsonb_array_elements(p_thresholds) LOOP
    v_code:=trim(v_threshold->>'productCode'); v_required:=COALESCE((v_threshold->>'requiredSales')::integer,0);
    IF v_code='' OR v_required<=0 OR NOT EXISTS(SELECT 1 FROM public.sales_products WHERE code=v_code AND active=true) THEN RAISE EXCEPTION 'Each threshold requires an active Sales Catalog product and a positive sales target'; END IF;
    INSERT INTO public.sales_career_progression_thresholds(settings_id,product_code,required_sales,enabled,sort_order) VALUES('default',v_code,v_required,COALESCE((v_threshold->>'enabled')::boolean,true),COALESCE((v_threshold->>'sortOrder')::integer,0));
  END LOOP;
  FOR v_sales IN SELECT id FROM public.user_profiles WHERE status='active' AND role IN ('sales','sales_rep','sales_team') LOOP PERFORM public.sync_sales_career_progression_review(v_sales.id,current_date); END LOOP;
  RETURN public.admin_get_sales_career_progression();
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_sales_career_progression(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_sales_career_progression(jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_sales_career_progression_review(p_review_id uuid,p_status text,p_notes text DEFAULT NULL,p_monthly_salary numeric DEFAULT NULL,p_currency text DEFAULT NULL,p_incentive_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_status text:=trim(COALESCE(p_status,'')); v_row public.sales_career_progression_reviews%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='admin' AND status='active') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF v_status NOT IN ('Eligible','Under Review','Proposal Offered','Accepted','Declined','Not Offered','No Longer Eligible') THEN RAISE EXCEPTION 'Invalid review status'; END IF;
  UPDATE public.sales_career_progression_reviews SET status=v_status,review_notes=NULLIF(trim(COALESCE(p_notes,'')),''),proposal_monthly_salary=CASE WHEN p_monthly_salary IS NULL THEN proposal_monthly_salary ELSE GREATEST(0,p_monthly_salary) END,proposal_currency=COALESCE(NULLIF(upper(trim(COALESCE(p_currency,''))),''),proposal_currency),proposal_incentive_notes=COALESCE(NULLIF(trim(COALESCE(p_incentive_notes,'')),''),proposal_incentive_notes),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=p_review_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Career progression review not found'; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_sales_career_progression_review(uuid,text,text,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_sales_career_progression_review(uuid,text,text,numeric,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_sales_role_context(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_job public.career_jobs%ROWTYPE; v_products jsonb; v_services jsonb; v_commission jsonb; v_progression jsonb;
BEGIN
  SELECT * INTO v_job FROM public.career_jobs WHERE slug=p_slug AND status='Published' AND (closes_at IS NULL OR closes_at>now()) AND application_type='sales_representative' LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',p.code,'name',p.name,'category',p.category,'priceMode',p.price_mode,'basePrice',p.base_price,'currency',p.currency,'shortDescription',p.short_description,'fullDescription',p.full_description,'scope',p.scope,'paymentTerms',p.standard_payment_terms) ORDER BY array_position(v_job.core_product_codes,p.code)),'[]'::jsonb) INTO v_products FROM public.sales_products p WHERE p.active=true AND p.code=ANY(v_job.core_product_codes);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',p.code,'name',p.name,'category',p.category,'priceMode',p.price_mode,'basePrice',p.base_price,'currency',p.currency,'shortDescription',p.short_description) ORDER BY array_position(v_job.additional_service_codes,p.code)),'[]'::jsonb) INTO v_services FROM public.sales_products p WHERE p.active=true AND p.code=ANY(v_job.additional_service_codes);
  SELECT jsonb_build_object('selfGeneratedBonusPercent',s.self_generated_bonus_percent,'performanceThreshold',s.performance_threshold,'performanceBonusPercent',s.performance_bonus_percent,'payoutSchedule',s.payout_schedule,'rules',COALESCE((SELECT jsonb_agg(jsonb_build_object('productCode',r.product_code,'productName',r.product_name,'baseRatePercent',r.base_rate_percent,'minRatePercent',r.min_rate_percent,'maxRatePercent',r.max_rate_percent,'requiresAdminRate',r.requires_admin_rate) ORDER BY array_position(v_job.core_product_codes,r.product_code)) FROM public.commission_rules r WHERE r.enabled=true AND r.product_code=ANY(v_job.core_product_codes)),'[]'::jsonb)) INTO v_commission FROM public.commission_settings s WHERE s.id='default';
  SELECT CASE WHEN s.enabled AND s.public_visible THEN jsonb_build_object('enabled',true,'title',s.public_title,'description',s.public_description,'qualificationMode',s.qualification_mode,'periodType',s.period_type,'minimumTotalSales',s.minimum_total_sales,'minimumActiveDays',s.minimum_active_days,'salaryAmount',CASE WHEN s.public_show_salary_amount THEN s.default_monthly_salary ELSE NULL END,'salaryCurrency',CASE WHEN s.public_show_salary_amount THEN s.salary_currency ELSE NULL END,'incentiveDescription',s.incentive_description,'managementReviewRequired',true,'thresholds',COALESCE((SELECT jsonb_agg(jsonb_build_object('productCode',t.product_code,'productName',p.name,'requiredSales',t.required_sales,'basePrice',p.base_price,'currency',p.currency,'priceMode',p.price_mode) ORDER BY t.sort_order,p.name) FROM public.sales_career_progression_thresholds t JOIN public.sales_products p ON p.code=t.product_code WHERE t.settings_id='default' AND t.enabled=true),'[]'::jsonb)) ELSE jsonb_build_object('enabled',false) END INTO v_progression FROM public.sales_career_progression_settings s WHERE s.id='default';
  RETURN jsonb_build_object('job',jsonb_build_object('id',v_job.id,'slug',v_job.slug,'title',v_job.title,'shortSummary',v_job.short_summary,'description',v_job.description,'department',v_job.department,'category',v_job.category,'location',v_job.location,'workplaceType',v_job.workplace_type,'engagementType',v_job.engagement_type,'experience',v_job.experience,'responsibilities',v_job.responsibilities,'requirements',v_job.requirements,'selectionProcess',v_job.selection_process,'applicationCta',v_job.application_cta,'requiresIntroVideo',v_job.requires_intro_video,'seoTitle',v_job.seo_title,'seoDescription',v_job.seo_description,'roleDetails',v_job.role_details),'products',v_products,'additionalServices',v_services,'commission',v_commission,'careerProgression',v_progression);
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_sales_role_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_sales_role_context(text) TO anon, authenticated;

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES('sales_career_progression_eligible_admin','Sales career progression review','Career progression review: {{salespersonName}}','{{salespersonName}} has reached the configured verified-sales criteria for {{periodStart}} through {{periodEnd}}. Review the performance evidence and decide whether to prepare a salaried proposal. Reaching the threshold does not make the decision automatically.\n\nReview: {{actionUrl}}',true,'Admin alert when a salesperson reaches the configured career progression criteria.')
ON CONFLICT (template_key) DO NOTHING;

UPDATE public.career_jobs SET
  title='Independent Commission-Based Sales Representative',
  short_summary='Build your own international sales pipeline, sell ProFox website and application services, and earn commission on verified customer payments.',
  description='ProFox Web Designer, registered as ProFox Digital Solution, provides professional website design, website development, landing pages, e-commerce development, UI/UX design, copywriting, maintenance, and custom web-application development services. We work with businesses that need stronger digital experiences, better websites, improved lead generation, better conversion, or custom digital systems to support their operations.',
  department='Sales',category='International Sales',location='Remote - Worldwide',workplace_type='Remote',engagement_type='Independent contractor - Commission-based',experience='Minimum 6 months of sales experience',
  responsibilities=ARRAY['Research qualified businesses and identify appropriate decision-makers and contact information.','Understand each prospect business and identify website, conversion or digital-operation problems that ProFox can genuinely solve.','Record every prospect in ProFox CRM with the correct owner, source, contact information, notes, status, next activity and follow-up date.','Use personalized cold email, LinkedIn and social outreach, prospecting calls and consistent follow-ups to start qualified conversations.','Book and conduct discovery meetings, ask relevant probing questions and understand the customer business problem and decision process.','Recommend the appropriate approved ProFox solution and explain current packages, scope and pricing without overselling.','Answer prospect questions and handle objections professionally.','Maintain accurate meeting notes and prepare quotations using approved company templates and catalog items.','Follow up after quotations and guide customers through the company-approved payment process.','Confirm payment status only through the protected ProFox verification workflow and management confirmation.','Complete the sales-to-project handover and maintain an appropriate customer relationship after closing.'],
  requirements=ARRAY['Minimum 6 months of sales, business development or client-facing sales experience.','Clear spoken and written English for professional international conversations.','Confidence speaking with business owners, founders, managing directors, marketing managers, operations managers and other decision-makers.','Self-motivation, organization and consistent follow-up discipline without aggressive selling.','Ability to listen carefully, ask useful questions, handle objections and ask for the next step.','Comfort learning website, application and digital-service concepts.','Reliable laptop or desktop, reliable internet, webcam and a suitable environment for Zoom or Google Meet calls.','Comfort working independently in a commission-based contractor model and generating your own leads initially.'],
  compensation='[]'::jsonb,
  core_product_codes=ARRAY['PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE','PF-CUSTOM'],
  additional_service_codes=ARRAY['PF-ADD-LANDING','PF-ADD-COMMERCE25','PF-ADD-COPY','PF-ADD-CRO','PF-ADD-INT-SIMPLE','PF-ADD-API','PF-ADD-EMAIL','PF-ADD-BPA','PF-CARE'],
  role_details=$role${"subtitle":"Website & Application Services","focusMarkets":["United States","United Kingdom","Canada","Australia"],"roleOverview":"You will manage the sales process from prospect research through successful customer payment and sales handover. You are expected to actively find opportunities rather than wait for incoming leads. Initially, sales representatives must generate their own leads.","prospectingChannels":["Google Maps","LinkedIn","Google Search","Facebook","Instagram","Business directories","Professional networks","Industry directories","Social platforms","Other legitimate prospecting channels"],"crmDiscipline":["Every prospect must be recorded in ProFox CRM.","Every active lead must have an assigned salesperson, correct contact information, lead source, relevant notes, current status, next activity and follow-up date.","Calls, meetings, important discussions, follow-ups and sales outcomes must be recorded.","Private or unrecorded prospect lists are not permitted."],"idealCandidate":["Confident","Professional","Self-motivated","Organized","Persistent without being aggressive","Comfortable speaking with international prospects","Able to listen carefully","Comfortable asking questions","Comfortable handling objections","Comfortable asking for the next step","Comfortable working independently","Disciplined about follow-ups","Comfortable learning digital services"],"preferredExperience":["Website sales","Software sales","SaaS","Digital marketing","Professional services","B2B sales","Lead generation","Appointment setting","International sales","Business development"],"experienceNote":"Website or software sales experience is preferred but not mandatory when the applicant demonstrates strong sales ability and learning potential.","targetCustomers":["Hotels & Hospitality","Healthcare & Clinics","Dental practices","Real Estate","Property Management","Roofing companies","HVAC companies","Plumbing companies","Electrical contractors","Home-service businesses","Professional services","Consultants","Law firms","Accounting firms","E-commerce companies","Technology companies","Local service businesses"],"digitalProblemSignals":["Outdated websites","Poor mobile experiences","Slow websites","Weak calls to action","Poor credibility","No online booking","Poor conversion","Broken forms","No clear services presentation","Poor design","Weak local competition positioning","Manual processes that could be automated"],"workingArrangement":{"workingDays":"Monday to Friday","expectedHoursPerWeek":35},"equipmentRequirements":["Laptop or desktop","Reliable internet","Suitable workspace","Clear audio environment","Headset where possible","Webcam","Ability to use Zoom","Ability to use Google Meet"],"performanceExpectations":{"qualifiedProspectsPerDay":"20-30","qualifiedOutreachPerDay":"20-40","callsPerDay":"20-40 depending on prospect availability and pipeline","followUps":"Complete every follow-up scheduled for that day","meetings":"Attend all confirmed prospect meetings","minimumMonthlyPaidSales":5},"paymentRules":["Use only company-approved payment methods.","Never collect customer money into a personal bank account.","Never share personal UPI information or ask clients to transfer money personally.","Never treat a customer screenshot as final payment verification.","A sale becomes confirmed only after payment is verified through the company-approved payment process."],"authorityRestrictions":["Change service prices","Give discounts","Change package inclusions","Promise additional features","Promise unsupported functionality","Promise delivery dates","Modify approved payment terms","Sign contracts on behalf of ProFox","Promise GST invoices","Commit company resources","Mark an opportunity as Won before payment verification"],"authorityNote":"Special requests must receive management approval.","applicationRequirements":["Full name","Country","Time zone","Email","WhatsApp or contact information","LinkedIn profile","CV or resume","Previous sales experience","Previous sales results","Weekly availability","Laptop and internet confirmation","Sample cold outreach message","Professional reference where available","Mandatory 60-120 second English self-introduction video"],"video":{"minimumSeconds":60,"recommendedMaximumSeconds":120,"questions":["Your name and country","Your sales experience","What products or services you have sold","Your cold-calling or lead-generation experience","Your international sales experience, if any","A sales result you are proud of","Why you believe you can sell ProFox services","Your weekly availability"],"standards":["Speak directly to the camera","Speak in English","Ensure your voice is clear","Use a reasonably quiet environment","Keep the video professional","Avoid reading an entire prepared script"],"evaluation":"The purpose is not to evaluate video production quality. We evaluate communication, confidence, clarity, professionalism and sales potential."},"additionalServiceSummary":["Landing page design and development","E-commerce websites","UI/UX design","Website redesign","Copywriting","Custom functionality","Web applications","Monthly website maintenance"],"careerProgressionNote":"High-performing representatives may become eligible for management review for a potential monthly salary plus commission or incentive proposal. Eligibility is based only on the current configured verified-sales policy and does not guarantee employment or an offer."}$role$::jsonb,
  updated_at=now()
WHERE slug='independent-sales-representative';
