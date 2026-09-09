-- CRM Sales SOP Part 6 — Package Fit policy hardening
-- Final Part 6 policy correction before release.
--
-- Keeps ONE canonical policy key and ONE canonical evaluator RPC.
-- Separates base-package classification from safe current-catalog add-on guidance.
-- Buying-process complexity does not by itself force a larger delivery package.
-- No client Package Fit table, selected-product field, quotation change, Pipeline gate,
-- review workflow, payment/Won behavior, or handoff behavior is introduced.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.system_configuration
    WHERE config_key = 'crm_package_fit_policy_v1'
  ) THEN
    RAISE EXCEPTION 'Package Fit policy crm_package_fit_policy_v1 must exist before hardening.';
  END IF;

  UPDATE public.system_configuration
  SET
    config_value = jsonb_build_object(
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
        jsonb_build_object(
          'ruleKey','growth.copywriting',
          'ruleType','MIN_PACKAGE',
          'severity','STANDARD',
          'requirementKey','copywriting_requirement',
          'minPackageCode','PF-WEB-GROWTH',
          'reviewRequired',false,
          'reason','Conversion copywriting is captured as a current project requirement.'
        ),
        jsonb_build_object(
          'ruleKey','growth.seo',
          'ruleType','MIN_PACKAGE',
          'severity','STANDARD',
          'requirementKey','seo_priority',
          'minPackageCode','PF-WEB-GROWTH',
          'reviewRequired',false,
          'reason','SEO is captured as a current project priority.'
        ),
        jsonb_build_object(
          'ruleKey','growth.conversion_tracking',
          'ruleType','MIN_PACKAGE',
          'severity','STANDARD',
          'requirementKey','conversion_tracking',
          'minPackageCode','PF-WEB-GROWTH',
          'reviewRequired',false,
          'reason','Conversion tracking is captured as a current project requirement.'
        ),

        jsonb_build_object(
          'ruleKey','scale.accessibility',
          'ruleType','MIN_PACKAGE',
          'severity','ADVANCED',
          'requirementKey','accessibility_requirements',
          'minPackageCode','PF-WEB-SCALE',
          'reviewRequired',false,
          'reason','Explicit accessibility requirements increase implementation and QA complexity.'
        ),
        jsonb_build_object(
          'ruleKey','scale.performance',
          'ruleType','MIN_PACKAGE',
          'severity','ADVANCED',
          'requirementKey','performance_requirements',
          'minPackageCode','PF-WEB-SCALE',
          'reviewRequired',false,
          'reason','Explicit performance requirements indicate advanced implementation and QA needs.'
        ),
        jsonb_build_object(
          'ruleKey','scale.security_review',
          'ruleType','MIN_PACKAGE',
          'severity','ADVANCED',
          'requirementKey','security_requirements',
          'minPackageCode','PF-WEB-SCALE',
          'reviewRequired',true,
          'reason','Explicit security requirements increase architecture complexity and require validation before package treatment is considered reliable.'
        ),

        jsonb_build_object('ruleKey','custom.authentication','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','authentication_requirement','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Authentication or login behavior is captured.'),
        jsonb_build_object('ruleKey','custom.roles','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','user_roles_permissions','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Role-based access or permission behavior is captured.'),
        jsonb_build_object('ruleKey','custom.portal','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','portal_dashboard','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','A portal or dashboard is captured.'),
        jsonb_build_object('ruleKey','custom.database','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','data_database','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Custom data or database behavior is captured.'),
        jsonb_build_object('ruleKey','custom.workflows','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','business_workflows','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Custom business workflow behavior is captured.'),
        jsonb_build_object('ruleKey','custom.user_types','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_user_types','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Application user types are captured.'),
        jsonb_build_object('ruleKey','custom.permissions','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_permissions','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Application permission rules are captured.'),
        jsonb_build_object('ruleKey','custom.notifications','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_notifications','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Custom application notification behavior is captured.'),
        jsonb_build_object('ruleKey','custom.reporting','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_reporting','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Custom application reporting is captured.'),
        jsonb_build_object('ruleKey','custom.admin_operations','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_admin_operations','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Custom admin operations are captured.'),
        jsonb_build_object('ruleKey','custom.usage_scale','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','app_usage_scale','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Application usage or scale requirements are captured.'),
        jsonb_build_object('ruleKey','custom.acceptance','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','acceptance_criteria','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Application acceptance criteria are captured.'),
        jsonb_build_object('ruleKey','custom.training_handover','ruleType','MIN_PACKAGE','severity','CUSTOM','requirementKey','training_handover','minPackageCode','PF-CUSTOM','reviewRequired',false,'reason','Application-specific training or handover requirements are captured.')
      ),
      'addonMappings', jsonb_build_array(
        jsonb_build_object(
          'mappingKey','addon.crm',
          'requirementKey','crm_integration',
          'productCode','PF-ADD-CRM',
          'reviewRequired',false,
          'reason','A current CRM integration Requirement has a direct catalog add-on mapping.'
        ),
        jsonb_build_object(
          'mappingKey','addon.booking',
          'requirementKey','booking_required',
          'productCode','PF-ADD-BOOKING',
          'reviewRequired',false,
          'reason','A current booking Requirement has a direct catalog add-on mapping.'
        ),
        jsonb_build_object(
          'mappingKey','addon.api',
          'requirementKey','api_requirements',
          'productCode','PF-ADD-API',
          'reviewRequired',true,
          'reason','A current API Requirement has a direct catalog add-on mapping, but API complexity must be validated before package/add-on treatment is considered reliable.'
        ),
        jsonb_build_object(
          'mappingKey','addon.subscription',
          'requirementKey','subscription_requirement',
          'productCode','PF-ADD-SUBSCRIPTION',
          'reviewRequired',true,
          'reason','A recurring-subscription Requirement has a direct catalog add-on mapping, but subscription complexity must be reviewed before package/add-on treatment is considered reliable.'
        ),
        jsonb_build_object(
          'mappingKey','addon.automation',
          'requirementKey','automation_requirements',
          'productCode','PF-ADD-BPA',
          'reviewRequired',true,
          'reason','An automation Requirement has a direct catalog add-on mapping, but workflow complexity must be reviewed before package/add-on treatment is considered reliable.'
        ),
        jsonb_build_object(
          'mappingKey','addon.seo_migration',
          'requirementKey','seo_redirect_migration',
          'productCode','PF-ADD-SEOMIGRATION',
          'reviewRequired',true,
          'reason','An SEO migration Requirement has a direct catalog add-on mapping, but migration risk must be reviewed before package/add-on treatment is considered reliable.'
        ),
        jsonb_build_object(
          'mappingKey','addon.ecommerce',
          'requirementKey','ecommerce_required',
          'productCode','PF-ADD-COMMERCE25',
          'reviewRequired',true,
          'reason','An e-commerce Requirement has a current starter add-on mapping, but catalog size and commerce complexity must be reviewed before package/add-on treatment is considered reliable.'
        ),
        jsonb_build_object(
          'mappingKey','addon.payment',
          'requirementKey','payment_gateway',
          'productCode','PF-ADD-PAYMENT',
          'reviewRequired',true,
          'reason','A payment-integration Requirement has a direct catalog add-on mapping, but payment and implementation complexity must be validated before package/add-on treatment is considered reliable.'
        )
      )
    ),
    description = 'Versioned deterministic Package Fit policy. Contains fit/complexity and safe stable add-on mappings only; all current product commercial facts remain in sales_products.',
    updated_at = now()
  WHERE config_key = 'crm_package_fit_policy_v1';
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
  v_addon_mappings jsonb := '[]'::jsonb;
  v_relevant_requirement_keys text[] := ARRAY[]::text[];
  v_config_errors jsonb := '[]'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_complexity_signals jsonb := '[]'::jsonb;
  v_hard_complexity_signals jsonb := '[]'::jsonb;
  v_mismatch_signals jsonb := '[]'::jsonb;
  v_missing_information jsonb := '[]'::jsonb;
  v_validation_signals jsonb := '[]'::jsonb;
  v_candidate_products jsonb := '[]'::jsonb;
  v_possible_addons jsonb := '[]'::jsonb;
  v_recommended_product jsonb := NULL;
  v_rule jsonb;
  v_mapping jsonb;
  v_core_key text;
  v_core_title text;
  v_code text;
  v_rank integer;
  v_target_rank integer;
  v_min_rank integer := 1;
  v_duplicate_count integer;
  v_match_count integer;
  v_total_product_count integer := 0;
  v_active_product_count integer := 0;
  v_active_package_count integer := 0;
  v_active_addon_count integer := 0;
  v_catalog_observed_at timestamptz;
  v_requirement public.crm_requirements%ROWTYPE;
  v_custom public.crm_requirements%ROWTYPE;
  v_product public.sales_products%ROWTYPE;
  v_addon public.sales_products%ROWTYPE;
  v_discovery record;
  v_trace jsonb;
  v_product_json jsonb;
  v_addon_json jsonb;
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

  SELECT sc.config_value->'definitions', NULLIF(sc.config_value->>'version','')::integer
  INTO v_requirement_definitions, v_definition_version
  FROM public.system_configuration sc
  WHERE sc.config_key = 'crm_requirement_definitions_v1';

  SELECT
    count(*),
    count(*) FILTER (WHERE sp.active),
    count(*) FILTER (WHERE sp.active AND lower(COALESCE(sp.product_type,'')) = 'package'),
    count(*) FILTER (WHERE sp.active AND lower(COALESCE(sp.product_type,'')) = 'addon'),
    max(sp.updated_at)
  INTO
    v_total_product_count,
    v_active_product_count,
    v_active_package_count,
    v_active_addon_count,
    v_catalog_observed_at
  FROM public.sales_products sp;

  IF v_policy IS NULL THEN
    v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
      'code','POLICY_MISSING','message','Package Fit policy configuration is missing.','sourceType','POLICY'
    ));
  ELSE
    v_policy_version := NULLIF(v_policy->>'policyVersion','')::integer;
    v_package_order := COALESCE(v_policy->'packageOrder', '[]'::jsonb);
    v_fit_core_keys := COALESCE(v_policy->'fitCoreRequirementKeys', '[]'::jsonb);
    v_rules := COALESCE(v_policy->'rules', '[]'::jsonb);
    v_addon_mappings := COALESCE(v_policy->'addonMappings', '[]'::jsonb);

    IF v_policy->>'policyKey' IS DISTINCT FROM v_policy_key THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','POLICY_KEY_INVALID','message','Package Fit policyKey does not match its canonical configuration key.','sourceType','POLICY'
      ));
    END IF;

    IF v_policy_version IS DISTINCT FROM 1 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','POLICY_VERSION_UNSUPPORTED','message','Package Fit policy version is unsupported.','sourceType','POLICY'
      ));
    END IF;

    IF jsonb_typeof(v_package_order) IS DISTINCT FROM 'array' OR jsonb_array_length(v_package_order) = 0 THEN
      v_package_order := '[]'::jsonb;
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','PACKAGE_ORDER_INVALID','message','Package Fit package order is missing or malformed.','sourceType','POLICY'
      ));
    END IF;

    IF jsonb_typeof(v_fit_core_keys) IS DISTINCT FROM 'array' THEN
      v_fit_core_keys := '[]'::jsonb;
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','CORE_KEYS_INVALID','message','Package Fit core Requirement keys are malformed.','sourceType','POLICY'
      ));
    END IF;

    IF jsonb_typeof(v_rules) IS DISTINCT FROM 'array' THEN
      v_rules := '[]'::jsonb;
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','RULES_INVALID','message','Package Fit rules are malformed.','sourceType','POLICY'
      ));
    END IF;

    IF jsonb_typeof(v_addon_mappings) IS DISTINCT FROM 'array' THEN
      v_addon_mappings := '[]'::jsonb;
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','ADDON_MAPPINGS_INVALID','message','Package Fit add-on mappings are malformed.','sourceType','POLICY'
      ));
    END IF;
  END IF;

  IF v_requirement_definitions IS NULL OR jsonb_typeof(v_requirement_definitions) IS DISTINCT FROM 'array' THEN
    v_requirement_definitions := '[]'::jsonb;
    v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
      'code','REQUIREMENT_DEFINITIONS_MISSING','message','Canonical Requirement Definitions are unavailable.','sourceType','POLICY'
    ));
  END IF;

  IF jsonb_typeof(v_package_order) = 'array' THEN
    SELECT count(*)
    INTO v_duplicate_count
    FROM (
      SELECT value
      FROM jsonb_array_elements_text(v_package_order)
      GROUP BY value
      HAVING count(*) > 1
    ) duplicate_codes;

    IF v_duplicate_count > 0 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','DUPLICATE_PACKAGE_CODE','message','Package Fit policy contains duplicate package codes.','sourceType','POLICY'
      ));
    END IF;

    IF v_active_package_count IS DISTINCT FROM jsonb_array_length(v_package_order) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','ACTIVE_PACKAGE_CATALOG_DRIFT','message','The active package catalog no longer matches the Package Fit policy package set.','sourceType','CATALOG'
      ));
    END IF;
  END IF;

  FOR v_code IN SELECT value FROM jsonb_array_elements_text(v_package_order)
  LOOP
    SELECT count(*)
    INTO v_match_count
    FROM public.sales_products sp
    WHERE sp.code = v_code;

    IF v_match_count <> 1 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','CATALOG_PACKAGE_CODE_INVALID','message','Package code ' || v_code || ' does not resolve to exactly one current catalog record.','sourceType','CATALOG','minimumProductCode',v_code
      ));
      CONTINUE;
    END IF;

    SELECT sp.*
    INTO v_product
    FROM public.sales_products sp
    WHERE sp.code = v_code
    LIMIT 1;

    IF NOT v_product.active OR lower(COALESCE(v_product.product_type,'')) <> 'package' THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','CATALOG_PACKAGE_INACTIVE','message','Package code ' || v_code || ' is not an active package in the current catalog.','sourceType','CATALOG','minimumProductCode',v_code
      ));
    END IF;
  END LOOP;

  SELECT count(*)
  INTO v_duplicate_count
  FROM (
    SELECT item->>'ruleKey' AS rule_key
    FROM jsonb_array_elements(v_rules) item
    GROUP BY item->>'ruleKey'
    HAVING item->>'ruleKey' IS NULL OR count(*) > 1
  ) duplicate_rules;

  IF v_duplicate_count > 0 THEN
    v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
      'code','DUPLICATE_OR_MISSING_RULE_KEY','message','Package Fit policy contains duplicate or missing rule keys.','sourceType','POLICY'
    ));
  END IF;

  FOR v_rule IN SELECT value FROM jsonb_array_elements(v_rules)
  LOOP
    IF v_rule->>'ruleType' IS DISTINCT FROM 'MIN_PACKAGE' THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','INVALID_RULE_TYPE','message','Unsupported Package Fit rule type.','sourceType','POLICY','ruleKey',v_rule->>'ruleKey'
      ));
    END IF;

    IF COALESCE(v_rule->>'severity','') NOT IN ('STANDARD','ADVANCED','CUSTOM') THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','INVALID_RULE_SEVERITY','message','Unsupported Package Fit rule severity.','sourceType','POLICY','ruleKey',v_rule->>'ruleKey'
      ));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_requirement_definitions) d
      WHERE COALESCE((d->>'active')::boolean, true)
        AND d->>'requirementKey' = v_rule->>'requirementKey'
    ) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','UNKNOWN_REQUIREMENT_KEY','message','Package Fit rule references an unknown Requirement key.','sourceType','POLICY','ruleKey',v_rule->>'ruleKey','requirementKey',v_rule->>'requirementKey'
      ));
    END IF;

    IF NOT (v_package_order ? (v_rule->>'minPackageCode')) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','UNKNOWN_MINIMUM_PACKAGE','message','Package Fit rule references a package outside the policy order.','sourceType','POLICY','ruleKey',v_rule->>'ruleKey','minimumProductCode',v_rule->>'minPackageCode'
      ));
    END IF;

    v_relevant_requirement_keys := array_append(v_relevant_requirement_keys, v_rule->>'requirementKey');
  END LOOP;

  SELECT count(*)
  INTO v_duplicate_count
  FROM (
    SELECT item->>'mappingKey' AS mapping_key
    FROM jsonb_array_elements(v_addon_mappings) item
    GROUP BY item->>'mappingKey'
    HAVING item->>'mappingKey' IS NULL OR count(*) > 1
  ) duplicate_mappings;

  IF v_duplicate_count > 0 THEN
    v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
      'code','DUPLICATE_OR_MISSING_ADDON_MAPPING_KEY','message','Package Fit policy contains duplicate or missing add-on mapping keys.','sourceType','POLICY'
    ));
  END IF;

  FOR v_mapping IN SELECT value FROM jsonb_array_elements(v_addon_mappings)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_requirement_definitions) d
      WHERE COALESCE((d->>'active')::boolean, true)
        AND d->>'requirementKey' = v_mapping->>'requirementKey'
    ) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','UNKNOWN_ADDON_REQUIREMENT_KEY','message','Package Fit add-on mapping references an unknown Requirement key.','sourceType','POLICY','mappingKey',v_mapping->>'mappingKey','requirementKey',v_mapping->>'requirementKey'
      ));
    END IF;

    SELECT count(*)
    INTO v_match_count
    FROM public.sales_products sp
    WHERE sp.code = v_mapping->>'productCode';

    IF v_match_count <> 1 THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','CATALOG_ADDON_CODE_INVALID','message','Mapped add-on code ' || COALESCE(v_mapping->>'productCode','(missing)') || ' does not resolve to exactly one current catalog record.','sourceType','CATALOG','productCode',v_mapping->>'productCode','mappingKey',v_mapping->>'mappingKey'
      ));
    ELSE
      SELECT sp.*
      INTO v_addon
      FROM public.sales_products sp
      WHERE sp.code = v_mapping->>'productCode'
      LIMIT 1;

      IF NOT v_addon.active OR lower(COALESCE(v_addon.product_type,'')) <> 'addon' THEN
        v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
          'code','CATALOG_ADDON_INACTIVE','message','Mapped add-on code ' || v_mapping->>'productCode' || ' is not an active add-on in the current catalog.','sourceType','CATALOG','productCode',v_mapping->>'productCode','mappingKey',v_mapping->>'mappingKey'
        ));
      END IF;
    END IF;

    v_relevant_requirement_keys := array_append(v_relevant_requirement_keys, v_mapping->>'requirementKey');
  END LOOP;

  FOR v_core_key IN SELECT value FROM jsonb_array_elements_text(v_fit_core_keys)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_requirement_definitions) d
      WHERE COALESCE((d->>'active')::boolean, true)
        AND d->>'requirementKey' = v_core_key
    ) THEN
      v_config_errors := v_config_errors || jsonb_build_array(jsonb_build_object(
        'code','UNKNOWN_CORE_REQUIREMENT_KEY','message','Package Fit core input references an unknown Requirement key.','sourceType','POLICY','requirementKey',v_core_key
      ));
    END IF;

    v_relevant_requirement_keys := array_append(v_relevant_requirement_keys, v_core_key);
  END LOOP;

  SELECT
    count(*) FILTER (WHERE r.record_state = 'ACTIVE'),
    count(*) FILTER (
      WHERE r.record_state = 'ACTIVE'
        AND r.information_certainty = 'CLIENT_CONFIRMED'
        AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
    ),
    count(*) FILTER (
      WHERE r.record_state = 'ACTIVE'
        AND r.information_certainty IN ('SELLER_OBSERVATION','SELLER_HYPOTHESIS','AWAITING_CLIENT','NEEDS_SPECIALIST_VALIDATION')
        AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
    ),
    count(*) FILTER (
      WHERE r.record_state = 'ACTIVE'
        AND r.is_custom
        AND r.information_certainty <> 'NOT_APPLICABLE'
        AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
    )
  INTO
    v_active_requirement_count,
    v_confirmed_requirement_count,
    v_unresolved_requirement_count,
    v_custom_requirement_count
  FROM public.crm_requirements r
  WHERE r.lead_id = v_lead_id;

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
      AND r.record_state = 'ACTIVE'
      AND NOT r.is_custom
      AND r.requirement_key = v_core_key
    ORDER BY r.updated_at DESC, r.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      v_missing_information := v_missing_information || jsonb_build_array(jsonb_build_object(
        'code','CORE_SCOPE_MISSING','message',COALESCE(v_core_title, v_core_key) || ' is still missing for reliable Package Fit.','sourceType','REQUIREMENT','requirementKey',v_core_key
      ));
      CONTINUE;
    END IF;

    IF v_requirement.information_certainty = 'NOT_APPLICABLE' THEN
      CONTINUE;
    END IF;

    IF NULLIF(btrim(COALESCE(v_requirement.content,'')), '') IS NULL AND v_requirement.structured_value IS NULL THEN
      v_missing_information := v_missing_information || jsonb_build_array(jsonb_build_object(
        'code','CORE_SCOPE_EMPTY','message',COALESCE(v_core_title, v_core_key) || ' has no meaningful current value for Package Fit.','sourceType','REQUIREMENT','requirementId',v_requirement.id,'requirementKey',v_core_key,'certainty',v_requirement.information_certainty
      ));
      CONTINUE;
    END IF;

    CASE v_requirement.information_certainty
      WHEN 'CLIENT_CONFIRMED' THEN
        v_has_fit_input := true;
      WHEN 'SELLER_OBSERVATION' THEN
        v_observation_count := v_observation_count + 1;
        v_missing_information := v_missing_information || jsonb_build_array(jsonb_build_object(
          'code','CORE_SCOPE_OBSERVED','message',COALESCE(v_core_title, v_core_key) || ' is currently a Seller observation and needs confirmation for stronger Package Fit confidence.','sourceType','REQUIREMENT','requirementId',v_requirement.id,'requirementKey',v_core_key,'certainty',v_requirement.information_certainty,'provisional',true
        ));
      WHEN 'SELLER_HYPOTHESIS' THEN
        v_missing_information := v_missing_information || jsonb_build_array(jsonb_build_object(
          'code','CORE_SCOPE_HYPOTHESIS','message',COALESCE(v_core_title, v_core_key) || ' is only a Seller hypothesis and cannot be assumed for Package Fit.','sourceType','REQUIREMENT','requirementId',v_requirement.id,'requirementKey',v_core_key,'certainty',v_requirement.information_certainty,'provisional',true
        ));
      WHEN 'AWAITING_CLIENT' THEN
        v_missing_information := v_missing_information || jsonb_build_array(jsonb_build_object(
          'code','CORE_SCOPE_AWAITING_CLIENT','message',COALESCE(v_core_title, v_core_key) || ' is awaiting client confirmation.','sourceType','REQUIREMENT','requirementId',v_requirement.id,'requirementKey',v_core_key,'certainty',v_requirement.information_certainty
        ));
      WHEN 'NEEDS_SPECIALIST_VALIDATION' THEN
        v_has_review := true;
        v_validation_signals := v_validation_signals || jsonb_build_array(jsonb_build_object(
          'code','CORE_SCOPE_VALIDATION','message',COALESCE(v_core_title, v_core_key) || ' needs specialist validation before Package Fit can be reliable. Review workflow is not initiated by Part 6.','sourceType','REQUIREMENT','requirementId',v_requirement.id,'requirementKey',v_core_key,'certainty',v_requirement.information_certainty
        ));
      ELSE
        NULL;
    END CASE;
  END LOOP;

  FOR v_rule IN SELECT value FROM jsonb_array_elements(v_rules)
  LOOP
    SELECT r.*
    INTO v_requirement
    FROM public.crm_requirements r
    WHERE r.lead_id = v_lead_id
      AND r.record_state = 'ACTIVE'
      AND NOT r.is_custom
      AND r.requirement_key = v_rule->>'requirementKey'
      AND r.information_certainty <> 'NOT_APPLICABLE'
      AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
    ORDER BY r.updated_at DESC, r.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT ordinality::integer
    INTO v_target_rank
    FROM jsonb_array_elements_text(v_package_order) WITH ORDINALITY package_code(value, ordinality)
    WHERE package_code.value = v_rule->>'minPackageCode'
    LIMIT 1;

    v_trace := jsonb_build_object(
      'code', upper(replace(v_rule->>'ruleKey','.','_')),
      'message', v_rule->>'reason',
      'sourceType','REQUIREMENT',
      'requirementId',v_requirement.id,
      'requirementKey',v_requirement.requirement_key,
      'certainty',v_requirement.information_certainty,
      'minimumProductCode',v_rule->>'minPackageCode'
    );

    CASE v_requirement.information_certainty
      WHEN 'CLIENT_CONFIRMED' THEN
        v_has_fit_input := true;
        v_min_rank := GREATEST(v_min_rank, COALESCE(v_target_rank, v_min_rank));
        v_reasons := v_reasons || jsonb_build_array(v_trace);
        v_hard_complexity_signals := v_hard_complexity_signals || jsonb_build_array(v_trace);
        v_complexity_signals := v_complexity_signals || jsonb_build_array(v_trace);

        IF COALESCE((v_rule->>'reviewRequired')::boolean, false) THEN
          v_has_review := true;
          v_validation_signals := v_validation_signals || jsonb_build_array(v_trace || jsonb_build_object(
            'code',upper(replace(v_rule->>'ruleKey','.','_')) || '_REVIEW_REQUIRED',
            'message',(v_rule->>'reason') || ' Package Fit identifies the trigger only; the review workflow is deferred to the next phase.'
          ));
        END IF;
      WHEN 'SELLER_OBSERVATION' THEN
        v_observation_count := v_observation_count + 1;
        v_complexity_signals := v_complexity_signals || jsonb_build_array(v_trace || jsonb_build_object(
          'provisional',true,
          'message',(v_rule->>'reason') || ' This is currently a Seller observation and does not hard-classify the package.'
        ));
      WHEN 'SELLER_HYPOTHESIS' THEN
        v_missing_information := v_missing_information || jsonb_build_array(v_trace || jsonb_build_object(
          'provisional',true,
          'message',(v_rule->>'reason') || ' This is only a Seller hypothesis and cannot force a package recommendation.'
        ));
      WHEN 'AWAITING_CLIENT' THEN
        v_missing_information := v_missing_information || jsonb_build_array(v_trace || jsonb_build_object(
          'message',(v_rule->>'reason') || ' Client confirmation is still pending.'
        ));
      WHEN 'NEEDS_SPECIALIST_VALIDATION' THEN
        v_has_review := true;
        v_validation_signals := v_validation_signals || jsonb_build_array(v_trace || jsonb_build_object(
          'message',(v_rule->>'reason') || ' Specialist validation is required before Package Fit can rely on this requirement. Review workflow is not initiated by Part 6.'
        ));
      ELSE
        NULL;
    END CASE;
  END LOOP;

  FOR v_mapping IN SELECT value FROM jsonb_array_elements(v_addon_mappings)
  LOOP
    SELECT r.*
    INTO v_requirement
    FROM public.crm_requirements r
    WHERE r.lead_id = v_lead_id
      AND r.record_state = 'ACTIVE'
      AND NOT r.is_custom
      AND r.requirement_key = v_mapping->>'requirementKey'
      AND r.information_certainty <> 'NOT_APPLICABLE'
      AND (NULLIF(btrim(COALESCE(r.content,'')), '') IS NOT NULL OR r.structured_value IS NOT NULL)
    ORDER BY r.updated_at DESC, r.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_trace := jsonb_build_object(
      'code', upper(replace(v_mapping->>'mappingKey','.','_')),
      'message',v_mapping->>'reason',
      'sourceType','REQUIREMENT',
      'requirementId',v_requirement.id,
      'requirementKey',v_requirement.requirement_key,
      'certainty',v_requirement.information_certainty,
      'productCode',v_mapping->>'productCode'
    );

    CASE v_requirement.information_certainty
      WHEN 'CLIENT_CONFIRMED' THEN
        SELECT sp.*
        INTO v_addon
        FROM public.sales_products sp
        WHERE sp.code = v_mapping->>'productCode'
          AND sp.active
          AND lower(COALESCE(sp.product_type,'')) = 'addon'
        LIMIT 1;

        IF FOUND THEN
          v_addon_json := jsonb_build_object(
            'id',v_addon.id,
            'code',v_addon.code,
            'name',v_addon.name,
            'productType',v_addon.product_type,
            'priceMode',v_addon.price_mode,
            'basePrice',v_addon.base_price,
            'currency',v_addon.currency,
            'billingPeriod',v_addon.billing_period,
            'scope',v_addon.scope,
            'technology',v_addon.technology,
            'managerApprovalRequired',v_addon.manager_approval_required,
            'timelineImpact',v_addon.timeline_impact,
            'deliveryDurationMin',v_addon.delivery_duration_min,
            'deliveryDurationMax',v_addon.delivery_duration_max,
            'deliveryDurationUnit',v_addon.delivery_duration_unit,
            'deliveryDurationNote',v_addon.delivery_duration_note,
            'serviceFamily',v_addon.service_family,
            'updatedAt',v_addon.updated_at,
            'trigger',v_trace,
            'reviewRequired',COALESCE((v_mapping->>'reviewRequired')::boolean, false),
            'provisional',false
          );
          v_possible_addons := v_possible_addons || jsonb_build_array(v_addon_json);
        END IF;

        IF COALESCE((v_mapping->>'reviewRequired')::boolean, false) THEN
          v_has_review := true;
          v_complexity_signals := v_complexity_signals || jsonb_build_array(v_trace || jsonb_build_object(
            'code',upper(replace(v_mapping->>'mappingKey','.','_')) || '_PACKAGE_OR_ADDON_REVIEW',
            'message',(v_mapping->>'reason') || ' A possible current catalog add-on exists, but Part 6 does not decide or add it to a quotation.'
          ));
          v_validation_signals := v_validation_signals || jsonb_build_array(v_trace || jsonb_build_object(
            'code',upper(replace(v_mapping->>'mappingKey','.','_')) || '_VALIDATION',
            'message','Review package-versus-add-on treatment and feasibility before relying on this item. Part 6 creates no review record and no quote item.'
          ));
        END IF;
      WHEN 'SELLER_OBSERVATION' THEN
        v_observation_count := v_observation_count + 1;
        v_missing_information := v_missing_information || jsonb_build_array(v_trace || jsonb_build_object(
          'provisional',true,
          'message',(v_mapping->>'reason') || ' This is currently a Seller observation; confirm it before treating the add-on as relevant.'
        ));
      WHEN 'SELLER_HYPOTHESIS' THEN
        v_missing_information := v_missing_information || jsonb_build_array(v_trace || jsonb_build_object(
          'provisional',true,
          'message',(v_mapping->>'reason') || ' This is only a Seller hypothesis; no add-on is treated as confirmed.'
        ));
      WHEN 'AWAITING_CLIENT' THEN
        v_missing_information := v_missing_information || jsonb_build_array(v_trace || jsonb_build_object(
          'message',(v_mapping->>'reason') || ' Client confirmation is still pending; no add-on is treated as confirmed.'
        ));
      WHEN 'NEEDS_SPECIALIST_VALIDATION' THEN
        v_has_review := true;
        v_validation_signals := v_validation_signals || jsonb_build_array(v_trace || jsonb_build_object(
          'message',(v_mapping->>'reason') || ' Specialist validation is required before package/add-on treatment can be relied on.'
        ));
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
      'message','Custom Requirement “' || v_custom.title || '” is not mapped to a canonical Package Fit rule and requires review before a reliable package recommendation.',
      'sourceType','CUSTOM_REQUIREMENT',
      'requirementId',v_custom.id,
      'requirementKey',v_custom.requirement_key,
      'certainty',v_custom.information_certainty
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
      q.id AS question_id,
      q.question_key,
      q.question_text,
      dr.question_state,
      dr.information_certainty,
      dr.follow_up_required
    FROM public.crm_discovery_questions q
    LEFT JOIN public.crm_discovery_responses dr
      ON dr.lead_id = v_lead_id
     AND dr.question_id = q.id
    WHERE (q.lead_id IS NULL OR q.lead_id = v_lead_id)
      AND q.active
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(q.applicability->'relatedRequirementKeys') = 'array'
              THEN q.applicability->'relatedRequirementKeys'
            ELSE '[]'::jsonb
          END
        ) related_key(value)
        WHERE related_key.value = ANY(v_relevant_requirement_keys)
      )
      AND (
        dr.id IS NULL
        OR dr.question_state IN ('NOT_ASKED','ASKED','NEEDS_FOLLOW_UP')
        OR dr.follow_up_required
        OR dr.information_certainty IN ('SELLER_HYPOTHESIS','AWAITING_CLIENT','NEEDS_SPECIALIST_VALIDATION')
      )
      AND COALESCE(dr.information_certainty, '') <> 'NOT_APPLICABLE'
    ORDER BY q.sort_order, q.id
  LOOP
    v_discovery_signal_count := v_discovery_signal_count + 1;

    IF v_discovery.information_certainty = 'NEEDS_SPECIALIST_VALIDATION' THEN
      v_has_review := true;
      v_validation_signals := v_validation_signals || jsonb_build_array(jsonb_build_object(
        'code','DISCOVERY_VALIDATION_REQUIRED',
        'message','Discovery still requires specialist validation: ' || v_discovery.question_text,
        'sourceType','DISCOVERY',
        'questionId',v_discovery.question_id,
        'questionKey',v_discovery.question_key,
        'certainty',v_discovery.information_certainty
      ));
    ELSE
      v_missing_information := v_missing_information || jsonb_build_array(jsonb_build_object(
        'code','DISCOVERY_SCOPE_UNRESOLVED',
        'message','Package Fit-relevant Discovery is still unresolved: ' || v_discovery.question_text,
        'sourceType','DISCOVERY',
        'questionId',v_discovery.question_id,
        'questionKey',v_discovery.question_key,
        'certainty',v_discovery.information_certainty
      ));
    END IF;
  END LOOP;

  IF v_has_fit_input AND v_min_rank = 1 THEN
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'code','BASE_SCOPE_CURRENTLY_STANDARD',
      'message','No client-confirmed Package Fit rule currently requires a base package above the first active package in policy order; core project scope is captured.',
      'sourceType','POLICY',
      'minimumProductCode',v_package_order->>0
    ));
  END IF;

  v_mismatch_signals := v_hard_complexity_signals;

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

  IF NOT v_has_review
     AND jsonb_array_length(v_config_errors) = 0
     AND v_has_fit_input
     AND v_min_rank BETWEEN 1 AND jsonb_array_length(v_package_order) THEN
    v_code := v_package_order->>(v_min_rank - 1);

    SELECT sp.*
    INTO v_product
    FROM public.sales_products sp
    WHERE sp.code = v_code
      AND sp.active
      AND lower(COALESCE(sp.product_type,'')) = 'package'
    LIMIT 1;

    IF FOUND THEN
      v_recommended_product := jsonb_build_object(
        'id',v_product.id,
        'code',v_product.code,
        'name',v_product.name,
        'productType',v_product.product_type,
        'priceMode',v_product.price_mode,
        'basePrice',v_product.base_price,
        'currency',v_product.currency,
        'billingPeriod',v_product.billing_period,
        'scope',v_product.scope,
        'technology',v_product.technology,
        'managerApprovalRequired',v_product.manager_approval_required,
        'timelineImpact',v_product.timeline_impact,
        'deliveryDurationMin',v_product.delivery_duration_min,
        'deliveryDurationMax',v_product.delivery_duration_max,
        'deliveryDurationUnit',v_product.delivery_duration_unit,
        'deliveryDurationNote',v_product.delivery_duration_note,
        'serviceFamily',v_product.service_family,
        'updatedAt',v_product.updated_at
      );
    END IF;
  END IF;

  FOR v_code, v_rank IN
    SELECT package_code.value, package_code.ordinality::integer
    FROM jsonb_array_elements_text(v_package_order) WITH ORDINALITY package_code(value, ordinality)
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
      'id',v_product.id,
      'code',v_product.code,
      'name',v_product.name,
      'productType',v_product.product_type,
      'priceMode',v_product.price_mode,
      'basePrice',v_product.base_price,
      'currency',v_product.currency,
      'billingPeriod',v_product.billing_period,
      'scope',v_product.scope,
      'technology',v_product.technology,
      'managerApprovalRequired',v_product.manager_approval_required,
      'timelineImpact',v_product.timeline_impact,
      'deliveryDurationMin',v_product.delivery_duration_min,
      'deliveryDurationMax',v_product.delivery_duration_max,
      'deliveryDurationUnit',v_product.delivery_duration_unit,
      'deliveryDurationNote',v_product.delivery_duration_note,
      'serviceFamily',v_product.service_family,
      'updatedAt',v_product.updated_at
    );

    IF v_rank < v_min_rank THEN
      v_candidate_status := 'MISMATCH';
      v_candidate_mismatches := v_hard_complexity_signals;
    ELSIF v_has_review OR jsonb_array_length(v_config_errors) > 0 THEN
      v_candidate_status := 'REVIEW_REQUIRED';
      v_candidate_mismatches := CASE WHEN v_rank < v_min_rank THEN v_hard_complexity_signals ELSE '[]'::jsonb END;
    ELSIF jsonb_array_length(v_missing_information) > 0 OR v_observation_count > 0 OR NOT v_has_fit_input THEN
      v_candidate_status := 'POSSIBLE_FIT';
      v_candidate_mismatches := '[]'::jsonb;
    ELSIF v_rank = v_min_rank THEN
      v_candidate_status := 'FIT';
      v_candidate_mismatches := '[]'::jsonb;
    ELSE
      v_candidate_status := 'POSSIBLE_FIT';
      v_candidate_mismatches := '[]'::jsonb;
    END IF;

    v_candidate_products := v_candidate_products || jsonb_build_array(
      v_product_json || jsonb_build_object(
        'assessmentStatus',v_candidate_status,
        'mismatchReasons',v_candidate_mismatches
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'leadId',v_lead_id,
    'opportunityId',v_opportunity_id,
    'policyKey',v_policy_key,
    'policyVersion',COALESCE(v_policy_version,1),
    'evaluatedAt',statement_timestamp(),
    'catalogObservedAt',v_catalog_observed_at,
    'status',v_status,
    'confidence',v_confidence,
    'recommendedProduct',v_recommended_product,
    'candidateProducts',v_candidate_products,
    'possibleAddOns',v_possible_addons,
    'reasons',v_reasons,
    'complexitySignals',v_complexity_signals,
    'mismatchSignals',v_mismatch_signals,
    'missingInformation',v_missing_information,
    'validationSignals',v_validation_signals,
    'managerApprovalRequired',COALESCE((v_recommended_product->>'managerApprovalRequired')::boolean,false),
    'timelineAssessmentRequired',COALESCE(v_recommended_product->>'timelineImpact','') = 'assessment_required',
    'configurationStatus',CASE WHEN jsonb_array_length(v_config_errors) = 0 THEN 'OK' ELSE 'REVIEW_REQUIRED' END,
    'sourceSummary',jsonb_build_object(
      'activeRequirementCount',v_active_requirement_count,
      'confirmedRequirementCount',v_confirmed_requirement_count,
      'unresolvedRequirementCount',v_unresolved_requirement_count,
      'customRequirementCount',v_custom_requirement_count,
      'discoverySignalCount',v_discovery_signal_count,
      'totalProductCount',v_total_product_count,
      'activeProductCount',v_active_product_count,
      'activePackageCount',v_active_package_count,
      'activeAddonCount',v_active_addon_count,
      'requirementDefinitionVersion',v_definition_version
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.crm_get_package_fit_assessment(uuid, uuid) IS
'Part 6 read-only deterministic Package Fit evaluator. Uses current sales_products as commercial truth, current CRM Requirements/Discovery, one versioned policy, and safe add-on guidance. Produces guidance only and creates no client business records.';
