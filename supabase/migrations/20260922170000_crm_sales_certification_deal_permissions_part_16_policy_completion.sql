-- PF-SOP-01 Part 16 completion foundation: configurable policy + certification grant semantics.
-- Forward-only. The already-applied 150000/151000 migrations remain immutable.
-- This migration deliberately keeps criteria/granting/enforcement inactive and creates no grants.

DO $$
DECLARE
  v_grants integer;
  v_policy jsonb;
BEGIN
  IF to_regclass('public.sales_certification_package_grants') IS NULL THEN
    RAISE EXCEPTION 'Part 16 grant truth must exist before completion hardening.';
  END IF;

  SELECT count(*)::integer INTO v_grants
  FROM public.sales_certification_package_grants;
  IF v_grants<>0 THEN
    RAISE EXCEPTION 'Part 16 completion hardening refuses to infer certification metadata for existing grants. Review them explicitly first.';
  END IF;

  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  IF v_policy IS NULL
     OR v_policy->>'policyKey' IS DISTINCT FROM 'crm_sales_certification_deal_permission_policy_v1'
     OR coalesce((v_policy->>'grantingActive')::boolean,false)
     OR coalesce((v_policy->>'enforcementActive')::boolean,false)
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false) THEN
    RAISE EXCEPTION 'Part 16 completion hardening requires the existing staged, inactive policy.';
  END IF;
END $$;

ALTER TABLE public.sales_certification_package_grants
  ADD COLUMN certification_key text,
  ADD COLUMN grant_state text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN expires_at timestamptz;

ALTER TABLE public.sales_certification_package_grants
  ALTER COLUMN certification_key SET NOT NULL,
  ALTER COLUMN grant_state DROP DEFAULT;

ALTER TABLE public.sales_certification_package_grants
  DROP CONSTRAINT IF EXISTS sales_certification_package_grants_authority_mode_check;

ALTER TABLE public.sales_certification_package_grants
  ADD CONSTRAINT sales_certification_package_grants_authority_mode_check
    CHECK (authority_mode IN ('INDEPENDENT','SUPERVISED','QUALIFY_ONLY')),
  ADD CONSTRAINT sales_certification_package_grants_certification_key_check
    CHECK (certification_key IN (
      'LAUNCH_CERTIFIED',
      'GROWTH_CERTIFIED',
      'SCALE_CERTIFIED',
      'CUSTOM_QUALIFICATION_CERTIFIED'
    )),
  ADD CONSTRAINT sales_certification_package_grants_state_check
    CHECK (grant_state IN ('PENDING','ACTIVE','SUSPENDED')),
  ADD CONSTRAINT sales_certification_package_grants_expiry_check
    CHECK (expires_at IS NULL OR expires_at>granted_at);

COMMENT ON COLUMN public.sales_certification_package_grants.certification_key IS
  'Canonical Part 16 certification key. Never inferred from general Final Certification alone.';
COMMENT ON COLUMN public.sales_certification_package_grants.grant_state IS
  'Grant lifecycle state. Effective status also considers expires_at and revocation fields.';
