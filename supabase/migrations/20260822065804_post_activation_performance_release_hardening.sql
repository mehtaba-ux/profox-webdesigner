-- Post-activation Sales Performance Management release hardening.
-- 1) Cover release-specific foreign keys reported by the Supabase performance advisor.
-- 2) Make completed performance reviews immutable historical evidence.

CREATE INDEX IF NOT EXISTS idx_sales_performance_reviews_completed_by
  ON public.sales_performance_reviews (completed_by);

CREATE INDEX IF NOT EXISTS idx_sales_performance_settings_updated_by
  ON public.sales_performance_settings (updated_by);

CREATE OR REPLACE FUNCTION public.admin_update_sales_performance_review(
  p_review_id uuid,
  p_status text,
  p_decision text DEFAULT NULL,
  p_strengths text DEFAULT NULL,
  p_coaching_actions text DEFAULT NULL,
  p_risks text DEFAULT NULL,
  p_review_notes text DEFAULT NULL,
  p_scope_restrictions text DEFAULT NULL,
  p_improvement_plan text DEFAULT NULL
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

  IF p_status = 'Completed' AND p_decision IS NULL THEN
    RAISE EXCEPTION 'A completed review requires a management decision';
  END IF;

  SELECT * INTO v_review
  FROM public.sales_performance_reviews
  WHERE id = p_review_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Performance review not found';
  END IF;

  -- Completed reviews are immutable audit evidence. Follow-up belongs in the
  -- next scheduled coaching/review record instead of rewriting history.
  IF v_review.status = 'Completed' THEN
    RAISE EXCEPTION 'Completed performance reviews are immutable';
  END IF;

  v_snapshot := CASE
    WHEN p_status = 'Completed' THEN public.get_sales_performance_snapshot(v_review.salesperson_id)
    ELSE v_review.metrics_snapshot
  END;

  UPDATE public.sales_performance_reviews
  SET status = p_status,
      decision = CASE WHEN p_status = 'Completed' THEN p_decision ELSE decision END,
      metrics_snapshot = v_snapshot,
      strengths = COALESCE(p_strengths, strengths),
      coaching_actions = COALESCE(p_coaching_actions, coaching_actions),
      risks = COALESCE(p_risks, risks),
      review_notes = COALESCE(p_review_notes, review_notes),
      scope_restrictions = COALESCE(p_scope_restrictions, scope_restrictions),
      improvement_plan = COALESCE(p_improvement_plan, improvement_plan),
      completed_by = CASE WHEN p_status = 'Completed' THEN v_actor ELSE completed_by END,
      completed_at = CASE WHEN p_status = 'Completed' THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_review_id
  RETURNING * INTO v_review;

  RETURN jsonb_build_object(
    'review', to_jsonb(v_review),
    'accessActionRequired', v_review.decision IN ('Restrict Scope','Close Engagement'),
    'message', CASE
      WHEN v_review.decision IN ('Restrict Scope','Close Engagement')
        THEN 'Management decision recorded. Apply any access/offboarding change through the existing Team & Users control; this review does not create a second access system.'
      ELSE 'Performance review updated.'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text) TO authenticated;
