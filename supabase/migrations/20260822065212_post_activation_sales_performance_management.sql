-- Post-activation Sales Performance Management
-- Purpose: supervise the first 90 days after Activation without creating a second CRM,
-- commission engine, meeting system, quotation system, payment ledger, or career progression system.
-- Live operational metrics are always composed from canonical ProFox records.

CREATE TABLE IF NOT EXISTS public.sales_performance_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  enabled boolean NOT NULL DEFAULT true,
  review_day_7 integer NOT NULL DEFAULT 7 CHECK (review_day_7 > 0),
  review_day_30 integer NOT NULL DEFAULT 30 CHECK (review_day_30 > review_day_7),
  review_day_60 integer NOT NULL DEFAULT 60 CHECK (review_day_60 > review_day_30),
  review_day_90 integer NOT NULL DEFAULT 90 CHECK (review_day_90 > review_day_60),
  first_interaction_review_count integer NOT NULL DEFAULT 20 CHECK (first_interaction_review_count > 0),
  weekly_coaching_interval_days integer NOT NULL DEFAULT 7 CHECK (weekly_coaching_interval_days BETWEEN 1 AND 30),
  crm_logging_target_percent integer NOT NULL DEFAULT 100 CHECK (crm_logging_target_percent BETWEEN 0 AND 100),
  policy_version integer NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sales_performance_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sales_performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  review_key text NOT NULL,
  review_type text NOT NULL CHECK (review_type IN (
    'day_7_checkin',
    'day_30_review',
    'day_60_review',
    'day_90_final',
    'first_20_quality',
    'weekly_coaching'
  )),
  scheduled_for date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','In Review','Completed','Cancelled')),
  decision text CHECK (decision IS NULL OR decision IN ('Continue','Extend Review','Restrict Scope','Close Engagement')),
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  strengths text NOT NULL DEFAULT '',
  coaching_actions text NOT NULL DEFAULT '',
  risks text NOT NULL DEFAULT '',
  review_notes text NOT NULL DEFAULT '',
  scope_restrictions text NOT NULL DEFAULT '',
  improvement_plan text NOT NULL DEFAULT '',
  owner_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salesperson_id, review_key),
  CHECK (period_end >= period_start),
  CHECK ((status = 'Completed' AND decision IS NOT NULL AND completed_at IS NOT NULL) OR status <> 'Completed')
);

CREATE INDEX IF NOT EXISTS idx_sales_performance_reviews_salesperson_schedule
  ON public.sales_performance_reviews (salesperson_id, scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_sales_performance_reviews_owner_status
  ON public.sales_performance_reviews (owner_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sales_performance_reviews_applicant
  ON public.sales_performance_reviews (applicant_id);

ALTER TABLE public.sales_performance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_performance_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sales_performance_settings FROM anon, authenticated;
REVOKE ALL ON public.sales_performance_reviews FROM anon, authenticated;
GRANT SELECT ON public.sales_performance_settings TO authenticated;
GRANT SELECT ON public.sales_performance_reviews TO authenticated;

DROP POLICY IF EXISTS sales_performance_settings_read ON public.sales_performance_settings;
CREATE POLICY sales_performance_settings_read
ON public.sales_performance_settings
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.status = 'active'
      AND p.role IN ('sales','sales_rep','sales_team')
  )
);

DROP POLICY IF EXISTS sales_performance_reviews_read ON public.sales_performance_reviews;
CREATE POLICY sales_performance_reviews_read
ON public.sales_performance_reviews
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    salesperson_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.role IN ('sales','sales_rep','sales_team')
    )
  )
);

CREATE OR REPLACE FUNCTION public.sales_performance_is_active_sales(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = p_user_id
      AND p.status = 'active'
      AND p.role IN ('sales','sales_rep','sales_team')
  );
$$;

