-- PF-SOP-01 Part 16 — Sales Certification + Deal Permissions.
-- Staged foundation only: no package grant backfill, no guessed certification mapping,
-- and no enforcement activation until an explicit Management-approved package policy exists.

DO $$
DECLARE
  v_reconciliation_policy jsonb;
BEGIN
  IF to_regclass('public.training_tracks') IS NULL
     OR to_regclass('public.training_track_modules') IS NULL
     OR to_regclass('public.user_training_progress') IS NULL
     OR to_regclass('public.final_certification_sessions') IS NULL
     OR to_regclass('public.sales_products') IS NULL
     OR to_regclass('public.quotation_items') IS NULL
     OR to_regclass('public.quotations') IS NULL
     OR to_regclass('public.crm_opportunities') IS NULL
     OR to_regclass('public.system_configuration') IS NULL THEN
    RAISE EXCEPTION 'Part 16 requires the existing Sales Academy, Final Certification, Sales Catalog, CRM and quotation architecture.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='sales_academy_training_ready') <> 1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='crm_get_package_fit_assessment') <> 1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='crm_assert_quotation_send_ready') <> 1 THEN
    RAISE EXCEPTION 'Part 16 canonical Academy, Package Fit, or final quotation send dependencies are unavailable.';
  END IF;

  SELECT config_value INTO v_reconciliation_policy
  FROM public.system_configuration
  WHERE config_key='crm_quotation_sales_reconciliation_policy_v1';

  IF coalesce((v_reconciliation_policy->>'finalQuotationSendGateActive')::boolean,false) IS DISTINCT FROM true
     OR nullif(v_reconciliation_policy->>'policyVersion','')::integer IS DISTINCT FROM 2
     OR nullif(v_reconciliation_policy->>'snapshotSchemaVersion','')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Part 16 requires the active Part 10B final quotation send gate at policy/schema 2/2.';
  END IF;
END $$;

