-- PF-SOP-01 Part 16 Product Owner-approved production policy activation.
-- Bounded forward-only compatibility extension for the existing PF-DISCOVERY product type.
-- This first activation stage loads the complete approved policy and enables grant issuance,
-- but deliberately keeps enforcement OFF because the current active Seller's canonical
-- certification evidence is synthetic/test-tagged and cannot authorize production commerce.

DO $$
DECLARE
  v_policy jsonb;
  v_part10b jsonb;
  v_grants integer;
  v_unknown text;
BEGIN
  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  IF v_policy IS NULL
     OR nullif(v_policy->>'schemaVersion','')::integer IS DISTINCT FROM 2
     OR nullif(v_policy->>'policyVersion','')::integer IS DISTINCT FROM 1
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false)
     OR coalesce((v_policy->>'grantingActive')::boolean,false)
     OR coalesce((v_policy->>'enforcementActive')::boolean,false)
     OR coalesce(v_policy->'productRules','{}'::jsonb)<>'{}'::jsonb
     OR coalesce(v_policy->'addonRules','{}'::jsonb)<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Part 16 policy activation requires the verified schema-v2 policyVersion=1 staged starting state.';
  END IF;

  SELECT count(*)::integer INTO v_grants FROM public.sales_certification_package_grants;
  IF v_grants<>0 THEN
    RAISE EXCEPTION 'Part 16 policy activation refuses to reinterpret existing granular grants; expected zero.';
  END IF;

  SELECT config_value INTO v_part10b
  FROM public.system_configuration
  WHERE config_key='crm_quotation_sales_reconciliation_policy_v1';
  IF coalesce((v_part10b->>'finalQuotationSendGateActive')::boolean,false) IS DISTINCT FROM true
     OR nullif(v_part10b->>'policyVersion','')::integer IS DISTINCT FROM 2
     OR nullif(v_part10b->>'snapshotSchemaVersion','')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Part 16 activation requires Part 10B final Send gate active at policy/schema 2/2.';
  END IF;

  SELECT string_agg(p.code||' ('||coalesce(p.product_type,'NULL')||')',', ' ORDER BY p.code) INTO v_unknown
  FROM public.sales_products p
  WHERE p.active=true
    AND lower(coalesce(p.product_type,''))='package'
    AND p.code NOT IN ('PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE','PF-CUSTOM');
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'UNCLASSIFIED ACTIVE SALES PRODUCT REQUIRES PRODUCT-OWNER DECISION: %',v_unknown;
  END IF;

  IF (SELECT count(*) FROM public.sales_products p
      WHERE p.active=true AND lower(coalesce(p.product_type,''))='package'
        AND p.code IN ('PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE','PF-CUSTOM'))<>4 THEN
    RAISE EXCEPTION 'Part 16 activation requires all four approved active package codes.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.sales_products p
    WHERE p.active=true AND p.code='PF-DISCOVERY' AND lower(coalesce(p.product_type,''))='discovery'
  ) THEN
    RAISE EXCEPTION 'Part 16 activation requires active PF-DISCOVERY with product_type=discovery.';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.sales_products p
    WHERE p.active=true AND lower(coalesce(p.product_type,''))='discovery' AND p.code<>'PF-DISCOVERY'
  ) THEN
    RAISE EXCEPTION 'Part 16 activation found an unclassified active discovery product.';
  END IF;

  SELECT string_agg(p.code,', ' ORDER BY p.code) INTO v_unknown
  FROM public.sales_products p
  WHERE p.active=true AND lower(coalesce(p.product_type,''))='addon'
    AND p.code<>ALL(ARRAY['PF-ADD-PAGE','PF-ADD-CUSTOM-PAGE','PF-ADD-LANDING','PF-ADD-COPY','PF-ADD-BLOG','PF-ADD-MIGRATION20','PF-ADD-LEADFORM','PF-ADD-BOOKING','PF-ADD-CHAT','PF-ADD-REVIEWS','PF-ADD-TRACKING','PF-ADD-CRO','PF-ADD-LOCALSEO','PF-ADD-SEOAUDIT','PF-ADD-LOGOREFRESH','PF-ADD-MINIBRAND','PF-ADD-ICONS','PF-ADD-ANIMATION','PF-ADD-ILLUSTRATION','PF-ADD-CRM','PF-ADD-ADVSEO','PF-ADD-AIDISCOVERY','PF-ADD-SEOMIGRATION','PF-ADD-COMMERCE25','PF-ADD-COMMERCEADD25','PF-ADD-FILTERS','PF-ADD-INT-SIMPLE','PF-ADD-EMAIL','PF-ADD-LEADROUTE','PF-ADD-3D','PF-ADD-SUBSCRIPTION','PF-ADD-PAYGATEWAY','PF-ADD-CHECKOUT','PF-ADD-INT-ADV','PF-ADD-API','PF-ADD-PAYMENT','PF-ADD-BPA']);
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'UNCLASSIFIED ACTIVE SALES PRODUCT REQUIRES PRODUCT-OWNER DECISION: %',v_unknown;
  END IF;

  IF (SELECT count(*) FROM public.sales_products p
      WHERE p.active=true AND lower(coalesce(p.product_type,''))='addon'
        AND p.code=ANY(ARRAY['PF-ADD-PAGE','PF-ADD-CUSTOM-PAGE','PF-ADD-LANDING','PF-ADD-COPY','PF-ADD-BLOG','PF-ADD-MIGRATION20','PF-ADD-LEADFORM','PF-ADD-BOOKING','PF-ADD-CHAT','PF-ADD-REVIEWS','PF-ADD-TRACKING','PF-ADD-CRO','PF-ADD-LOCALSEO','PF-ADD-SEOAUDIT','PF-ADD-LOGOREFRESH','PF-ADD-MINIBRAND','PF-ADD-ICONS','PF-ADD-ANIMATION','PF-ADD-ILLUSTRATION','PF-ADD-CRM','PF-ADD-ADVSEO','PF-ADD-AIDISCOVERY','PF-ADD-SEOMIGRATION','PF-ADD-COMMERCE25','PF-ADD-COMMERCEADD25','PF-ADD-FILTERS','PF-ADD-INT-SIMPLE','PF-ADD-EMAIL','PF-ADD-LEADROUTE','PF-ADD-3D','PF-ADD-SUBSCRIPTION','PF-ADD-PAYGATEWAY','PF-ADD-CHECKOUT','PF-ADD-INT-ADV','PF-ADD-API','PF-ADD-PAYMENT','PF-ADD-BPA']))<>37 THEN
    RAISE EXCEPTION 'Part 16 activation requires exactly the 37 approved active add-ons.';
  END IF;
END $$;


