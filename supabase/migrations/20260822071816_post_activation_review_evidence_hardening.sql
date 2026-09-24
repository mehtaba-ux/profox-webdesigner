-- Post-activation review evidence hardening.
-- Approved review areas come from the Sales consultancy/onboarding policy.
-- Completed checkpoints must retain an owner, management notes, and evidence
-- across every required quality dimension.

ALTER TABLE public.sales_performance_reviews
  ADD COLUMN IF NOT EXISTS quality_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS required_actions text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.sales_performance_reviews
  ADD CONSTRAINT sales_performance_reviews_quality_evidence_object_chk
    CHECK (jsonb_typeof(quality_evidence) = 'object'),
  ADD CONSTRAINT sales_performance_reviews_required_actions_chk
    CHECK (required_actions <@ ARRAY[
      'Coaching',
      'Re-certification',
      'Supervised Calls',
      'Temporary Access Restriction',
      'Improvement Plan'
    ]::text[]),
  ADD CONSTRAINT sales_performance_reviews_completed_owner_chk
    CHECK (status <> 'Completed' OR owner_id IS NOT NULL),
  ADD CONSTRAINT sales_performance_reviews_completed_evidence_chk
    CHECK (
      status <> 'Completed'
      OR (
        btrim(review_notes) <> ''
        AND btrim(COALESCE(quality_evidence->>'customerConduct','')) <> ''
        AND btrim(COALESCE(quality_evidence->>'preparation','')) <> ''
        AND btrim(COALESCE(quality_evidence->>'crmAccuracy','')) <> ''
        AND btrim(COALESCE(quality_evidence->>'productAccuracy','')) <> ''
        AND btrim(COALESCE(quality_evidence->>'followUpReliability','')) <> ''
        AND btrim(COALESCE(quality_evidence->>'pipelineHealth','')) <> ''
        AND btrim(COALESCE(quality_evidence->>'conversion','')) <> ''
        AND btrim(COALESCE(quality_evidence->>'learning','')) <> ''
        AND btrim(COALESCE(quality_evidence->>'policyCompliance','')) <> ''
      )
    ),
  ADD CONSTRAINT sales_performance_reviews_extend_plan_chk
    CHECK (decision IS DISTINCT FROM 'Extend Review' OR btrim(improvement_plan) <> ''),
  ADD CONSTRAINT sales_performance_reviews_restrict_scope_chk
    CHECK (decision IS DISTINCT FROM 'Restrict Scope' OR btrim(scope_restrictions) <> '');

