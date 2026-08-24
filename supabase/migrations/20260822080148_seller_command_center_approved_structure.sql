-- Seller Command Center approved-structure closure.
-- Presentation/aggregation only: no dashboard-owned CRM, task, KPI, commission,
-- training, customer, meeting, quotation, payment or career-progression state.

CREATE OR REPLACE FUNCTION public.get_sales_today_dashboard(p_salesperson_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean := false;
  v_target uuid;
  v_quote_days integer := 2;
  v_settings jsonb := '{}'::jsonb;
  v_tz text := 'UTC';
  v_today date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  v_is_admin := public.is_admin();
  IF NOT v_is_admin AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN
    RAISE EXCEPTION 'Active Sales access required.';
  END IF;

  IF v_is_admin THEN
    v_target := p_salesperson_id;
  ELSE
    v_target := auth.uid();
  END IF;

  IF v_target IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = v_target
        AND up.status = 'active'
        AND up.role IN ('sales','sales_rep','sales_team')
    ) THEN
      RAISE EXCEPTION 'Active Sales profile not found.';
    END IF;
    SELECT COALESCE(NULLIF(up.timezone,''),'UTC') INTO v_tz
    FROM public.user_profiles up WHERE up.id = v_target;
  ELSE
    SELECT COALESCE(NULLIF(up.timezone,''),'UTC') INTO v_tz
    FROM public.user_profiles up WHERE up.id = auth.uid();
  END IF;

  v_tz := COALESCE(NULLIF(v_tz,''),'UTC');
  v_today := (now() AT TIME ZONE v_tz)::date;

  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings
  FROM public.system_configuration
  WHERE config_key='notification_settings';

  v_quote_days := LEAST(
    GREATEST(COALESCE((v_settings->>'quotationFollowUpDays')::integer,2),1),
    30
  );

  RETURN jsonb_build_object(
    'scope', CASE WHEN v_target IS NULL THEN 'team' ELSE 'individual' END,
    'salespersonId', v_target,
    'timezone', v_tz,
    'localDate', v_today,
    'counts', jsonb_build_object(
      'followUpsDueToday', (
        SELECT count(*)
        FROM public.crm_activities a
        WHERE (v_target IS NULL OR a.assigned_to=v_target)
          AND a.activity_type IN ('Follow-Up','Meeting Follow-Up','Quotation Follow-Up','Payment Follow-Up')
          AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled')
          AND (a.due_at AT TIME ZONE v_tz)::date = v_today
      ),
      'meetingsToday', (
        SELECT count(*)
        FROM public.sales_meetings m
        WHERE (v_target IS NULL OR m.salesperson_id=v_target)
          AND m.status IN ('Scheduled','Rescheduled')
          AND (m.start_at AT TIME ZONE COALESCE(NULLIF(m.timezone,''),v_tz))::date = v_today
      ),
      'overdueActivities', (
        SELECT count(*)
        FROM public.crm_activities a
        WHERE (v_target IS NULL OR a.assigned_to=v_target)
          AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled')
          AND a.due_at < now()
      ),
      'quotationsAwaitingResponse', (
        SELECT count(*)
        FROM public.quotations q
        WHERE (v_target IS NULL OR q.salesperson_id=v_target)
          AND lower(COALESCE(q.status,''))='sent'
          AND q.accepted_at IS NULL
          AND q.rejected_at IS NULL
      ),
      'paymentsAwaitingVerification', (
        SELECT count(*)
        FROM public.payments pay
        WHERE (v_target IS NULL OR pay.salesperson_id=v_target)
          AND pay.status='Verification Pending'
      ),
      'leadsNeedingAction', (
        SELECT count(*)
        FROM public.crm_leads l
        WHERE (v_target IS NULL OR l.salesperson_id=v_target)
          AND l.converted_opportunity_id IS NULL
          AND l.status <> 'Not Qualified'
          AND (l.next_follow_up_at IS NULL OR l.next_follow_up_at <= now())
      ),
      'academyPolicyAcknowledgements', (
        SELECT count(*)
        FROM public.in_app_notifications n
        WHERE n.read_at IS NULL
          AND (
            (v_target IS NOT NULL AND n.recipient_user_id=v_target)
            OR (
              v_target IS NULL
              AND EXISTS (
                SELECT 1 FROM public.user_profiles up
                WHERE up.id=n.recipient_user_id
                  AND up.status='active'
                  AND up.role IN ('sales','sales_rep','sales_team')
              )
            )
          )
          AND (
            lower(COALESCE(n.notification_type,'')) LIKE '%academy%'
            OR lower(COALESCE(n.notification_type,'')) LIKE '%policy%'
            OR lower(COALESCE(n.title,'')) LIKE '%academy%'
            OR lower(COALESCE(n.title,'')) LIKE '%policy%'
            OR lower(COALESCE(n.title,'')) LIKE '%acknowledg%'
            OR lower(COALESCE(n.message,'')) LIKE '%acknowledg%'
            OR lower(COALESCE(n.action_url,'')) LIKE '%academy%'
          )
      ),
      'newBookings', (
        SELECT count(*)
        FROM public.public_booking_submissions b
        WHERE (v_target IS NULL OR b.salesperson_id=v_target)
          AND b.created_at>=now()-interval '24 hours'
          AND b.status='Confirmed'
      ),
      'quotationFollowUps', (
        SELECT count(*)
        FROM public.quotations q
        WHERE (v_target IS NULL OR q.salesperson_id=v_target)
          AND lower(COALESCE(q.status,''))='sent'
          AND q.sent_at<=now()-make_interval(days=>v_quote_days)
          AND q.accepted_at IS NULL
          AND q.rejected_at IS NULL
      ),
      'unreadNotifications', (
        SELECT count(*)
        FROM public.in_app_notifications n
        WHERE n.read_at IS NULL
          AND (
            (v_target IS NOT NULL AND n.recipient_user_id=v_target)
            OR (
              v_target IS NULL
              AND EXISTS (
                SELECT 1 FROM public.user_profiles up
                WHERE up.id=n.recipient_user_id
                  AND up.status='active'
                  AND up.role IN ('sales','sales_rep','sales_team')
              )
            )
          )
      )
    ),
    'todayMeetings', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.start_at)
      FROM (
        SELECT m.start_at,
          jsonb_build_object(
            'id',m.id,'title',m.title,'startAt',m.start_at,'endAt',m.end_at,
            'timezone',m.timezone,'status',m.status,'meetingUrl',m.meeting_url,
            'companyName',COALESCE(b.company_name,o.company_name,l.company_name,''),
            'contactName',COALESCE(b.contact_name,o.contact_name,l.contact_name,m.attendee_name,''),
            'serviceInterest',COALESCE(b.service_interest,o.service_interest,l.service_interest,''),
            'prepUrl','/admin/meeting-prep/'||m.id::text
          ) obj
        FROM public.sales_meetings m
        LEFT JOIN public.public_booking_submissions b ON b.meeting_id=m.id
        LEFT JOIN public.crm_opportunities o ON o.id=m.opportunity_id
        LEFT JOIN public.crm_leads l ON l.id=m.lead_id
        WHERE (v_target IS NULL OR m.salesperson_id=v_target)
          AND m.status IN ('Scheduled','Rescheduled')
          AND (m.start_at AT TIME ZONE COALESCE(NULLIF(m.timezone,''),v_tz))::date=v_today
        ORDER BY m.start_at
        LIMIT 12
      ) x
    ),'[]'::jsonb),
    'followUpsDueToday', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.due_at)
      FROM (
        SELECT a.due_at,
          jsonb_build_object(
            'id',a.id,'activityType',a.activity_type,'subject',a.subject,'dueAt',a.due_at,
            'leadId',a.lead_id,'opportunityId',a.opportunity_id,'status',a.status,
            'channel',a.channel,'actionUrl','/admin/app/crm?tab=activities'
          ) obj
        FROM public.crm_activities a
        WHERE (v_target IS NULL OR a.assigned_to=v_target)
          AND a.activity_type IN ('Follow-Up','Meeting Follow-Up','Quotation Follow-Up','Payment Follow-Up')
          AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled')
          AND (a.due_at AT TIME ZONE v_tz)::date=v_today
        ORDER BY a.due_at
        LIMIT 15
      ) x
    ),'[]'::jsonb),
    'overdueActivities', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.due_at)
      FROM (
        SELECT a.due_at,
          jsonb_build_object(
            'id',a.id,'activityType',a.activity_type,'subject',a.subject,'dueAt',a.due_at,
            'leadId',a.lead_id,'opportunityId',a.opportunity_id,'status',a.status,
            'channel',a.channel,'actionUrl','/admin/app/crm?tab=activities'
          ) obj
        FROM public.crm_activities a
        WHERE (v_target IS NULL OR a.assigned_to=v_target)
          AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled')
          AND a.due_at<now()
        ORDER BY a.due_at
        LIMIT 15
      ) x
    ),'[]'::jsonb),
    'leadActions', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.sort_at)
      FROM (
        SELECT COALESCE(l.next_follow_up_at,l.created_at) sort_at,
          jsonb_build_object(
            'id',l.id,'companyName',l.company_name,'contactName',l.contact_name,
            'status',l.status,'nextFollowUpAt',l.next_follow_up_at,
            'lastContactAt',l.last_contact_at,'serviceInterest',l.service_interest,
            'actionUrl','/admin/app/crm?tab=crm_leads'
          ) obj
        FROM public.crm_leads l
        WHERE (v_target IS NULL OR l.salesperson_id=v_target)
          AND l.converted_opportunity_id IS NULL
          AND l.status <> 'Not Qualified'
          AND (l.next_follow_up_at IS NULL OR l.next_follow_up_at<=now())
        ORDER BY COALESCE(l.next_follow_up_at,l.created_at)
        LIMIT 12
      ) x
    ),'[]'::jsonb),
    'paymentVerificationActions', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.sort_at)
      FROM (
        SELECT COALESCE(pay.updated_at,pay.created_at) sort_at,
          jsonb_build_object(
            'id',pay.id,'customerName',pay.customer_name,'amount',pay.amount_paid,
            'currency',pay.currency,'paymentReference',pay.payment_reference,
            'status',pay.status,'actionUrl','/admin/app/sales?tab=payments'
          ) obj
        FROM public.payments pay
        WHERE (v_target IS NULL OR pay.salesperson_id=v_target)
          AND pay.status='Verification Pending'
        ORDER BY COALESCE(pay.updated_at,pay.created_at)
        LIMIT 12
      ) x
    ),'[]'::jsonb),
    'quotationActions', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.sent_at)
      FROM (
        SELECT q.sent_at,
          jsonb_build_object(
            'id',q.id,'quotationNumber',q.quotation_number,'customerName',q.customer_name,
            'total',q.total,'currency',q.currency,'sentAt',q.sent_at,'status',q.status,
            'url','/admin/app/sales?tab=quotations'
          ) obj
        FROM public.quotations q
        WHERE (v_target IS NULL OR q.salesperson_id=v_target)
          AND lower(COALESCE(q.status,''))='sent'
          AND q.sent_at<=now()-make_interval(days=>v_quote_days)
          AND q.accepted_at IS NULL
          AND q.rejected_at IS NULL
        ORDER BY q.sent_at
        LIMIT 12
      ) x
    ),'[]'::jsonb),
    'academyPolicyActions', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.created_at DESC)
      FROM (
        SELECT n.created_at,
          jsonb_build_object(
            'id',n.id,'type',n.notification_type,'title',n.title,'message',n.message,
            'actionUrl',n.action_url,'createdAt',n.created_at
          ) obj
        FROM public.in_app_notifications n
        WHERE n.read_at IS NULL
          AND (
            (v_target IS NOT NULL AND n.recipient_user_id=v_target)
            OR (
              v_target IS NULL
              AND EXISTS (
                SELECT 1 FROM public.user_profiles up
                WHERE up.id=n.recipient_user_id
                  AND up.status='active'
                  AND up.role IN ('sales','sales_rep','sales_team')
              )
            )
          )
          AND (
            lower(COALESCE(n.notification_type,'')) LIKE '%academy%'
            OR lower(COALESCE(n.notification_type,'')) LIKE '%policy%'
            OR lower(COALESCE(n.title,'')) LIKE '%academy%'
            OR lower(COALESCE(n.title,'')) LIKE '%policy%'
            OR lower(COALESCE(n.title,'')) LIKE '%acknowledg%'
            OR lower(COALESCE(n.message,'')) LIKE '%acknowledg%'
            OR lower(COALESCE(n.action_url,'')) LIKE '%academy%'
          )
        ORDER BY n.created_at DESC
        LIMIT 12
      ) x
    ),'[]'::jsonb),
    'upcomingMeetings', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.start_at)
      FROM (
        SELECT m.start_at,
          jsonb_build_object(
            'id',m.id,'title',m.title,'startAt',m.start_at,'timezone',m.timezone,
            'attendeeName',m.attendee_name,'meetingUrl',m.meeting_url,
            'prepUrl','/admin/meeting-prep/'||m.id::text
          ) obj
        FROM public.sales_meetings m
        WHERE (v_target IS NULL OR m.salesperson_id=v_target)
          AND m.status IN ('Scheduled','Rescheduled')
          AND m.start_at>now()
          AND m.start_at<now()+interval '7 days'
        ORDER BY m.start_at
        LIMIT 12
      ) x
    ),'[]'::jsonb),
    'notifications', COALESCE((
      SELECT jsonb_agg(x.obj ORDER BY x.created_at DESC)
      FROM (
        SELECT n.created_at,
          jsonb_build_object(
            'id',n.id,'type',n.notification_type,'title',n.title,'message',n.message,
            'actionUrl',n.action_url,'createdAt',n.created_at,'readAt',n.read_at
          ) obj
        FROM public.in_app_notifications n
        WHERE n.read_at IS NULL
          AND (
            (v_target IS NOT NULL AND n.recipient_user_id=v_target)
            OR (
              v_target IS NULL
              AND EXISTS (
                SELECT 1 FROM public.user_profiles up
                WHERE up.id=n.recipient_user_id
                  AND up.status='active'
                  AND up.role IN ('sales','sales_rep','sales_team')
              )
            )
          )
        ORDER BY n.created_at DESC
        LIMIT 12
      ) x
    ),'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_today_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_today_dashboard(uuid) TO authenticated;

-- Avoid PostgREST overload ambiguity: replace the old one-argument function with
-- one period-aware function whose remaining arguments are optional.
DROP FUNCTION IF EXISTS public.get_seller_command_center(uuid);

CREATE FUNCTION public.get_seller_command_center(
  p_salesperson_id uuid DEFAULT NULL::uuid,
  p_period text DEFAULT 'month'::text,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_target uuid;
  v_scope text;
  v_tz text := 'UTC';
  v_today date;
  v_period text := lower(COALESCE(NULLIF(btrim(p_period),''),'month'));
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
  v_span integer;
  v_month_start date;
  v_month_end date;
  v_monthly_target integer := 5;
  v_current_month_paid_sales integer := 0;
  v_paid_sales integer := 0;
  v_verified_revenue numeric := 0;
  v_meetings_completed integer := 0;
  v_pipeline_value numeric := 0;
  v_prev_paid_sales integer := 0;
  v_prev_verified_revenue numeric := 0;
  v_prev_meetings_completed integer := 0;
  v_prior_events integer := 0;
  v_target_completion numeric := 0;
  v_comparison jsonb := NULL;
  v_today_dashboard jsonb := '{}'::jsonb;
  v_progress jsonb := NULL;
  v_payout_schedule text := '';
  v_core_codes text[] := ARRAY['PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE','PF-CUSTOM']::text[];
  v_settings jsonb := '{}'::jsonb;
  v_quote_days integer := 2;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  v_is_admin := public.is_admin();
  IF NOT v_is_admin AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN
    RAISE EXCEPTION 'Active Sales access required.';
  END IF;

  IF v_is_admin THEN
    v_target := p_salesperson_id;
  ELSE
    v_target := v_uid;
  END IF;

  IF v_target IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id=v_target
        AND up.status='active'
        AND up.role IN ('sales','sales_rep','sales_team')
    ) THEN
      RAISE EXCEPTION 'Active Sales profile not found.';
    END IF;
    SELECT COALESCE(NULLIF(up.timezone,''),'UTC') INTO v_tz
    FROM public.user_profiles up WHERE up.id=v_target;
  ELSE
    SELECT COALESCE(NULLIF(up.timezone,''),'UTC') INTO v_tz
    FROM public.user_profiles up WHERE up.id=v_uid;
  END IF;

  v_tz := COALESCE(NULLIF(v_tz,''),'UTC');
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_scope := CASE WHEN v_target IS NULL THEN 'team' ELSE 'individual' END;

  IF v_period = 'today' THEN
    v_start := v_today;
    v_end := v_today;
  ELSIF v_period IN ('week','this_week') THEN
    v_period := 'week';
    v_start := date_trunc('week',v_today::timestamp)::date;
    v_end := v_start + 6;
  ELSIF v_period IN ('month','this_month') THEN
    v_period := 'month';
    v_start := date_trunc('month',v_today::timestamp)::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
  ELSIF v_period IN ('quarter','this_quarter') THEN
    v_period := 'quarter';
    v_start := date_trunc('quarter',v_today::timestamp)::date;
    v_end := (v_start + interval '3 months - 1 day')::date;
  ELSIF v_period = 'custom' THEN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
      RAISE EXCEPTION 'Custom period requires a start date and end date.';
    END IF;
    IF p_start_date > p_end_date THEN
      RAISE EXCEPTION 'Custom period start date must be on or before end date.';
    END IF;
    IF (p_end_date - p_start_date) > 365 THEN
      RAISE EXCEPTION 'Custom period cannot exceed 366 days.';
    END IF;
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    RAISE EXCEPTION 'Invalid seller dashboard period. Use today, week, month, quarter, or custom.';
  END IF;

  v_span := (v_end - v_start) + 1;
  v_prev_end := v_start - 1;
  v_prev_start := v_prev_end - (v_span - 1);
  v_month_start := date_trunc('month',v_today::timestamp)::date;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;

  SELECT
    COALESCE((role_details #>> '{performanceExpectations,minimumMonthlyPaidSales}')::integer,5),
    COALESCE(core_product_codes,v_core_codes)
  INTO v_monthly_target,v_core_codes
  FROM public.career_jobs
  WHERE slug='independent-sales-representative'
  ORDER BY updated_at DESC
  LIMIT 1;
  v_monthly_target := GREATEST(COALESCE(v_monthly_target,5),1);

  SELECT COALESCE(payout_schedule,'') INTO v_payout_schedule
  FROM public.commission_settings WHERE id='default';

  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings
  FROM public.system_configuration WHERE config_key='notification_settings';
  v_quote_days := LEAST(GREATEST(COALESCE((v_settings->>'quotationFollowUpDays')::integer,2),1),30);

  v_today_dashboard := public.get_sales_today_dashboard(v_target);
  IF v_target IS NOT NULL THEN
    v_progress := public.calculate_sales_career_progression(v_target,v_today);
  END IF;

  SELECT count(*)::integer INTO v_paid_sales
  FROM (
    SELECT DISTINCT COALESCE(ce.quotation_id::text,ce.opportunity_id::text,ce.payment_id::text) sale_key
    FROM public.commission_entries ce
    JOIN public.payments pay ON pay.id=ce.payment_id
    WHERE (v_target IS NULL OR ce.salesperson_id=v_target)
      AND ce.status IN ('Earned','Under Review','Approved','Paid')
      AND pay.status='Verified'
      AND pay.verified_at IS NOT NULL
      AND (pay.verified_at AT TIME ZONE v_tz)::date BETWEEN v_start AND v_end
  ) s
  WHERE sale_key IS NOT NULL;

  SELECT COALESCE(sum(pay.amount_paid),0) INTO v_verified_revenue
  FROM public.payments pay
  WHERE (v_target IS NULL OR pay.salesperson_id=v_target)
    AND pay.status='Verified'
    AND pay.verified_at IS NOT NULL
    AND (pay.verified_at AT TIME ZONE v_tz)::date BETWEEN v_start AND v_end;

  SELECT count(*)::integer INTO v_meetings_completed
  FROM public.sales_meetings m
  WHERE (v_target IS NULL OR m.salesperson_id=v_target)
    AND m.status='Completed'
    AND (COALESCE(m.completed_at,m.start_at) AT TIME ZONE v_tz)::date BETWEEN v_start AND v_end;

  SELECT COALESCE(sum(o.expected_value),0) INTO v_pipeline_value
  FROM public.crm_opportunities o
  WHERE (v_target IS NULL OR o.salesperson_id=v_target)
    AND o.status='Open';

  SELECT count(*)::integer INTO v_current_month_paid_sales
  FROM (
    SELECT DISTINCT COALESCE(ce.quotation_id::text,ce.opportunity_id::text,ce.payment_id::text) sale_key
    FROM public.commission_entries ce
    JOIN public.payments pay ON pay.id=ce.payment_id
    WHERE (v_target IS NULL OR ce.salesperson_id=v_target)
      AND ce.status IN ('Earned','Under Review','Approved','Paid')
      AND pay.status='Verified'
      AND pay.verified_at IS NOT NULL
      AND (pay.verified_at AT TIME ZONE v_tz)::date BETWEEN v_month_start AND v_month_end
  ) s
  WHERE sale_key IS NOT NULL;

  v_target_completion := round((v_current_month_paid_sales::numeric / v_monthly_target::numeric) * 100,1);

  SELECT (
    SELECT count(*) FROM public.payments pay
    WHERE (v_target IS NULL OR pay.salesperson_id=v_target)
      AND pay.status='Verified'
      AND pay.verified_at IS NOT NULL
      AND (pay.verified_at AT TIME ZONE v_tz)::date BETWEEN v_prev_start AND v_prev_end
  ) + (
    SELECT count(*) FROM public.sales_meetings m
    WHERE (v_target IS NULL OR m.salesperson_id=v_target)
      AND m.status='Completed'
      AND (COALESCE(m.completed_at,m.start_at) AT TIME ZONE v_tz)::date BETWEEN v_prev_start AND v_prev_end
  ) INTO v_prior_events;

  IF v_prior_events > 0 THEN
    SELECT count(*)::integer INTO v_prev_paid_sales
    FROM (
      SELECT DISTINCT COALESCE(ce.quotation_id::text,ce.opportunity_id::text,ce.payment_id::text) sale_key
      FROM public.commission_entries ce
      JOIN public.payments pay ON pay.id=ce.payment_id
      WHERE (v_target IS NULL OR ce.salesperson_id=v_target)
        AND ce.status IN ('Earned','Under Review','Approved','Paid')
        AND pay.status='Verified'
        AND pay.verified_at IS NOT NULL
        AND (pay.verified_at AT TIME ZONE v_tz)::date BETWEEN v_prev_start AND v_prev_end
    ) s
    WHERE sale_key IS NOT NULL;

    SELECT COALESCE(sum(pay.amount_paid),0) INTO v_prev_verified_revenue
    FROM public.payments pay
    WHERE (v_target IS NULL OR pay.salesperson_id=v_target)
      AND pay.status='Verified'
      AND pay.verified_at IS NOT NULL
      AND (pay.verified_at AT TIME ZONE v_tz)::date BETWEEN v_prev_start AND v_prev_end;

    SELECT count(*)::integer INTO v_prev_meetings_completed
    FROM public.sales_meetings m
    WHERE (v_target IS NULL OR m.salesperson_id=v_target)
      AND m.status='Completed'
      AND (COALESCE(m.completed_at,m.start_at) AT TIME ZONE v_tz)::date BETWEEN v_prev_start AND v_prev_end;

    v_comparison := jsonb_build_object(
      'available',true,
      'period',jsonb_build_object('start',v_prev_start,'end',v_prev_end),
      'confirmedPaidSales',v_prev_paid_sales,
      'verifiedRevenue',v_prev_verified_revenue,
      'meetingsCompleted',v_prev_meetings_completed,
      'changes',jsonb_build_object(
        'confirmedPaidSales',jsonb_build_object(
          'absolute',v_paid_sales-v_prev_paid_sales,
          'percent',CASE WHEN v_prev_paid_sales>0 THEN round(((v_paid_sales-v_prev_paid_sales)::numeric/v_prev_paid_sales::numeric)*100,1) ELSE NULL END
        ),
        'verifiedRevenue',jsonb_build_object(
          'absolute',v_verified_revenue-v_prev_verified_revenue,
          'percent',CASE WHEN v_prev_verified_revenue>0 THEN round(((v_verified_revenue-v_prev_verified_revenue)/v_prev_verified_revenue)*100,1) ELSE NULL END
        ),
        'meetingsCompleted',jsonb_build_object(
          'absolute',v_meetings_completed-v_prev_meetings_completed,
          'percent',CASE WHEN v_prev_meetings_completed>0 THEN round(((v_meetings_completed-v_prev_meetings_completed)::numeric/v_prev_meetings_completed::numeric)*100,1) ELSE NULL END
        )
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'scope',v_scope,
    'salespersonId',v_target,
    'generatedAt',now(),
    'timezone',v_tz,
    'period',jsonb_build_object('key',v_period,'start',v_start,'end',v_end),
    'comparison',v_comparison,
    'today',v_today_dashboard,
    'performance',jsonb_build_object(
      'confirmedPaidSales',v_paid_sales,
      'verifiedRevenue',v_verified_revenue,
      'pipelineValue',v_pipeline_value,
      'monthlyTarget',v_monthly_target,
      'monthlyTargetPaidSales',v_current_month_paid_sales,
      'targetCompletion',v_target_completion,
      'meetingsCompleted',v_meetings_completed,
      'productBreakdown',COALESCE((
        WITH qualifying AS (
          SELECT DISTINCT
            ce.product_code,
            COALESCE(sp.name,ce.product_name,ce.product_code) product_name,
            COALESCE(ce.quotation_id::text,ce.opportunity_id::text,ce.payment_id::text) sale_key
          FROM public.commission_entries ce
          JOIN public.payments pay ON pay.id=ce.payment_id
          LEFT JOIN public.sales_products sp ON sp.code=ce.product_code
          WHERE (v_target IS NULL OR ce.salesperson_id=v_target)
            AND ce.status IN ('Earned','Under Review','Approved','Paid')
            AND pay.status='Verified'
            AND pay.verified_at IS NOT NULL
            AND (pay.verified_at AT TIME ZONE v_tz)::date BETWEEN v_start AND v_end
        )
        SELECT jsonb_agg(
          jsonb_build_object('productCode',product_code,'productName',product_name,'sales',sale_count)
          ORDER BY sale_count DESC,product_name
        )
        FROM (
          SELECT product_code,max(product_name) product_name,count(*)::integer sale_count
          FROM qualifying WHERE sale_key IS NOT NULL
          GROUP BY product_code
        ) x
      ),'[]'::jsonb)
    ),
    'pipeline',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('stage',stage,'count',cnt,'value',value) ORDER BY rank_order)
      FROM (
        SELECT o.stage,count(*)::integer cnt,COALESCE(sum(o.expected_value),0) value,
          CASE o.stage
            WHEN 'Qualified' THEN 1
            WHEN 'Meeting Scheduled' THEN 2
            WHEN 'Requirements Confirmed' THEN 3
            WHEN 'Quotation Sent' THEN 4
            WHEN 'Negotiation / Decision Pending' THEN 5
            WHEN 'Awaiting Advance Payment' THEN 6
            WHEN 'Won' THEN 7
            ELSE 99
          END rank_order
        FROM public.crm_opportunities o
        WHERE (v_target IS NULL OR o.salesperson_id=v_target)
          AND o.status<>'Lost'
        GROUP BY o.stage
      ) p
    ),'[]'::jsonb),
    'commissions',jsonb_build_object(
      'earned',COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status='Earned'),0),
      'pendingVerification',COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status IN ('Under Review','Disputed')),0),
      'approved',COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status='Approved' AND payout_batch_id IS NULL),0),
      'scheduled',COALESCE((
        SELECT sum(ce.commission_amount)
        FROM public.commission_entries ce
        JOIN public.commission_payout_batches b ON b.id=ce.payout_batch_id
        WHERE (v_target IS NULL OR ce.salesperson_id=v_target)
          AND ce.status='Approved'
          AND b.status='Approved'
      ),0),
      'paid',COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status='Paid'),0),
      'reversed',COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status='Reversed'),0),
      'payoutSchedule',v_payout_schedule,
      'upcomingPayout',(
        SELECT COALESCE(to_jsonb(x),'null'::jsonb)
        FROM (
          SELECT b.id,b.batch_number "batchNumber",b.scheduled_date "scheduledDate",b.status,
                 COALESCE(sum(ce.commission_amount),0) amount,count(ce.id)::integer "entryCount"
          FROM public.commission_payout_batches b
          JOIN public.commission_entries ce ON ce.payout_batch_id=b.id
          WHERE b.status='Approved'
            AND b.scheduled_date>=v_today
            AND (v_target IS NULL OR ce.salesperson_id=v_target)
          GROUP BY b.id,b.batch_number,b.scheduled_date,b.status,b.created_at
          ORDER BY b.scheduled_date,b.created_at
          LIMIT 1
        ) x
      ),
      'entries',COALESCE((
        SELECT jsonb_agg(x.obj ORDER BY x.created_at DESC)
        FROM (
          SELECT ce.created_at,
            jsonb_build_object(
              'id',ce.id,
              'entryNumber',COALESCE(ce.entry_number,'COM-'||left(ce.id::text,8)),
              'salespersonId',ce.salesperson_id,
              'salespersonName',COALESCE(up.full_name,'Sales Representative'),
              'customerName',COALESCE(pay.customer_name,'Client'),
              'paymentId',ce.payment_id,
              'paymentReference',pay.payment_reference,
              'quotationId',ce.quotation_id,
              'opportunityId',ce.opportunity_id,
              'productCode',ce.product_code,
              'productName',COALESCE(sp.name,ce.product_name,ce.product_code),
              'verifiedPaymentAmount',ce.verified_payment_amount,
              'currency',ce.currency,
              'baseRatePercent',ce.base_rate_percent,
              'selfGeneratedBonusPercent',ce.self_generated_bonus_percent,
              'performanceBonusPercent',ce.performance_bonus_percent,
              'effectiveRatePercent',ce.effective_rate_percent,
              'commissionAmount',ce.commission_amount,
              'canonicalStatus',ce.status,
              'displayStatus',CASE
                WHEN ce.status IN ('Under Review','Disputed') THEN 'Pending Verification'
                WHEN ce.status='Approved' AND b.status='Approved' THEN 'Scheduled'
                WHEN ce.status='Approved' THEN 'Approved'
                WHEN ce.status='Earned' THEN 'Earned'
                WHEN ce.status='Paid' THEN 'Paid'
                WHEN ce.status='Reversed' THEN 'Reversed'
                ELSE ce.status
              END,
              'payoutBatchId',ce.payout_batch_id,
              'payoutBatchNumber',b.batch_number,
              'payoutScheduledDate',b.scheduled_date,
              'payoutBatchStatus',b.status,
              'payoutReference',ce.payout_reference,
              'paidAt',ce.paid_at,
              'reversalReason',NULLIF(ce.reversal_reason,''),
              'createdAt',ce.created_at,
              'updatedAt',ce.updated_at
            ) obj
          FROM public.commission_entries ce
          LEFT JOIN public.payments pay ON pay.id=ce.payment_id
          LEFT JOIN public.user_profiles up ON up.id=ce.salesperson_id
          LEFT JOIN public.sales_products sp ON sp.code=ce.product_code
          LEFT JOIN public.commission_payout_batches b ON b.id=ce.payout_batch_id
          WHERE (v_target IS NULL OR ce.salesperson_id=v_target)
          ORDER BY ce.created_at DESC
          LIMIT 50
        ) x
      ),'[]'::jsonb)
    ),
    'quotations',jsonb_build_object(
      'draft',(SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Draft'),
      'readyForApproval',(SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Ready for Approval'),
      'sent',(SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Sent'),
      'accepted',(SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Accepted'),
      'expired',(SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Expired')
    ),
    'payments',jsonb_build_object(
      'awaitingCustomer',(SELECT count(*) FROM public.payments pay WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status IN ('Ready','Sent','Pending','Partially Paid')),
      'verificationPending',(SELECT count(*) FROM public.payments pay WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status='Verification Pending'),
      'overdue',(SELECT count(*) FROM public.payments pay WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status IN ('Ready','Sent','Pending','Partially Paid') AND pay.due_date IS NOT NULL AND pay.due_date<v_today),
      'verifiedInPeriod',(SELECT count(*) FROM public.payments pay WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status='Verified' AND pay.verified_at IS NOT NULL AND (pay.verified_at AT TIME ZONE v_tz)::date BETWEEN v_start AND v_end)
    ),
    'recentSales',COALESCE((
      SELECT jsonb_agg(obj ORDER BY verified_at DESC)
      FROM (
        SELECT pay.verified_at,
          jsonb_build_object(
            'paymentId',pay.id,'customerName',pay.customer_name,'amount',pay.amount_paid,
            'currency',pay.currency,'verifiedAt',pay.verified_at,
            'productCode',ce.product_code,'productName',COALESCE(sp.name,ce.product_name),
            'commissionAmount',ce.commission_amount,'commissionStatus',ce.status,
            'opportunityId',pay.opportunity_id,'quotationId',pay.quotation_id
          ) obj
        FROM public.payments pay
        LEFT JOIN LATERAL (
          SELECT c.product_code,c.product_name,c.commission_amount,c.status
          FROM public.commission_entries c
          WHERE c.payment_id=pay.id
          ORDER BY c.created_at
          LIMIT 1
        ) ce ON true
        LEFT JOIN public.sales_products sp ON sp.code=ce.product_code
        WHERE (v_target IS NULL OR pay.salesperson_id=v_target)
          AND pay.status='Verified'
          AND pay.verified_at IS NOT NULL
        ORDER BY pay.verified_at DESC
        LIMIT 8
      ) r
    ),'[]'::jsonb),
    'attention',COALESCE((
      SELECT jsonb_agg(item ORDER BY priority,sort_at)
      FROM (
        SELECT * FROM (
          SELECT 1 priority,a.due_at sort_at,
            jsonb_build_object('type','overdue_follow_up','priority','high','title',a.subject,'detail','Follow-up overdue','actionUrl','/admin/app/crm?tab=activities','entityId',a.id) item
          FROM public.crm_activities a
          WHERE (v_target IS NULL OR a.assigned_to=v_target)
            AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled')
            AND a.due_at<now()
          UNION ALL
          SELECT 1,COALESCE(pay.updated_at,pay.created_at),
            jsonb_build_object('type','payment_verification','priority','high','title',pay.customer_name,'detail','Customer payment is waiting for verification','actionUrl','/admin/app/sales?tab=payments','entityId',pay.id)
          FROM public.payments pay
          WHERE (v_target IS NULL OR pay.salesperson_id=v_target)
            AND pay.status='Verification Pending'
          UNION ALL
          SELECT 2,a.due_at,
            jsonb_build_object('type','follow_up_today','priority','medium','title',a.subject,'detail','Follow-up due today','actionUrl','/admin/app/crm?tab=activities','entityId',a.id)
          FROM public.crm_activities a
          WHERE (v_target IS NULL OR a.assigned_to=v_target)
            AND a.activity_type IN ('Follow-Up','Meeting Follow-Up','Quotation Follow-Up','Payment Follow-Up')
            AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled')
            AND a.due_at>=now()
            AND (a.due_at AT TIME ZONE v_tz)::date=v_today
          UNION ALL
          SELECT 2,COALESCE(q.sent_at,q.updated_at),
            jsonb_build_object('type','quotation_follow_up','priority','medium','title',q.customer_name,'detail',q.quotation_number||' is awaiting follow-up','actionUrl','/admin/app/sales?tab=quotations','entityId',q.id)
          FROM public.quotations q
          WHERE (v_target IS NULL OR q.salesperson_id=v_target)
            AND q.status='Sent'
            AND q.accepted_at IS NULL
            AND q.rejected_at IS NULL
            AND q.sent_at IS NOT NULL
            AND q.sent_at<=now()-make_interval(days=>v_quote_days)
          UNION ALL
          SELECT 2,COALESCE(l.next_follow_up_at,l.created_at),
            jsonb_build_object('type','lead_needs_action','priority','medium','title',l.company_name,'detail','Lead needs a next action','actionUrl','/admin/app/crm?tab=crm_leads','entityId',l.id)
          FROM public.crm_leads l
          WHERE (v_target IS NULL OR l.salesperson_id=v_target)
            AND l.converted_opportunity_id IS NULL
            AND l.status<>'Not Qualified'
            AND (l.next_follow_up_at IS NULL OR l.next_follow_up_at<=now())
          UNION ALL
          SELECT 2,COALESCE(o.next_follow_up_at,o.updated_at),
            jsonb_build_object('type','opportunity_next_step','priority','medium','title',o.company_name,'detail','Open opportunity has no future follow-up scheduled','actionUrl','/admin/app/crm?tab=pipeline','entityId',o.id)
          FROM public.crm_opportunities o
          WHERE (v_target IS NULL OR o.salesperson_id=v_target)
            AND o.status='Open'
            AND (o.next_follow_up_at IS NULL OR o.next_follow_up_at<now())
        ) raw
        ORDER BY priority,sort_at
        LIMIT 15
      ) a
    ),'[]'::jsonb),
    'careerProgression',v_progress,
    'coreProducts',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code',p.code,'name',p.name,'priceMode',p.price_mode,'basePrice',p.base_price,
        'currency',p.currency,'shortDescription',p.short_description,
        'scope',COALESCE(p.scope,'[]'::jsonb),
        'standardPaymentTerms',p.standard_payment_terms,
        'paymentSchedule',COALESCE(p.payment_schedule,'[]'::jsonb),
        'managerApprovalRequired',p.manager_approval_required
      ) ORDER BY array_position(v_core_codes,p.code),p.sort_order)
      FROM public.sales_products p
      WHERE p.active=true
        AND p.code=ANY(v_core_codes)
    ),'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_seller_command_center(uuid,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_command_center(uuid,text,date,date) TO authenticated;
