-- PF-SOP-01 Part 15 — Seller Quality + Performance.
-- Extends the existing Sales Performance architecture with period-aware, source-derived quality evidence.
-- No new performance business table, no review/settings backfill, no automatic employment/access/commission/certification action.

DO $$
DECLARE
  v_policy jsonb;
BEGIN
  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_quotation_sales_reconciliation_policy_v1';

  IF coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false) IS DISTINCT FROM true
     OR nullif(v_policy->>'policyVersion','')::integer IS DISTINCT FROM 2
     OR nullif(v_policy->>'snapshotSchemaVersion','')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Part 15 requires the active Part 10B final quotation Send gate at policy/schema 2/2.';
  END IF;

  IF (SELECT count(*) FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('sales_performance_reviews','sales_performance_settings')) <> 2 THEN
    RAISE EXCEPTION 'Part 15 requires the existing Sales Performance review/settings architecture.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('seller_quality_reviews','sales_performance_v2','seller_scorecards','sales_quality_scores','performance_reviews_v2')
  ) THEN
    RAISE EXCEPTION 'Part 15 refuses to run with a duplicate Seller Performance truth system.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='crm_get_sales_gate_assessment') <> 1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='project_get_sales_handoff_readiness') <> 1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='crm_get_pipeline_command_center') <> 1 THEN
    RAISE EXCEPTION 'Part 15 canonical Part 8/11/13 dependencies are unavailable.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_sales_performance_period_snapshot(
  p_salesperson_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_is_admin boolean:=public.is_admin();
  v_start timestamptz;
  v_end_exclusive timestamptz;
  v_effective_end timestamptz;
  v_period_days integer;
  v_result jsonb;

  v_first_eligible integer:=0;
  v_first_responded integer:=0;
  v_first_on_time integer:=0;
  v_first_late integer:=0;
  v_first_open_breaches integer:=0;
  v_first_unknown integer:=0;
  v_first_measured integer:=0;
  v_first_unsafe_attribution integer:=0;
  v_first_median numeric;

  v_discovery_opps integer:=0;
  v_discovery_required integer:=0;
  v_discovery_resolved integer:=0;
  v_discovery_complete integer:=0;
  v_discovery_incomplete integer:=0;
  v_readiness_eval integer:=0;
  v_readiness_ready integer:=0;
  v_readiness_warning integer:=0;
  v_readiness_blocked integer:=0;
  v_readiness_hard_blockers integer:=0;
  v_readiness_errors integer:=0;
  v_opp record;
  v_assessment jsonb;
  v_dimension jsonb;
  v_required integer;
  v_resolved integer;

  v_reviewed_handoffs integer:=0;
  v_all_reviewed_handoffs integer:=0;
  v_first_pass_accepted integer:=0;
  v_first_pass_returned integer:=0;
  v_missing_returns integer:=0;
  v_missing_reasons jsonb:='{}'::jsonb;

  v_promise_incidents integer:=0;
  v_promise_deals integer:=0;

  v_quotes integer:=0;
  v_discount_quotes integer:=0;
  v_approval_requests integer:=0;
  v_validation_requests integer:=0;
  v_approved_overrides integer:=0;

  v_activities_due integer:=0;
  v_completed_on_time integer:=0;
  v_completed_late integer:=0;
  v_cancelled integer:=0;
  v_rescheduled integer:=0;
  v_repeatedly_rescheduled integer:=0;

  v_current_open integer:=0;
  v_current_missing_next integer:=0;
  v_current_overdue_next integer:=0;

  v_verified_payments integer:=0;
  v_verified_sales integer:=0;
  v_revenue_by_currency jsonb:='[]'::jsonb;

  v_won integer:=0;
  v_lost integer:=0;
  v_deal_value_by_currency jsonb:='[]'::jsonb;

  v_meetings_completed integer:=0;
  v_meetings_closed_out integer:=0;
  v_meetings_prep_eligible integer:=0;
  v_meetings_prep_reviewed integer:=0;
  v_activity_outcome_eligible integer:=0;
  v_activity_outcome_complete integer:=0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT v_is_admin AND v_actor IS DISTINCT FROM p_salesperson_id THEN
    RAISE EXCEPTION 'You can only view your own sales performance';
  END IF;
  IF NOT public.sales_performance_is_active_sales(p_salesperson_id) THEN
    RAISE EXCEPTION 'Active Sales access is required';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end<p_period_start THEN
    RAISE EXCEPTION 'A valid performance period is required';
  END IF;
  IF p_period_end-p_period_start>3660 THEN
    RAISE EXCEPTION 'Performance periods longer than ten years are not supported';
  END IF;

  -- Review periods are date-based. Canonical timestamptz evidence is evaluated
  -- in deterministic UTC half-open boundaries [periodStart, periodEnd + 1 day).
  v_start:=(p_period_start::timestamp AT TIME ZONE 'UTC');
  v_end_exclusive:=((p_period_end+1)::timestamp AT TIME ZONE 'UTC');
  v_effective_end:=least(statement_timestamp(),v_end_exclusive);
  v_period_days:=(p_period_end-p_period_start)+1;

  -- FIRST RESPONSE SLA: only rows carrying a canonical SLA obligation are eligible.
  -- A current-owner row whose acceptance predates its current assignment is excluded
  -- rather than crediting/blaming a reassigned Seller without event-time ownership proof.
  SELECT
    count(*) FILTER(WHERE attribution_safe)::int,
    count(*) FILTER(WHERE attribution_safe AND response_evidenced)::int,
    count(*) FILTER(WHERE attribution_safe AND response_evidenced AND first_response_at<=first_response_due_at)::int,
    count(*) FILTER(WHERE attribution_safe AND response_evidenced AND first_response_at>first_response_due_at)::int,
    count(*) FILTER(WHERE attribution_safe AND first_response_at IS NULL AND first_response_due_at<v_effective_end)::int,
    count(*) FILTER(WHERE attribution_safe AND first_response_at IS NOT NULL AND NOT response_evidenced)::int,
    count(*) FILTER(WHERE NOT attribution_safe)::int,
    percentile_cont(0.5) within group (
      order by extract(epoch from (first_response_at-coalesce(accepted_at,assigned_at,created_at)))/60.0
    ) FILTER(WHERE attribution_safe AND response_evidenced AND first_response_at>=coalesce(accepted_at,assigned_at,created_at))
  INTO
    v_first_eligible,v_first_responded,v_first_on_time,v_first_late,v_first_open_breaches,
    v_first_unknown,v_first_unsafe_attribution,v_first_median
  FROM (
    SELECT l.*,
      (
        l.salesperson_id=p_salesperson_id
        AND (l.assigned_at IS NULL OR l.accepted_at IS NULL OR l.accepted_at>=l.assigned_at)
        AND (l.assigned_at IS NULL OR l.first_response_at IS NULL OR l.first_response_at>=l.assigned_at)
      ) attribution_safe,
      (
        l.first_response_at IS NOT NULL
        AND nullif(btrim(coalesce(l.first_response_evidence_type,'')),'') IS NOT NULL
        AND nullif(btrim(coalesce(l.first_response_evidence_id,'')),'') IS NOT NULL
      ) response_evidenced
    FROM public.crm_leads l
    WHERE l.salesperson_id=p_salesperson_id
      AND l.first_response_due_at IS NOT NULL
      AND coalesce(l.accepted_at,l.assigned_at,l.created_at)>=v_start
      AND coalesce(l.accepted_at,l.assigned_at,l.created_at)<v_end_exclusive
  ) x;

  v_first_measured:=v_first_responded+v_first_open_breaches+v_first_unknown;

  -- DISCOVERY + PROPOSAL READINESS: reuse the Part 8 gate engine. This is a
  -- current evaluation of opportunities whose lifecycle overlaps the review period;
  -- a completed review freezes the result at completion time.
  FOR v_opp IN
    SELECT o.id
    FROM public.crm_opportunities o
    WHERE o.salesperson_id=p_salesperson_id
      AND o.archived_at IS NULL
      AND o.created_at<v_end_exclusive
      AND coalesce(o.won_at,o.lost_at,v_end_exclusive)>=v_start
    ORDER BY o.created_at,o.id
  LOOP
    BEGIN
      v_assessment:=public.crm_get_sales_gate_assessment(v_opp.id,'REQUIREMENTS_CONFIRMED');
      SELECT value INTO v_dimension
      FROM jsonb_array_elements(coalesce(v_assessment->'dimensions','[]'::jsonb))
      WHERE value->>'key'='REQUIREMENTS_COMPLETENESS'
      LIMIT 1;
      v_required:=coalesce(nullif(v_dimension->>'required','')::int,0);
      v_resolved:=coalesce(nullif(v_dimension->>'resolved','')::int,0);
      v_discovery_opps:=v_discovery_opps+1;
      v_discovery_required:=v_discovery_required+v_required;
      v_discovery_resolved:=v_discovery_resolved+v_resolved;
      IF v_required>0 AND v_resolved>=v_required THEN
        v_discovery_complete:=v_discovery_complete+1;
      ELSE
        v_discovery_incomplete:=v_discovery_incomplete+1;
      END IF;

      v_assessment:=public.crm_get_sales_gate_assessment(v_opp.id,'PROPOSAL_READINESS');
      v_readiness_eval:=v_readiness_eval+1;
      CASE coalesce(v_assessment->>'status','')
        WHEN 'READY' THEN v_readiness_ready:=v_readiness_ready+1;
        WHEN 'WARNING' THEN v_readiness_warning:=v_readiness_warning+1;
        WHEN 'BLOCKED' THEN v_readiness_blocked:=v_readiness_blocked+1;
        ELSE v_readiness_warning:=v_readiness_warning+1;
      END CASE;
      v_readiness_hard_blockers:=v_readiness_hard_blockers+
        coalesce((SELECT count(*)::int FROM jsonb_array_elements(coalesce(v_assessment->'blockers','[]'::jsonb))),0);
    EXCEPTION WHEN OTHERS THEN
      v_readiness_errors:=v_readiness_errors+1;
    END;
  END LOOP;

  -- DELIVERY QUALITY: event-time attribution comes from handoff submitted_by.
  SELECT
    count(*)::int,
    count(*) FILTER(WHERE a.status='ACCEPTED')::int,
    count(*) FILTER(WHERE a.status='RETURNED_TO_SALES')::int
  INTO v_reviewed_handoffs,v_first_pass_accepted,v_first_pass_returned
  FROM public.project_sales_handover_attempts a
  WHERE a.attempt_number=1
    AND a.submitted_by=p_salesperson_id
    AND a.reviewed_at>=v_start AND a.reviewed_at<v_end_exclusive
    AND a.status IN ('ACCEPTED','RETURNED_TO_SALES');

  SELECT count(*)::int INTO v_all_reviewed_handoffs
  FROM public.project_sales_handover_attempts a
  WHERE a.submitted_by=p_salesperson_id
    AND a.reviewed_at>=v_start AND a.reviewed_at<v_end_exclusive
    AND a.status IN ('ACCEPTED','RETURNED_TO_SALES');

  SELECT count(*)::int INTO v_missing_returns
  FROM public.project_sales_handover_attempts a
  WHERE a.submitted_by=p_salesperson_id
    AND a.reviewed_at>=v_start AND a.reviewed_at<v_end_exclusive
    AND a.status='RETURNED_TO_SALES'
    AND a.return_reason_codes && ARRAY[
      'MISSING_REQUIREMENT','UNCLEAR_REQUIREMENT',
      'CLIENT_DEPENDENCY_MISSING','ONBOARDING_INFORMATION_INCOMPLETE'
    ]::text[];

  SELECT coalesce(jsonb_object_agg(reason,cnt),'{}'::jsonb) INTO v_missing_reasons
  FROM (
    SELECT reason,count(*)::int cnt
    FROM public.project_sales_handover_attempts a
    CROSS JOIN LATERAL unnest(a.return_reason_codes) reason
    WHERE a.submitted_by=p_salesperson_id
      AND a.reviewed_at>=v_start AND a.reviewed_at<v_end_exclusive
      AND a.status='RETURNED_TO_SALES'
      AND reason IN ('MISSING_REQUIREMENT','UNCLEAR_REQUIREMENT','CLIENT_DEPENDENCY_MISSING','ONBOARDING_INFORMATION_INCOMPLETE')
    GROUP BY reason
  ) r;

  -- POLICY / COMMERCIAL QUALITY: a Promise incident requires an actual active
  -- canonical conflict. Draft/Pending/no-record states never become incidents.
  SELECT count(*)::int,count(distinct p.opportunity_id)::int
  INTO v_promise_incidents,v_promise_deals
  FROM public.crm_sales_promises p
  WHERE p.promised_by=p_salesperson_id
    AND p.promised_at>=v_start AND p.promised_at<v_end_exclusive
    AND p.record_state='ACTIVE'
    AND p.validation_alignment_status='CONFLICT'
    AND NOT EXISTS(
      SELECT 1 FROM public.crm_sales_promises child
      WHERE child.supersedes_promise_id=p.id
    );

  SELECT
    count(*)::int,
    count(*) FILTER(WHERE coalesce(q.quote_discount_total,0)>0 OR coalesce(q.line_discount_total,0)>0 OR coalesce(q.quote_discount_value,0)>0)::int,
    count(*) FILTER(WHERE q.approval_requested_at>=v_start AND q.approval_requested_at<v_end_exclusive
                      AND q.approval_requested_by=p_salesperson_id)::int,
    count(*) FILTER(WHERE q.revenue_distribution_override_at>=v_start AND q.revenue_distribution_override_at<v_end_exclusive
                      AND q.revenue_distribution_override_by=p_salesperson_id)::int
  INTO v_quotes,v_discount_quotes,v_approval_requests,v_approved_overrides
  FROM public.quotations q
  WHERE q.salesperson_id=p_salesperson_id
    AND q.created_at>=v_start AND q.created_at<v_end_exclusive;

  SELECT count(*)::int INTO v_validation_requests
  FROM public.crm_sales_validations v
  WHERE v.requested_by=p_salesperson_id
    AND v.requested_at>=v_start AND v.requested_at<v_end_exclusive;

  -- PART 11 NEXT-ACTION DISCIPLINE: opportunity-linked crm_activities are
  -- authoritative. Legacy crm_opportunities.next_follow_up_at is intentionally unused.
  SELECT
    count(*)::int,
    count(*) FILTER(WHERE a.status='Completed' AND a.completed_at IS NOT NULL AND a.completed_at<=a.due_at)::int,
    count(*) FILTER(WHERE a.status='Completed' AND a.completed_at IS NOT NULL AND a.completed_at>a.due_at)::int,
    count(*) FILTER(WHERE a.status='Cancelled')::int,
    count(*) FILTER(WHERE a.reschedule_count>0)::int,
    count(*) FILTER(WHERE a.reschedule_count>1)::int
  INTO v_activities_due,v_completed_on_time,v_completed_late,v_cancelled,v_rescheduled,v_repeatedly_rescheduled
  FROM public.crm_activities a
  WHERE a.assigned_to=p_salesperson_id
    AND a.opportunity_id IS NOT NULL
    AND a.due_at>=v_start AND a.due_at<v_end_exclusive;

  SELECT count(*)::int INTO v_current_open
  FROM public.crm_opportunities o
  WHERE o.salesperson_id=p_salesperson_id
    AND o.archived_at IS NULL AND o.status='Open';

  SELECT count(*)::int INTO v_current_missing_next
  FROM public.crm_opportunities o
  WHERE o.salesperson_id=p_salesperson_id
    AND o.archived_at IS NULL AND o.status='Open'
    AND NOT EXISTS(
      SELECT 1 FROM public.crm_activities a
      WHERE a.opportunity_id=o.id AND a.status='Scheduled'
    );

  SELECT count(*)::int INTO v_current_overdue_next
  FROM public.crm_opportunities o
  WHERE o.salesperson_id=p_salesperson_id
    AND o.archived_at IS NULL AND o.status='Open'
    AND EXISTS(
      SELECT 1 FROM public.crm_activities a
      WHERE a.id=(
        SELECT a2.id FROM public.crm_activities a2
        WHERE a2.opportunity_id=o.id AND a2.status='Scheduled'
        ORDER BY a2.due_at,a2.created_at,a2.id LIMIT 1
      )
      AND a.due_at<statement_timestamp()
    );

  -- COMMERCIAL OUTCOMES: Verified Payment is revenue authority. Never FX-normalize.
  SELECT count(*)::int,count(distinct p.opportunity_id)::int
  INTO v_verified_payments,v_verified_sales
  FROM public.payments p
  WHERE p.salesperson_id=p_salesperson_id
    AND p.status='Verified' AND p.verified_at IS NOT NULL
    AND p.verified_at>=v_start AND p.verified_at<v_end_exclusive;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'currency',currency,'amount',amount,'paymentCount',payment_count,'saleCount',sale_count
  ) ORDER BY currency),'[]'::jsonb)
  INTO v_revenue_by_currency
  FROM (
    SELECT coalesce(nullif(btrim(p.currency),''),'UNSPECIFIED') currency,
           round(sum(coalesce(p.amount_paid,0)),2) amount,
           count(*)::int payment_count,
           count(distinct p.opportunity_id)::int sale_count
    FROM public.payments p
    WHERE p.salesperson_id=p_salesperson_id
      AND p.status='Verified' AND p.verified_at IS NOT NULL
      AND p.verified_at>=v_start AND p.verified_at<v_end_exclusive
    GROUP BY coalesce(nullif(btrim(p.currency),''),'UNSPECIFIED')
  ) r;

  SELECT
    count(*) FILTER(WHERE o.won_at>=v_start AND o.won_at<v_end_exclusive)::int,
    count(*) FILTER(WHERE o.lost_at>=v_start AND o.lost_at<v_end_exclusive)::int
  INTO v_won,v_lost
  FROM public.crm_opportunities o
  WHERE o.salesperson_id=p_salesperson_id
    AND o.archived_at IS NULL
    AND (
      (o.won_at>=v_start AND o.won_at<v_end_exclusive)
      OR (o.lost_at>=v_start AND o.lost_at<v_end_exclusive)
    );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'currency',currency,
    'wonDeals',won_deals,
    'averageWonDealValue',avg_value,
    'medianWonDealValue',median_value,
    'verifiedRevenue',verified_revenue,
    'verifiedRevenuePerWonDeal',case when won_deals>0 then round(verified_revenue/won_deals,2) else null end
  ) ORDER BY currency),'[]'::jsonb)
  INTO v_deal_value_by_currency
  FROM (
    WITH won_quotes AS (
      SELECT DISTINCT ON (o.id)
        o.id opportunity_id,
        coalesce(nullif(btrim(q.currency),''),'UNSPECIFIED') currency,
        coalesce(q.total,0)::numeric quote_total
      FROM public.crm_opportunities o
      JOIN public.quotations q ON q.opportunity_id=o.id
      WHERE o.salesperson_id=p_salesperson_id
        AND o.won_at>=v_start AND o.won_at<v_end_exclusive
        AND q.status='Accepted' AND q.accepted_at IS NOT NULL
      ORDER BY o.id,q.accepted_at DESC,q.created_at DESC,q.id
    ),
    quote_stats AS (
      SELECT currency,count(*)::int won_deals,
             round(avg(quote_total),2) avg_value,
             round(percentile_cont(0.5) within group(order by quote_total)::numeric,2) median_value
      FROM won_quotes GROUP BY currency
    ),
    revenue AS (
      SELECT coalesce(nullif(btrim(currency),''),'UNSPECIFIED') currency,
             round(sum(coalesce(amount_paid,0)),2) verified_revenue
      FROM public.payments
      WHERE salesperson_id=p_salesperson_id AND status='Verified' AND verified_at IS NOT NULL
        AND verified_at>=v_start AND verified_at<v_end_exclusive
      GROUP BY coalesce(nullif(btrim(currency),''),'UNSPECIFIED')
    )
    SELECT q.currency,q.won_deals,q.avg_value,q.median_value,coalesce(r.verified_revenue,0) verified_revenue
    FROM quote_stats q LEFT JOIN revenue r USING(currency)
  ) x;

  -- Supporting deterministic evidence for the existing human quality areas.
  SELECT
    count(*) FILTER(WHERE m.completed_at>=v_start AND m.completed_at<v_end_exclusive)::int,
    count(*) FILTER(WHERE m.completed_at>=v_start AND m.completed_at<v_end_exclusive
                      AND nullif(btrim(coalesce(m.outcome,'')),'') IS NOT NULL
                      AND nullif(btrim(coalesce(m.next_step,'')),'') IS NOT NULL)::int,
    count(*) FILTER(WHERE m.start_at>=v_start AND m.start_at<v_end_exclusive)::int,
    count(*) FILTER(WHERE m.start_at>=v_start AND m.start_at<v_end_exclusive AND m.prep_reviewed_at IS NOT NULL)::int
  INTO v_meetings_completed,v_meetings_closed_out,v_meetings_prep_eligible,v_meetings_prep_reviewed
  FROM public.sales_meetings m
  WHERE m.salesperson_id=p_salesperson_id
    AND (
      (m.completed_at>=v_start AND m.completed_at<v_end_exclusive)
      OR (m.start_at>=v_start AND m.start_at<v_end_exclusive)
    );

  SELECT
    count(*)::int,
    count(*) FILTER(WHERE nullif(btrim(coalesce(a.outcome,'')),'') IS NOT NULL
                      AND a.outcome_recorded_at IS NOT NULL)::int
  INTO v_activity_outcome_eligible,v_activity_outcome_complete
  FROM public.crm_activities a
  WHERE a.assigned_to=p_salesperson_id
    AND a.status='Completed'
    AND a.completed_at>=v_start AND a.completed_at<v_end_exclusive
    AND a.opportunity_id IS NOT NULL;

  v_result:=jsonb_build_object(
    'schemaVersion',1,
    'period',jsonb_build_object(
      'start',p_period_start,'end',p_period_end,'days',v_period_days,'timezone','UTC',
      'boundary','[periodStart 00:00 UTC, periodEnd + 1 day 00:00 UTC)',
      'effectiveThrough',v_effective_end
    ),

    -- Backward-compatible volume/outcome fields. Current-health fields are
    -- completed by get_sales_performance_snapshot().
    'customerInteractions',
      (SELECT count(*)::int FROM public.crm_activities a
       WHERE a.assigned_to=p_salesperson_id AND a.completed_at>=v_start AND a.completed_at<v_end_exclusive
         AND (a.lead_id IS NOT NULL OR a.opportunity_id IS NOT NULL)
         AND NOT EXISTS(
           SELECT 1 FROM public.sales_meetings sm
           WHERE sm.activity_id=a.id AND sm.salesperson_id=p_salesperson_id
         ))
      +(SELECT count(*)::int FROM public.sales_meetings m
        WHERE m.salesperson_id=p_salesperson_id AND m.completed_at>=v_start AND m.completed_at<v_end_exclusive),
    'crmActivitiesLogged',(SELECT count(*)::int FROM public.crm_activities a
      WHERE a.assigned_to=p_salesperson_id AND a.created_at>=v_start AND a.created_at<v_end_exclusive),
    'crmActivitiesCompleted',(SELECT count(*)::int FROM public.crm_activities a
      WHERE a.assigned_to=p_salesperson_id AND a.completed_at>=v_start AND a.completed_at<v_end_exclusive),
    'overdueActivities',(SELECT count(*)::int FROM public.crm_activities a
      WHERE a.assigned_to=p_salesperson_id AND a.status NOT IN ('Completed','Cancelled') AND a.due_at<statement_timestamp()),
    'leadsOwned',(SELECT count(*)::int FROM public.crm_leads l WHERE l.salesperson_id=p_salesperson_id),
    'openOpportunities',v_current_open,
    'wonOpportunities',v_won,
    'pipelineValue',coalesce((SELECT sum(coalesce(o.expected_value,0)) FROM public.crm_opportunities o
      WHERE o.salesperson_id=p_salesperson_id AND o.archived_at IS NULL AND o.status='Open'),0),
    'opportunitiesMissingNextFollowUp',v_current_missing_next,
    'meetingsScheduled',(SELECT count(*)::int FROM public.sales_meetings m
      WHERE m.salesperson_id=p_salesperson_id AND m.created_at>=v_start AND m.created_at<v_end_exclusive),
    'meetingsCompleted',v_meetings_completed,
    'meetingNoShows',(SELECT count(*)::int FROM public.sales_meetings m
      WHERE m.salesperson_id=p_salesperson_id AND m.start_at>=v_start AND m.start_at<v_end_exclusive
        AND lower(m.status) IN ('no show','no_show','no-show')),
    'quotationsCreated',v_quotes,
    'quotationsSent',(SELECT count(*)::int FROM public.quotations q
      WHERE q.salesperson_id=p_salesperson_id AND q.sent_at>=v_start AND q.sent_at<v_end_exclusive),
    'quotationsAccepted',(SELECT count(*)::int FROM public.quotations q
      WHERE q.salesperson_id=p_salesperson_id AND q.accepted_at>=v_start AND q.accepted_at<v_end_exclusive),
    'verifiedPayments',v_verified_payments,
    'verifiedSales',v_verified_sales,
    'commissionEntries',(SELECT count(*)::int FROM public.commission_entries ce
      WHERE ce.salesperson_id=p_salesperson_id AND ce.created_at>=v_start AND ce.created_at<v_end_exclusive
        AND ce.status NOT IN ('Reversed','Adjusted')),

    'qualityEvidence',jsonb_build_object(
      'firstResponseSla',jsonb_build_object(
        'key','firstResponseSla','label','First-response SLA',
        'availability',case when v_first_measured=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',case when v_first_measured=0 then null else round(100.0*v_first_on_time/v_first_measured,1) end,
        'numerator',v_first_on_time,'denominator',v_first_measured,'rate',
          case when v_first_measured=0 then null else round(100.0*v_first_on_time/v_first_measured,1) end,
        'sampleSize',v_first_measured,'eligibleLeads',v_first_eligible,'measuredObligations',v_first_measured,'respondedLeads',v_first_responded,
        'onTimeResponses',v_first_on_time,'lateResponses',v_first_late,'openBreaches',v_first_open_breaches,
        'unknownIncompleteEvidence',v_first_unknown,'excludedUnsafeOwnershipAttribution',v_first_unsafe_attribution,
        'medianResponseMinutes',case when v_first_median is null then null else round(v_first_median,1) end,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','crm_leads first-response evidence',
        'notes','Only canonical SLA obligations with current Seller ownership and safe assignment timing are counted; incomplete evidence never counts as a successful response.'
      ),
      'discoveryCompleteness',jsonb_build_object(
        'key','discoveryCompleteness','label','Discovery completeness',
        'availability',case when v_discovery_opps=0 or v_discovery_required=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',case when v_discovery_required=0 then null else round(100.0*v_discovery_resolved/v_discovery_required,1) end,
        'numerator',v_discovery_resolved,'denominator',v_discovery_required,
        'rate',case when v_discovery_required=0 then null else round(100.0*v_discovery_resolved/v_discovery_required,1) end,
        'sampleSize',v_discovery_opps,'eligibleOpportunities',v_discovery_opps,
        'requiredRequirements',v_discovery_required,'confirmedRequirements',v_discovery_resolved,
        'unresolvedRequiredRequirements',greatest(v_discovery_required-v_discovery_resolved,0),
        'opportunitiesWithCompleteRequiredDiscovery',v_discovery_complete,
        'opportunitiesWithIncompleteRequiredDiscovery',v_discovery_incomplete,
        'periodStart',p_period_start,'periodEnd',p_period_end,
        'source','Part 8 REQUIREMENTS_CONFIRMED evaluator / structured crm_requirements',
        'sourceVersion','crm_sales_gate_policy_v1',
        'notes','Uses the canonical Requirement definitions, conditional applicability, certainty and Not Applicable handling. Current evaluator evidence is frozen when a review is completed.'
      ),
      'proposalReadiness',jsonb_build_object(
        'key','proposalReadiness','label','Proposal readiness',
        'availability',case when v_readiness_eval=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',case when v_readiness_eval=0 then null else v_readiness_ready end,
        'sampleSize',v_readiness_eval,'opportunitiesEvaluated',v_readiness_eval,
        'readyCount',v_readiness_ready,'clarificationRequiredCount',v_readiness_warning,
        'blockedCount',v_readiness_blocked,'hardBlockerIncidence',v_readiness_hard_blockers,
        'evaluationErrors',v_readiness_errors,'periodStart',p_period_start,'periodEnd',p_period_end,
        'source','Part 8 crm_get_sales_gate_assessment(PROPOSAL_READINESS)',
        'sourceVersion','crm_sales_gate_policy_v1',
        'notes','Current readiness evaluation as of snapshot time; this does not claim historical readiness at an earlier stage transition.'
      ),
      'firstPassHandoffAcceptance',jsonb_build_object(
        'key','firstPassHandoffAcceptance','label','First-pass handoff acceptance',
        'availability',case when v_reviewed_handoffs=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',case when v_reviewed_handoffs=0 then null else round(100.0*v_first_pass_accepted/v_reviewed_handoffs,1) end,
        'numerator',v_first_pass_accepted,'denominator',v_reviewed_handoffs,
        'rate',case when v_reviewed_handoffs=0 then null else round(100.0*v_first_pass_accepted/v_reviewed_handoffs,1) end,
        'sampleSize',v_reviewed_handoffs,'reviewedHandoffs',v_reviewed_handoffs,
        'acceptedFirstPass',v_first_pass_accepted,'returnedFirstPass',v_first_pass_returned,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','Part 13 project_sales_handover_attempts',
        'notes','Only reviewed attempt #1 is counted. Not Submitted and awaiting-review submissions are excluded.'
      ),
      'missingInformationRate',jsonb_build_object(
        'key','missingInformationRate','label','Missing-information rate',
        'availability',case when v_all_reviewed_handoffs=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',case when v_all_reviewed_handoffs=0 then null else round(100.0*v_missing_returns/v_all_reviewed_handoffs,1) end,
        'numerator',v_missing_returns,'denominator',v_all_reviewed_handoffs,
        'rate',case when v_all_reviewed_handoffs=0 then null else round(100.0*v_missing_returns/v_all_reviewed_handoffs,1) end,
        'sampleSize',v_all_reviewed_handoffs,'reviewedHandoffs',v_all_reviewed_handoffs,
        'returnsForMissingInformation',v_missing_returns,'reasonBreakdown',v_missing_reasons,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','Part 13 structured Return reasons',
        'notes','Counts only MISSING_REQUIREMENT, UNCLEAR_REQUIREMENT, CLIENT_DEPENDENCY_MISSING and ONBOARDING_INFORMATION_INCOMPLETE. Commercial, scope and timeline returns are not relabeled as missing information.'
      ),
      'postSaleSalesAttributedScopeChanges',jsonb_build_object(
        'key','postSaleSalesAttributedScopeChanges','label','Post-sale Sales-attributed scope changes',
        'availability','NOT_TRACKED_AUTHORITATIVELY','value',null,'sampleSize',0,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','No canonical explicit Sales-attribution source',
        'notes','Project/worker scope changes exist, but no authoritative source explicitly proves Sales responsibility. Part 15 does not infer blame.'
      ),
      'unauthorizedPromiseIncidents',jsonb_build_object(
        'key','unauthorizedPromiseIncidents','label','Unauthorized Promise incidents',
        'availability','AVAILABLE','value',v_promise_incidents,'sampleSize',v_promise_incidents,
        'incidentCount',v_promise_incidents,'relatedDeals',v_promise_deals,
        'periodStart',p_period_start,'periodEnd',p_period_end,
        'source','Part 9 crm_sales_promises canonical conflict evidence',
        'notes','Only active, unsuperseded material Promises with canonical CONFLICT alignment count. Draft, Pending and clarification states are not incidents.'
      ),
      'discountFrequency',jsonb_build_object(
        'key','discountFrequency','label','Discount frequency',
        'availability',case when v_quotes=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',case when v_quotes=0 then null else round(100.0*v_discount_quotes/v_quotes,1) end,
        'numerator',v_discount_quotes,'denominator',v_quotes,
        'rate',case when v_quotes=0 then null else round(100.0*v_discount_quotes/v_quotes,1) end,
        'sampleSize',v_quotes,'quotationsCreated',v_quotes,'quotationsWithDiscount',v_discount_quotes,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','quotations discount fields',
        'notes','Pattern context only; a normal discount or required approval is not misconduct.'
      ),
      'commercialExceptions',jsonb_build_object(
        'key','commercialExceptions','label','Approval / exception frequency',
        'availability',case when v_quotes=0 and v_validation_requests=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',v_approval_requests+v_validation_requests+v_approved_overrides,
        'sampleSize',greatest(v_quotes,v_validation_requests),
        'approvalRequests',v_approval_requests,'commercialApprovalFrequency',
          case when v_quotes=0 then null else round(100.0*v_approval_requests/v_quotes,1) end,
        'validationRequests',v_validation_requests,'approvedOverrides',v_approved_overrides,
        'periodStart',p_period_start,'periodEnd',p_period_end,
        'source','quotation approval + Sales Validation + audited quotation override evidence',
        'notes','Approval requests, specialist validations and audited overrides remain separate evidence; none is automatically classified as misconduct.'
      ),
      'nextActionDiscipline',jsonb_build_object(
        'key','nextActionDiscipline','label','Next-action discipline',
        'availability',case when v_activities_due=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',case when v_completed_on_time+v_completed_late=0 then null
          else round(100.0*v_completed_on_time/(v_completed_on_time+v_completed_late),1) end,
        'numerator',v_completed_on_time,'denominator',v_completed_on_time+v_completed_late,
        'rate',case when v_completed_on_time+v_completed_late=0 then null
          else round(100.0*v_completed_on_time/(v_completed_on_time+v_completed_late),1) end,
        'sampleSize',v_activities_due,'activitiesDue',v_activities_due,'completedOnTime',v_completed_on_time,
        'completedLate',v_completed_late,'cancelled',v_cancelled,'rescheduled',v_rescheduled,
        'repeatedlyRescheduled',v_repeatedly_rescheduled,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','Part 11 opportunity-linked crm_activities',
        'notes','crm_opportunities.next_follow_up_at is not used as performance truth. Current missing/overdue next action is reported separately.'
      ),
      'clientExpectationDisputes',jsonb_build_object(
        'key','clientExpectationDisputes','label','Client expectation disputes',
        'availability','NOT_TRACKED_AUTHORITATIVELY','value',null,'sampleSize',0,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','No explicit structured dispute/complaint source',
        'notes','Refunds, handoff returns, quotation changes, messages and sentiment are not used to infer a client dispute.'
      ),
      'verifiedRevenue',jsonb_build_object(
        'key','verifiedRevenue','label','Verified revenue',
        'availability','AVAILABLE','value',v_revenue_by_currency,'sampleSize',v_verified_payments,
        'verifiedRevenueByCurrency',v_revenue_by_currency,'qualifyingPaidSales',v_verified_sales,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','payments.status=Verified + verified_at',
        'notes','Currencies are kept separate. No FX conversion is invented.'
      ),
      'winRate',jsonb_build_object(
        'key','winRate','label','Win rate',
        'availability',case when v_won+v_lost=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',case when v_won+v_lost=0 then null else round(100.0*v_won/(v_won+v_lost),1) end,
        'numerator',v_won,'denominator',v_won+v_lost,
        'rate',case when v_won+v_lost=0 then null else round(100.0*v_won/(v_won+v_lost),1) end,
        'sampleSize',v_won+v_lost,'closedDeals',v_won+v_lost,'wonDeals',v_won,'lostDeals',v_lost,
        'periodStart',p_period_start,'periodEnd',p_period_end,'source','payment-controlled Won / canonical Lost opportunities',
        'notes','Open opportunities are excluded. Opportunity ownership history is not reconstructed when event-time reassignment evidence is unavailable.'
      ),
      'dealValue',jsonb_build_object(
        'key','dealValue','label','Won deal value',
        'availability',case when v_won=0 then 'INSUFFICIENT_DATA' else 'AVAILABLE' end,
        'value',v_deal_value_by_currency,'sampleSize',v_won,
        'byCurrency',v_deal_value_by_currency,
        'periodStart',p_period_start,'periodEnd',p_period_end,
        'source','accepted quotation totals + verified payments',
        'notes','Accepted quotation value and verified revenue remain distinct. Currencies are not mixed.'
      )
    ),

    'currentOperationalHealth',jsonb_build_object(
      'asOf',statement_timestamp(),
      'currentOpenOpportunities',v_current_open,
      'currentMissingNextAction',v_current_missing_next,
      'currentOverdueNextAction',v_current_overdue_next,
      'source','Part 11 opportunity-linked Scheduled crm_activities'
    ),

    'supportingEvidence',jsonb_build_object(
      'crmAccuracy',jsonb_build_object(
        'completedOpportunityActivities',v_activity_outcome_eligible,
        'completedWithOutcomeEvidence',v_activity_outcome_complete
      ),
      'preparation',jsonb_build_object(
        'meetingsInPeriod',v_meetings_prep_eligible,
        'meetingPrepReviewed',v_meetings_prep_reviewed
      ),
      'meetingCloseOut',jsonb_build_object(
        'completedMeetings',v_meetings_completed,
        'completedWithOutcomeAndNextStep',v_meetings_closed_out
      ),
      'pipelineHealth',jsonb_build_object(
        'currentOpenOpportunities',v_current_open,
        'currentMissingNextAction',v_current_missing_next,
        'currentOverdueNextAction',v_current_overdue_next
      )
    ),

    'attribution',jsonb_build_object(
      'principle','Use event-time actor/owner evidence when available; do not infer responsibility from unsupported signals.',
      'leadReassignmentLimitations',v_first_unsafe_attribution,
      'opportunityOwnershipLimitation','Historical opportunity ownership transfers are not reconstructable from a canonical event-time owner ledger; current-owner outcome metrics disclose this limitation rather than guessing.'
    )
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_performance_snapshot(p_salesperson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_activation jsonb;
  v_activation_date date;
  v_snapshot jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_admin() AND v_actor IS DISTINCT FROM p_salesperson_id THEN
    RAISE EXCEPTION 'You can only view your own sales performance';
  END IF;
  IF NOT public.sales_performance_is_active_sales(p_salesperson_id) THEN
    RAISE EXCEPTION 'Active Sales access is required';
  END IF;

  v_activation:=public.sales_performance_activation_context(p_salesperson_id);
  v_activation_date:=nullif(v_activation->>'activationDate','')::date;

  IF v_activation_date IS NULL THEN
    RETURN jsonb_build_object(
      'activationDate',null,'daysActive',null,
      'customerInteractions',0,'crmActivitiesLogged',0,'crmActivitiesCompleted',0,
      'overdueActivities',0,'leadsOwned',0,'openOpportunities',0,'wonOpportunities',0,
      'pipelineValue',0,'opportunitiesMissingNextFollowUp',0,'meetingsScheduled',0,
      'meetingsCompleted',0,'meetingNoShows',0,'quotationsCreated',0,'quotationsSent',0,
      'quotationsAccepted',0,'verifiedPayments',0,'verifiedSales',0,'commissionEntries',0,
      'schemaVersion',1,
      'qualityEvidence',jsonb_build_object(
        'firstResponseSla',jsonb_build_object('key','firstResponseSla','label','First-response SLA','availability','INSUFFICIENT_DATA','sampleSize',0),
        'discoveryCompleteness',jsonb_build_object('key','discoveryCompleteness','label','Discovery completeness','availability','INSUFFICIENT_DATA','sampleSize',0),
        'proposalReadiness',jsonb_build_object('key','proposalReadiness','label','Proposal readiness','availability','INSUFFICIENT_DATA','sampleSize',0),
        'firstPassHandoffAcceptance',jsonb_build_object('key','firstPassHandoffAcceptance','label','First-pass handoff acceptance','availability','INSUFFICIENT_DATA','sampleSize',0),
        'missingInformationRate',jsonb_build_object('key','missingInformationRate','label','Missing-information rate','availability','INSUFFICIENT_DATA','sampleSize',0),
        'postSaleSalesAttributedScopeChanges',jsonb_build_object('key','postSaleSalesAttributedScopeChanges','label','Post-sale Sales-attributed scope changes','availability','NOT_TRACKED_AUTHORITATIVELY','sampleSize',0),
        'unauthorizedPromiseIncidents',jsonb_build_object('key','unauthorizedPromiseIncidents','label','Unauthorized Promise incidents','availability','AVAILABLE','value',0,'sampleSize',0),
        'discountFrequency',jsonb_build_object('key','discountFrequency','label','Discount frequency','availability','INSUFFICIENT_DATA','sampleSize',0),
        'commercialExceptions',jsonb_build_object('key','commercialExceptions','label','Approval / exception frequency','availability','INSUFFICIENT_DATA','sampleSize',0),
        'nextActionDiscipline',jsonb_build_object('key','nextActionDiscipline','label','Next-action discipline','availability','INSUFFICIENT_DATA','sampleSize',0),
        'clientExpectationDisputes',jsonb_build_object('key','clientExpectationDisputes','label','Client expectation disputes','availability','NOT_TRACKED_AUTHORITATIVELY','sampleSize',0),
        'verifiedRevenue',jsonb_build_object('key','verifiedRevenue','label','Verified revenue','availability','AVAILABLE','value','[]'::jsonb,'sampleSize',0),
        'winRate',jsonb_build_object('key','winRate','label','Win rate','availability','INSUFFICIENT_DATA','sampleSize',0),
        'dealValue',jsonb_build_object('key','dealValue','label','Won deal value','availability','INSUFFICIENT_DATA','sampleSize',0)
      ),
      'currentOperationalHealth',jsonb_build_object('asOf',statement_timestamp(),'currentOpenOpportunities',0,'currentMissingNextAction',0,'currentOverdueNextAction',0)
    );
  END IF;

  v_snapshot:=public.get_sales_performance_period_snapshot(p_salesperson_id,v_activation_date,current_date);

  RETURN v_snapshot || jsonb_build_object(
    'activationDate',v_activation_date,
    'daysActive',greatest(0,current_date-v_activation_date)
  );
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
  p_improvement_plan text DEFAULT NULL,
  p_quality_evidence jsonb DEFAULT NULL,
  p_required_actions text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_review public.sales_performance_reviews%ROWTYPE;
  v_snapshot jsonb;
  v_quality jsonb;
  v_actions text[];
  v_notes text;
  v_improvement_plan text;
  v_scope_restrictions text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  IF p_status NOT IN ('Scheduled','In Review','Completed','Cancelled') THEN
    RAISE EXCEPTION 'Invalid review status';
  END IF;
  IF p_decision IS NOT NULL AND p_decision NOT IN ('Continue','Extend Review','Restrict Scope','Close Engagement') THEN
    RAISE EXCEPTION 'Invalid review decision';
  END IF;

  SELECT * INTO v_review FROM public.sales_performance_reviews
  WHERE id=p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Performance review not found'; END IF;
  IF v_review.status='Completed' THEN
    RAISE EXCEPTION 'Completed performance reviews are immutable';
  END IF;
  IF p_status='Completed' AND current_date<v_review.period_end THEN
    RAISE EXCEPTION 'A performance review cannot be completed before its evidence period ends';
  END IF;

  v_quality:=coalesce(p_quality_evidence,v_review.quality_evidence,'{}'::jsonb);
  v_actions:=coalesce(p_required_actions,v_review.required_actions,ARRAY[]::text[]);
  v_notes:=coalesce(p_review_notes,v_review.review_notes,'');
  v_improvement_plan:=coalesce(p_improvement_plan,v_review.improvement_plan,'');
  v_scope_restrictions:=coalesce(p_scope_restrictions,v_review.scope_restrictions,'');

  IF jsonb_typeof(v_quality)<>'object' THEN RAISE EXCEPTION 'Quality evidence must be an object'; END IF;
  IF EXISTS(
    SELECT 1 FROM unnest(v_actions) action
    WHERE action NOT IN ('Coaching','Re-certification','Supervised Calls','Temporary Access Restriction','Improvement Plan')
  ) THEN RAISE EXCEPTION 'Invalid management action'; END IF;

  IF p_status='Completed' THEN
    IF p_decision IS NULL THEN RAISE EXCEPTION 'A completed review requires a management decision'; END IF;
    IF btrim(v_notes)='' THEN RAISE EXCEPTION 'A completed review requires management notes'; END IF;
    IF btrim(coalesce(v_quality->>'customerConduct',''))=''
       OR btrim(coalesce(v_quality->>'preparation',''))=''
       OR btrim(coalesce(v_quality->>'crmAccuracy',''))=''
       OR btrim(coalesce(v_quality->>'productAccuracy',''))=''
       OR btrim(coalesce(v_quality->>'followUpReliability',''))=''
       OR btrim(coalesce(v_quality->>'pipelineHealth',''))=''
       OR btrim(coalesce(v_quality->>'conversion',''))=''
       OR btrim(coalesce(v_quality->>'learning',''))=''
       OR btrim(coalesce(v_quality->>'policyCompliance',''))='' THEN
      RAISE EXCEPTION 'A completed review requires evidence for every approved quality area';
    END IF;
    IF p_decision='Extend Review' AND btrim(v_improvement_plan)='' THEN
      RAISE EXCEPTION 'Extend Review requires an improvement plan';
    END IF;
    IF p_decision='Restrict Scope' AND btrim(v_scope_restrictions)='' THEN
      RAISE EXCEPTION 'Restrict Scope requires scope restrictions';
    END IF;
  END IF;

  -- Part 15 freezes exact review-period quantitative evidence. It never rewrites
  -- a completed review after later CRM or policy changes.
  v_snapshot:=CASE WHEN p_status='Completed'
    THEN public.get_sales_performance_period_snapshot(v_review.salesperson_id,v_review.period_start,v_review.period_end)
    ELSE v_review.metrics_snapshot END;

  UPDATE public.sales_performance_reviews
  SET status=p_status,
      decision=CASE WHEN p_status='Completed' THEN p_decision ELSE decision END,
      metrics_snapshot=v_snapshot,
      quality_evidence=v_quality,
      required_actions=v_actions,
      strengths=coalesce(p_strengths,strengths),
      coaching_actions=coalesce(p_coaching_actions,coaching_actions),
      risks=coalesce(p_risks,risks),
      review_notes=v_notes,
      scope_restrictions=v_scope_restrictions,
      improvement_plan=v_improvement_plan,
      owner_id=coalesce(owner_id,v_actor),
      completed_by=CASE WHEN p_status='Completed' THEN v_actor ELSE completed_by END,
      completed_at=CASE WHEN p_status='Completed' THEN now() ELSE completed_at END,
      updated_at=now()
  WHERE id=p_review_id
  RETURNING * INTO v_review;

  RETURN jsonb_build_object(
    'review',to_jsonb(v_review),
    'accessActionRequired',v_review.decision IN ('Restrict Scope','Close Engagement')
      OR 'Temporary Access Restriction'=ANY(v_review.required_actions),
    'message',CASE
      WHEN v_review.decision IN ('Restrict Scope','Close Engagement')
        OR 'Temporary Access Restriction'=ANY(v_review.required_actions)
      THEN 'Management decision recorded. Apply any access/offboarding change through the existing Team & Users control; this review does not create a second access system.'
      ELSE 'Performance review updated.'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_performance_period_snapshot(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_sales_performance_period_snapshot(uuid,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_sales_performance_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text,jsonb,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text,jsonb,text[]) TO authenticated;

COMMENT ON FUNCTION public.get_sales_performance_period_snapshot(uuid,date,date) IS
  'Part 15 canonical period-aware Seller performance evidence. Derived from existing CRM/Sales/Payment/Handoff truth; no overall Seller score and no automated management consequence.';
COMMENT ON FUNCTION public.get_sales_performance_snapshot(uuid) IS
  'Backward-compatible current/activation Seller performance wrapper using the canonical Part 15 period-aware calculation path.';
COMMENT ON FUNCTION public.admin_update_sales_performance_review(uuid,text,text,text,text,text,text,text,text,jsonb,text[]) IS
  'Human-controlled Sales performance review workflow. Completion freezes immutable Part 15 period-specific metrics_snapshot evidence; no automatic access/employment action.';

DO $$
DECLARE
  v_policy jsonb;
BEGIN
  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_quotation_sales_reconciliation_policy_v1';

  IF coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false) IS DISTINCT FROM true
     OR nullif(v_policy->>'policyVersion','')::integer IS DISTINCT FROM 2
     OR nullif(v_policy->>'snapshotSchemaVersion','')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Part 15 must preserve Part 10B at policy/schema 2/2.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('seller_quality_reviews','sales_performance_v2','seller_scorecards','sales_quality_scores','performance_reviews_v2')
  ) THEN
    RAISE EXCEPTION 'Part 15 created or encountered a prohibited duplicate performance table.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='get_sales_performance_period_snapshot') <> 1 THEN
    RAISE EXCEPTION 'Part 15 period-aware snapshot helper is not canonical/exactly-once.';
  END IF;
END $$;