CREATE OR REPLACE FUNCTION public.sales_certification_authoritative_evidence(p_salesperson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_academy_ready boolean:=false;
  v_product_module_id uuid;
  v_product_progress_id uuid;
  v_product_status text;
  v_product_score integer;
  v_product_passing integer;
  v_final_progress_id uuid;
  v_final_session_id uuid;
  v_final_status text;
  v_final_score integer;
  v_final_passing integer:=90;
  v_final_failures jsonb:='[]'::jsonb;
  v_judgment_passed boolean:=false;
  v_judgment_critical_misses integer:=0;
  v_sandbox jsonb:='{}'::jsonb;
  v_seller_brief jsonb:='{}'::jsonb;
  v_evaluator_brief jsonb:='{}'::jsonb;
  v_synthetic boolean:=false;
  v_blockers jsonb:='[]'::jsonb;
  v_product_passed boolean:=false;
  v_final_passed boolean:=false;
BEGIN
  IF p_salesperson_id IS NULL THEN
    RETURN jsonb_build_object('grantEligible',false,'syntheticEvidenceDetected',false,'blockers',jsonb_build_array('Salesperson is required.'));
  END IF;

  v_academy_ready:=public.sales_academy_training_ready(p_salesperson_id);

  SELECT m.id,p.id,p.status,p.score,coalesce(tm.passing_score_override,m.passing_score,0)
  INTO v_product_module_id,v_product_progress_id,v_product_status,v_product_score,v_product_passing
  FROM public.training_track_modules tm
  JOIN public.training_modules m ON m.id=tm.module_id
  LEFT JOIN public.user_training_progress p ON p.user_id=p_salesperson_id AND p.module_id=m.id
  WHERE tm.track_key='sales' AND m.active=true AND m.slug='product-training'
  ORDER BY tm.sort_order DESC
  LIMIT 1;

  v_product_passed:=v_product_progress_id IS NOT NULL
    AND v_product_status IN ('Passed','Completed')
    AND coalesce(v_product_score,0)>=coalesce(v_product_passing,0);

  SELECT f.progress_id,s.id,s.status,s.score,coalesce(m.passing_score,90),
         coalesce(s.critical_failures,'[]'::jsonb),
         coalesce(f.judgment_passed,false),coalesce(f.judgment_critical_misses,0),
         coalesce(f.sandbox_snapshot,'{}'::jsonb),
         coalesce(s.seller_brief_snapshot,'{}'::jsonb),
         coalesce(s.evaluator_brief_snapshot,'{}'::jsonb)
  INTO v_final_progress_id,v_final_session_id,v_final_status,v_final_score,v_final_passing,
       v_final_failures,v_judgment_passed,v_judgment_critical_misses,
       v_sandbox,v_seller_brief,v_evaluator_brief
  FROM public.final_certification_state f
  JOIN public.training_modules m ON m.id=f.module_id
  LEFT JOIN LATERAL(
    SELECT fs.*
    FROM public.final_certification_sessions fs
    WHERE fs.progress_id=f.progress_id AND fs.trainee_id=p_salesperson_id
    ORDER BY fs.evaluated_at DESC NULLS LAST,fs.created_at DESC,fs.id DESC
    LIMIT 1
  ) s ON true
  WHERE f.user_id=p_salesperson_id
    AND m.academy_key='sales'
    AND m.slug='final-certification'
    AND m.active=true
  ORDER BY f.updated_at DESC,f.progress_id
  LIMIT 1;

  v_final_passed:=v_final_progress_id IS NOT NULL
    AND v_final_session_id IS NOT NULL
    AND v_final_status='passed'
    AND coalesce(v_final_score,0)>=coalesce(v_final_passing,90)
    AND jsonb_array_length(coalesce(v_final_failures,'[]'::jsonb))=0
    AND v_judgment_passed=true
    AND coalesce(v_judgment_critical_misses,0)=0;

  SELECT EXISTS(
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id=p_salesperson_id
      AND lower(coalesce(up.email,'')) LIKE '%.test'
  )
  OR EXISTS(
    SELECT 1 FROM public.applicants a
    WHERE a.linked_user_id=p_salesperson_id
      AND (
        lower(coalesce(a.source,'')) LIKE '%synthetic%'
        OR upper(coalesce(a.application_reference,'')) LIKE 'TEST-%'
        OR lower(coalesce(a.application_answers->>'testAccount','false'))='true'
        OR coalesce(a.application_answers::text,'') ILIKE '%PROFOX_TEST%'
      )
  )
  OR lower(coalesce(v_sandbox->>'testAccount','false'))='true'
  OR lower(coalesce(v_seller_brief->>'testAccount','false'))='true'
  OR lower(coalesce(v_evaluator_brief->>'testAccount','false'))='true'
  OR coalesce(v_sandbox::text,'') ILIKE '%PROFOX_TEST%'
  OR coalesce(v_seller_brief::text,'') ILIKE '%PROFOX_TEST%'
  OR coalesce(v_evaluator_brief::text,'') ILIKE '%PROFOX_TEST%'
  INTO v_synthetic;

  IF NOT v_academy_ready THEN
    v_blockers:=v_blockers||jsonb_build_array('Sales Academy readiness is not currently verified.');
  END IF;
  IF NOT v_product_passed THEN
    v_blockers:=v_blockers||jsonb_build_array('Product & Package Training is not authoritatively passed.');
  END IF;
  IF NOT v_final_passed THEN
    v_blockers:=v_blockers||jsonb_build_array('Final Certification is not authoritatively passed with zero unresolved critical failures.');
  END IF;
  IF v_synthetic THEN
    v_blockers:=v_blockers||jsonb_build_array('Canonical evidence is tagged as synthetic/test evidence and cannot create production commercial authority.');
  END IF;

  RETURN jsonb_build_object(
    'grantEligible',v_academy_ready AND v_product_passed AND v_final_passed AND NOT v_synthetic,
    'academyReady',v_academy_ready,
    'productTrainingPassed',v_product_passed,
    'productTrainingModuleId',v_product_module_id,
    'productTrainingProgressId',v_product_progress_id,
    'productTrainingScore',v_product_score,
    'finalCertificationPassed',v_final_passed,
    'finalCertificationProgressId',v_final_progress_id,
    'finalCertificationSessionId',v_final_session_id,
    'finalCertificationScore',v_final_score,
    'criticalFailures',coalesce(v_final_failures,'[]'::jsonb),
    'judgmentCriticalMisses',coalesce(v_judgment_critical_misses,0),
    'syntheticEvidenceDetected',v_synthetic,
    'blockers',v_blockers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_certification_authoritative_evidence(uuid) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION public.validate_sales_certification_deal_permission_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_value jsonb:=new.config_value;
  v_code text;
  v_rule jsonb;
  v_text text;
  v_behavior text;
  v_mode text;
  v_cert text;
  v_active boolean;
  v_type text;
  v_pipeline jsonb;
  v_allowed_certifications text[]:=ARRAY[
    'LAUNCH_CERTIFIED',
    'GROWTH_CERTIFIED',
    'SCALE_CERTIFIED',
    'CUSTOM_QUALIFICATION_CERTIFIED'
  ];
  v_allowed_modes text[]:=ARRAY['INDEPENDENT','SUPERVISED','QUALIFY_ONLY','BLOCKED'];
  v_allowed_addon_behaviors text[]:=ARRAY[
    'INHERIT_BASE_PACKAGE',
    'REQUIRE_GROWTH',
    'REQUIRE_SCALE',
    'REQUIRE_SPECIALIST_VALIDATION',
    'CUSTOM_QUALIFICATION_ONLY'
  ];
BEGIN
  IF new.config_key<>'crm_sales_certification_deal_permission_policy_v1' THEN
    RETURN new;
  END IF;

  IF jsonb_typeof(v_value)<>'object'
     OR v_value->>'policyKey' IS DISTINCT FROM 'crm_sales_certification_deal_permission_policy_v1'
     OR nullif(v_value->>'schemaVersion','')::integer IS DISTINCT FROM 2
     OR coalesce(nullif(v_value->>'policyVersion','')::integer,0)<1 THEN
    RAISE EXCEPTION 'Invalid Part 16 certification/deal-permission policy identity or schema version.';
  END IF;

  IF jsonb_typeof(coalesce(v_value->'productRules','{}'::jsonb))<>'object'
     OR jsonb_typeof(coalesce(v_value->'addonRules','{}'::jsonb))<>'object'
     OR jsonb_typeof(coalesce(v_value->'protectedCommitmentStages','[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'Part 16 productRules/addonRules/protectedCommitmentStages have invalid shapes.';
  END IF;

  FOR v_code,v_rule IN
    SELECT key,value FROM jsonb_each(coalesce(v_value->'productRules','{}'::jsonb))
  LOOP
    SELECT p.active,lower(coalesce(p.product_type,'')) INTO v_active,v_type
    FROM public.sales_products p
    WHERE p.code=v_code;

    IF NOT FOUND OR v_active IS DISTINCT FROM true OR v_type NOT IN ('package','discovery') THEN
      RAISE EXCEPTION 'Part 16 product rule % must reference an active canonical package/discovery code.',v_code;
    END IF;
    IF v_type='discovery' AND v_code<>'PF-DISCOVERY' THEN
      RAISE EXCEPTION 'Part 16 discovery policy is approved only for PF-DISCOVERY; found %.',v_code;
    END IF;
    IF jsonb_typeof(v_rule)<>'object' THEN
      RAISE EXCEPTION 'Part 16 product rule % must be an object.',v_code;
    END IF;

    v_cert:=nullif(v_rule->>'requiredCertificationKey','');
    v_mode:=nullif(v_rule->>'permissionMode','');
    IF v_cert IS NULL OR NOT (v_cert=ANY(v_allowed_certifications)) THEN
      RAISE EXCEPTION 'Part 16 product rule % has an invalid requiredCertificationKey.',v_code;
    END IF;
    IF v_mode IS NULL OR NOT (v_mode=ANY(v_allowed_modes)) THEN
      RAISE EXCEPTION 'Part 16 product rule % has an invalid permissionMode.',v_code;
    END IF;
    IF jsonb_typeof(coalesce(v_rule->'inheritedCertificationKeys','[]'::jsonb))<>'array' THEN
      RAISE EXCEPTION 'Part 16 product rule % inheritedCertificationKeys must be an array.',v_code;
    END IF;
    FOR v_text IN SELECT jsonb_array_elements_text(coalesce(v_rule->'inheritedCertificationKeys','[]'::jsonb))
    LOOP
      IF NOT (v_text=ANY(v_allowed_certifications)) THEN
        RAISE EXCEPTION 'Part 16 product rule % contains invalid inherited certification key %.',v_code,v_text;
      END IF;
    END LOOP;
    IF nullif(btrim(coalesce(v_rule->>'remediation','')),'') IS NULL
       OR nullif(btrim(coalesce(v_rule->>'recommendedAction','')),'') IS NULL THEN
      RAISE EXCEPTION 'Part 16 product rule % requires exact remediation and recommendedAction.',v_code;
    END IF;

    PERFORM coalesce((v_rule->>'validationRequired')::boolean,false);
    PERFORM coalesce((v_rule->>'managerReviewRequired')::boolean,false);
    PERFORM coalesce((v_rule->>'escalationRequired')::boolean,false);

    IF v_code='PF-CUSTOM'
       AND (
         v_cert<>'CUSTOM_QUALIFICATION_CERTIFIED'
         OR v_mode<>'QUALIFY_ONLY'
         OR coalesce((v_rule->>'validationRequired')::boolean,false) IS DISTINCT FROM true
       ) THEN
      RAISE EXCEPTION 'PF-CUSTOM may only use CUSTOM_QUALIFICATION_CERTIFIED with QUALIFY_ONLY and required Sales Validation.';
    END IF;

    IF v_code='PF-WEB-SCALE'
       AND (
         v_cert<>'SCALE_CERTIFIED'
         OR v_mode<>'SUPERVISED'
         OR coalesce((v_rule->>'escalationRequired')::boolean,false) IS DISTINCT FROM true
       ) THEN
      RAISE EXCEPTION 'PF-WEB-SCALE must remain SCALE_CERTIFIED + SUPERVISED with explicit escalation preserved.';
    END IF;

    IF v_code='PF-DISCOVERY'
       AND (v_type<>'discovery' OR v_cert<>'GROWTH_CERTIFIED' OR v_mode<>'SUPERVISED') THEN
      RAISE EXCEPTION 'PF-DISCOVERY must remain the canonical discovery product with GROWTH_CERTIFIED + SUPERVISED authority.';
    END IF;

    IF v_rule ? 'grantValidityDays'
       AND (v_rule->>'grantValidityDays')::integer<1 THEN
      RAISE EXCEPTION 'Part 16 product rule % grantValidityDays must be positive when configured.',v_code;
    END IF;
  END LOOP;

  FOR v_code,v_rule IN
    SELECT key,value FROM jsonb_each(coalesce(v_value->'addonRules','{}'::jsonb))
  LOOP
    SELECT p.active,lower(coalesce(p.product_type,'')) INTO v_active,v_type
    FROM public.sales_products p
    WHERE p.code=v_code;

    IF NOT FOUND OR v_active IS DISTINCT FROM true OR v_type<>'addon' THEN
      RAISE EXCEPTION 'Part 16 add-on rule % must reference an active canonical add-on code.',v_code;
    END IF;
    IF jsonb_typeof(v_rule)<>'object' THEN
      RAISE EXCEPTION 'Part 16 add-on rule % must be an object.',v_code;
    END IF;

    v_behavior:=nullif(v_rule->>'behavior','');
    v_mode:=coalesce(nullif(v_rule->>'permissionMode',''),'SUPERVISED');
    IF v_behavior IS NULL OR NOT (v_behavior=ANY(v_allowed_addon_behaviors)) THEN
      RAISE EXCEPTION 'Part 16 add-on rule % has an invalid behavior.',v_code;
    END IF;
    IF NOT (v_mode=ANY(v_allowed_modes)) THEN
      RAISE EXCEPTION 'Part 16 add-on rule % has an invalid permissionMode.',v_code;
    END IF;
    IF nullif(btrim(coalesce(v_rule->>'remediation','')),'') IS NULL
       OR nullif(btrim(coalesce(v_rule->>'recommendedAction','')),'') IS NULL THEN
      RAISE EXCEPTION 'Part 16 add-on rule % requires exact remediation and recommendedAction.',v_code;
    END IF;

    IF v_behavior='REQUIRE_GROWTH'
       AND v_rule->>'requiredCertificationKey' IS DISTINCT FROM 'GROWTH_CERTIFIED' THEN
      RAISE EXCEPTION 'Part 16 add-on % REQUIRE_GROWTH must use GROWTH_CERTIFIED.',v_code;
    ELSIF v_behavior='REQUIRE_SCALE'
       AND v_rule->>'requiredCertificationKey' IS DISTINCT FROM 'SCALE_CERTIFIED' THEN
      RAISE EXCEPTION 'Part 16 add-on % REQUIRE_SCALE must use SCALE_CERTIFIED.',v_code;
    ELSIF v_behavior='CUSTOM_QUALIFICATION_ONLY'
       AND (
         v_rule->>'requiredCertificationKey' IS DISTINCT FROM 'CUSTOM_QUALIFICATION_CERTIFIED'
         OR v_mode<>'QUALIFY_ONLY'
         OR coalesce((v_rule->>'validationRequired')::boolean,false) IS DISTINCT FROM true
       ) THEN
      RAISE EXCEPTION 'Part 16 add-on % CUSTOM_QUALIFICATION_ONLY must remain qualify-only with Sales Validation.',v_code;
    ELSIF v_behavior='REQUIRE_SPECIALIST_VALIDATION'
       AND coalesce((v_rule->>'validationRequired')::boolean,false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Part 16 add-on % specialist-validation behavior must require Sales Validation.',v_code;
    END IF;
  END LOOP;

  SELECT config_value INTO v_pipeline
  FROM public.system_configuration
  WHERE config_key='crm_pipeline_settings';

  FOR v_text IN SELECT jsonb_array_elements_text(coalesce(v_value->'protectedCommitmentStages','[]'::jsonb))
  LOOP
    IF NOT EXISTS(
      SELECT 1
      FROM jsonb_array_elements(coalesce(v_pipeline->'stages','[]'::jsonb)) s
      WHERE s->>'name'=v_text AND coalesce((s->>'active')::boolean,false)=true
    ) THEN
      RAISE EXCEPTION 'Part 16 protected pipeline stage % is not an active canonical CRM stage.',v_text;
    END IF;
  END LOOP;

  IF coalesce((v_value->>'criteriaApproved')::boolean,false)
     OR coalesce((v_value->>'grantingActive')::boolean,false)
     OR coalesce((v_value->>'enforcementActive')::boolean,false) THEN
    IF coalesce((v_value->>'criteriaApproved')::boolean,false) IS DISTINCT FROM true
       OR coalesce(nullif(v_value->>'criteriaVersion','')::integer,0)<1
       OR nullif(v_value->>'criteriaApprovedAt','') IS NULL THEN
      RAISE EXCEPTION 'Part 16 granting/enforcement cannot activate before explicit criteria are approved and versioned.';
    END IF;

    IF EXISTS(
      SELECT 1 FROM public.sales_products p
      WHERE p.active=true AND lower(coalesce(p.product_type,''))='package'
        AND NOT (coalesce(v_value->'productRules','{}'::jsonb) ? p.code)
    ) THEN
      RAISE EXCEPTION 'Part 16 approval requires an explicit rule for every active package.';
    END IF;

    IF EXISTS(
      SELECT 1 FROM public.sales_products p
      WHERE p.active=true AND lower(coalesce(p.product_type,''))='addon'
        AND NOT (coalesce(v_value->'addonRules','{}'::jsonb) ? p.code)
    ) THEN
      RAISE EXCEPTION 'Part 16 approval requires an explicit complexity rule for every active add-on.';
    END IF;

    IF NOT EXISTS(
      SELECT 1 FROM public.sales_products p
      WHERE p.active=true AND p.code='PF-DISCOVERY'
        AND lower(coalesce(p.product_type,''))='discovery'
        AND (coalesce(v_value->'productRules','{}'::jsonb) ? 'PF-DISCOVERY')
    ) THEN
      RAISE EXCEPTION 'Part 16 approval requires the explicit PF-DISCOVERY discovery rule.';
    END IF;

    IF EXISTS(
      SELECT 1 FROM public.sales_products p
      WHERE p.active=true AND lower(coalesce(p.product_type,''))='discovery' AND p.code<>'PF-DISCOVERY'
    ) THEN
      RAISE EXCEPTION 'Part 16 approval found an unclassified active discovery product.';
    END IF;
  END IF;

  IF coalesce((v_value->>'enforcementActive')::boolean,false) THEN
    IF coalesce((v_value->>'grantingActive')::boolean,false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Part 16 enforcement cannot activate while grant issuance is disabled.';
    END IF;
    IF jsonb_array_length(coalesce(v_value->'protectedCommitmentStages','[]'::jsonb))=0 THEN
      RAISE EXCEPTION 'Part 16 enforcement requires at least one explicit protected pipeline commitment stage.';
    END IF;
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_sales_certification_deal_permission_policy() FROM PUBLIC,anon,authenticated;



CREATE OR REPLACE FUNCTION public.sales_get_certification_permission_snapshot(p_salesperson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_policy jsonb:=public.sales_certification_policy();
  v_general_ready boolean:=false;
  v_final jsonb:='{}'::jsonb;
  v_products jsonb:='[]'::jsonb;
  v_certifications jsonb:='[]'::jsonb;
  v_authoritative_evidence jsonb:='{}'::jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF NOT public.is_admin() AND v_actor IS DISTINCT FROM p_salesperson_id THEN
    RAISE EXCEPTION 'You can only view your own Sales certification permissions.';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_profiles up
    WHERE up.id=p_salesperson_id
      AND up.status='active'
      AND up.role IN ('sales','sales_rep','sales_team')
  ) THEN
    RAISE EXCEPTION 'Active Sales access is required.';
  END IF;

  v_general_ready:=public.sales_certification_general_ready(p_salesperson_id);
  v_authoritative_evidence:=public.sales_certification_authoritative_evidence(p_salesperson_id);

  SELECT coalesce(jsonb_build_object(
      'sessionId',s.id,
      'status',s.status,
      'score',s.score,
      'evaluatedAt',s.evaluated_at,
      'passed',s.status='passed' AND coalesce(s.score,0)>=coalesce(m.passing_score,90)
        AND jsonb_array_length(coalesce(s.critical_failures,'[]'::jsonb))=0
    ),'{}'::jsonb)
  INTO v_final
  FROM public.training_modules m
  JOIN public.user_training_progress p
    ON p.module_id=m.id AND p.user_id=p_salesperson_id
  LEFT JOIN LATERAL(
    SELECT fs.*
    FROM public.final_certification_sessions fs
    WHERE fs.progress_id=p.id
    ORDER BY fs.evaluated_at DESC NULLS LAST,fs.created_at DESC,fs.id DESC
    LIMIT 1
  ) s ON true
  WHERE m.academy_key='sales' AND m.slug='final-certification' AND m.active=true
  ORDER BY m.sort_order DESC
  LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'grantId',g.id,
      'certificationKey',g.certification_key,
      'productId',g.sales_product_id,
      'productCode',g.product_code_snapshot,
      'authorityMode',g.authority_mode,
      'status',public.sales_certification_grant_effective_status(g.grant_state,g.expires_at,g.revoked_at),
      'grantedAt',g.granted_at,
      'expiresAt',g.expires_at,
      'policyVersion',g.policy_version
    ) ORDER BY g.granted_at DESC,g.id DESC),'[]'::jsonb)
  INTO v_certifications
  FROM public.sales_certification_package_grants g
  WHERE g.salesperson_id=p_salesperson_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'productId',sp.id,
      'productCode',sp.code,
      'productName',sp.name,
      'productType',sp.product_type,
      'active',sp.active,
      'requiredCertification',v_policy#>>ARRAY['productRules',sp.code,'requiredCertificationKey'],
      'configuredPermissionMode',v_policy#>>ARRAY['productRules',sp.code,'permissionMode'],
      'grantId',g.id,
      'certificationKey',g.certification_key,
      'grantStatus',CASE
        WHEN g.id IS NULL THEN 'NOT_GRANTED'
        ELSE public.sales_certification_grant_effective_status(g.grant_state,g.expires_at,g.revoked_at)
      END,
      'authorityMode',g.authority_mode,
      'evidenceType',g.evidence_type,
      'grantedAt',g.granted_at,
      'expiresAt',g.expires_at,
      'policyVersion',g.policy_version
    ) ORDER BY sp.sort_order,sp.code),'[]'::jsonb)
  INTO v_products
  FROM public.sales_products sp
  LEFT JOIN LATERAL(
    SELECT x.*
    FROM public.sales_certification_package_grants x
    WHERE x.sales_product_id=sp.id
      AND x.salesperson_id=p_salesperson_id
    ORDER BY
      CASE public.sales_certification_grant_effective_status(x.grant_state,x.expires_at,x.revoked_at)
        WHEN 'ACTIVE' THEN 0 WHEN 'SUSPENDED' THEN 1 WHEN 'PENDING' THEN 2 WHEN 'EXPIRED' THEN 3 ELSE 4 END,
      x.granted_at DESC,x.id DESC
    LIMIT 1
  ) g ON true
  WHERE sp.active=true AND lower(coalesce(sp.product_type,'')) IN ('package','discovery');

  RETURN jsonb_build_object(
    'policyKey',v_policy->>'policyKey',
    'schemaVersion',v_policy->'schemaVersion',
    'policyVersion',v_policy->'policyVersion',
    'grantingActive',coalesce((v_policy->>'grantingActive')::boolean,false),
    'enforcementActive',coalesce((v_policy->>'enforcementActive')::boolean,false),
    'criteriaApproved',coalesce((v_policy->>'criteriaApproved')::boolean,false),
    'rolloutState',coalesce(v_policy->>'rolloutState','STAGED_POLICY_REQUIRED'),
    'rolloutReason',v_policy->>'rolloutReason',
    'salespersonId',p_salesperson_id,
    'generalCertificationReady',v_general_ready,
    'authoritativeGrantEvidenceReady',coalesce((v_authoritative_evidence->>'grantEligible')::boolean,false),
    'authoritativeEvidence',v_authoritative_evidence,
    'finalCertification',coalesce(v_final,'{}'::jsonb),
    'certifications',v_certifications,
    'products',v_products
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_get_certification_permission_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_get_certification_permission_snapshot(uuid) TO authenticated;



CREATE OR REPLACE FUNCTION public.admin_grant_sales_package_certification(
  p_salesperson_id uuid,
  p_sales_product_id uuid,
  p_authority_mode text,
  p_evidence_type text,
  p_evidence jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_policy jsonb:=public.sales_certification_policy();
  v_product public.sales_products%rowtype;
  v_rule jsonb;
  v_certification_key text;
  v_policy_mode text;
  v_validity_days integer;
  v_grant public.sales_certification_package_grants%rowtype;
  v_authoritative jsonb:='{}'::jsonb;
  v_note text;
  v_prerequisite text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF coalesce((v_policy->>'grantingActive')::boolean,false) IS DISTINCT FROM true
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Part 16 package certification granting is staged until explicit package criteria are Management-approved.';
  END IF;
  IF nullif(btrim(coalesce(p_evidence_type,'')),'') IS NULL
     OR p_evidence IS NULL
     OR jsonb_typeof(p_evidence)<>'object'
     OR nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Evidence type, evidence object and grant reason are required.';
  END IF;
  IF NOT public.sales_certification_general_ready(p_salesperson_id) THEN
    RAISE EXCEPTION 'General Sales Academy and Final Certification must be genuinely passed before a package grant can be issued.';
  END IF;

  v_authoritative:=public.sales_certification_authoritative_evidence(p_salesperson_id);
  IF coalesce((v_authoritative->>'grantEligible')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Authoritative production certification evidence is required; synthetic/test-tagged evidence cannot create commercial authority. Blockers: %',coalesce(v_authoritative->'blockers','[]'::jsonb)::text;
  END IF;

  IF p_evidence->>'productTrainingProgressId' IS DISTINCT FROM v_authoritative->>'productTrainingProgressId'
     OR p_evidence->>'finalCertificationProgressId' IS DISTINCT FROM v_authoritative->>'finalCertificationProgressId'
     OR p_evidence->>'finalCertificationSessionId' IS DISTINCT FROM v_authoritative->>'finalCertificationSessionId' THEN
    RAISE EXCEPTION 'Grant evidence must reference the current canonical Product Training and Final Certification records.';
  END IF;

  SELECT * INTO v_product
  FROM public.sales_products
  WHERE id=p_sales_product_id
    AND active=true
    AND lower(coalesce(product_type,''))='package';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active canonical Sales package is required.';
  END IF;

  v_rule:=v_policy->'productRules'->v_product.code;
  IF v_rule IS NULL THEN
    RAISE EXCEPTION 'No approved Part 16 certification rule exists for package %.',v_product.code;
  END IF;

  v_certification_key:=nullif(v_rule->>'requiredCertificationKey','');
  v_policy_mode:=nullif(v_rule->>'permissionMode','');
  IF v_policy_mode='BLOCKED' THEN
    RAISE EXCEPTION 'Package % is policy-blocked and cannot receive an authority grant.',v_product.code;
  END IF;
  IF p_authority_mode IS DISTINCT FROM v_policy_mode THEN
    RAISE EXCEPTION 'Grant authority mode must match the current approved policy mode %.',v_policy_mode;
  END IF;

  v_note:=nullif(btrim(coalesce(p_evidence->>'note','')),'');
  IF v_certification_key='GROWTH_CERTIFIED' THEN
    v_prerequisite:='LAUNCH_CERTIFIED';
  ELSIF v_certification_key='SCALE_CERTIFIED' THEN
    v_prerequisite:='GROWTH_CERTIFIED';
  END IF;

  IF v_prerequisite IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.sales_certification_package_grants g
    WHERE g.salesperson_id=p_salesperson_id
      AND g.certification_key=v_prerequisite
      AND public.sales_certification_grant_effective_status(g.grant_state,g.expires_at,g.revoked_at)='ACTIVE'
  ) THEN
    RAISE EXCEPTION '% requires an active % prerequisite grant; inheritance never auto-issues certification.',v_certification_key,v_prerequisite;
  END IF;

  IF v_certification_key IN ('GROWTH_CERTIFIED','SCALE_CERTIFIED','CUSTOM_QUALIFICATION_CERTIFIED')
     AND (v_note IS NULL OR char_length(v_note)<20) THEN
    RAISE EXCEPTION '% requires explicit Admin-reviewed practical/advanced evidence in the grant note.',v_certification_key;
  END IF;

  IF v_certification_key='CUSTOM_QUALIFICATION_CERTIFIED'
     AND lower(coalesce(p_evidence->>'qualificationBoundaryConfirmed','false'))<>'true' THEN
    RAISE EXCEPTION 'Custom Qualification grant requires Admin confirmation of the qualification-versus-technical-commitment boundary.';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.sales_certification_package_grants g
    WHERE g.salesperson_id=p_salesperson_id
      AND g.sales_product_id=p_sales_product_id
      AND g.revoked_at IS NULL
      AND public.sales_certification_grant_effective_status(g.grant_state,g.expires_at,g.revoked_at) IN ('ACTIVE','PENDING','SUSPENDED')
  ) THEN
    RAISE EXCEPTION 'This Seller already has a non-revoked package certification grant. Revoke it before issuing a replacement.';
  END IF;

  v_validity_days:=CASE
    WHEN v_rule ? 'grantValidityDays' THEN (v_rule->>'grantValidityDays')::integer
    ELSE NULL
  END;

  INSERT INTO public.sales_certification_package_grants(
    salesperson_id,sales_product_id,product_code_snapshot,certification_key,authority_mode,
    grant_state,expires_at,evidence_type,evidence,grant_reason,policy_version,granted_by
  )
  VALUES(
    p_salesperson_id,p_sales_product_id,v_product.code,v_certification_key,v_policy_mode,
    'ACTIVE',CASE WHEN v_validity_days IS NULL THEN NULL ELSE now()+make_interval(days=>v_validity_days) END,
    btrim(p_evidence_type),p_evidence,btrim(p_reason),
    (v_policy->>'policyVersion')::integer,v_actor
  )
  RETURNING * INTO v_grant;

  RETURN jsonb_build_object(
    'grantId',v_grant.id,
    'salespersonId',v_grant.salesperson_id,
    'productId',v_grant.sales_product_id,
    'productCode',v_grant.product_code_snapshot,
    'certificationKey',v_grant.certification_key,
    'authorityMode',v_grant.authority_mode,
    'grantStatus',public.sales_certification_grant_effective_status(v_grant.grant_state,v_grant.expires_at,v_grant.revoked_at),
    'expiresAt',v_grant.expires_at,
    'grantedAt',v_grant.granted_at,
    'policyVersion',v_grant.policy_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_sales_package_certification(uuid,uuid,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_sales_package_certification(uuid,uuid,text,text,jsonb,text) TO authenticated;



CREATE OR REPLACE FUNCTION public.crm_get_sales_certification_deal_permission(
  p_salesperson_id uuid DEFAULT NULL,
  p_product_code text DEFAULT NULL,
  p_opportunity_id uuid DEFAULT NULL,
  p_quotation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_policy jsonb:=public.sales_certification_policy();
  v_enforced boolean:=coalesce((v_policy->>'enforcementActive')::boolean,false);
  v_salesperson_id uuid:=p_salesperson_id;
  v_opportunity_id uuid:=p_opportunity_id;
  v_q public.quotations%rowtype;
  v_package_fit jsonb;
  v_code text;
  v_base_package_code text;
  v_codes text[]:=ARRAY[]::text[];
  v_product public.sales_products%rowtype;
  v_rule jsonb;
  v_base_rule jsonb;
  v_behavior text;
  v_required_cert text;
  v_mode text;
  v_accepted_keys text[]:=ARRAY[]::text[];
  v_general_ready boolean:=false;
  v_has_cert boolean:=false;
  v_validation_required boolean:=false;
  v_manager_required boolean:=false;
  v_escalation_required boolean:=false;
  v_validation_satisfied boolean:=false;
  v_supervision_satisfied boolean:=false;
  v_item_allowed boolean:=false;
  v_item_can_draft boolean:=false;
  v_item_can_send boolean:=false;
  v_overall_allowed boolean:=true;
  v_can_draft boolean:=true;
  v_can_send boolean:=true;
  v_any_supervision boolean:=false;
  v_any_validation boolean:=false;
  v_any_manager boolean:=false;
  v_status text:='INDEPENDENT';
  v_permission_mode text:='INDEPENDENT';
  v_required_top text;
  v_product_name_top text;
  v_recommended_action text;
  v_item_permissions jsonb:='[]'::jsonb;
  v_blockers jsonb:='[]'::jsonb;
  v_reasons jsonb:='[]'::jsonb;
  v_certifications jsonb:='[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_quotation_id IS NOT NULL THEN
    SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found.'; END IF;
    IF v_salesperson_id IS NOT NULL AND v_salesperson_id IS DISTINCT FROM v_q.salesperson_id THEN
      RAISE EXCEPTION 'Salesperson does not match quotation ownership.';
    END IF;
    v_salesperson_id:=v_q.salesperson_id;
    v_opportunity_id:=coalesce(v_opportunity_id,v_q.opportunity_id);

    SELECT qi.product_code_snapshot INTO v_base_package_code
    FROM public.quotation_items qi
    JOIN public.sales_products sp ON sp.id=qi.sales_product_id
    WHERE qi.quotation_id=p_quotation_id
      AND sp.active=true
      AND lower(coalesce(sp.product_type,''))='package'
      AND nullif(btrim(coalesce(qi.product_code_snapshot,'')),'') IS NOT NULL
    ORDER BY qi.sort_order,qi.created_at,qi.id
    LIMIT 1;

    SELECT coalesce(array_agg(DISTINCT qi.product_code_snapshot ORDER BY qi.product_code_snapshot),ARRAY[]::text[])
    INTO v_codes
    FROM public.quotation_items qi
    JOIN public.sales_products sp ON sp.id=qi.sales_product_id
    WHERE qi.quotation_id=p_quotation_id
      AND sp.active=true
      AND lower(coalesce(sp.product_type,'')) IN ('package','addon','discovery')
      AND nullif(btrim(coalesce(qi.product_code_snapshot,'')),'') IS NOT NULL;
  END IF;

  IF v_opportunity_id IS NOT NULL THEN
    IF NOT EXISTS(
      SELECT 1 FROM public.crm_opportunities o
      WHERE o.id=v_opportunity_id
        AND (v_salesperson_id IS NULL OR o.salesperson_id=v_salesperson_id)
    ) THEN
      RAISE EXCEPTION 'Opportunity does not match Sales ownership.';
    END IF;
    SELECT o.salesperson_id INTO v_salesperson_id
    FROM public.crm_opportunities o
    WHERE o.id=v_opportunity_id;
  END IF;

  IF v_salesperson_id IS NULL THEN
    v_salesperson_id:=v_actor;
  END IF;

  IF NOT public.is_admin() AND v_actor IS DISTINCT FROM v_salesperson_id THEN
    RAISE EXCEPTION 'You can only evaluate your own Sales certification deal permission.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.user_profiles up
    WHERE up.id=v_salesperson_id
      AND up.status='active'
      AND up.role IN ('sales','sales_rep','sales_team')
  ) THEN
    RETURN jsonb_build_object(
      'policyKey',v_policy->>'policyKey',
      'policyVersion',v_policy->'policyVersion',
      'enforcementActive',v_enforced,
      'salespersonId',v_salesperson_id,
      'status','BLOCKED',
      'permissionMode','BLOCKED',
      'allowed',false,
      'canDraft',false,
      'canSend',false,
      'supervisionRequired',false,
      'validationRequired',false,
      'managerReviewRequired',false,
      'reasons',jsonb_build_array('Inactive or non-Sales users do not receive active deal authority.'),
      'recommendedAction','Use an active authorized Sales identity or route the deal to Management.',
      'blockers',jsonb_build_array(jsonb_build_object('code','ACTIVE_SALES_REQUIRED','message','Active Sales access is required.'))
    );
  END IF;

  IF p_product_code IS NOT NULL AND nullif(btrim(p_product_code),'') IS NOT NULL
     AND NOT (btrim(p_product_code)=ANY(v_codes)) THEN
    v_codes:=array_append(v_codes,btrim(p_product_code));
  END IF;

  IF cardinality(v_codes)=0 AND v_opportunity_id IS NOT NULL THEN
    BEGIN
      v_package_fit:=public.crm_get_package_fit_assessment(NULL,v_opportunity_id);
      v_code:=nullif(v_package_fit#>>'{recommendedProduct,code}','');
      IF v_code IS NOT NULL THEN
        v_codes:=ARRAY[v_code];
        v_base_package_code:=v_code;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_package_fit:=NULL;
    END;
  END IF;

  v_general_ready:=public.sales_certification_general_ready(v_salesperson_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'grantId',g.id,
    'certificationKey',g.certification_key,
    'productCode',g.product_code_snapshot,
    'authorityMode',g.authority_mode,
    'status',public.sales_certification_grant_effective_status(g.grant_state,g.expires_at,g.revoked_at),
    'expiresAt',g.expires_at,
    'policyVersion',g.policy_version
  ) ORDER BY g.granted_at DESC,g.id DESC),'[]'::jsonb)
  INTO v_certifications
  FROM public.sales_certification_package_grants g
  WHERE g.salesperson_id=v_salesperson_id;

  IF NOT v_general_ready THEN
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','GENERAL_CERTIFICATION_NOT_READY',
      'message','General Sales Academy and Final Certification are not currently verified as passed.'
    ));
    v_reasons:=v_reasons||jsonb_build_array('General Sales Academy and Final Certification are required before independent package authority.');
  END IF;

  IF NOT v_enforced THEN
    v_rule:=NULL;
    v_required_top:=NULL;
    v_mode:=NULL;
    IF cardinality(v_codes)=1 THEN
      SELECT * INTO v_product FROM public.sales_products p WHERE p.code=v_codes[1] AND p.active=true;
      IF FOUND AND lower(coalesce(v_product.product_type,'')) IN ('package','discovery') THEN
        v_rule:=v_policy->'productRules'->v_codes[1];
        v_required_top:=v_rule->>'requiredCertificationKey';
        v_mode:=v_rule->>'permissionMode';
      ELSIF FOUND AND lower(coalesce(v_product.product_type,''))='addon' THEN
        v_rule:=v_policy->'addonRules'->v_codes[1];
        v_behavior:=v_rule->>'behavior';
        IF v_behavior='INHERIT_BASE_PACKAGE' THEN
          v_base_rule:=v_policy->'productRules'->v_base_package_code;
          v_required_top:=v_base_rule->>'requiredCertificationKey';
          v_mode:=v_base_rule->>'permissionMode';
        ELSIF v_behavior='REQUIRE_GROWTH' THEN
          v_required_top:='GROWTH_CERTIFIED'; v_mode:=coalesce(v_rule->>'permissionMode','INDEPENDENT');
        ELSIF v_behavior='REQUIRE_SCALE' THEN
          v_required_top:='SCALE_CERTIFIED'; v_mode:=coalesce(v_rule->>'permissionMode','SUPERVISED');
        ELSIF v_behavior='CUSTOM_QUALIFICATION_ONLY' THEN
          v_required_top:='CUSTOM_QUALIFICATION_CERTIFIED'; v_mode:='QUALIFY_ONLY';
        ELSE
          v_required_top:=nullif(v_rule->>'requiredCertificationKey','');
          v_mode:=coalesce(v_rule->>'permissionMode','INDEPENDENT');
        END IF;
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'policyKey',v_policy->>'policyKey',
      'schemaVersion',v_policy->'schemaVersion',
      'policyVersion',v_policy->'policyVersion',
      'enforcementActive',false,
      'criteriaApproved',coalesce((v_policy->>'criteriaApproved')::boolean,false),
      'rolloutState',v_policy->>'rolloutState',
      'salespersonId',v_salesperson_id,
      'opportunityId',v_opportunity_id,
      'quotationId',p_quotation_id,
      'productCode',CASE WHEN cardinality(v_codes)=1 THEN v_codes[1] ELSE v_base_package_code END,
      'productName',(SELECT p.name FROM public.sales_products p WHERE p.code=coalesce(v_base_package_code,CASE WHEN cardinality(v_codes)=1 THEN v_codes[1] END)),
      'requiredCertification',v_required_top,
      'prospectivePermissionMode',coalesce(v_mode,'BLOCKED'),
      'permissionMode','STAGED_NOT_ENFORCED',
      'status','STAGED_NOT_ENFORCED',
      'allowed',true,
      'canDraft',true,
      'canSend',true,
      'supervisionRequired',false,
      'validationRequired',false,
      'managerReviewRequired',false,
      'packageCodes',to_jsonb(v_codes),
      'itemPermissions','[]'::jsonb,
      'certifications',v_certifications,
      'generalCertificationReady',v_general_ready,
      'reasons',jsonb_build_array('The Product Owner-approved Part 16 policy is loaded with enforcement staged off. Current deal authority is unchanged until authoritative Launch certification evidence permits final activation.'),
      'recommendedAction','Continue using existing CRM, Package Fit, Validation, quotation approval and Part 10B controls while the current Seller obtains authoritative non-test Launch certification evidence.',
      'blockers','[]'::jsonb,
      'packageFitStatus',v_package_fit->>'status',
      'sourceEvidence',jsonb_build_object(
        'academySource','sales_academy_training_ready',
        'grantSource','sales_certification_package_grants',
        'productSource','sales_products',
        'policyVersion',v_policy->'policyVersion'
      ),
      'separationOfDuties','Certification authority does not replace Package Fit, specialist validation, quotation approval, Part 10B final send readiness, payment verification, or delivery handoff gates.'
    );
  END IF;

  IF cardinality(v_codes)=0 THEN
    v_overall_allowed:=false;
    v_can_draft:=false;
    v_can_send:=false;
    v_permission_mode:='BLOCKED';
    v_status:='BLOCKED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PACKAGE_NOT_RESOLVED',
      'message','No canonical package could be resolved for this deal.'
    ));
    v_recommended_action:='Complete Requirements and Package Fit before making a protected commercial commitment.';
  ELSE
    FOREACH v_code IN ARRAY v_codes LOOP
      v_rule:=NULL;
      v_base_rule:=NULL;
      v_behavior:=NULL;
      v_required_cert:=NULL;
      v_mode:='BLOCKED';
      v_accepted_keys:=ARRAY[]::text[];
      v_has_cert:=false;
      v_validation_required:=false;
      v_manager_required:=false;
      v_escalation_required:=false;
      v_validation_satisfied:=false;
      v_item_allowed:=false;
      v_item_can_draft:=false;
      v_item_can_send:=false;

      SELECT * INTO v_product
      FROM public.sales_products p
      WHERE p.code=v_code;

      IF NOT FOUND OR v_product.active IS DISTINCT FROM true THEN
        v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
          'code','PRODUCT_NOT_ACTIVE',
          'productCode',v_code,
          'message','This product is not an active canonical Sales product.'
        ));
        v_item_permissions:=v_item_permissions||jsonb_build_array(jsonb_build_object(
          'productCode',v_code,'productName',coalesce(v_product.name,v_code),'permissionMode','BLOCKED',
          'allowed',false,'canDraft',false,'canSend',false,'reason','Inactive or unknown product.'
        ));
        v_overall_allowed:=false; v_can_draft:=false; v_can_send:=false; v_permission_mode:='BLOCKED';
        CONTINUE;
      END IF;

      IF lower(coalesce(v_product.product_type,'')) IN ('package','discovery') THEN
        v_rule:=v_policy->'productRules'->v_code;
        IF v_base_package_code IS NULL THEN v_base_package_code:=v_code; END IF;
      ELSIF lower(coalesce(v_product.product_type,''))='addon' THEN
        v_rule:=v_policy->'addonRules'->v_code;
        v_behavior:=v_rule->>'behavior';
        IF v_behavior='INHERIT_BASE_PACKAGE' THEN
          v_base_rule:=v_policy->'productRules'->v_base_package_code;
          IF v_base_rule IS NOT NULL THEN
            v_required_cert:=v_base_rule->>'requiredCertificationKey';
            v_mode:=coalesce(v_base_rule->>'permissionMode','BLOCKED');
            v_validation_required:=coalesce((v_base_rule->>'validationRequired')::boolean,false);
            v_manager_required:=coalesce((v_base_rule->>'managerReviewRequired')::boolean,false);
            v_escalation_required:=coalesce((v_base_rule->>'escalationRequired')::boolean,false);
            v_accepted_keys:=ARRAY[v_required_cert]||ARRAY(
              SELECT jsonb_array_elements_text(coalesce(v_base_rule->'inheritedCertificationKeys','[]'::jsonb))
            );
          END IF;
        ELSIF v_behavior='REQUIRE_GROWTH' THEN
          v_required_cert:='GROWTH_CERTIFIED';
          v_mode:=coalesce(v_rule->>'permissionMode','SUPERVISED');
        ELSIF v_behavior='REQUIRE_SCALE' THEN
          v_required_cert:='SCALE_CERTIFIED';
          v_mode:=coalesce(v_rule->>'permissionMode','SUPERVISED');
          v_escalation_required:=true;
        ELSIF v_behavior='REQUIRE_SPECIALIST_VALIDATION' THEN
          v_required_cert:=nullif(v_rule->>'requiredCertificationKey','');
          v_mode:=coalesce(v_rule->>'permissionMode','SUPERVISED');
          v_validation_required:=true;
        ELSIF v_behavior='CUSTOM_QUALIFICATION_ONLY' THEN
          v_required_cert:='CUSTOM_QUALIFICATION_CERTIFIED';
          v_mode:='QUALIFY_ONLY';
          v_validation_required:=true;
        END IF;

        IF v_rule IS NOT NULL AND v_behavior<>'INHERIT_BASE_PACKAGE' THEN
          v_validation_required:=v_validation_required OR coalesce((v_rule->>'validationRequired')::boolean,false);
          v_manager_required:=coalesce((v_rule->>'managerReviewRequired')::boolean,false);
          v_escalation_required:=v_escalation_required OR coalesce((v_rule->>'escalationRequired')::boolean,false);
          IF v_required_cert IS NOT NULL THEN
            v_accepted_keys:=ARRAY[v_required_cert]||ARRAY(
              SELECT jsonb_array_elements_text(coalesce(v_rule->'inheritedCertificationKeys','[]'::jsonb))
            );
          END IF;
        END IF;
      ELSE
        CONTINUE;
      END IF;

      IF v_rule IS NULL OR (lower(coalesce(v_product.product_type,''))='addon' AND v_behavior='INHERIT_BASE_PACKAGE' AND v_base_rule IS NULL) THEN
        v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
          'code','CERTIFICATION_POLICY_RULE_MISSING',
          'productCode',v_code,
          'message','No active Part 16 policy rule exists for this product.'
        ));
        v_item_permissions:=v_item_permissions||jsonb_build_array(jsonb_build_object(
          'productCode',v_code,'productName',v_product.name,'permissionMode','BLOCKED',
          'allowed',false,'canDraft',false,'canSend',false,'reason','Certification policy rule is missing.'
        ));
        v_overall_allowed:=false; v_can_draft:=false; v_can_send:=false; v_permission_mode:='BLOCKED';
        CONTINUE;
      END IF;

      IF lower(coalesce(v_product.product_type,'')) IN ('package','discovery') THEN
        v_required_cert:=v_rule->>'requiredCertificationKey';
        v_mode:=coalesce(v_rule->>'permissionMode','BLOCKED');
        v_validation_required:=coalesce((v_rule->>'validationRequired')::boolean,false);
        v_manager_required:=coalesce((v_rule->>'managerReviewRequired')::boolean,false);
        v_escalation_required:=coalesce((v_rule->>'escalationRequired')::boolean,false);
        v_accepted_keys:=ARRAY[v_required_cert]||ARRAY(
          SELECT jsonb_array_elements_text(coalesce(v_rule->'inheritedCertificationKeys','[]'::jsonb))
        );
      END IF;

      IF v_required_top IS NULL THEN
        v_required_top:=v_required_cert;
        v_product_name_top:=v_product.name;
      END IF;

      IF v_required_cert IS NULL THEN
        v_has_cert:=true;
      ELSE
        SELECT EXISTS(
          SELECT 1
          FROM public.sales_certification_package_grants g
          WHERE g.salesperson_id=v_salesperson_id
            AND g.certification_key=ANY(v_accepted_keys)
            AND public.sales_certification_grant_effective_status(g.grant_state,g.expires_at,g.revoked_at)='ACTIVE'
        ) INTO v_has_cert;
      END IF;

      IF v_validation_required THEN
        SELECT EXISTS(
          SELECT 1
          FROM public.crm_sales_validations sv
          WHERE sv.opportunity_id=v_opportunity_id
            AND sv.status='APPROVED'
            AND (sv.product_id IS NULL OR sv.product_id=v_product.id)
        ) INTO v_validation_satisfied;
      ELSIF v_escalation_required AND EXISTS(
        SELECT 1 FROM public.crm_sales_validations sv
        WHERE sv.opportunity_id=v_opportunity_id
          AND (sv.product_id IS NULL OR sv.product_id=v_product.id)
          AND sv.status NOT IN ('CANCELLED','REJECTED')
      ) THEN
        SELECT EXISTS(
          SELECT 1
          FROM public.crm_sales_validations sv
          WHERE sv.opportunity_id=v_opportunity_id
            AND sv.status='APPROVED'
            AND (sv.product_id IS NULL OR sv.product_id=v_product.id)
        ) INTO v_validation_satisfied;
        v_validation_required:=true;
      ELSE
        v_validation_satisfied:=true;
      END IF;

      IF p_quotation_id IS NOT NULL THEN
        v_supervision_satisfied:=coalesce(v_q.approval_decision,'')='approved'
          AND v_q.approved_by IS NOT NULL
          AND v_q.approved_at IS NOT NULL;
      ELSE
        v_supervision_satisfied:=false;
      END IF;

      v_item_allowed:=v_general_ready AND v_has_cert AND v_mode<>'BLOCKED';
      v_item_can_draft:=v_item_allowed AND v_mode IN ('INDEPENDENT','SUPERVISED');
      v_item_can_send:=v_item_allowed
        AND v_mode IN ('INDEPENDENT','SUPERVISED')
        AND v_validation_satisfied
        AND (NOT v_manager_required OR v_supervision_satisfied)
        AND (v_mode<>'SUPERVISED' OR v_supervision_satisfied);

      IF NOT v_general_ready THEN
        v_item_allowed:=false; v_item_can_draft:=false; v_item_can_send:=false;
      END IF;

      IF NOT v_has_cert THEN
        v_item_allowed:=false; v_item_can_draft:=false; v_item_can_send:=false;
        v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
          'code','PACKAGE_CERTIFICATION_NOT_GRANTED',
          'productCode',v_code,
          'requiredCertification',v_required_cert,
          'message',coalesce(v_rule->>'remediation','Required Sales certification has not been granted.')
        ));
      END IF;

      IF v_mode='QUALIFY_ONLY' THEN
        v_item_can_draft:=false;
        v_item_can_send:=false;
        v_reasons:=v_reasons||jsonb_build_array('Qualification-only certification permits discovery/qualification but not independent commercial commitment.');
      ELSIF v_mode='BLOCKED' THEN
        v_item_allowed:=false; v_item_can_draft:=false; v_item_can_send:=false;
      END IF;

      IF (v_validation_required OR v_escalation_required) AND NOT v_validation_satisfied THEN
        v_item_can_send:=false;
        v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
          'code','SALES_VALIDATION_REQUIRED',
          'productCode',v_code,
          'message','Existing Sales Validation must approve the required specialist/escalation review before commercial commitment.'
        ));
      END IF;

      IF (v_manager_required OR v_mode='SUPERVISED') AND NOT v_supervision_satisfied THEN
        v_item_can_send:=false;
        v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
          'code','SUPERVISION_APPROVAL_REQUIRED',
          'productCode',v_code,
          'message','Existing canonical quotation approval is required before this supervised package can be sent.'
        ));
      END IF;

      v_item_permissions:=v_item_permissions||jsonb_build_array(jsonb_build_object(
        'productId',v_product.id,
        'productCode',v_code,
        'productName',v_product.name,
        'productType',v_product.product_type,
        'requiredCertification',v_required_cert,
        'permissionMode',v_mode,
        'allowed',v_item_allowed,
        'canDraft',v_item_can_draft,
        'canSend',v_item_can_send,
        'supervisionRequired',(v_mode='SUPERVISED' OR v_manager_required),
        'supervisionSatisfied',v_supervision_satisfied,
        'validationRequired',(v_validation_required OR v_escalation_required),
        'validationSatisfied',v_validation_satisfied,
        'managerReviewRequired',v_manager_required,
        'escalationRequired',v_escalation_required,
        'recommendedAction',coalesce(v_rule->>'recommendedAction',v_base_rule->>'recommendedAction'),
        'remediation',coalesce(v_rule->>'remediation',v_base_rule->>'remediation')
      ));

      v_overall_allowed:=v_overall_allowed AND v_item_allowed;
      v_can_draft:=v_can_draft AND v_item_can_draft;
      v_can_send:=v_can_send AND v_item_can_send;
      v_any_supervision:=v_any_supervision OR v_mode='SUPERVISED' OR v_manager_required;
      v_any_validation:=v_any_validation OR v_validation_required OR v_escalation_required;
      v_any_manager:=v_any_manager OR v_manager_required;

      IF v_mode='BLOCKED' OR NOT v_item_allowed THEN
        v_permission_mode:='BLOCKED';
      ELSIF v_permission_mode<>'BLOCKED' AND v_mode='QUALIFY_ONLY' THEN
        v_permission_mode:='QUALIFY_ONLY';
      ELSIF v_permission_mode NOT IN ('BLOCKED','QUALIFY_ONLY') AND v_mode='SUPERVISED' THEN
        v_permission_mode:='SUPERVISED';
      END IF;

      IF v_recommended_action IS NULL THEN
        v_recommended_action:=coalesce(v_rule->>'recommendedAction',v_base_rule->>'recommendedAction');
      END IF;
    END LOOP;

    v_status:=v_permission_mode;
  END IF;

  RETURN jsonb_build_object(
    'policyKey',v_policy->>'policyKey',
    'schemaVersion',v_policy->'schemaVersion',
    'policyVersion',v_policy->'policyVersion',
    'enforcementActive',v_enforced,
    'criteriaApproved',coalesce((v_policy->>'criteriaApproved')::boolean,false),
    'rolloutState',v_policy->>'rolloutState',
    'salespersonId',v_salesperson_id,
    'opportunityId',v_opportunity_id,
    'quotationId',p_quotation_id,
    'productCode',coalesce(v_base_package_code,CASE WHEN cardinality(v_codes)=1 THEN v_codes[1] END),
    'productName',coalesce(v_product_name_top,(SELECT p.name FROM public.sales_products p WHERE p.code=v_base_package_code)),
    'requiredCertification',v_required_top,
    'permissionMode',v_permission_mode,
    'status',v_status,
    'allowed',v_overall_allowed,
    'canDraft',v_can_draft,
    'canSend',v_can_send,
    'supervisionRequired',v_any_supervision,
    'validationRequired',v_any_validation,
    'managerReviewRequired',v_any_manager,
    'supervisionSatisfied',v_supervision_satisfied,
    'packageCodes',to_jsonb(v_codes),
    'itemPermissions',v_item_permissions,
    'certifications',v_certifications,
    'generalCertificationReady',v_general_ready,
    'reasons',v_reasons,
    'recommendedAction',coalesce(v_recommended_action,'Resolve the recorded certification/validation requirement before protected commercial commitment.'),
    'blockers',v_blockers,
    'packageFitStatus',v_package_fit->>'status',
    'sourceEvidence',jsonb_build_object(
      'academySource','sales_academy_training_ready',
      'grantSource','sales_certification_package_grants',
      'productSource','sales_products',
      'validationSource','crm_sales_validations',
      'supervisionSource','quotations.approval_decision/approved_by/approved_at',
      'policyVersion',v_policy->'policyVersion'
    ),
    'separationOfDuties','Certification authority does not replace Package Fit, specialist validation, quotation approval, Part 10B final send readiness, payment verification, or delivery handoff gates.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_get_sales_certification_deal_permission(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_get_sales_certification_deal_permission(uuid,text,uuid,uuid) TO authenticated;



CREATE OR REPLACE FUNCTION public.crm_enforce_sales_certification_package_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_q public.quotations%rowtype;
  v_product public.sales_products%rowtype;
  v_assessment jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN new; END IF;

  SELECT * INTO v_product
  FROM public.sales_products
  WHERE id=new.sales_product_id;

  IF NOT FOUND OR lower(coalesce(v_product.product_type,'')) NOT IN ('package','addon','discovery') THEN
    RETURN new;
  END IF;

  SELECT * INTO v_q FROM public.quotations WHERE id=new.quotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found for Sales certification permission check.'; END IF;

  v_assessment:=public.crm_get_sales_certification_deal_permission(
    v_q.salesperson_id,
    v_product.code,
    v_q.opportunity_id,
    v_q.id
  );

  IF coalesce((v_assessment->>'enforcementActive')::boolean,false)
     AND coalesce((v_assessment->>'canDraft')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%',coalesce(
      nullif(v_assessment->>'recommendedAction',''),
      'This package/add-on is outside the Seller''s active Sales certification authority.'
    );
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_enforce_sales_certification_package_item() FROM PUBLIC,anon,authenticated;



DO $$
DECLARE
  v_product_rules jsonb:=$json${"PF-WEB-LAUNCH":{"requiredCertificationKey":"LAUNCH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["GROWTH_CERTIFIED","SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"Obtain an evidence-backed LAUNCH_CERTIFIED grant before protected commercial commitment.","recommendedAction":"Complete Launch certification or route the deal to a Seller with effective Launch-or-higher authority."},"PF-WEB-GROWTH":{"requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"Obtain an evidence-backed GROWTH_CERTIFIED grant before independent Growth commitment.","recommendedAction":"Complete Growth certification or route the deal through a Seller with effective Growth-or-higher authority."},"PF-WEB-SCALE":{"requiredCertificationKey":"SCALE_CERTIFIED","permissionMode":"SUPERVISED","inheritedCertificationKeys":[],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":true,"remediation":"Scale requires SCALE_CERTIFIED authority and existing quotation supervision; triggered specialist validation remains mandatory.","recommendedAction":"Route Scale through the existing supervised quotation-approval path and satisfy any triggered Sales Validation."},"PF-CUSTOM":{"requiredCertificationKey":"CUSTOM_QUALIFICATION_CERTIFIED","permissionMode":"QUALIFY_ONLY","inheritedCertificationKeys":[],"validationRequired":true,"managerReviewRequired":false,"escalationRequired":true,"remediation":"Custom remains qualification-only; technical/commercial commitment requires canonical specialist/Sales Validation authority.","recommendedAction":"Use Custom Qualification only for discovery and qualification, then route technical commitments through Sales Validation and existing approval."},"PF-DISCOVERY":{"requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"SUPERVISED","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"Discovery requires effective Growth-or-higher certification plus existing quotation supervision before protected commercial commitment.","recommendedAction":"Route the Discovery Sprint through the existing supervised quotation-approval path."}}$json$::jsonb;
  v_addon_rules jsonb:=$json${"PF-ADD-PAGE":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-CUSTOM-PAGE":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-LANDING":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-COPY":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-BLOG":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-MIGRATION20":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-LEADFORM":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-BOOKING":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-CHAT":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-REVIEWS":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-TRACKING":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-CRO":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-LOCALSEO":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-SEOAUDIT":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-LOGOREFRESH":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-MINIBRAND":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-ICONS":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-ANIMATION":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-ILLUSTRATION":{"behavior":"INHERIT_BASE_PACKAGE","permissionMode":"INDEPENDENT","remediation":"This add-on inherits the effective base-package certification authority.","recommendedAction":"Resolve the base-package certification and any existing deal-specific validation/approval requirements."},"PF-ADD-CRM":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-ADVSEO":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-AIDISCOVERY":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-SEOMIGRATION":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-COMMERCE25":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-COMMERCEADD25":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-FILTERS":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-INT-SIMPLE":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-EMAIL":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-LEADROUTE":{"behavior":"REQUIRE_GROWTH","requiredCertificationKey":"GROWTH_CERTIFIED","permissionMode":"INDEPENDENT","inheritedCertificationKeys":["SCALE_CERTIFIED"],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":false,"remediation":"This advanced add-on requires effective Growth-or-higher certification.","recommendedAction":"Use a Growth/Scale-certified Seller or remove the add-on until appropriate authority is available."},"PF-ADD-3D":{"behavior":"REQUIRE_SCALE","requiredCertificationKey":"SCALE_CERTIFIED","permissionMode":"SUPERVISED","inheritedCertificationKeys":[],"validationRequired":false,"managerReviewRequired":false,"escalationRequired":true,"remediation":"3D work requires Scale certification and remains supervised; triggered specialist validation still applies.","recommendedAction":"Route through Scale-certified supervised quotation approval and satisfy any triggered validation."},"PF-ADD-SUBSCRIPTION":{"behavior":"REQUIRE_SPECIALIST_VALIDATION","permissionMode":"INDEPENDENT","inheritedCertificationKeys":[],"validationRequired":true,"managerReviewRequired":false,"escalationRequired":true,"remediation":"This add-on requires canonical specialist/Sales Validation evidence regardless of Seller tier.","recommendedAction":"Obtain approved Sales Validation before protected commercial commitment."},"PF-ADD-PAYGATEWAY":{"behavior":"REQUIRE_SPECIALIST_VALIDATION","permissionMode":"INDEPENDENT","inheritedCertificationKeys":[],"validationRequired":true,"managerReviewRequired":false,"escalationRequired":true,"remediation":"This add-on requires canonical specialist/Sales Validation evidence regardless of Seller tier.","recommendedAction":"Obtain approved Sales Validation before protected commercial commitment."},"PF-ADD-CHECKOUT":{"behavior":"REQUIRE_SPECIALIST_VALIDATION","permissionMode":"INDEPENDENT","inheritedCertificationKeys":[],"validationRequired":true,"managerReviewRequired":false,"escalationRequired":true,"remediation":"This add-on requires canonical specialist/Sales Validation evidence regardless of Seller tier.","recommendedAction":"Obtain approved Sales Validation before protected commercial commitment."},"PF-ADD-INT-ADV":{"behavior":"REQUIRE_SPECIALIST_VALIDATION","permissionMode":"INDEPENDENT","inheritedCertificationKeys":[],"validationRequired":true,"managerReviewRequired":false,"escalationRequired":true,"remediation":"This add-on requires canonical specialist/Sales Validation evidence regardless of Seller tier.","recommendedAction":"Obtain approved Sales Validation before protected commercial commitment."},"PF-ADD-API":{"behavior":"REQUIRE_SPECIALIST_VALIDATION","permissionMode":"INDEPENDENT","inheritedCertificationKeys":[],"validationRequired":true,"managerReviewRequired":false,"escalationRequired":true,"remediation":"This add-on requires canonical specialist/Sales Validation evidence regardless of Seller tier.","recommendedAction":"Obtain approved Sales Validation before protected commercial commitment."},"PF-ADD-PAYMENT":{"behavior":"REQUIRE_SPECIALIST_VALIDATION","permissionMode":"INDEPENDENT","inheritedCertificationKeys":[],"validationRequired":true,"managerReviewRequired":false,"escalationRequired":true,"remediation":"This add-on requires canonical specialist/Sales Validation evidence regardless of Seller tier.","recommendedAction":"Obtain approved Sales Validation before protected commercial commitment."},"PF-ADD-BPA":{"behavior":"REQUIRE_SPECIALIST_VALIDATION","permissionMode":"INDEPENDENT","inheritedCertificationKeys":[],"validationRequired":true,"managerReviewRequired":false,"escalationRequired":true,"remediation":"This add-on requires canonical specialist/Sales Validation evidence regardless of Seller tier.","recommendedAction":"Obtain approved Sales Validation before protected commercial commitment."}}$json$::jsonb;
  v_stages jsonb:='["Quotation Sent","Negotiation / Decision Pending","Awaiting Advance Payment"]'::jsonb;
