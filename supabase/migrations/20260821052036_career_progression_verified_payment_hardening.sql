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
    SELECT ce.product_code, COALESCE(ce.quotation_id::text,ce.opportunity_id::text,ce.payment_id::text) AS sale_key
    FROM public.commission_entries ce
    JOIN public.payments p ON p.id=ce.payment_id
    WHERE ce.salesperson_id=p_salesperson_id
      AND ce.status IN ('Earned','Under Review','Approved','Paid')
      AND p.status='Verified'
      AND p.verified_at IS NOT NULL
      AND p.verified_at::date BETWEEN v_period_start AND v_period_end
  ), distinct_sales AS (
    SELECT DISTINCT product_code,sale_key FROM qualifying WHERE sale_key IS NOT NULL
  ), counts AS (
    SELECT product_code,count(*)::integer AS sale_count FROM distinct_sales GROUP BY product_code
  ), criteria AS (
    SELECT t.product_code,p.name AS product_name,p.base_price,p.currency,p.price_mode,t.required_sales,
           COALESCE(c.sale_count,0)::integer AS current_sales,(COALESCE(c.sale_count,0) >= t.required_sales) AS met,t.sort_order
    FROM public.sales_career_progression_thresholds t
    JOIN public.sales_products p ON p.code=t.product_code
    LEFT JOIN counts c ON c.product_code=t.product_code
    WHERE t.settings_id='default' AND t.enabled=true ORDER BY t.sort_order,p.name
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('productCode',product_code,'productName',product_name,'basePrice',base_price,'currency',currency,'priceMode',price_mode,'requiredSales',required_sales,'currentSales',current_sales,'met',met) ORDER BY sort_order,product_name),'[]'::jsonb),
         COALESCE(bool_or(met),false),CASE WHEN count(*)=0 THEN false ELSE bool_and(met) END
  INTO v_criteria,v_any_met,v_all_met FROM criteria;

  WITH qualifying AS (
    SELECT DISTINCT COALESCE(ce.quotation_id::text,ce.opportunity_id::text,ce.payment_id::text) AS sale_key
    FROM public.commission_entries ce
    JOIN public.payments p ON p.id=ce.payment_id
    WHERE ce.salesperson_id=p_salesperson_id
      AND ce.status IN ('Earned','Under Review','Approved','Paid')
      AND p.status='Verified'
      AND p.verified_at IS NOT NULL
      AND p.verified_at::date BETWEEN v_period_start AND v_period_end
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
