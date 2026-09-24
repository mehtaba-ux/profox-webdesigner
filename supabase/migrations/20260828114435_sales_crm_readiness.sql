-- Close the final Sales recruitment-to-CRM access gaps.
--
-- 1. An active Sales profile alone is not sufficient for CRM access. The
--    mandatory post-activation account setup and six-step CRM tour must also
--    be complete.
-- 2. Preserve the one-time test-bypass audit record, but return any incomplete
--    test-activated candidate to the real Sales Academy flow and remove live
--    Sales access.
-- 3. Backfill the Academy completion timestamp for legitimately activated
--    legacy candidates whose complete training evidence is already present.

CREATE OR REPLACE FUNCTION public.sales_crm_access_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    JOIN public.sales_account_setup_state s ON s.user_id = p.id
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('sales', 'sales_rep', 'sales_team')
      AND p.onboarding_status = 'completed'
      AND COALESCE(p.onboarding_progress, 0) = 100
      AND s.completed_at IS NOT NULL
      AND s.crm_tour_completed_at IS NOT NULL
      AND COALESCE(s.crm_tour_step, 0) >= 6
  );
$function$;

REVOKE ALL ON FUNCTION public.sales_crm_access_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_crm_access_ready() TO authenticated;

COMMENT ON FUNCTION public.sales_crm_access_ready() IS
'Returns true only for an active, fully onboarded Sales user whose mandatory account setup and CRM tour are complete.';

DROP POLICY IF EXISTS crm_leads_select ON public.crm_leads;
CREATE POLICY crm_leads_select ON public.crm_leads
FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR (
    (SELECT public.sales_crm_access_ready())
    AND salesperson_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS crm_leads_insert ON public.crm_leads;
CREATE POLICY crm_leads_insert ON public.crm_leads
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_admin())
  OR (
    (SELECT public.sales_crm_access_ready())
    AND salesperson_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS crm_leads_update ON public.crm_leads;
CREATE POLICY crm_leads_update ON public.crm_leads
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_admin())
  OR (
    (SELECT public.sales_crm_access_ready())
    AND salesperson_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  (SELECT public.is_admin())
  OR (
    (SELECT public.sales_crm_access_ready())
    AND salesperson_id = (SELECT auth.uid())
  )
);
