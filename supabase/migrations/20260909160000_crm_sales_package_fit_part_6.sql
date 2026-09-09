-- CRM Sales SOP Part 6 — Package Fit & Complexity Classification
--
-- Architecture:
--   * sales_products remains the only current commercial package source of truth.
--   * crm_requirement_definitions_v1 and crm_discovery_questions remain canonical discovery metadata.
--   * this migration adds one versioned policy configuration and one read-only evaluator RPC.
--   * no client Package Fit table, selected-product field, quotation gate, Pipeline gate, review workflow,
--     payment/Won behavior, or handoff behavior is introduced.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.system_configuration
    WHERE config_key = 'crm_package_fit_policy_v1'
  ) THEN
    RAISE EXCEPTION 'Package Fit policy collision: crm_package_fit_policy_v1 already exists.';
  END IF;

  INSERT INTO public.system_configuration (config_key, config_value, description)
  VALUES (
    'crm_package_fit_policy_v1',
    jsonb_build_object(
      'policyKey', 'crm_package_fit_policy_v1',
      'policyVersion', 1,
      'packageOrder', jsonb_build_array(
        'PF-WEB-LAUNCH',
        'PF-WEB-GROWTH',
        'PF-WEB-SCALE',
        'PF-CUSTOM'
      ),
      'fitCoreRequirementKeys', jsonb_build_array(
        'project_type',
        'required_functionality',
        'required_pages'
      ),
      'rules', jsonb_build_array(
        jsonb_build_object('ruleKey','growth.copywriting','ruleType','MIN_PACKAGE','severity','STANDARD','requirementKey','copywriting_requirement','minPackageCode','PF-WEB-GROWTH','reason','Conversion copywriting is captured as a current project requirement.'),
        jsonb_build_object('ruleKey','growth.seo','ruleType','MIN_PACKAGE','severity','STANDARD','requirementKey','seo_priority','minPackageCode','PF-WEB-GROWTH','reason','SEO is captured as a current project priority.'),
        jsonb_build_object('ruleKey','growth.conversion_tracking','ruleType','MIN_PACKAGE','severity','STANDARD','requirementKey','conversion_tracking','minPackageCode','PF-WEB-GROWTH','reason','Conversion tracking is captured as a current requirement.'),
        jsonb_build_object('ruleKey','growth.crm_integration','ruleType','MIN_PACKAGE','severity','ADVANCED','requirementKey','crm_integration','minPackageCode','PF-WEB-GROWTH','reason','A CRM integration is captured as a current requirement.'),
        jsonb_build_object('ruleKey','growth.third_party_integration','ruleType','MIN_PACKAGE','severity','ADVANCED','requirementKey','third_party_integrations','minPackageCode','PF-WEB-GROWTH','reason','Third-party integration scope is captured.'),

        jsonb_build_object('ruleKey','scale.accessibility','ruleType','MIN_PACKAGE','severity','ADVANCED','requirementKey','accessibility_requirements','minPackageCode','PF-WEB-SCALE','reason','Explicit accessibility requirements increase implementation and QA complexity.'),
        jsonb_build_object('ruleKey','scale.economic_buyer','ruleType','MIN_PACKAGE','severity','ADVANCED','requirementKey','economic_buyer','minPackageCode','PF-WEB-SCALE','reason','Economic-buyer qualification indicates a more complex buying environment.'),
        jsonb_build_object('ruleKey','scale.procurement','ruleType','MIN_PACKAGE','severity','ADVANCED','requirementKey','procurement_process','minPackageCode','PF-WEB-SCALE','reason','A procurement or paper process is captured.'),
        jsonb_build_object('ruleKey','scale.stakeholders','ruleType','MIN_PACKAGE','severity','ADVANCED','requirementKey','stakeholder_map','minPackageCode','PF-WEB-SCALE','reason','Multiple stakeholder requirements are captured.'),
        jsonb_build_object('ruleKey','scale.internal_champion','ruleType','MIN_PACKAGE','severity','ADVANCED','requirementKey','internal_champion','minPackageCode','PF-WEB-SCALE','reason','Internal-champion qualification is captured for a complex decision process.'),

        jsonb_build_object('ruleKey','custom.authentication','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','authentication_requirement','minPackageCode','PF-CUSTOM','reason','Authentication or login behavior is captured.'),
        jsonb_build_object('ruleKey','custom.roles','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','user_roles_permissions','minPackageCode','PF-CUSTOM','reason','Role-based access or permission behavior is captured.'),
        jsonb_build_object('ruleKey','custom.portal','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','portal_dashboard','minPackageCode','PF-CUSTOM','reason','A portal or dashboard is captured.'),
        jsonb_build_object('ruleKey','custom.database','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','data_database','minPackageCode','PF-CUSTOM','reason','Custom data or database behavior is captured.'),
        jsonb_build_object('ruleKey','custom.api','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','api_requirements','minPackageCode','PF-CUSTOM','reason','Custom API requirements are captured.'),
        jsonb_build_object('ruleKey','custom.subscription','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','subscription_requirement','minPackageCode','PF-CUSTOM','reason','Recurring subscription billing is captured.'),
        jsonb_build_object('ruleKey','custom.customer_accounts','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','ecommerce_customer_accounts','minPackageCode','PF-CUSTOM','reason','Customer-account behavior is captured.'),
        jsonb_build_object('ruleKey','custom.workflows','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','business_workflows','minPackageCode','PF-CUSTOM','reason','Custom business workflow behavior is captured.'),
        jsonb_build_object('ruleKey','custom.user_types','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_user_types','minPackageCode','PF-CUSTOM','reason','Application user types are captured.'),
        jsonb_build_object('ruleKey','custom.permissions','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_permissions','minPackageCode','PF-CUSTOM','reason','Application permission rules are captured.'),
        jsonb_build_object('ruleKey','custom.reporting','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_reporting','minPackageCode','PF-CUSTOM','reason','Custom application reporting is captured.'),
        jsonb_build_object('ruleKey','custom.admin_operations','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_admin_operations','minPackageCode','PF-CUSTOM','reason','Custom admin operations are captured.'),
        jsonb_build_object('ruleKey','custom.usage_scale','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_usage_scale','minPackageCode','PF-CUSTOM','reason','Application usage or scale requirements are captured.'),
        jsonb_build_object('ruleKey','custom.acceptance','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','acceptance_criteria','minPackageCode','PF-CUSTOM','reason','Application acceptance criteria are captured.')
      )
    ),
    'Versioned deterministic Package Fit policy. Contains fit/complexity rules and stable catalog codes only; all current product commercial facts remain in sales_products.'
  );