CREATE TABLE public.sales_certification_package_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  sales_product_id uuid NOT NULL REFERENCES public.sales_products(id) ON DELETE RESTRICT,
  product_code_snapshot text NOT NULL CHECK (btrim(product_code_snapshot) <> ''),
  authority_mode text NOT NULL CHECK (authority_mode IN ('INDEPENDENT','SUPERVISED')),
  evidence_type text NOT NULL CHECK (btrim(evidence_type) <> ''),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  grant_reason text NOT NULL CHECK (btrim(grant_reason) <> ''),
  policy_version integer NOT NULL CHECK (policy_version > 0),
  granted_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revocation_reason text,
  CONSTRAINT sales_certification_package_grants_revocation_consistency CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR
    (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND nullif(btrim(revocation_reason),'') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX sales_certification_package_grants_one_active_per_product
  ON public.sales_certification_package_grants(salesperson_id,sales_product_id)
  WHERE revoked_at IS NULL;
CREATE INDEX sales_certification_package_grants_salesperson_history
  ON public.sales_certification_package_grants(salesperson_id,granted_at DESC);
CREATE INDEX sales_certification_package_grants_product_history
  ON public.sales_certification_package_grants(sales_product_id,granted_at DESC);

ALTER TABLE public.sales_certification_package_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_certification_package_grants_read_self_or_admin
  ON public.sales_certification_package_grants
  FOR SELECT
  TO authenticated
  USING (
    salesperson_id=auth.uid()
    OR public.is_admin()
  );

REVOKE ALL ON TABLE public.sales_certification_package_grants FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.sales_certification_package_grants TO authenticated;

COMMENT ON TABLE public.sales_certification_package_grants IS
  'Part 16 durable package-level Seller certification grant history. One active grant per Seller/package; revocation closes the row instead of overwriting history. No rows are backfilled by Part 16.';
COMMENT ON COLUMN public.sales_certification_package_grants.authority_mode IS
  'INDEPENDENT permits independent package authority when enforcement is active. SUPERVISED requires existing quotation approval evidence before send.';

INSERT INTO public.system_configuration(config_key,config_value,description)
VALUES (
  'crm_sales_certification_deal_permission_policy_v1',
  jsonb_build_object(
    'policyKey','crm_sales_certification_deal_permission_policy_v1',
    'policyVersion',1,
    'grantingActive',false,
    'enforcementActive',false,
    'criteriaApproved',false,
    'criteriaVersion',null,
    'criteriaApprovedAt',null,
    'packageCriteria','{}'::jsonb,
    'protectedProductTypes',jsonb_build_array('package'),
    'authorityModes',jsonb_build_array('INDEPENDENT','SUPERVISED'),
    'supervisedSendEvidence','EXISTING_QUOTATION_APPROVAL',
    'generalCertificationSource','sales_academy_training_ready',
    'rolloutState','STAGED_POLICY_REQUIRED',
    'rolloutReason','No Management-approved package-level certification criteria existed at Part 16 implementation time. No granular grants are inferred from general Academy or Final Certification completion.'
  ),
  'Part 16 Sales Certification + Deal Permissions. Staged until explicit package criteria and evidence-backed grants are approved.'
)
ON CONFLICT (config_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_sales_certification_deal_permission_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_value jsonb:=new.config_value;
  v_code text;
BEGIN
  IF new.config_key<>'crm_sales_certification_deal_permission_policy_v1' THEN
    RETURN new;
  END IF;

  IF jsonb_typeof(v_value)<>'object'
     OR v_value->>'policyKey' IS DISTINCT FROM 'crm_sales_certification_deal_permission_policy_v1'
     OR nullif(v_value->>'policyVersion','')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Invalid Part 16 certification/deal-permission policy identity.';
  END IF;

  IF jsonb_typeof(coalesce(v_value->'packageCriteria','{}'::jsonb))<>'object' THEN
    RAISE EXCEPTION 'Part 16 packageCriteria must be a JSON object keyed by canonical sales product code.';
  END IF;

  IF coalesce((v_value->>'grantingActive')::boolean,false)
     OR coalesce((v_value->>'enforcementActive')::boolean,false) THEN
    IF coalesce((v_value->>'criteriaApproved')::boolean,false) IS DISTINCT FROM true
       OR nullif(v_value->>'criteriaVersion','')::integer IS NULL
       OR nullif(v_value->>'criteriaApprovedAt','') IS NULL THEN
      RAISE EXCEPTION 'Part 16 granting/enforcement cannot activate before explicit package criteria are approved and versioned.';
    END IF;

    FOR v_code IN
      SELECT p.code
      FROM public.sales_products p
      WHERE p.active=true AND lower(coalesce(p.product_type,''))='package'
      ORDER BY p.sort_order,p.code
    LOOP
      IF NOT (v_value->'packageCriteria' ? v_code) THEN
        RAISE EXCEPTION 'Part 16 activation requires explicit criteria for active package %.',v_code;
      END IF;
      IF jsonb_typeof(v_value#>ARRAY['packageCriteria',v_code,'evidenceRequirements']) IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_value#>ARRAY['packageCriteria',v_code,'evidenceRequirements'])=0
         OR nullif(btrim(v_value#>>ARRAY['packageCriteria',v_code,'certificationPath']),'') IS NULL THEN
        RAISE EXCEPTION 'Part 16 package % requires a certificationPath and at least one evidence requirement.',v_code;
      END IF;
    END LOOP;
  END IF;

  IF coalesce((v_value->>'enforcementActive')::boolean,false)
     AND coalesce((v_value->>'grantingActive')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Part 16 enforcement cannot activate while grant issuance is disabled.';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_sales_certification_deal_permission_policy ON public.system_configuration;
CREATE TRIGGER trg_validate_sales_certification_deal_permission_policy
BEFORE INSERT OR UPDATE OF config_value
ON public.system_configuration
FOR EACH ROW
WHEN (NEW.config_key='crm_sales_certification_deal_permission_policy_v1')
EXECUTE FUNCTION public.validate_sales_certification_deal_permission_policy();

REVOKE ALL ON FUNCTION public.validate_sales_certification_deal_permission_policy() FROM PUBLIC,anon,authenticated;

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
     OR new.authority_mode IS DISTINCT FROM old.authority_mode
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

CREATE TRIGGER trg_protect_sales_certification_package_grant_history
BEFORE UPDATE OR DELETE
ON public.sales_certification_package_grants
FOR EACH ROW
EXECUTE FUNCTION public.protect_sales_certification_package_grant_history();

REVOKE ALL ON FUNCTION public.protect_sales_certification_package_grant_history() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_certification_policy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
  SELECT coalesce(
    (SELECT sc.config_value
     FROM public.system_configuration sc
     WHERE sc.config_key='crm_sales_certification_deal_permission_policy_v1'),
    '{}'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.sales_certification_policy() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_certification_general_ready(p_salesperson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
  SELECT
    p_salesperson_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id=p_salesperson_id
        AND up.status='active'
        AND up.role IN ('sales','sales_rep','sales_team')
    )
    AND public.sales_academy_training_ready(p_salesperson_id);
$$;

REVOKE ALL ON FUNCTION public.sales_certification_general_ready(uuid) FROM PUBLIC,anon,authenticated;

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
      'productId',sp.id,
      'productCode',sp.code,
      'productName',sp.name,
      'active',sp.active,
      'grantId',g.id,
      'grantStatus',CASE WHEN g.id IS NULL THEN 'NOT_GRANTED' ELSE 'GRANTED' END,
      'authorityMode',g.authority_mode,
      'evidenceType',g.evidence_type,
      'grantedAt',g.granted_at,
      'policyVersion',g.policy_version
    ) ORDER BY sp.sort_order,sp.code),'[]'::jsonb)
  INTO v_products
  FROM public.sales_products sp
  LEFT JOIN public.sales_certification_package_grants g
    ON g.sales_product_id=sp.id
   AND g.salesperson_id=p_salesperson_id
   AND g.revoked_at IS NULL
  WHERE sp.active=true AND lower(coalesce(sp.product_type,''))='package';

  RETURN jsonb_build_object(
    'policyKey',v_policy->>'policyKey',
    'policyVersion',v_policy->'policyVersion',
    'grantingActive',coalesce((v_policy->>'grantingActive')::boolean,false),
    'enforcementActive',coalesce((v_policy->>'enforcementActive')::boolean,false),
    'criteriaApproved',coalesce((v_policy->>'criteriaApproved')::boolean,false),
    'rolloutState',coalesce(v_policy->>'rolloutState','STAGED_POLICY_REQUIRED'),
    'rolloutReason',v_policy->>'rolloutReason',
    'salespersonId',p_salesperson_id,
    'generalCertificationReady',v_general_ready,
    'finalCertification',coalesce(v_final,'{}'::jsonb),
    'products',v_products
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_get_certification_permission_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_get_certification_permission_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_sales_certification_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
  SELECT public.sales_get_certification_permission_snapshot(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_my_sales_certification_permissions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_sales_certification_permissions() TO authenticated;

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
      'authorityMode',g.authority_mode,
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
  v_grant public.sales_certification_package_grants%rowtype;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF coalesce((v_policy->>'grantingActive')::boolean,false) IS DISTINCT FROM true
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Part 16 package certification granting is staged until explicit package criteria are Management-approved.';
  END IF;
  IF p_authority_mode NOT IN ('INDEPENDENT','SUPERVISED') THEN
    RAISE EXCEPTION 'Invalid Sales certification authority mode.';
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
  IF NOT (coalesce(v_policy->'packageCriteria','{}'::jsonb) ? v_product.code) THEN
    RAISE EXCEPTION 'No approved Part 16 certification criteria exist for package %.',v_product.code;
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.sales_certification_package_grants g
    WHERE g.salesperson_id=p_salesperson_id
      AND g.sales_product_id=p_sales_product_id
      AND g.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This Seller already has an active package certification grant. Revoke it before issuing a replacement.';
  END IF;

  INSERT INTO public.sales_certification_package_grants(
    salesperson_id,sales_product_id,product_code_snapshot,authority_mode,
    evidence_type,evidence,grant_reason,policy_version,granted_by
  )
  VALUES(
    p_salesperson_id,p_sales_product_id,v_product.code,p_authority_mode,
    btrim(p_evidence_type),p_evidence,btrim(p_reason),
    (v_policy->>'policyVersion')::integer,v_actor
  )
  RETURNING * INTO v_grant;

  RETURN jsonb_build_object(
    'grantId',v_grant.id,
    'salespersonId',v_grant.salesperson_id,
    'productId',v_grant.sales_product_id,
    'productCode',v_grant.product_code_snapshot,
    'authorityMode',v_grant.authority_mode,
    'grantedAt',v_grant.granted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_sales_package_certification(uuid,uuid,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_sales_package_certification(uuid,uuid,text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_sales_package_certification(
  p_grant_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_grant public.sales_certification_package_grants%rowtype;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'A revocation reason is required.';
  END IF;

  SELECT * INTO v_grant
  FROM public.sales_certification_package_grants
  WHERE id=p_grant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales certification grant not found.';
  END IF;
  IF v_grant.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Sales certification grant is already revoked.';
  END IF;

  UPDATE public.sales_certification_package_grants
  SET revoked_by=v_actor,
      revoked_at=now(),
      revocation_reason=btrim(p_reason)
  WHERE id=p_grant_id
  RETURNING * INTO v_grant;

  RETURN jsonb_build_object(
    'grantId',v_grant.id,
    'salespersonId',v_grant.salesperson_id,
    'productCode',v_grant.product_code_snapshot,
    'revokedAt',v_grant.revoked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_sales_package_certification(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_sales_package_certification(uuid,text) TO authenticated;

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
  v_codes text[]:=ARRAY[]::text[];
  v_code text;
  v_general_ready boolean:=false;
  v_modes jsonb:='[]'::jsonb;
  v_mode text;
  v_missing integer:=0;
  v_supervised integer:=0;
  v_independent integer:=0;
  v_supervision_satisfied boolean:=false;
  v_status text:='BLOCKED';
  v_can_draft boolean:=false;
  v_can_send boolean:=false;
  v_blockers jsonb:='[]'::jsonb;
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

    SELECT coalesce(array_agg(DISTINCT qi.product_code_snapshot ORDER BY qi.product_code_snapshot),ARRAY[]::text[])
    INTO v_codes
    FROM public.quotation_items qi
    LEFT JOIN public.sales_products sp ON sp.id=qi.sales_product_id
    WHERE qi.quotation_id=p_quotation_id
      AND (
        lower(coalesce(sp.product_type,''))='package'
        OR lower(coalesce(qi.item_type,''))='package'
      )
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

  IF p_product_code IS NOT NULL AND nullif(btrim(p_product_code),'') IS NOT NULL
     AND NOT (btrim(p_product_code)=ANY(v_codes)) THEN
    v_codes:=array_append(v_codes,btrim(p_product_code));
  END IF;

  IF cardinality(v_codes)=0 AND v_opportunity_id IS NOT NULL THEN
    BEGIN
      v_package_fit:=public.crm_get_package_fit_assessment(NULL,v_opportunity_id);
      v_code:=nullif(v_package_fit#>>'{recommendedProduct,code}','');
      IF v_code IS NOT NULL THEN v_codes:=ARRAY[v_code]; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_package_fit:=NULL;
    END;
  END IF;

  v_general_ready:=public.sales_certification_general_ready(v_salesperson_id);
  IF NOT v_general_ready THEN
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','GENERAL_CERTIFICATION_NOT_READY',
      'message','General Sales Academy and Final Certification are not currently verified as passed.'
    ));
  END IF;

  FOREACH v_code IN ARRAY v_codes LOOP
    SELECT g.authority_mode
    INTO v_mode
    FROM public.sales_certification_package_grants g
    JOIN public.sales_products sp ON sp.id=g.sales_product_id
    WHERE g.salesperson_id=v_salesperson_id
      AND g.revoked_at IS NULL
      AND sp.code=v_code
      AND sp.active=true
      AND lower(coalesce(sp.product_type,''))='package'
    ORDER BY g.granted_at DESC,g.id DESC
    LIMIT 1;

    IF v_mode IS NULL THEN
      v_missing:=v_missing+1;
      v_modes:=v_modes||jsonb_build_array(jsonb_build_object(
        'productCode',v_code,
        'grantStatus','NOT_GRANTED',
        'authorityMode',NULL
      ));
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','PACKAGE_CERTIFICATION_NOT_GRANTED',
        'productCode',v_code,
        'message','No active package-level Sales certification grant exists.'
      ));
    ELSE
      IF v_mode='SUPERVISED' THEN v_supervised:=v_supervised+1; ELSE v_independent:=v_independent+1; END IF;
      v_modes:=v_modes||jsonb_build_array(jsonb_build_object(
        'productCode',v_code,
        'grantStatus','GRANTED',
        'authorityMode',v_mode
      ));
    END IF;
    v_mode:=NULL;
  END LOOP;

  IF p_quotation_id IS NOT NULL THEN
    v_supervision_satisfied:=coalesce(v_q.approval_decision,'')='approved'
      AND v_q.approved_by IS NOT NULL
      AND v_q.approved_at IS NOT NULL;
  END IF;

  IF NOT v_enforced THEN
    v_status:='STAGED_NOT_ENFORCED';
    v_can_draft:=true;
    v_can_send:=true;
  ELSIF cardinality(v_codes)=0 THEN
    v_status:='BLOCKED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PACKAGE_NOT_RESOLVED',
      'message','No canonical package could be resolved for this deal.'
    ));
  ELSIF NOT v_general_ready OR v_missing>0 THEN
    v_status:='BLOCKED';
  ELSIF v_supervised>0 THEN
    v_status:='SUPERVISED';
    v_can_draft:=true;
    v_can_send:=v_supervision_satisfied;
    IF NOT v_supervision_satisfied THEN
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','SUPERVISION_APPROVAL_REQUIRED',
        'message','An existing canonical quotation approval must be approved before this supervised package can be sent.'
      ));
    END IF;
  ELSE
    v_status:='INDEPENDENT';
    v_can_draft:=true;
    v_can_send:=true;
  END IF;

  RETURN jsonb_build_object(
    'policyKey',v_policy->>'policyKey',
    'policyVersion',v_policy->'policyVersion',
    'enforcementActive',v_enforced,
    'salespersonId',v_salesperson_id,
    'opportunityId',v_opportunity_id,
    'quotationId',p_quotation_id,
    'packageCodes',to_jsonb(v_codes),
    'packagePermissions',v_modes,
    'generalCertificationReady',v_general_ready,
    'status',v_status,
    'canDraft',v_can_draft,
    'canSend',v_can_send,
    'supervisionSatisfied',v_supervision_satisfied,
    'blockers',v_blockers,
    'packageFitStatus',v_package_fit->>'status',
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
    RAISE EXCEPTION 'Quotation cannot be sent: %',coalesce(nullif(v_message,''),'Sales certification deal permission is not satisfied.');
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

  IF NOT FOUND OR lower(coalesce(v_product.product_type,''))<>'package' THEN
    RETURN new;
  END IF;

  SELECT * INTO v_q FROM public.quotations WHERE id=new.quotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found for Sales certification permission check.'; END IF;

  v_assessment:=public.crm_get_sales_certification_deal_permission(
    v_q.salesperson_id,
    v_product.code,
    v_q.opportunity_id,
    NULL
  );

  IF coalesce((v_assessment->>'enforcementActive')::boolean,false)
     AND coalesce((v_assessment->>'canDraft')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This package is outside the Seller''s active Sales certification authority.';
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_enforce_sales_certification_package_item() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER trg_crm_enforce_sales_certification_package_item
BEFORE INSERT OR UPDATE OF sales_product_id
ON public.quotation_items
FOR EACH ROW
EXECUTE FUNCTION public.crm_enforce_sales_certification_package_item();

CREATE OR REPLACE FUNCTION public.crm_enforce_sales_certification_before_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN new; END IF;

  IF (old.sent_at IS NULL AND new.sent_at IS NOT NULL)
     OR (old.status IS DISTINCT FROM new.status AND new.status='Sent') THEN
    PERFORM public.crm_assert_sales_certification_deal_permission(new.id);
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_enforce_sales_certification_before_send() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER trg_crm_enforce_sales_certification_before_send
BEFORE UPDATE OF status,sent_at
ON public.quotations
FOR EACH ROW
EXECUTE FUNCTION public.crm_enforce_sales_certification_before_send();

COMMENT ON FUNCTION public.sales_get_certification_permission_snapshot(uuid) IS
  'Part 16 Seller/Admin read model for general certification plus explicit package grants. Does not infer package authority from general Academy completion.';
COMMENT ON FUNCTION public.crm_get_sales_certification_deal_permission(uuid,text,uuid,uuid) IS
  'Part 16 canonical deal-authority evaluator. Staged policy preserves current behavior while enforcementActive=false; when activated, missing grants fail closed and SUPERVISED requires existing quotation approval before send.';
COMMENT ON FUNCTION public.crm_assert_sales_certification_deal_permission(uuid) IS
  'Part 16 server-side pre-send certification assertion. It is additive to, not a replacement for, the Part 10B final quotation send gate.';

DO $$
DECLARE
  v_policy jsonb;
  v_grant_count integer;
  v_reconciliation_policy jsonb;
BEGIN
  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  IF v_policy IS NULL
     OR v_policy->>'policyKey' IS DISTINCT FROM 'crm_sales_certification_deal_permission_policy_v1'
     OR nullif(v_policy->>'policyVersion','')::integer IS DISTINCT FROM 1
     OR coalesce((v_policy->>'grantingActive')::boolean,false) IS DISTINCT FROM false
     OR coalesce((v_policy->>'enforcementActive')::boolean,false) IS DISTINCT FROM false
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false) IS DISTINCT FROM false
     OR coalesce(v_policy->'packageCriteria','{}'::jsonb) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Part 16 staged policy must begin inactive with no fabricated package criteria.';
  END IF;

  SELECT count(*)::integer INTO v_grant_count
  FROM public.sales_certification_package_grants;
  IF v_grant_count<>0 THEN
    RAISE EXCEPTION 'Part 16 must not backfill or fabricate package certification grants.';
  END IF;

  SELECT config_value INTO v_reconciliation_policy
  FROM public.system_configuration
  WHERE config_key='crm_quotation_sales_reconciliation_policy_v1';

  IF coalesce((v_reconciliation_policy->>'finalQuotationSendGateActive')::boolean,false) IS DISTINCT FROM true
     OR nullif(v_reconciliation_policy->>'policyVersion','')::integer IS DISTINCT FROM 2
     OR nullif(v_reconciliation_policy->>'snapshotSchemaVersion','')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Part 16 must preserve Part 10B at policy/schema 2/2.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='crm_get_sales_certification_deal_permission') <> 1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='sales_get_certification_permission_snapshot') <> 1 THEN
    RAISE EXCEPTION 'Part 16 canonical permission functions are not exactly-once.';
  END IF;
END $$;
