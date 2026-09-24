-- Module 6 advisor hardening
-- Add covering FK indexes and collapse overlapping SELECT policies while preserving access semantics.

CREATE INDEX IF NOT EXISTS idx_loom_outreach_review_assignment
  ON public.loom_outreach_review_details(assignment_id);
CREATE INDEX IF NOT EXISTS idx_loom_outreach_review_reviewer
  ON public.loom_outreach_review_details(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_loom_outreach_config_updated_by
  ON public.loom_outreach_training_config(updated_by);
CREATE INDEX IF NOT EXISTS idx_loom_outreach_state_module
  ON public.loom_outreach_training_state(module_id);

-- CONFIG: one SELECT policy for Admin + authorized learners, separate Admin mutation policies.
DROP POLICY IF EXISTS loom_outreach_config_admin_all ON public.loom_outreach_training_config;
DROP POLICY IF EXISTS loom_outreach_config_learner_select ON public.loom_outreach_training_config;
DROP POLICY IF EXISTS loom_outreach_config_select ON public.loom_outreach_training_config;
DROP POLICY IF EXISTS loom_outreach_config_admin_insert ON public.loom_outreach_training_config;
DROP POLICY IF EXISTS loom_outreach_config_admin_update ON public.loom_outreach_training_config;
DROP POLICY IF EXISTS loom_outreach_config_admin_delete ON public.loom_outreach_training_config;

CREATE POLICY loom_outreach_config_select
ON public.loom_outreach_training_config
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.can_access_sales_academy_module(module_id)
);

CREATE POLICY loom_outreach_config_admin_insert
ON public.loom_outreach_training_config
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY loom_outreach_config_admin_update
ON public.loom_outreach_training_config
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY loom_outreach_config_admin_delete
ON public.loom_outreach_training_config
FOR DELETE TO authenticated
USING (public.is_admin());

-- STATE: Admin or owner may read. Writes remain RPC-only.
DROP POLICY IF EXISTS loom_outreach_state_select ON public.loom_outreach_training_state;
CREATE POLICY loom_outreach_state_select
ON public.loom_outreach_training_state
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR user_id = (SELECT auth.uid())
);

-- REVIEW DETAILS: one SELECT policy for Admin + owner, separate Admin mutation policies.
DROP POLICY IF EXISTS loom_outreach_review_admin_all ON public.loom_outreach_review_details;
DROP POLICY IF EXISTS loom_outreach_review_owner_select ON public.loom_outreach_review_details;
DROP POLICY IF EXISTS loom_outreach_review_select ON public.loom_outreach_review_details;
DROP POLICY IF EXISTS loom_outreach_review_admin_insert ON public.loom_outreach_review_details;
DROP POLICY IF EXISTS loom_outreach_review_admin_update ON public.loom_outreach_review_details;
DROP POLICY IF EXISTS loom_outreach_review_admin_delete ON public.loom_outreach_review_details;

CREATE POLICY loom_outreach_review_select
ON public.loom_outreach_review_details
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.user_training_progress p
    WHERE p.id = loom_outreach_review_details.progress_id
      AND p.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY loom_outreach_review_admin_insert
ON public.loom_outreach_review_details
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY loom_outreach_review_admin_update
ON public.loom_outreach_review_details
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY loom_outreach_review_admin_delete
ON public.loom_outreach_review_details
FOR DELETE TO authenticated
USING (public.is_admin());
