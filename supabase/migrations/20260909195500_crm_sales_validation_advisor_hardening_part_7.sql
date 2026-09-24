-- CRM Sales SOP Part 7 — production advisor hardening
-- Adds covering indexes for the remaining Part 7 foreign keys and avoids
-- per-row auth.uid() evaluation in the canonical SELECT RLS policy.
-- No business state, workflow, routing, quotation, Pipeline, payment, Won,
-- or Sales-to-Delivery behavior is changed.

CREATE INDEX IF NOT EXISTS crm_sales_validations_meeting_idx
  ON public.crm_sales_validations(meeting_id)
  WHERE meeting_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_sales_validations_product_idx
  ON public.crm_sales_validations(product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_sales_validations_requested_by_idx
  ON public.crm_sales_validations(requested_by);

CREATE INDEX IF NOT EXISTS crm_sales_validations_decided_by_idx
  ON public.crm_sales_validations(decided_by)
  WHERE decided_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_sales_validations_cancelled_by_idx
  ON public.crm_sales_validations(cancelled_by)
  WHERE cancelled_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_sales_validations_source_acknowledged_by_idx
  ON public.crm_sales_validations(source_acknowledged_by)
  WHERE source_acknowledged_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_sales_validations_supersedes_idx
  ON public.crm_sales_validations(supersedes_validation_id)
  WHERE supersedes_validation_id IS NOT NULL;

DROP POLICY IF EXISTS crm_sales_validations_select_authorized
  ON public.crm_sales_validations;

CREATE POLICY crm_sales_validations_select_authorized
ON public.crm_sales_validations
FOR SELECT TO authenticated
USING (
  public.crm_can_access_lead(lead_id)
  OR public.is_admin()
  OR assigned_reviewer_id = (SELECT auth.uid())
  OR public.crm_sales_validation_reviewer_eligible(
    validation_type,
    reviewer_team,
    (SELECT auth.uid())
  )
);
