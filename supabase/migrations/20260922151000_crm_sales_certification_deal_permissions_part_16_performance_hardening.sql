-- PF-SOP-01 Part 16 — post-release performance hardening.
-- Forward-only: preserves the applied Part 16 migration, staged policy, grant truth and deal authority behavior.

DO $$
BEGIN
  IF to_regclass('public.sales_certification_package_grants') IS NULL THEN
    RAISE EXCEPTION 'Part 16 grant history table is required before performance hardening.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.system_configuration
    WHERE config_key='crm_sales_certification_deal_permission_policy_v1'
  ) THEN
    RAISE EXCEPTION 'Part 16 policy is required before performance hardening.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_certification_package_grants_granted_by_idx
  ON public.sales_certification_package_grants(granted_by);

CREATE INDEX IF NOT EXISTS sales_certification_package_grants_revoked_by_idx
  ON public.sales_certification_package_grants(revoked_by);

DROP POLICY IF EXISTS sales_certification_package_grants_read_self_or_admin
  ON public.sales_certification_package_grants;

CREATE POLICY sales_certification_package_grants_read_self_or_admin
  ON public.sales_certification_package_grants
  FOR SELECT
  TO authenticated
  USING (
    salesperson_id=(SELECT auth.uid())
    OR (SELECT public.is_admin())
  );

DO $$
DECLARE
  v_policy jsonb;
  v_part10b jsonb;
  v_grants integer;
BEGIN
  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_sales_certification_deal_permission_policy_v1';

  IF v_policy->>'policyKey' IS DISTINCT FROM 'crm_sales_certification_deal_permission_policy_v1'
     OR nullif(v_policy->>'policyVersion','')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Part 16 policy identity changed during performance hardening.';
  END IF;

  IF coalesce((v_policy->>'grantingActive')::boolean,false)
     OR coalesce((v_policy->>'enforcementActive')::boolean,false)
     OR coalesce((v_policy->>'criteriaApproved')::boolean,false) THEN
    RAISE EXCEPTION 'Part 16 staged rollout state changed unexpectedly during performance hardening.';
  END IF;

  SELECT count(*)::integer INTO v_grants
  FROM public.sales_certification_package_grants;
  IF v_grants<>0 THEN
    RAISE EXCEPTION 'Part 16 performance hardening must not create or mutate certification grants.';
  END IF;

  SELECT config_value INTO v_part10b
  FROM public.system_configuration
  WHERE config_key='crm_quotation_sales_reconciliation_policy_v1';

  IF coalesce((v_part10b->>'finalQuotationSendGateActive')::boolean,false) IS DISTINCT FROM true
     OR nullif(v_part10b->>'policyVersion','')::integer IS DISTINCT FROM 2
     OR nullif(v_part10b->>'snapshotSchemaVersion','')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Part 16 performance hardening must preserve Part 10B at policy/schema 2/2.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='sales_certification_package_grants'
      AND indexname='sales_certification_package_grants_granted_by_idx'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='sales_certification_package_grants'
      AND indexname='sales_certification_package_grants_revoked_by_idx'
  ) THEN
    RAISE EXCEPTION 'Part 16 actor foreign-key indexes were not installed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='sales_certification_package_grants'
      AND policyname='sales_certification_package_grants_read_self_or_admin'
      AND roles=ARRAY['authenticated']::name[]
      AND cmd='SELECT'
  ) THEN
    RAISE EXCEPTION 'Part 16 optimized Seller/Admin SELECT policy is unavailable.';
  END IF;
END $$;
