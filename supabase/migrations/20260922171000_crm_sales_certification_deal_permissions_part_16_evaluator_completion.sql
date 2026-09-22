-- PF-SOP-01 Part 16 completion foundation: canonical evaluator + progressive server enforcement.
-- Policy remains staged/inactive unless a later reviewed policy update explicitly activates it.

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
  WHERE sp.active=true AND lower(coalesce(sp.product_type,''))='package';

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
    'finalCertification',coalesce(v_final,'{}'::jsonb),
    'certifications',v_certifications,
    'products',v_products
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_get_certification_permission_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_get_certification_permission_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_sales_certification_permissions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_policy jsonb:=public.sales_certification_policy();
  v_sellers jsonb:='[]'::jsonb;
  v_history jsonb:='[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',up.id,
      'name',coalesce(nullif(up.full_name,''),up.email),
      'email',up.email,
      'role',up.role,
      'snapshot',public.sales_get_certification_permission_snapshot(up.id)
    )
    ORDER BY coalesce(nullif(up.full_name,''),up.email),up.id
  ),'[]'::jsonb)
  INTO v_sellers
  FROM public.user_profiles up
  WHERE up.status='active' AND up.role IN ('sales','sales_rep','sales_team');

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',g.id,
      'salespersonId',g.salesperson_id,
      'salespersonName',coalesce(nullif(up.full_name,''),up.email),
      'productId',g.sales_product_id,
      'productCode',g.product_code_snapshot,
      'productName',sp.name,
      'certificationKey',g.certification_key,
      'authorityMode',g.authority_mode,
      'grantState',g.grant_state,
      'effectiveStatus',public.sales_certification_grant_effective_status(g.grant_state,g.expires_at,g.revoked_at),
      'expiresAt',g.expires_at,
      'evidenceType',g.evidence_type,
      'evidence',g.evidence,
      'grantReason',g.grant_reason,
      'policyVersion',g.policy_version,
      'grantedBy',g.granted_by,
      'grantedAt',g.granted_at,
      'revokedBy',g.revoked_by,
      'revokedAt',g.revoked_at,
      'revocationReason',g.revocation_reason
    ) ORDER BY g.granted_at DESC,g.id DESC),'[]'::jsonb)
  INTO v_history
  FROM public.sales_certification_package_grants g
  JOIN public.user_profiles up ON up.id=g.salesperson_id
  JOIN public.sales_products sp ON sp.id=g.sales_product_id;

  RETURN jsonb_build_object(
    'policy',v_policy,
    'sellers',v_sellers,
    'history',v_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_sales_certification_permissions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_sales_certification_permissions() TO authenticated;

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
      AND lower(coalesce(sp.product_type,'')) IN ('package','addon')
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
      'requiredCertification',NULL,
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
      'reasons',jsonb_build_array('Part 16 product policy is intentionally staged. Current deal authority is unchanged.'),
      'recommendedAction','Continue using existing CRM, Package Fit, Validation, quotation approval and Part 10B controls until Management approves exact Part 16 product rules.',
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

      IF lower(coalesce(v_product.product_type,''))='package' THEN
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

      IF lower(coalesce(v_product.product_type,''))='package' THEN
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

      IF v_validation_required OR v_escalation_required THEN
        SELECT EXISTS(
          SELECT 1
          FROM public.crm_sales_validations sv
          WHERE sv.opportunity_id=v_opportunity_id
            AND sv.status='APPROVED'
            AND (sv.product_id IS NULL OR sv.product_id=v_product.id)
        ) INTO v_validation_satisfied;
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

CREATE OR REPLACE FUNCTION public.crm_assert_sales_certification_deal_permission(p_quotation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_assessment jsonb;
  v_message text;
BEGIN
  v_assessment:=public.crm_get_sales_certification_deal_permission(NULL,NULL,NULL,p_quotation_id);
  IF coalesce((v_assessment->>'enforcementActive')::boolean,false)
     AND coalesce((v_assessment->>'canSend')::boolean,false) IS DISTINCT FROM true THEN
    SELECT string_agg(coalesce(value->>'message','Sales certification permission failed.'),' | ')
    INTO v_message
    FROM jsonb_array_elements(coalesce(v_assessment->'blockers','[]'::jsonb));
    RAISE EXCEPTION 'Quotation cannot be sent: %',coalesce(nullif(v_message,''),v_assessment->>'recommendedAction','Sales certification deal permission is not satisfied.');
  END IF;
  RETURN v_assessment;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_assert_sales_certification_deal_permission(uuid) FROM PUBLIC,anon,authenticated;

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

  IF NOT FOUND OR lower(coalesce(v_product.product_type,'')) NOT IN ('package','addon') THEN
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

CREATE OR REPLACE FUNCTION public.crm_enforce_sales_certification_pipeline_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_policy jsonb:=public.sales_certification_policy();
  v_assessment jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR new.stage IS NOT DISTINCT FROM old.stage
     OR coalesce((v_policy->>'enforcementActive')::boolean,false) IS DISTINCT FROM true
     OR NOT (coalesce(v_policy->'protectedCommitmentStages','[]'::jsonb) ? new.stage) THEN
    RETURN new;
  END IF;

  v_assessment:=public.crm_get_sales_certification_deal_permission(
    new.salesperson_id,NULL,new.id,NULL
  );

  IF v_assessment->>'permissionMode' IN ('BLOCKED','QUALIFY_ONLY')
     OR coalesce((v_assessment->>'allowed')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Pipeline stage % requires additional Sales certification authority: %',
      new.stage,
      coalesce(nullif(v_assessment->>'recommendedAction',''),'route to a qualified reviewer or Management.');
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_enforce_sales_certification_pipeline_stage() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_crm_enforce_sales_certification_pipeline_stage ON public.crm_opportunities;
CREATE TRIGGER trg_crm_enforce_sales_certification_pipeline_stage
BEFORE UPDATE OF stage
ON public.crm_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.crm_enforce_sales_certification_pipeline_stage();

COMMENT ON FUNCTION public.crm_get_sales_certification_deal_permission(uuid,text,uuid,uuid) IS
  'Part 16 canonical Seller deal-authority evaluator. Supports INDEPENDENT, SUPERVISED, QUALIFY_ONLY and BLOCKED; uses current sales_products, versioned policy, explicit grant evidence, Sales Validation and existing quotation approval; never replaces Package Fit or Part 10B.';

DO $$
DECLARE
  v_policy jsonb;
  v_grants integer;
BEGIN
  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  IF nullif(v_policy->>'schemaVersion','')::integer IS DISTINCT FROM 2
     OR coalesce((v_policy->>'enforcementActive')::boolean,false)
     OR coalesce((v_policy->>'grantingActive')::boolean,false)
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false) THEN
    RAISE EXCEPTION 'Part 16 evaluator completion must preserve staged rollout.';
  END IF;

  SELECT count(*)::integer INTO v_grants
  FROM public.sales_certification_package_grants;
  IF v_grants<>0 THEN
    RAISE EXCEPTION 'Part 16 evaluator completion must not create granular certification grants.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='crm_get_sales_certification_deal_permission')<>1
     OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND t.tgname='trg_crm_enforce_sales_certification_pipeline_stage' AND NOT t.tgisinternal)<>1 THEN
    RAISE EXCEPTION 'Part 16 canonical evaluator/pipeline hook must exist exactly once.';
  END IF;
END $$;