CREATE OR REPLACE FUNCTION public.sales_performance_activation_context(p_salesperson_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'applicantId', a.id,
      'activationDate', a.stage_entered_at::date,
      'activationAt', a.stage_entered_at,
      'applicantStage', a.stage,
      'finalApproval', a.final_approval
    )
    FROM public.applicants a
    WHERE a.linked_user_id = p_salesperson_id
      AND a.stage = 'Activated'
      AND a.final_approval = true
    ORDER BY a.stage_entered_at DESC
    LIMIT 1
  ), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.get_sales_performance_snapshot(p_salesperson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := public.is_admin();
  v_activation jsonb;
  v_activation_at timestamptz;
  v_activation_date date;
  v_days_active integer;
  v_metrics jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT v_is_admin AND v_actor <> p_salesperson_id THEN
    RAISE EXCEPTION 'You can only view your own sales performance';
  END IF;

  IF NOT public.sales_performance_is_active_sales(p_salesperson_id) THEN
    RAISE EXCEPTION 'Active Sales access is required';
  END IF;

  v_activation := public.sales_performance_activation_context(p_salesperson_id);
  v_activation_at := NULLIF(v_activation->>'activationAt','')::timestamptz;
  v_activation_date := NULLIF(v_activation->>'activationDate','')::date;

  IF v_activation_date IS NULL THEN
    RETURN jsonb_build_object(
      'activationDate', NULL,
      'daysActive', NULL,
      'customerInteractions', 0,
      'crmActivitiesLogged', 0,
      'crmActivitiesCompleted', 0,
      'overdueActivities', 0,
      'leadsOwned', 0,
      'openOpportunities', 0,
      'wonOpportunities', 0,
      'pipelineValue', 0,
      'opportunitiesMissingNextFollowUp', 0,
      'meetingsScheduled', 0,
      'meetingsCompleted', 0,
      'meetingNoShows', 0,
      'quotationsCreated', 0,
      'quotationsSent', 0,
      'quotationsAccepted', 0,
      'verifiedPayments', 0,
      'verifiedSales', 0,
      'commissionEntries', 0
    );
  END IF;

  v_days_active := GREATEST(0, current_date - v_activation_date);

  SELECT jsonb_build_object(
    'activationDate', v_activation_date,
    'daysActive', v_days_active,
    'customerInteractions',
      (
        SELECT count(*)::integer
        FROM public.crm_activities ca
        WHERE ca.assigned_to = p_salesperson_id
          AND ca.completed_at IS NOT NULL
          AND ca.completed_at >= v_activation_at
          AND (ca.lead_id IS NOT NULL OR ca.opportunity_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1
            FROM public.sales_meetings sm
            WHERE sm.activity_id = ca.id
              AND sm.salesperson_id = p_salesperson_id
          )
      )
      +
      (
        SELECT count(*)::integer
        FROM public.sales_meetings sm
        WHERE sm.salesperson_id = p_salesperson_id
          AND sm.completed_at IS NOT NULL
          AND sm.completed_at >= v_activation_at
      ),
    'crmActivitiesLogged', (
      SELECT count(*)::integer
      FROM public.crm_activities ca
      WHERE ca.assigned_to = p_salesperson_id
        AND ca.created_at >= v_activation_at
    ),
    'crmActivitiesCompleted', (
      SELECT count(*)::integer
      FROM public.crm_activities ca
      WHERE ca.assigned_to = p_salesperson_id
        AND ca.completed_at IS NOT NULL
        AND ca.completed_at >= v_activation_at
    ),
    'overdueActivities', (
      SELECT count(*)::integer
      FROM public.crm_activities ca
      WHERE ca.assigned_to = p_salesperson_id
        AND ca.completed_at IS NULL
        AND ca.status <> 'Completed'
        AND ca.due_at < now()
    ),
    'leadsOwned', (
      SELECT count(*)::integer
      FROM public.crm_leads l
      WHERE l.salesperson_id = p_salesperson_id
    ),
    'openOpportunities', (
      SELECT count(*)::integer
      FROM public.crm_opportunities o
      WHERE o.salesperson_id = p_salesperson_id
        AND o.won_at IS NULL
        AND o.lost_at IS NULL
    ),
    'wonOpportunities', (
      SELECT count(*)::integer
      FROM public.crm_opportunities o
      WHERE o.salesperson_id = p_salesperson_id
        AND o.won_at IS NOT NULL
        AND o.won_at >= v_activation_at
    ),
    'pipelineValue', COALESCE((
      SELECT sum(COALESCE(o.expected_value,0))
      FROM public.crm_opportunities o
      WHERE o.salesperson_id = p_salesperson_id
        AND o.won_at IS NULL
        AND o.lost_at IS NULL
    ),0),
    'opportunitiesMissingNextFollowUp', (
      SELECT count(*)::integer
      FROM public.crm_opportunities o
      WHERE o.salesperson_id = p_salesperson_id
        AND o.won_at IS NULL
        AND o.lost_at IS NULL
        AND (o.next_follow_up_at IS NULL OR o.next_follow_up_at < now())
    ),
    'meetingsScheduled', (
      SELECT count(*)::integer
      FROM public.sales_meetings sm
      WHERE sm.salesperson_id = p_salesperson_id
        AND sm.created_at >= v_activation_at
    ),
    'meetingsCompleted', (
      SELECT count(*)::integer
      FROM public.sales_meetings sm
      WHERE sm.salesperson_id = p_salesperson_id
        AND sm.completed_at IS NOT NULL
        AND sm.completed_at >= v_activation_at
    ),
    'meetingNoShows', (
      SELECT count(*)::integer
      FROM public.sales_meetings sm
      WHERE sm.salesperson_id = p_salesperson_id
        AND sm.created_at >= v_activation_at
        AND lower(sm.status) IN ('no show','no_show','no-show')
    ),
    'quotationsCreated', (
      SELECT count(*)::integer
      FROM public.quotations q
      WHERE q.salesperson_id = p_salesperson_id
        AND q.created_at >= v_activation_at
    ),
    'quotationsSent', (
      SELECT count(*)::integer
      FROM public.quotations q
      WHERE q.salesperson_id = p_salesperson_id
        AND q.sent_at IS NOT NULL
        AND q.sent_at >= v_activation_at
    ),
    'quotationsAccepted', (
      SELECT count(*)::integer
      FROM public.quotations q
      WHERE q.salesperson_id = p_salesperson_id
        AND q.accepted_at IS NOT NULL
        AND q.accepted_at >= v_activation_at
    ),
    'verifiedPayments', (
      SELECT count(*)::integer
      FROM public.payments p
      WHERE p.salesperson_id = p_salesperson_id
        AND p.status = 'Verified'
        AND p.verified_at IS NOT NULL
        AND p.verified_at >= v_activation_at
    ),
    'verifiedSales', (
      SELECT count(DISTINCT p.opportunity_id)::integer
      FROM public.payments p
      WHERE p.salesperson_id = p_salesperson_id
        AND p.status = 'Verified'
        AND p.verified_at IS NOT NULL
        AND p.verified_at >= v_activation_at
        AND p.opportunity_id IS NOT NULL
    ),
    'commissionEntries', (
      SELECT count(*)::integer
      FROM public.commission_entries ce
      WHERE ce.salesperson_id = p_salesperson_id
        AND ce.created_at >= v_activation_at
        AND ce.status NOT IN ('Reversed','Adjusted')
    )
  ) INTO v_metrics;

  RETURN v_metrics;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_sales_performance_schedule(p_salesperson_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_settings public.sales_performance_settings%ROWTYPE;
  v_activation jsonb;
  v_activation_date date;
  v_applicant_id uuid;
  v_snapshot jsonb;
  v_interactions integer := 0;
  v_inserted integer := 0;
  v_week integer;
  v_week_day integer;
  v_review_date date;
BEGIN
  IF NOT public.sales_performance_is_active_sales(p_salesperson_id) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_settings
  FROM public.sales_performance_settings
  WHERE id = 'default';

  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN 0;
  END IF;

  v_activation := public.sales_performance_activation_context(p_salesperson_id);
  v_activation_date := NULLIF(v_activation->>'activationDate','')::date;
  v_applicant_id := NULLIF(v_activation->>'applicantId','')::uuid;

  IF v_activation_date IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.sales_performance_reviews
    (salesperson_id, applicant_id, review_key, review_type, scheduled_for, period_start, period_end)
  VALUES
    (p_salesperson_id, v_applicant_id, 'day7', 'day_7_checkin', v_activation_date + v_settings.review_day_7, v_activation_date, v_activation_date + v_settings.review_day_7),
    (p_salesperson_id, v_applicant_id, 'day30', 'day_30_review', v_activation_date + v_settings.review_day_30, v_activation_date, v_activation_date + v_settings.review_day_30),
    (p_salesperson_id, v_applicant_id, 'day60', 'day_60_review', v_activation_date + v_settings.review_day_60, v_activation_date + v_settings.review_day_30 + 1, v_activation_date + v_settings.review_day_60),
    (p_salesperson_id, v_applicant_id, 'day90', 'day_90_final', v_activation_date + v_settings.review_day_90, v_activation_date + v_settings.review_day_60 + 1, v_activation_date + v_settings.review_day_90)
  ON CONFLICT (salesperson_id, review_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_settings.weekly_coaching_interval_days > 0 THEN
    v_week := 1;
    LOOP
      v_week_day := v_week * v_settings.weekly_coaching_interval_days;
      EXIT WHEN v_week_day > v_settings.review_day_90;
      v_review_date := v_activation_date + v_week_day;
      INSERT INTO public.sales_performance_reviews
        (salesperson_id, applicant_id, review_key, review_type, scheduled_for, period_start, period_end)
      VALUES (
        p_salesperson_id,
        v_applicant_id,
        'week-' || v_week::text,
        'weekly_coaching',
        v_review_date,
        GREATEST(v_activation_date, v_review_date - v_settings.weekly_coaching_interval_days + 1),
        v_review_date
      )
      ON CONFLICT (salesperson_id, review_key) DO NOTHING;
      v_week := v_week + 1;
    END LOOP;
  END IF;

  v_snapshot := public.get_sales_performance_snapshot(p_salesperson_id);
  v_interactions := COALESCE((v_snapshot->>'customerInteractions')::integer,0);

  IF v_interactions >= v_settings.first_interaction_review_count THEN
    INSERT INTO public.sales_performance_reviews
      (salesperson_id, applicant_id, review_key, review_type, scheduled_for, period_start, period_end)
    VALUES (
      p_salesperson_id,
      v_applicant_id,
      'first-' || v_settings.first_interaction_review_count::text,
      'first_20_quality',
      current_date,
      v_activation_date,
      current_date
    )
    ON CONFLICT (salesperson_id, review_key) DO NOTHING;
  END IF;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_sales_performance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_settings public.sales_performance_settings%ROWTYPE;
  v_activation jsonb;
  v_activation_date date;
  v_days_active integer;
  v_phase text;
  v_reviews jsonb;
  v_next jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.sales_performance_is_active_sales(v_user) THEN
    RAISE EXCEPTION 'Active Sales access is required';
  END IF;

  PERFORM public.ensure_sales_performance_schedule(v_user);

  SELECT * INTO v_settings FROM public.sales_performance_settings WHERE id='default';
  v_activation := public.sales_performance_activation_context(v_user);
  v_activation_date := NULLIF(v_activation->>'activationDate','')::date;
  v_days_active := CASE WHEN v_activation_date IS NULL THEN NULL ELSE GREATEST(0,current_date-v_activation_date) END;

  v_phase := CASE
    WHEN v_days_active IS NULL THEN 'Activation record required'
    WHEN v_days_active <= v_settings.review_day_30 THEN 'Days 1-30 - Supervised Execution'
    WHEN v_days_active <= v_settings.review_day_60 THEN 'Days 31-60 - Pipeline Building'
    WHEN v_days_active <= v_settings.review_day_90 THEN 'Days 61-90 - Independent Execution'
    ELSE 'Post-90-Day Performance'
  END;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.scheduled_for, r.created_at),'[]'::jsonb)
  INTO v_reviews
  FROM public.sales_performance_reviews r
  WHERE r.salesperson_id = v_user;

  SELECT COALESCE(to_jsonb(r),'{}'::jsonb)
  INTO v_next
  FROM public.sales_performance_reviews r
  WHERE r.salesperson_id = v_user
    AND r.status IN ('Scheduled','In Review')
  ORDER BY CASE WHEN r.scheduled_for < current_date THEN 0 ELSE 1 END, r.scheduled_for, r.created_at
  LIMIT 1;

  RETURN jsonb_build_object(
    'settings', to_jsonb(v_settings),
    'activation', v_activation,
    'daysActive', v_days_active,
    'phase', v_phase,
    'snapshot', public.get_sales_performance_snapshot(v_user),
    'nextReview', v_next,
    'reviews', v_reviews
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_sales_performance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_settings public.sales_performance_settings%ROWTYPE;
  v_people jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_settings FROM public.sales_performance_settings WHERE id='default';

  PERFORM public.ensure_sales_performance_schedule(p.id)
  FROM public.user_profiles p
  WHERE p.status='active'
    AND p.role IN ('sales','sales_rep','sales_team');

  SELECT COALESCE(jsonb_agg(person ORDER BY person->>'name'),'[]'::jsonb)
  INTO v_people
  FROM (
    SELECT jsonb_build_object(
      'userId', p.id,
      'name', COALESCE(NULLIF(p.full_name,''), p.email),
      'email', p.email,
      'role', p.role,
      'activation', public.sales_performance_activation_context(p.id),
      'snapshot', public.get_sales_performance_snapshot(p.id),
      'nextReview', COALESCE((
        SELECT to_jsonb(r)
        FROM public.sales_performance_reviews r
        WHERE r.salesperson_id = p.id
          AND r.status IN ('Scheduled','In Review')
        ORDER BY CASE WHEN r.scheduled_for < current_date THEN 0 ELSE 1 END, r.scheduled_for, r.created_at
        LIMIT 1
      ), '{}'::jsonb),
      'reviews', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.scheduled_for, r.created_at)
        FROM public.sales_performance_reviews r
        WHERE r.salesperson_id = p.id
      ), '[]'::jsonb)
    ) AS person
    FROM public.user_profiles p
    WHERE p.status='active'
      AND p.role IN ('sales','sales_rep','sales_team')
  ) q;

  RETURN jsonb_build_object(
    'settings', to_jsonb(v_settings),
    'salespeople', v_people
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_sales_performance_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_day7 integer := COALESCE((p_settings->>'reviewDay7')::integer,7);
  v_day30 integer := COALESCE((p_settings->>'reviewDay30')::integer,30);
  v_day60 integer := COALESCE((p_settings->>'reviewDay60')::integer,60);
  v_day90 integer := COALESCE((p_settings->>'reviewDay90')::integer,90);
  v_first integer := COALESCE((p_settings->>'firstInteractionReviewCount')::integer,20);
  v_weekly integer := COALESCE((p_settings->>'weeklyCoachingIntervalDays')::integer,7);
  v_crm integer := COALESCE((p_settings->>'crmLoggingTargetPercent')::integer,100);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF NOT (v_day7 > 0 AND v_day30 > v_day7 AND v_day60 > v_day30 AND v_day90 > v_day60) THEN
    RAISE EXCEPTION 'Review days must be positive and strictly increasing';
  END IF;
  IF v_first <= 0 THEN RAISE EXCEPTION 'First interaction review count must be greater than zero'; END IF;
  IF v_weekly < 1 OR v_weekly > 30 THEN RAISE EXCEPTION 'Weekly coaching interval must be between 1 and 30 days'; END IF;
  IF v_crm < 0 OR v_crm > 100 THEN RAISE EXCEPTION 'CRM logging target must be between 0 and 100 percent'; END IF;

  UPDATE public.sales_performance_settings
  SET enabled = COALESCE((p_settings->>'enabled')::boolean, enabled),
      review_day_7 = v_day7,
      review_day_30 = v_day30,
      review_day_60 = v_day60,
      review_day_90 = v_day90,
      first_interaction_review_count = v_first,
      weekly_coaching_interval_days = v_weekly,
      crm_logging_target_percent = v_crm,
      policy_version = policy_version + 1,
      updated_by = v_actor,
      updated_at = now()
  WHERE id='default';

  DELETE FROM public.sales_performance_reviews
  WHERE status='Scheduled'
    AND scheduled_for > current_date
    AND review_type IN ('day_7_checkin','day_30_review','day_60_review','day_90_final','weekly_coaching');

  PERFORM public.ensure_sales_performance_schedule(p.id)
  FROM public.user_profiles p
  WHERE p.status='active'
    AND p.role IN ('sales','sales_rep','sales_team');

  RETURN public.admin_get_sales_performance();
END;
$$;

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

  IF p_status='Completed' AND p_decision IS NULL THEN
    RAISE EXCEPTION 'A completed review requires a management decision';
  END IF;

  SELECT * INTO v_review
  FROM public.sales_performance_reviews
  WHERE id = p_review_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Performance review not found';
  END IF;

  v_snapshot := CASE
    WHEN p_status='Completed' THEN public.get_sales_performance_snapshot(v_review.salesperson_id)
    ELSE v_review.metrics_snapshot
  END;

  UPDATE public.sales_performance_reviews
  SET status = p_status,
      decision = CASE WHEN p_status='Completed' THEN p_decision ELSE decision END,
      metrics_snapshot = v_snapshot,
      strengths = COALESCE(p_strengths, strengths),
      coaching_actions = COALESCE(p_coaching_actions, coaching_actions),
      risks = COALESCE(p_risks, risks),
      review_notes = COALESCE(p_review_notes, review_notes),
      scope_restrictions = COALESCE(p_scope_restrictions, scope_restrictions),
      improvement_plan = COALESCE(p_improvement_plan, improvement_plan),
      completed_by = CASE WHEN p_status='Completed' THEN v_actor ELSE completed_by END,
      completed_at = CASE WHEN p_status='Completed' THEN now() WHEN status='Completed' AND p_status<>'Completed' THEN NULL ELSE completed_at END,
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

REVOKE ALL ON FUNCTION public.sales_performance_is_active_sales(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_performance_activation_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_sales_performance_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_sales_performance_schedule(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_sales_performance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_sales_performance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_sales_performance_settings(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_sales_performance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_sales_performance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_sales_performance_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text) TO authenticated;

COMMENT ON TABLE public.sales_performance_settings IS 'Admin-editable cadence for post-activation Sales supervision. Does not own CRM, commission, meeting, quotation, payment, or career-progression facts.';
COMMENT ON TABLE public.sales_performance_reviews IS 'Historical management review/coaching evidence for activated sellers. metrics_snapshot is immutable evidence captured from canonical systems when a review is completed.';