END
$$;

CREATE OR REPLACE FUNCTION public.crm_get_package_fit_assessment(
  p_lead_id uuid DEFAULT NULL,
  p_opportunity_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lead_id uuid;
  v_opportunity_id uuid;
  v_policy_key constant text := 'crm_package_fit_policy_v1';
  v_policy jsonb;
  v_policy_version integer;
  v_requirement_definitions jsonb := '[]'::jsonb;
  v_definition_version integer;
  v_package_order jsonb := '[]'::jsonb;
  v_fit_core_keys jsonb := '[]'::jsonb;
  v_rules jsonb := '[]'::jsonb;
  v_rule_requirement_keys text[] := ARRAY[]::text[];
  v_config_errors jsonb := '[]'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_complexity_signals jsonb := '[]'::jsonb;
  v_mismatch_signals jsonb := '[]'::jsonb;
  v_missing_information jsonb := '[]'::jsonb;
  v_validation_signals jsonb := '[]'::jsonb;
  v_candidate_products jsonb := '[]'::jsonb;
  v_recommended_product jsonb := NULL;
  v_rule jsonb;
  v_core_key text;
  v_core_title text;
  v_code text;
  v_min_code text;
  v_rank integer;
  v_min_rank integer := 1;
  v_target_rank integer;
  v_duplicate_count integer;
  v_total_product_count integer;
  v_active_product_count integer;
  v_active_package_count integer;
  v_catalog_observed_at timestamptz;
  v_requirement public.crm_requirements%ROWTYPE;
  v_product public.sales_products%ROWTYPE;
  v_custom public.crm_requirements%ROWTYPE;
  v_discovery record;
  v_trace jsonb;
  v_product_json jsonb;
  v_candidate_status text;
  v_candidate_mismatches jsonb;
  v_has_review boolean := false;
  v_has_fit_input boolean := false;
  v_observation_count integer := 0;
  v_active_requirement_count integer := 0;
  v_confirmed_requirement_count integer := 0;
  v_unresolved_requirement_count integer := 0;
  v_custom_requirement_count integer := 0;
  v_discovery_signal_count integer := 0;
  v_confidence text := 'LOW';
  v_status text := 'REVIEW_REQUIRED';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication is required for Package Fit.';
  END IF;

  IF p_opportunity_id IS NOT NULL THEN
    SELECT o.lead_id
    INTO v_lead_id
    FROM public.crm_opportunities o
    WHERE o.id = p_opportunity_id;

    IF v_lead_id IS NULL THEN
      RAISE EXCEPTION 'Opportunity is not connected to a CRM lead.';
    END IF;

    IF p_lead_id IS NOT NULL AND p_lead_id IS DISTINCT FROM v_lead_id THEN
      RAISE EXCEPTION 'Lead and opportunity do not belong to the same sales lifecycle.';
    END IF;

    v_opportunity_id := p_opportunity_id;
  ELSE
    v_lead_id := p_lead_id;

    IF v_lead_id IS NOT NULL THEN
      SELECT o.id
      INTO v_opportunity_id
      FROM public.crm_opportunities o
      WHERE o.lead_id = v_lead_id
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 1;
    END IF;
  END IF;

  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'Lead or opportunity is required for Package Fit.';
  END IF;

  IF NOT public.crm_can_access_lead(v_lead_id) THEN
    RAISE EXCEPTION 'CRM lead access is required for Package Fit.';
  END IF;

  SELECT sc.config_value
  INTO v_policy
  FROM public.system_configuration sc
  WHERE sc.config_key = v_policy_key;

  SELECT sc.config_value->'definitions', (sc.config_value->>'version')::integer
  INTO v_requirement_definitions, v_definition_version
  FROM public.system_configuration sc
  WHERE sc.config_key = 'crm_requirement_definitions_v1';

  IF v_policy IS NULL THEN
    v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','POLICY_MISSING','message','Package Fit policy configuration is missing.','sourceType','POLICY'));
  ELSE
    v_policy_version := NULLIF(v_policy->>'policyVersion','')::integer;
    v_package_order := COALESCE(v_policy->'packageOrder', '[]'::jsonb);
    v_fit_core_keys := COALESCE(v_policy->'fitCoreRequirementKeys', '[]'::jsonb);
    v_rules := COALESCE(v_policy->'rules', '[]'::jsonb);

    IF v_policy->>'policyKey' IS DISTINCT FROM v_policy_key THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','POLICY_KEY_INVALID','message','Package Fit policyKey does not match its canonical configuration key.','sourceType','POLICY'));
    END IF;

    IF v_policy_version IS DISTINCT FROM 1 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','POLICY_VERSION_UNSUPPORTED','message','Package Fit policy version is unsupported.','sourceType','POLICY'));
    END IF;

    IF jsonb_typeof(v_package_order) IS DISTINCT FROM 'array' OR jsonb_array_length(v_package_order) = 0 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','PACKAGE_ORDER_INVALID','message','Package Fit package order is missing or malformed.','sourceType','POLICY'));
    END IF;

    IF jsonb_typeof(v_rules) IS DISTINCT FROM 'array' THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','RULES_INVALID','message','Package Fit rules are malformed.','sourceType','POLICY'));
      v_rules := '[]'::jsonb;
    END IF;
  END IF;

  IF v_requirement_definitions IS NULL OR jsonb_typeof(v_requirement_definitions) IS DISTINCT FROM 'array' THEN
    v_requirement_definitions := '[]'::jsonb;
    v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','REQUIREMENT_DEFINITIONS_MISSING','message','Canonical Requirement Definitions are unavailable.','sourceType','POLICY'));
  END IF;

  IF jsonb_typeof(v_package_order) = 'array' THEN
    SELECT COUNT(*)
    INTO v_duplicate_count
    FROM (
      SELECT value
      FROM jsonb_array_elements_text(v_package_order)
      GROUP BY value
      HAVING COUNT(*) > 1
    ) duplicates;

    IF v_duplicate_count > 0 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','DUPLICATE_PACKAGE_CODE','message','Package Fit policy contains duplicate package codes.','sourceType','POLICY'));
    END IF;
  END IF;

  IF jsonb_typeof(v_rules) = 'array' THEN
    SELECT COUNT(*)
    INTO v_duplicate_count
    FROM (
      SELECT value->>'ruleKey' AS rule_key
      FROM jsonb_array_elements(v_rules)
      GROUP BY value->>'ruleKey'
      HAVING COUNT(*) > 1 OR value->>'ruleKey' IS NULL
    ) duplicates;

    IF v_duplicate_count > 0 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','DUPLICATE_OR_MISSING_RULE_KEY','message','Package Fit policy contains duplicate or missing rule keys.','sourceType','POLICY'));
    END IF;
  END IF;

  FOR v_rule IN SELECT value FROM jsonb_array_elements(v_rules)
  LOOP
    IF v_rule->>'ruleType' IS DISTINCT FROM 'MIN_PACKAGE' THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','INVALID_RULE_TYPE','message','Unsupported Package Fit rule type.','sourceType','POLICY','ruleKey',v_rule->>'ruleKey'));
    END IF;

    IF COALESCE(v_rule->>'severity','') NOT IN ('STANDARD','ADVANCED','CUSTOM') THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','INVALID_RULE_SEVERITY','message','Unsupported Package Fit rule severity.','sourceType','POLICY','ruleKey',v_rule->>'ruleKey'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_requirement_definitions) d
      WHERE COALESCE((d->>'active')::boolean, true)
        AND d->>'requirementKey' = v_rule->>'requirementKey'
    ) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','UNKNOWN_REQUIREMENT_KEY','message','Package Fit rule references an unknown Requirement key.','sourceType','POLICY','ruleKey',v_rule->>'ruleKey','requirementKey',v_rule->>'requirementKey'));
    END IF;

    IF NOT (v_package_order ? (v_rule->>'minPackageCode')) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','UNKNOWN_MINIMUM_PACKAGE','message','Package Fit rule references a package outside the policy order.','sourceType','POLICY','ruleKey',v_rule->>'ruleKey','minimumProductCode',v_rule->>'minPackageCode'));
    END IF;

    v_rule_requirement_keys := array_append(v_rule_requirement_keys, v_rule->>'requirementKey');
  END LOOP;

  FOR v_core_key IN SELECT value FROM jsonb_array_elements_text(v_fit_core_keys)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_requirement_definitions) d
      WHERE COALESCE((d->>'active')::boolean, true)
        AND d->>'requirementKey' = v_core_key
    ) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','UNKNOWN_CORE_REQUIREMENT_KEY','message','Package Fit core input references an unknown Requirement key.','sourceType','POLICY','requirementKey',v_core_key));
    END IF;
  END LOOP;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE sp.active), COUNT(*) FILTER (WHERE sp.active AND lower(COALESCE(sp.product_type,'')) = 'package'), MAX(sp.updated_at) FILTER (WHERE sp.active AND lower(COALESCE(sp.product_type,'')) = 'package')
  INTO v_total_product_count, v_active_product_count, v_active_package_count, v_catalog_observed_at
  FROM public.sales_products sp;

  FOR v_code, v_rank IN
    SELECT value, ordinality::integer
    FROM jsonb_array_elements_text(v_package_order) WITH ORDINALITY
  LOOP
    SELECT COUNT(*)
    INTO v_duplicate_count
    FROM public.sales_products sp
    WHERE sp.code = v_code;

    IF v_duplicate_count <> 1 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','CATALOG_PACKAGE_CODE_INVALID','message','A policy package code does not resolve to exactly one catalog record.','sourceType','CATALOG','productCode',v_code));
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.sales_products sp
      WHERE sp.code = v_code AND sp.active AND lower(COALESCE(sp.product_type,'')) = 'package'
    ) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','CATALOG_PACKAGE_INACTIVE','message','A policy package is missing, inactive, or no longer a package.','sourceType','CATALOG','productCode',v_code));
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.sales_products sp
    WHERE sp.active
      AND lower(COALESCE(sp.product_type,'')) = 'package'
      AND NOT (v_package_order ? sp.code)
  ) THEN
    v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object('code','CATALOG_POLICY_DRIFT','message','The active package catalog contains a package not represented by the current Package Fit policy.','sourceType','CATALOG'));
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE r.information_certainty = 'CLIENT_CONFIRMED'),
         COUNT(*) FILTER (WHERE r.information_certainty IN ('SELLER_HYPOTHESIS','AWAITING_CLIENT','NEEDS_SPECIALIST_VALIDATION')),
         COUNT(*) FILTER (WHERE r.is_custom)
  INTO v_active_requirement_count, v_confirmed_requirement_count, v_unresolved_requirement_count, v_custom_requirement_count
  FROM public.crm_requirements r
  WHERE r.lead_id = v_lead_id
    AND r.record_state = 'ACTIVE'
    AND r.information_certainty <> 'NOT_APPLICABLE'
    AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL);

  FOR v_core_key IN SELECT value FROM jsonb_array_elements_text(v_fit_core_keys)
  LOOP
    SELECT d->>'title'
    INTO v_core_title
    FROM jsonb_array_elements(v_requirement_definitions) d
    WHERE d->>'requirementKey' = v_core_key
    LIMIT 1;

    SELECT r.*
    INTO v_requirement
    FROM public.crm_requirements r
    WHERE r.lead_id = v_lead_id
      AND r.requirement_key = v_core_key
      AND r.record_state = 'ACTIVE'
      AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
    LIMIT 1;

    IF NOT FOUND THEN
      v_missing_information := v_missing_information || jsonb_build_array(jsonb_build_object(
        'code','CORE_SCOPE_MISSING','message',COALESCE(v_core_title, v_core_key) || ' is still missing for reliable Package Fit.','sourceType','REQUIREMENT','requirementKey',v_core_key
      ));
    ELSIF v_requirement.information_certainty = 'CLIENT_CONFIRMED' THEN
      v_has_fit_input := true;
    ELSIF v_requirement.information_certainty = 'NOT_APPLICABLE' THEN
      NULL;
    ELSIF v_requirement.information_certainty = 'NEEDS_SPECIALIST_VALIDATION' THEN
      v_validation_signals := v_validation_signals || jsonb_build_array(jsonb_build_object(
        'code','CORE_SCOPE_VALIDATION','message',COALESCE(v_core_title, v_core_key) || ' needs specialist validation before Package Fit can be reliable.','sourceType','REQUIREMENT','requirementId',v_requirement.id,'requirementKey',v_core_key,'certainty',v_requirement.information_certainty
      ));
      v_has_review := true;
    ELSE
      v_missing_information := v_missing_information || jsonb_build_array(jsonb_build_object(
        'code','CORE_SCOPE_UNCONFIRMED','message',COALESCE(v_core_title, v_core_key) || ' is not client-confirmed yet.','sourceType','REQUIREMENT','requirementId',v_requirement.id,'requirementKey',v_core_key,'certainty',v_requirement.information_certainty,'provisional',true
      ));
      IF v_requirement.information_certainty = 'SELLER_OBSERVATION' THEN
        v_observation_count := v_observation_count + 1;
      END IF;
    END IF;
  END LOOP;

  FOR v_rule IN SELECT value FROM jsonb_array_elements(v_rules)
  LOOP
    SELECT ordinality::integer
    INTO v_target_rank
    FROM jsonb_array_elements_text(v_package_order) WITH ORDINALITY
    WHERE value = v_rule->>'minPackageCode';

    SELECT r.*
    INTO v_requirement
    FROM public.crm_requirements r
    WHERE r.lead_id = v_lead_id
      AND r.requirement_key = v_rule->>'requirementKey'
      AND r.record_state = 'ACTIVE'
      AND NOT r.is_custom
      AND r.information_certainty <> 'NOT_APPLICABLE'
      AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_trace := jsonb_build_object(
      'code', v_rule->>'ruleKey',
      'message', v_rule->>'reason',
      'sourceType', 'REQUIREMENT',
      'requirementId', v_requirement.id,
      'requirementKey', v_requirement.requirement_key,
      'certainty', v_requirement.information_certainty,
      'minimumProductCode', v_rule->>'minPackageCode'
    );

    CASE v_requirement.information_certainty
      WHEN 'CLIENT_CONFIRMED' THEN
        v_has_fit_input := true;
        v_min_rank := GREATEST(v_min_rank, COALESCE(v_target_rank, v_min_rank));
        v_reasons := v_reasons || jsonb_build_array(v_trace);
        v_complexity_signals := v_complexity_signals || jsonb_build_array(v_trace);
      WHEN 'SELLER_OBSERVATION' THEN
        v_observation_count := v_observation_count + 1;
        v_complexity_signals := v_complexity_signals || jsonb_build_array(v_trace || jsonb_build_object('provisional',true,'message',(v_rule->>'reason') || ' This is currently a Seller observation and does not hard-classify the package.'));
      WHEN 'SELLER_HYPOTHESIS' THEN
        v_missing_information := v_missing_information || jsonb_build_array(v_trace || jsonb_build_object('provisional',true,'message',(v_rule->>'reason') || ' This is only a Seller hypothesis and needs confirmation.'));
      WHEN 'AWAITING_CLIENT' THEN
        v_missing_information := v_missing_information || jsonb_build_array(v_trace || jsonb_build_object('message',(v_rule->>'reason') || ' Client confirmation is still pending.'));
      WHEN 'NEEDS_SPECIALIST_VALIDATION' THEN
        v_validation_signals := v_validation_signals || jsonb_build_array(v_trace || jsonb_build_object('message',(v_rule->>'reason') || ' Specialist validation is required before feasibility can be treated as known.'));
        v_has_review := true;
      ELSE
        NULL;
    END CASE;
  END LOOP;

  FOR v_custom IN
    SELECT r.*
    FROM public.crm_requirements r
    WHERE r.lead_id = v_lead_id
      AND r.record_state = 'ACTIVE'
      AND r.is_custom
      AND r.information_certainty <> 'NOT_APPLICABLE'
      AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
    ORDER BY r.updated_at, r.id
  LOOP
    v_trace := jsonb_build_object(
      'code','CUSTOM_REQUIREMENT_REVIEW',
      'message','Custom Requirement “' || v_custom.title || '” is not mapped to a canonical Package Fit rule and requires review before a reliable package recommendation.','sourceType','CUSTOM_REQUIREMENT','requirementId',v_custom.id,'requirementKey',v_custom.requirement_key,'certainty',v_custom.information_certainty
    );
    v_complexity_signals := v_complexity_signals || jsonb_build_array(v_trace);
    v_has_review := true;

    IF v_custom.information_certainty IN ('AWAITING_CLIENT','SELLER_HYPOTHESIS','SELLER_OBSERVATION') THEN
      v_missing_information := v_missing_information || jsonb_build_array(v_trace || jsonb_build_object('provisional',true));
    ELSIF v_custom.information_certainty = 'NEEDS_SPECIALIST_VALIDATION' THEN
      v_validation_signals := v_validation_signals || jsonb_build_array(v_trace);
    END IF;
  END LOOP;

  FOR v_discovery IN
    SELECT
      dr.id AS response_id,
      dr.question_id,
      dr.question_state,
      dr.information_certainty,
      q.question_key,
      q.question_text,
      q.applicability
    FROM public.crm_discovery_responses dr
    JOIN public.crm_discovery_questions q ON q.id = dr.question_id
    WHERE dr.lead_id = v_lead_id
      AND q.active
      AND dr.question_state <> 'NOT_APPLICABLE'
      AND dr.information_certainty IN ('SELLER_OBSERVATION','SELLER_HYPOTHESIS','AWAITING_CLIENT','NEEDS_SPECIALIST_VALIDATION')
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(q.applicability->'relatedRequirementKeys','[]'::jsonb)) related(key)
        WHERE related.key = ANY(v_rule_requirement_keys)
           OR v_fit_core_keys ? related.key
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.crm_requirements r
        WHERE r.lead_id = v_lead_id
          AND r.record_state = 'ACTIVE'
          AND r.information_certainty <> 'NOT_APPLICABLE'
          AND r.requirement_key IN (
            SELECT value
            FROM jsonb_array_elements_text(COALESCE(q.applicability->'relatedRequirementKeys','[]'::jsonb))
          )
          AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
      )
    ORDER BY q.sort_order, q.id
  LOOP
    v_discovery_signal_count := v_discovery_signal_count + 1;
    v_trace := jsonb_build_object(
      'code','DISCOVERY_FIT_GAP',
      'message','Discovery still contains Package Fit-relevant uncertainty: ' || v_discovery.question_text,
      'sourceType','DISCOVERY','questionId',v_discovery.question_id,'questionKey',v_discovery.question_key,'certainty',v_discovery.information_certainty,'provisional',true
    );

    IF v_discovery.information_certainty = 'NEEDS_SPECIALIST_VALIDATION' THEN
      v_validation_signals := v_validation_signals || jsonb_build_array(v_trace);
      v_has_review := true;
    ELSE
      v_missing_information := v_missing_information || jsonb_build_array(v_trace);
      IF v_discovery.information_certainty = 'SELLER_OBSERVATION' THEN
        v_observation_count := v_observation_count + 1;
      END IF;
    END IF;
  END LOOP;

  SELECT value
  INTO v_min_code
  FROM jsonb_array_elements_text(v_package_order) WITH ORDINALITY
  WHERE ordinality = v_min_rank;

  v_mismatch_signals := v_complexity_signals;

  IF jsonb_array_length(v_config_errors) > 0 THEN
    v_has_review := true;
    v_confidence := 'LOW';
    v_status := 'REVIEW_REQUIRED';
    v_validation_signals := v_validation_signals || v_config_errors;
  ELSIF v_has_review THEN
    v_confidence := 'LOW';
    v_status := 'REVIEW_REQUIRED';
  ELSIF NOT v_has_fit_input THEN
    v_confidence := 'LOW';
    v_status := 'POSSIBLE_FIT';
  ELSIF jsonb_array_length(v_missing_information) > 0 OR v_observation_count > 0 THEN
    v_confidence := 'MEDIUM';
    v_status := 'POSSIBLE_FIT';
  ELSE
    v_confidence := 'HIGH';
    v_status := 'FIT';
  END IF;

  IF NOT v_has_review AND jsonb_array_length(v_config_errors) = 0 THEN
    SELECT sp.*
    INTO v_product
    FROM public.sales_products sp
    WHERE sp.code = v_min_code
      AND sp.active
      AND lower(COALESCE(sp.product_type,'')) = 'package'
    LIMIT 1;

    IF FOUND THEN
      v_recommended_product := jsonb_build_object(
        'id',v_product.id,'code',v_product.code,'name',v_product.name,'productType',v_product.product_type,
        'priceMode',v_product.price_mode,'basePrice',v_product.base_price,'currency',v_product.currency,'billingPeriod',v_product.billing_period,
        'scope',v_product.scope,'technology',v_product.technology,'managerApprovalRequired',v_product.manager_approval_required,
        'timelineImpact',v_product.timeline_impact,'deliveryDurationMin',v_product.delivery_duration_min,'deliveryDurationMax',v_product.delivery_duration_max,
        'deliveryDurationUnit',v_product.delivery_duration_unit,'deliveryDurationNote',v_product.delivery_duration_note,'serviceFamily',v_product.service_family,'updatedAt',v_product.updated_at
      );
    END IF;
  END IF;

  FOR v_code, v_rank IN
    SELECT value, ordinality::integer
    FROM jsonb_array_elements_text(v_package_order) WITH ORDINALITY
  LOOP
    SELECT sp.*
    INTO v_product
    FROM public.sales_products sp
    WHERE sp.code = v_code
      AND sp.active
      AND lower(COALESCE(sp.product_type,'')) = 'package'
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_product_json := jsonb_build_object(
      'id',v_product.id,'code',v_product.code,'name',v_product.name,'productType',v_product.product_type,
      'priceMode',v_product.price_mode,'basePrice',v_product.base_price,'currency',v_product.currency,'billingPeriod',v_product.billing_period,
      'scope',v_product.scope,'technology',v_product.technology,'managerApprovalRequired',v_product.manager_approval_required,
      'timelineImpact',v_product.timeline_impact,'deliveryDurationMin',v_product.delivery_duration_min,'deliveryDurationMax',v_product.delivery_duration_max,
      'deliveryDurationUnit',v_product.delivery_duration_unit,'deliveryDurationNote',v_product.delivery_duration_note,'serviceFamily',v_product.service_family,'updatedAt',v_product.updated_at
    );

    IF jsonb_array_length(v_config_errors) > 0 OR v_has_review THEN
      v_candidate_status := 'REVIEW_REQUIRED';
      v_candidate_mismatches := CASE WHEN v_rank < v_min_rank THEN v_mismatch_signals ELSE '[]'::jsonb END;
    ELSIF v_rank < v_min_rank THEN
      v_candidate_status := 'MISMATCH';
      v_candidate_mismatches := v_mismatch_signals;
    ELSIF v_rank = v_min_rank AND v_confidence = 'HIGH' THEN
      v_candidate_status := 'FIT';
      v_candidate_mismatches := '[]'::jsonb;
    ELSE
      v_candidate_status := 'POSSIBLE_FIT';
      v_candidate_mismatches := '[]'::jsonb;
    END IF;

    v_candidate_products := v_candidate_products || jsonb_build_array(
      v_product_json || jsonb_build_object('assessmentStatus',v_candidate_status,'mismatchReasons',v_candidate_mismatches)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'leadId',v_lead_id,
    'opportunityId',v_opportunity_id,
    'policyKey',v_policy_key,
    'policyVersion',COALESCE(v_policy_version,0),
    'evaluatedAt',clock_timestamp(),
    'catalogObservedAt',v_catalog_observed_at,
    'status',v_status,
    'confidence',v_confidence,
    'recommendedProduct',v_recommended_product,
    'candidateProducts',v_candidate_products,
    'reasons',v_reasons,
    'complexitySignals',v_complexity_signals,
    'mismatchSignals',v_mismatch_signals,
    'missingInformation',v_missing_information,
    'validationSignals',v_validation_signals,
    'managerApprovalRequired',COALESCE((v_recommended_product->>'managerApprovalRequired')::boolean,false),
    'timelineAssessmentRequired',COALESCE(v_recommended_product->>'timelineImpact','') = 'assessment_required',
    'configurationStatus',CASE WHEN jsonb_array_length(v_config_errors) > 0 THEN 'REVIEW_REQUIRED' ELSE 'OK' END,
    'sourceSummary',jsonb_build_object(
      'activeRequirementCount',v_active_requirement_count,
      'confirmedRequirementCount',v_confirmed_requirement_count,
      'unresolvedRequirementCount',v_unresolved_requirement_count,
      'customRequirementCount',v_custom_requirement_count,
      'discoverySignalCount',v_discovery_signal_count,
      'activePackageCount',v_active_package_count,
      'totalProductCount',v_total_product_count,
      'activeProductCount',v_active_product_count,
      'requirementDefinitionVersion',v_definition_version
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) IS
  'Part 6 read-only deterministic Package Fit evaluator. Reuses canonical CRM Requirements/Discovery and live sales_products; recommendation is guidance only and performs no client or lifecycle writes.';