DROP FUNCTION IF EXISTS public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.admin_update_sales_performance_review(
  p_review_id uuid,
  p_status text,
  p_decision text DEFAULT NULL,
  p_strengths text DEFAULT NULL,
  p_coaching_actions text DEFAULT NULL,
  p_risks text DEFAULT NULL,
  p_review_notes text DEFAULT NULL,
  p_scope_restrictions text DEFAULT NULL,
  p_improvement_plan text DEFAULT NULL,
  p_quality_evidence jsonb DEFAULT NULL,
  p_required_actions text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_review public.sales_performance_reviews%ROWTYPE;
  v_snapshot jsonb;
  v_quality jsonb;
  v_actions text[];
  v_notes text;
  v_improvement_plan text;
  v_scope_restrictions text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_status NOT IN ('Scheduled','In Review','Completed','Cancelled') THEN
    RAISE EXCEPTION 'Invalid review status';
  END IF;

  IF p_decision IS NOT NULL AND p_decision NOT IN ('Continue','Extend Review','Restrict Scope','Close Engagement') THEN
    RAISE EXCEPTION 'Invalid review decision';
  END IF;

  SELECT * INTO v_review
  FROM public.sales_performance_reviews
  WHERE id = p_review_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Performance review not found';
  END IF;

  IF v_review.status = 'Completed' THEN
    RAISE EXCEPTION 'Completed performance reviews are immutable';
  END IF;

  v_quality := COALESCE(p_quality_evidence, v_review.quality_evidence, '{}'::jsonb);
  v_actions := COALESCE(p_required_actions, v_review.required_actions, ARRAY[]::text[]);
  v_notes := COALESCE(p_review_notes, v_review.review_notes, '');
  v_improvement_plan := COALESCE(p_improvement_plan, v_review.improvement_plan, '');
  v_scope_restrictions := COALESCE(p_scope_restrictions, v_review.scope_restrictions, '');

  IF jsonb_typeof(v_quality) <> 'object' THEN
    RAISE EXCEPTION 'Quality evidence must be an object';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_actions) action
    WHERE action NOT IN ('Coaching','Re-certification','Supervised Calls','Temporary Access Restriction','Improvement Plan')
  ) THEN
    RAISE EXCEPTION 'Invalid management action';
  END IF;

  IF p_status = 'Completed' THEN
    IF p_decision IS NULL THEN
      RAISE EXCEPTION 'A completed review requires a management decision';
    END IF;

    IF btrim(v_notes) = '' THEN
      RAISE EXCEPTION 'A completed review requires management notes';
    END IF;

    IF btrim(COALESCE(v_quality->>'customerConduct','')) = ''
      OR btrim(COALESCE(v_quality->>'preparation','')) = ''
      OR btrim(COALESCE(v_quality->>'crmAccuracy','')) = ''
      OR btrim(COALESCE(v_quality->>'productAccuracy','')) = ''
      OR btrim(COALESCE(v_quality->>'followUpReliability','')) = ''
      OR btrim(COALESCE(v_quality->>'pipelineHealth','')) = ''
      OR btrim(COALESCE(v_quality->>'conversion','')) = ''
      OR btrim(COALESCE(v_quality->>'learning','')) = ''
      OR btrim(COALESCE(v_quality->>'policyCompliance','')) = ''
    THEN
      RAISE EXCEPTION 'A completed review requires evidence for every approved quality area';
    END IF;

    IF p_decision = 'Extend Review' AND btrim(v_improvement_plan) = '' THEN
      RAISE EXCEPTION 'Extend Review requires an improvement plan';
    END IF;

    IF p_decision = 'Restrict Scope' AND btrim(v_scope_restrictions) = '' THEN
      RAISE EXCEPTION 'Restrict Scope requires scope restrictions';
    END IF;
  END IF;

  v_snapshot := CASE
    WHEN p_status = 'Completed' THEN public.get_sales_performance_snapshot(v_review.salesperson_id)
    ELSE v_review.metrics_snapshot
  END;

  UPDATE public.sales_performance_reviews
  SET status = p_status,
      decision = CASE WHEN p_status = 'Completed' THEN p_decision ELSE decision END,
      metrics_snapshot = v_snapshot,
      quality_evidence = v_quality,
      required_actions = v_actions,
      strengths = COALESCE(p_strengths, strengths),
      coaching_actions = COALESCE(p_coaching_actions, coaching_actions),
      risks = COALESCE(p_risks, risks),
      review_notes = v_notes,
      scope_restrictions = v_scope_restrictions,
      improvement_plan = v_improvement_plan,
      owner_id = COALESCE(owner_id, v_actor),
      completed_by = CASE WHEN p_status = 'Completed' THEN v_actor ELSE completed_by END,
      completed_at = CASE WHEN p_status = 'Completed' THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_review_id
  RETURNING * INTO v_review;

  RETURN jsonb_build_object(
    'review', to_jsonb(v_review),
    'accessActionRequired', v_review.decision IN ('Restrict Scope','Close Engagement')
      OR 'Temporary Access Restriction' = ANY(v_review.required_actions),
    'message', CASE
      WHEN v_review.decision IN ('Restrict Scope','Close Engagement')
        OR 'Temporary Access Restriction' = ANY(v_review.required_actions)
      THEN 'Management decision recorded. Apply any access/offboarding change through the existing Team & Users control; this review does not create a second access system.'
      ELSE 'Performance review updated.'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text,jsonb,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text,jsonb,text[]) TO authenticated;