BEGIN
  UPDATE public.system_configuration
  SET config_value=
    config_value
    || jsonb_build_object(
      'policyVersion',2,
      'criteriaApproved',true,
      'criteriaVersion',1,
      'criteriaApprovedAt',to_jsonb(now()),
      'grantingActive',true,
      'enforcementActive',false,
      'rolloutState','GRANTING_ONLY',
      'rolloutReason','Product Owner-approved Part 16 policy loaded. Enforcement remains fail-closed pending authoritative non-test Launch certification evidence for the current active Seller.',
      'productRules',v_product_rules,
      'packageCriteria',v_product_rules,
      'addonRules',v_addon_rules,
      'protectedCommitmentStages',v_stages
    )
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Part 16 canonical policy row is unavailable.';
  END IF;
END $$;

DO $$
DECLARE
  v_policy jsonb;
  v_grants integer;
BEGIN
  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  IF nullif(v_policy->>'schemaVersion','')::integer IS DISTINCT FROM 2
     OR nullif(v_policy->>'policyVersion','')::integer IS DISTINCT FROM 2
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false) IS DISTINCT FROM true
     OR nullif(v_policy->>'criteriaVersion','')::integer IS DISTINCT FROM 1
     OR coalesce((v_policy->>'grantingActive')::boolean,false) IS DISTINCT FROM true
     OR coalesce((v_policy->>'enforcementActive')::boolean,false) IS DISTINCT FROM false
     OR v_policy->>'rolloutState' IS DISTINCT FROM 'GRANTING_ONLY'
     OR jsonb_object_length(v_policy->'productRules')<>5
     OR jsonb_object_length(v_policy->'addonRules')<>37
     OR jsonb_array_length(v_policy->'protectedCommitmentStages')<>3 THEN
    RAISE EXCEPTION 'Part 16 approved policy did not converge to the expected granting-only activation state.';
  END IF;

  IF v_policy#>>'{productRules,PF-DISCOVERY,requiredCertificationKey}' IS DISTINCT FROM 'GROWTH_CERTIFIED'
     OR v_policy#>>'{productRules,PF-DISCOVERY,permissionMode}' IS DISTINCT FROM 'SUPERVISED'
     OR v_policy#>>'{productRules,PF-WEB-SCALE,permissionMode}' IS DISTINCT FROM 'SUPERVISED'
     OR v_policy#>>'{productRules,PF-CUSTOM,permissionMode}' IS DISTINCT FROM 'QUALIFY_ONLY'
     OR coalesce((v_policy#>>'{productRules,PF-CUSTOM,validationRequired}')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Part 16 approved Product Owner package/discovery safety rules drifted during activation.';
  END IF;

  SELECT count(*)::integer INTO v_grants FROM public.sales_certification_package_grants;
  IF v_grants<>0 THEN
    RAISE EXCEPTION 'Part 16 policy activation must not create or backfill granular certification grants.';
  END IF;
END $$;

COMMENT ON FUNCTION public.sales_certification_authoritative_evidence(uuid) IS
  'Part 16 canonical production grant-evidence verifier. Requires current Sales Academy/Product Training/Final Certification evidence and rejects synthetic/test-tagged evidence; never grants authority itself.';

COMMENT ON FUNCTION public.crm_get_sales_certification_deal_permission(uuid,text,uuid,uuid) IS
  'Part 16 canonical Seller deal-authority evaluator. Supports package, add-on and approved PF-DISCOVERY policy rules; preserves Package Fit, Sales Validation, quotation approval and Part 10B authority.';