COMMENT ON COLUMN public.sales_certification_package_grants.expires_at IS
  'Optional policy-derived expiry. Historical rows are preserved after expiry/revocation.';

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

    IF NOT FOUND OR v_active IS DISTINCT FROM true OR v_type<>'package' THEN
      RAISE EXCEPTION 'Part 16 product rule % must reference an active canonical package code.',v_code;
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
       AND coalesce((v_rule->>'escalationRequired')::boolean,false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'PF-WEB-SCALE policy must preserve explicit escalation.';
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

UPDATE public.system_configuration
SET config_value =
  config_value
  || jsonb_build_object(
    'schemaVersion',2,
    'allowedCertificationKeys',jsonb_build_array(
      'LAUNCH_CERTIFIED',
      'GROWTH_CERTIFIED',
      'SCALE_CERTIFIED',
      'CUSTOM_QUALIFICATION_CERTIFIED'
    ),
    'permissionModes',jsonb_build_array('INDEPENDENT','SUPERVISED','QUALIFY_ONLY','BLOCKED'),
    'addonBehaviors',jsonb_build_array(
      'INHERIT_BASE_PACKAGE',
      'REQUIRE_GROWTH',
      'REQUIRE_SCALE',
      'REQUIRE_SPECIALIST_VALIDATION',
      'CUSTOM_QUALIFICATION_ONLY'
    ),
    'productRules','{}'::jsonb,
    'addonRules','{}'::jsonb,
    'protectedCommitmentStages','[]'::jsonb
  )
WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

CREATE OR REPLACE FUNCTION public.admin_update_sales_certification_policy(
  p_product_rules jsonb,
  p_addon_rules jsonb,
  p_protected_commitment_stages jsonb,
  p_criteria_approved boolean,
  p_granting_active boolean,
  p_enforcement_active boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_current jsonb;
  v_next jsonb;
  v_version integer;
  v_criteria_version integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL OR char_length(btrim(p_reason))<10 THEN
    RAISE EXCEPTION 'A meaningful policy-change reason is required.';
  END IF;
  IF jsonb_typeof(coalesce(p_product_rules,'{}'::jsonb))<>'object'
     OR jsonb_typeof(coalesce(p_addon_rules,'{}'::jsonb))<>'object'
     OR jsonb_typeof(coalesce(p_protected_commitment_stages,'[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'Product rules, add-on rules and protected stages have invalid shapes.';
  END IF;

  SELECT config_value INTO v_current
  FROM public.system_configuration
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1'
  FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Part 16 policy is unavailable.';
  END IF;

  v_version:=coalesce((v_current->>'policyVersion')::integer,0)+1;
  v_criteria_version:=CASE
    WHEN p_criteria_approved THEN coalesce((v_current->>'criteriaVersion')::integer,0)+1
    ELSE NULL
  END;

  v_next:=v_current
    || jsonb_build_object(
      'policyVersion',v_version,
      'productRules',coalesce(p_product_rules,'{}'::jsonb),
      'packageCriteria',coalesce(p_product_rules,'{}'::jsonb),
      'addonRules',coalesce(p_addon_rules,'{}'::jsonb),
      'protectedCommitmentStages',coalesce(p_protected_commitment_stages,'[]'::jsonb),
      'criteriaApproved',coalesce(p_criteria_approved,false),
      'criteriaVersion',v_criteria_version,
      'criteriaApprovedAt',CASE WHEN p_criteria_approved THEN to_jsonb(now()) ELSE 'null'::jsonb END,
      'grantingActive',coalesce(p_granting_active,false),
      'enforcementActive',coalesce(p_enforcement_active,false),
      'rolloutState',CASE
        WHEN p_enforcement_active THEN 'ACTIVE'
        WHEN p_granting_active THEN 'GRANTING_ONLY'
        WHEN p_criteria_approved THEN 'CRITERIA_APPROVED'
        ELSE 'STAGED_POLICY_REQUIRED'
      END,
      'rolloutReason',btrim(p_reason)
    );

  UPDATE public.system_configuration
  SET config_value=v_next
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_sales_certification_policy(jsonb,jsonb,jsonb,boolean,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_sales_certification_policy(jsonb,jsonb,jsonb,boolean,boolean,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_certification_grant_effective_status(
  p_grant_state text,
  p_expires_at timestamptz,
  p_revoked_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path='public','pg_temp'
AS $$
  SELECT CASE
    WHEN p_revoked_at IS NOT NULL THEN 'REVOKED'
    WHEN p_grant_state='SUSPENDED' THEN 'SUSPENDED'
    WHEN p_grant_state='PENDING' THEN 'PENDING'
    WHEN p_expires_at IS NOT NULL AND p_expires_at<=now() THEN 'EXPIRED'
    ELSE 'ACTIVE'
  END;
$$;

REVOKE ALL ON FUNCTION public.sales_certification_grant_effective_status(text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.protect_sales_certification_package_grant_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path='public','pg_temp'
AS $$
BEGIN
  IF tg_op='DELETE' THEN
    RAISE EXCEPTION 'Sales certification grant history is immutable; revoke the active grant instead of deleting it.';
  END IF;

  IF old.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Revoked Sales certification grants are immutable.';
  END IF;

  IF new.salesperson_id IS DISTINCT FROM old.salesperson_id
     OR new.sales_product_id IS DISTINCT FROM old.sales_product_id
     OR new.product_code_snapshot IS DISTINCT FROM old.product_code_snapshot
     OR new.certification_key IS DISTINCT FROM old.certification_key
     OR new.authority_mode IS DISTINCT FROM old.authority_mode
     OR new.grant_state IS DISTINCT FROM old.grant_state
     OR new.expires_at IS DISTINCT FROM old.expires_at
     OR new.evidence_type IS DISTINCT FROM old.evidence_type
     OR new.evidence IS DISTINCT FROM old.evidence
     OR new.grant_reason IS DISTINCT FROM old.grant_reason
     OR new.policy_version IS DISTINCT FROM old.policy_version
     OR new.granted_by IS DISTINCT FROM old.granted_by
     OR new.granted_at IS DISTINCT FROM old.granted_at THEN
    RAISE EXCEPTION 'Sales certification grant evidence is immutable after issuance.';
  END IF;

  IF new.revoked_at IS NULL
     OR new.revoked_by IS NULL
     OR nullif(btrim(coalesce(new.revocation_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Grant updates are limited to a complete revocation record.';
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_sales_certification_package_grant_history() FROM PUBLIC,anon,authenticated;

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

DO $$
DECLARE
  v_policy jsonb;
  v_grants integer;
BEGIN
  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  IF nullif(v_policy->>'schemaVersion','')::integer IS DISTINCT FROM 2
     OR coalesce((v_policy->>'grantingActive')::boolean,false)
     OR coalesce((v_policy->>'enforcementActive')::boolean,false)
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false)
     OR coalesce(v_policy->'productRules','{}'::jsonb)<>'{}'::jsonb
     OR coalesce(v_policy->'addonRules','{}'::jsonb)<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Part 16 completion policy migration must remain staged with zero business-policy mappings.';
  END IF;

  SELECT count(*)::integer INTO v_grants
  FROM public.sales_certification_package_grants;
  IF v_grants<>0 THEN
    RAISE EXCEPTION 'Part 16 completion policy migration must not create certification grants.';
  END IF;
END $$;
