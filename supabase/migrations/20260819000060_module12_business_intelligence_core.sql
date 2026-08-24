-- Module 12 — ProFox Business Intelligence & Founder Control Center.
-- Deterministic intelligence over existing source records. No duplicate CRM/project/finance data is stored.

INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES(
  'business_intelligence_settings',
  '{
    "active": true,
    "primaryCurrency": "USD",
    "defaultPeriodDays": 30,
    "thresholds": {
      "leadResponseHours": 24,
      "staleLeadDays": 3,
      "staleOpportunityDays": 5,
      "staleQuotationDays": 3,
      "overduePaymentGraceDays": 0,
      "projectRiskDays": 7,
      "applicantStageDays": 3,
      "maxOpenTasksPerPerson": 8
    },
    "stageForecastWeights": {
      "Qualified": 20,
      "Meeting Scheduled": 35,
      "Requirements Confirmed": 50,
      "Quotation Sent": 65,
      "Negotiation / Decision Pending": 75,
      "Awaiting Advance Payment": 90,
      "Won": 100
    }
  }'::jsonb,
  'Founder dashboard KPI, risk and forecasting rules. Values are operational thresholds, not accounting rules.',
  now()
)
ON CONFLICT(config_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.business_intelligence_default_settings()
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
SELECT '{
  "active": true,
  "primaryCurrency": "USD",
  "defaultPeriodDays": 30,
  "thresholds": {
    "leadResponseHours": 24,
    "staleLeadDays": 3,
    "staleOpportunityDays": 5,
    "staleQuotationDays": 3,
    "overduePaymentGraceDays": 0,
    "projectRiskDays": 7,
    "applicantStageDays": 3,
    "maxOpenTasksPerPerson": 8
  },
  "stageForecastWeights": {
    "Qualified": 20,
    "Meeting Scheduled": 35,
    "Requirements Confirmed": 50,
    "Quotation Sent": 65,
    "Negotiation / Decision Pending": 75,
    "Awaiting Advance Payment": 90,
    "Won": 100
  }
}'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.business_intelligence_settings()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
SELECT public.business_intelligence_default_settings()
  || COALESCE((SELECT config_value - 'thresholds' - 'stageForecastWeights' FROM public.system_configuration WHERE config_key='business_intelligence_settings'),'{}'::jsonb)
  || jsonb_build_object(
    'thresholds',
      (public.business_intelligence_default_settings()->'thresholds') || COALESCE((SELECT config_value->'thresholds' FROM public.system_configuration WHERE config_key='business_intelligence_settings'),'{}'::jsonb),
    'stageForecastWeights',
      (public.business_intelligence_default_settings()->'stageForecastWeights') || COALESCE((SELECT config_value->'stageForecastWeights' FROM public.system_configuration WHERE config_key='business_intelligence_settings'),'{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_get_business_intelligence_settings()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  RETURN public.business_intelligence_settings();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_business_intelligence_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_defaults jsonb := public.business_intelligence_default_settings();
  v_existing jsonb := public.business_intelligence_settings();
  v_thresholds jsonb;
  v_weights jsonb;
  v_result jsonb;
  v_currency text;
  v_value integer;
  v_key text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF p_settings IS NULL OR jsonb_typeof(p_settings)<>'object' THEN RAISE EXCEPTION 'Settings must be a JSON object.'; END IF;

  v_currency := upper(trim(COALESCE(p_settings->>'primaryCurrency',v_existing->>'primaryCurrency','USD')));
  IF v_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Primary currency must be a 3-letter code.'; END IF;

  v_thresholds := (v_defaults->'thresholds') || COALESCE(v_existing->'thresholds','{}'::jsonb) || COALESCE(p_settings->'thresholds','{}'::jsonb);
  v_weights := (v_defaults->'stageForecastWeights') || COALESCE(v_existing->'stageForecastWeights','{}'::jsonb) || COALESCE(p_settings->'stageForecastWeights','{}'::jsonb);

  FOR v_key,v_value IN SELECT key,(value #>> '{}')::integer FROM jsonb_each(v_thresholds) LOOP
    IF v_key='leadResponseHours' AND (v_value<1 OR v_value>168) THEN RAISE EXCEPTION 'Lead response hours must be between 1 and 168.'; END IF;
    IF v_key IN ('staleLeadDays','staleQuotationDays','applicantStageDays') AND (v_value<1 OR v_value>30) THEN RAISE EXCEPTION '% must be between 1 and 30.',v_key; END IF;
    IF v_key IN ('staleOpportunityDays','projectRiskDays') AND (v_value<1 OR v_value>60) THEN RAISE EXCEPTION '% must be between 1 and 60.',v_key; END IF;
    IF v_key='overduePaymentGraceDays' AND (v_value<0 OR v_value>30) THEN RAISE EXCEPTION 'Payment grace days must be between 0 and 30.'; END IF;
    IF v_key='maxOpenTasksPerPerson' AND (v_value<1 OR v_value>50) THEN RAISE EXCEPTION 'Open-task capacity must be between 1 and 50.'; END IF;
  END LOOP;

  FOR v_key,v_value IN SELECT key,(value #>> '{}')::integer FROM jsonb_each(v_weights) LOOP
    IF v_value<0 OR v_value>100 THEN RAISE EXCEPTION 'Forecast weights must be between 0 and 100.'; END IF;
  END LOOP;

  v_value := COALESCE((p_settings->>'defaultPeriodDays')::integer,(v_existing->>'defaultPeriodDays')::integer,30);
  IF v_value<7 OR v_value>90 THEN RAISE EXCEPTION 'Default period must be between 7 and 90 days.'; END IF;

  v_result := jsonb_build_object(
    'active',COALESCE((p_settings->>'active')::boolean,(v_existing->>'active')::boolean,true),
    'primaryCurrency',v_currency,
    'defaultPeriodDays',v_value,
    'thresholds',v_thresholds,
    'stageForecastWeights',v_weights
  );

  INSERT INTO public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  VALUES('business_intelligence_settings',v_result,'Founder dashboard KPI, risk and forecasting rules. Values are operational thresholds, not accounting rules.',auth.uid(),now())
  ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value,description=EXCLUDED.description,updated_by=auth.uid(),updated_at=now();
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_intelligence_exceptions(p_scope text DEFAULT 'mine')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_role text; v_status text; v_admin boolean; v_team boolean;
  v_cfg jsonb:=public.business_intelligence_settings();
  v_t jsonb;
  v_response_hours integer; v_stale_lead integer; v_stale_opp integer; v_stale_quote integer;
  v_payment_grace integer; v_project_risk integer; v_applicant_days integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT role,status INTO v_role,v_status FROM public.user_profiles WHERE id=v_uid;
  IF v_status<>'active' OR v_role IN ('customer','pending') THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
  IF COALESCE((v_cfg->>'active')::boolean,true) IS FALSE THEN RETURN '[]'::jsonb; END IF;

  v_admin:=public.is_admin();
  v_team:=v_admin AND lower(COALESCE(p_scope,'mine'))='team';
  v_t:=v_cfg->'thresholds';
  v_response_hours:=COALESCE((v_t->>'leadResponseHours')::integer,24);
  v_stale_lead:=COALESCE((v_t->>'staleLeadDays')::integer,3);
  v_stale_opp:=COALESCE((v_t->>'staleOpportunityDays')::integer,5);
  v_stale_quote:=COALESCE((v_t->>'staleQuotationDays')::integer,3);
  v_payment_grace:=COALESCE((v_t->>'overduePaymentGraceDays')::integer,0);
  v_project_risk:=COALESCE((v_t->>'projectRiskDays')::integer,7);
  v_applicant_days:=COALESCE((v_t->>'applicantStageDays')::integer,3);

  WITH raw AS (
    SELECT
      'lead-response:'||l.id::text exception_key,'High' severity,'Sales' area,'lead_response' exception_type,
      'New lead waiting for first response' title,
      COALESCE(NULLIF(l.company_name,''),l.title)||' has been waiting more than '||v_response_hours||' hours.' detail,
      'lead' entity_type,l.id entity_id,l.salesperson_id owner_user_id,
      94 score,'Overdue' bucket,'Respond to lead' action_label,'/admin/focus/lead/'||l.id action_url,
      jsonb_build_object('source',l.source,'country',l.country,'service',l.service_interest,'createdAt',l.created_at) metadata
    FROM public.crm_leads l
    WHERE l.status='New' AND l.converted_opportunity_id IS NULL AND l.created_at<now()-make_interval(hours=>v_response_hours)
      AND (v_team OR (NOT v_admin AND l.salesperson_id=v_uid) OR (v_admin AND l.salesperson_id IS NULL))

    UNION ALL
    SELECT
      'lead-stale:'||l.id,'Medium','Sales','stale_lead','Lead has no current next action',
      COALESCE(NULLIF(l.company_name,''),l.title)||' has gone quiet for more than '||v_stale_lead||' days.',
      'lead',l.id,l.salesperson_id,80,'Do Now','Review lead','/admin/focus/lead/'||l.id,
      jsonb_build_object('status',l.status,'lastContactAt',l.last_contact_at,'nextFollowUpAt',l.next_follow_up_at)
    FROM public.crm_leads l
    WHERE l.status IN ('Researching','Contacted','Follow-Up','Interested','Qualified') AND l.converted_opportunity_id IS NULL
      AND (l.next_follow_up_at<now() OR (l.next_follow_up_at IS NULL AND COALESCE(l.last_contact_at,l.updated_at,l.created_at)<now()-make_interval(days=>v_stale_lead)))
      AND (v_team OR (NOT v_admin AND l.salesperson_id=v_uid) OR (v_admin AND l.salesperson_id IS NULL))

    UNION ALL
    SELECT
      'opportunity-stale:'||o.id,
      CASE WHEN o.next_follow_up_at<now() THEN 'High' ELSE 'Medium' END,'Sales','stale_opportunity','Open opportunity needs a decision or follow-up',
      COALESCE(NULLIF(o.company_name,''),o.name)||' has not moved recently.',
      'opportunity',o.id,o.salesperson_id,CASE WHEN o.next_follow_up_at<now() THEN 91 ELSE 81 END,
      CASE WHEN o.next_follow_up_at<now() THEN 'Overdue' ELSE 'Do Now' END,'Review opportunity','/admin/focus/opportunity/'||o.id,
      jsonb_build_object('stage',o.stage,'expectedValue',o.expected_value,'currency',o.currency,'nextFollowUpAt',o.next_follow_up_at)
    FROM public.crm_opportunities o
    WHERE o.status='Open' AND (o.next_follow_up_at<now() OR (o.next_follow_up_at IS NULL AND o.updated_at<now()-make_interval(days=>v_stale_opp)))
      AND (v_team OR (NOT v_admin AND o.salesperson_id=v_uid) OR (v_admin AND o.salesperson_id IS NULL))

    UNION ALL
    SELECT
      'quotation-stale:'||q.id,'High','Sales','stale_quotation','Sent quotation needs follow-up',
      q.quotation_number||' for '||COALESCE(NULLIF(q.customer_name,''),'customer')||' has been sent for more than '||v_stale_quote||' days.',
      'quotation',q.id,q.salesperson_id,90,'Overdue','Follow up quotation','/admin/focus/quotation/'||q.id,
      jsonb_build_object('quotationNumber',q.quotation_number,'total',q.total,'currency',q.currency,'sentAt',q.sent_at)
    FROM public.quotations q
    WHERE q.status='Sent' AND q.accepted_at IS NULL AND q.rejected_at IS NULL AND q.sent_at<now()-make_interval(days=>v_stale_quote)
      AND (v_team OR (NOT v_admin AND q.salesperson_id=v_uid) OR (v_admin AND q.salesperson_id IS NULL))

    UNION ALL
    SELECT
      'payment-overdue:'||p.id,'Critical','Finance','overdue_payment','Payment is overdue',
      COALESCE(NULLIF(p.customer_name,''),p.payment_reference)||' has an overdue balance of '||p.currency||' '||GREATEST(COALESCE(p.amount_due,0)-COALESCE(p.amount_paid,0),0)::text||'.',
      'payment',p.id,p.salesperson_id,99,'Overdue','Open payment','/admin/focus/payment/'||p.id,
      jsonb_build_object('amountDue',p.amount_due,'amountPaid',p.amount_paid,'currency',p.currency,'dueDate',p.due_date)
    FROM public.payments p
    WHERE p.verified_at IS NULL AND lower(COALESCE(p.status,'')) NOT IN ('verified','cancelled','failed')
      AND p.due_date IS NOT NULL AND p.due_date<CURRENT_DATE-v_payment_grace
      AND (v_team OR (NOT v_admin AND p.salesperson_id=v_uid) OR (v_admin AND p.salesperson_id IS NULL))

    UNION ALL
    SELECT
      'project-risk:'||p.id,
      CASE WHEN COALESCE(x.overdue_tasks,0)>0 OR p.target_date<CURRENT_DATE THEN 'High' ELSE 'Medium' END,
      'Delivery','project_risk','Project needs delivery attention',
      p.project_name||CASE WHEN COALESCE(x.overdue_tasks,0)>0 THEN ' has '||x.overdue_tasks||' overdue task(s).' WHEN p.target_date<CURRENT_DATE THEN ' is past its target date.' ELSE ' is approaching its target date with unfinished work.' END,
      'project',p.id,p.project_manager_id,
      CASE WHEN COALESCE(x.overdue_tasks,0)>0 OR p.target_date<CURRENT_DATE THEN 92 ELSE 79 END,
      CASE WHEN COALESCE(x.overdue_tasks,0)>0 OR p.target_date<CURRENT_DATE THEN 'Overdue' ELSE 'Do Now' END,
      'Review project','/admin/focus/project/'||p.id,
      jsonb_build_object('stage',p.stage,'targetDate',p.target_date,'overdueTasks',COALESCE(x.overdue_tasks,0),'openTasks',COALESCE(x.open_tasks,0))
    FROM public.projects p
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER(WHERE t.due_date<CURRENT_DATE) overdue_tasks,count(*) open_tasks
      FROM public.project_tasks t
      WHERE t.project_id=p.id AND t.completed_at IS NULL AND lower(COALESCE(t.status,'')) NOT IN ('completed','done','cancelled')
    ) x ON true
    WHERE lower(COALESCE(p.status,'')) NOT IN ('completed','cancelled') AND p.completed_at IS NULL
      AND (COALESCE(x.overdue_tasks,0)>0 OR p.target_date<CURRENT_DATE OR (p.target_date<=CURRENT_DATE+v_project_risk AND COALESCE(x.open_tasks,0)>0))
      AND (v_team OR (NOT v_admin AND p.project_manager_id=v_uid) OR (v_admin AND p.project_manager_id IS NULL))

    UNION ALL
    SELECT
      'applicant-stuck:'||a.id,'Medium','Recruitment','stuck_applicant','Candidate stage has stalled',
      a.full_name||' has remained in '||a.stage||' for more than '||v_applicant_days||' days.',
      'applicant',a.id,NULL::uuid,78,'Do Now','Review candidate','/admin/focus/applicant/'||a.id,
      jsonb_build_object('stage',a.stage,'country',a.country,'position',a.position,'updatedAt',a.updated_at)
    FROM public.applicants a
    WHERE v_admin AND a.stage<>'Activated' AND a.updated_at<now()-make_interval(days=>v_applicant_days)
  ), visible AS (
    SELECT * FROM raw
    WHERE v_team OR NOT v_admin OR owner_user_id IS NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'exceptionKey',exception_key,'severity',severity,'area',area,'type',exception_type,
    'title',title,'detail',detail,'entityType',entity_type,'entityId',entity_id,'ownerUserId',owner_user_id,
    'priorityScore',score,'bucket',bucket,'actionLabel',action_label,'actionUrl',action_url,'metadata',metadata
  ) ORDER BY score DESC,title),'[]'::jsonb) INTO v_result FROM visible;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_intelligence_dashboard(p_period_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_cfg jsonb:=public.business_intelligence_settings();
  v_t jsonb; v_weights jsonb; v_currency text;
  v_days integer:=LEAST(GREATEST(COALESCE(p_period_days,30),7),90);
  v_start timestamptz; v_prev_start timestamptz;
  v_exceptions jsonb;
  v_critical integer:=0; v_high integer:=0; v_medium integer:=0; v_health integer:=100; v_health_status text;
  v_current_revenue numeric:=0; v_previous_revenue numeric:=0; v_outstanding numeric:=0; v_weighted_pipeline numeric:=0;
  v_max_tasks integer;
  v_pipeline jsonb; v_stages jsonb; v_sources jsonb; v_finance jsonb; v_workload jsonb; v_recruit_stages jsonb;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  v_start:=now()-make_interval(days=>v_days); v_prev_start:=now()-make_interval(days=>v_days*2);
  v_t:=v_cfg->'thresholds'; v_weights:=v_cfg->'stageForecastWeights';
  v_currency:=upper(COALESCE(NULLIF(v_cfg->>'primaryCurrency',''),'USD'));
  v_max_tasks:=COALESCE((v_t->>'maxOpenTasksPerPerson')::integer,8);
  v_exceptions:=public.get_business_intelligence_exceptions('team');

  SELECT count(*) FILTER(WHERE value->>'severity'='Critical'),count(*) FILTER(WHERE value->>'severity'='High'),count(*) FILTER(WHERE value->>'severity'='Medium')
  INTO v_critical,v_high,v_medium FROM jsonb_array_elements(v_exceptions);
  v_health:=GREATEST(0,100-(v_critical*12)-(v_high*6)-(v_medium*3));
  v_health_status:=CASE WHEN v_health>=85 THEN 'Healthy' WHEN v_health>=70 THEN 'Watch' ELSE 'At Risk' END;

  SELECT COALESCE(sum(amount_paid),0) INTO v_current_revenue FROM public.payments WHERE verified_at>=v_start AND currency=v_currency AND verified_at IS NOT NULL;
  SELECT COALESCE(sum(amount_paid),0) INTO v_previous_revenue FROM public.payments WHERE verified_at>=v_prev_start AND verified_at<v_start AND currency=v_currency AND verified_at IS NOT NULL;
  SELECT COALESCE(sum(GREATEST(COALESCE(amount_due,0)-COALESCE(amount_paid,0),0)),0) INTO v_outstanding FROM public.payments WHERE verified_at IS NULL AND lower(COALESCE(status,'')) NOT IN ('cancelled','failed') AND currency=v_currency;
  SELECT COALESCE(sum(COALESCE(expected_value,0)*COALESCE(probability,(v_weights->>stage)::integer,0)/100.0),0) INTO v_weighted_pipeline FROM public.crm_opportunities WHERE status='Open' AND currency=v_currency;

  WITH currency_rows AS (
    SELECT currency FROM public.crm_opportunities WHERE currency<>'' UNION SELECT currency FROM public.quotations WHERE currency<>'' UNION SELECT currency FROM public.payments WHERE currency<>'' UNION SELECT currency FROM public.projects WHERE currency<>''
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'currency',c.currency,
    'openPipeline',COALESCE((SELECT sum(o.expected_value) FROM public.crm_opportunities o WHERE o.status='Open' AND o.currency=c.currency),0),
    'weightedPipeline',COALESCE((SELECT sum(COALESCE(o.expected_value,0)*COALESCE(o.probability,(v_weights->>o.stage)::integer,0)/100.0) FROM public.crm_opportunities o WHERE o.status='Open' AND o.currency=c.currency),0)
  ) ORDER BY CASE WHEN c.currency=v_currency THEN 0 ELSE 1 END,c.currency),'[]'::jsonb) INTO v_pipeline FROM currency_rows c;

  SELECT COALESCE(jsonb_object_agg(stage,cnt),'{}'::jsonb) INTO v_stages FROM (SELECT stage,count(*) cnt FROM public.crm_opportunities WHERE status='Open' GROUP BY stage ORDER BY stage) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('source',source,'leads',leads,'opportunities',opportunities,'won',won) ORDER BY leads DESC,source),'[]'::jsonb) INTO v_sources
  FROM (
    SELECT COALESCE(NULLIF(l.source,''),'Unknown') source,count(*) leads,
      count(*) FILTER(WHERE l.converted_opportunity_id IS NOT NULL) opportunities,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.crm_opportunities o WHERE o.id=l.converted_opportunity_id AND o.status='Won')) won
    FROM public.crm_leads l WHERE l.created_at>=v_start GROUP BY COALESCE(NULLIF(l.source,''),'Unknown')
  ) s;

  WITH currency_rows AS (
    SELECT currency FROM public.payments WHERE currency<>'' UNION SELECT currency FROM public.commission_entries WHERE currency<>'' UNION SELECT currency FROM public.projects WHERE currency<>''
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'currency',c.currency,
    'verifiedRevenue',COALESCE((SELECT sum(p.amount_paid) FROM public.payments p WHERE p.currency=c.currency AND p.verified_at>=v_start),0),
    'outstanding',COALESCE((SELECT sum(GREATEST(COALESCE(p.amount_due,0)-COALESCE(p.amount_paid,0),0)) FROM public.payments p WHERE p.currency=c.currency AND p.verified_at IS NULL AND lower(COALESCE(p.status,'')) NOT IN ('cancelled','failed')),0),
    'overdue',COALESCE((SELECT sum(GREATEST(COALESCE(p.amount_due,0)-COALESCE(p.amount_paid,0),0)) FROM public.payments p WHERE p.currency=c.currency AND p.verified_at IS NULL AND p.due_date<CURRENT_DATE AND lower(COALESCE(p.status,'')) NOT IN ('cancelled','failed')),0),
    'commissionsOutstanding',COALESCE((SELECT sum(e.commission_amount) FROM public.commission_entries e WHERE e.currency=c.currency AND e.status IN ('Earned','Under Review','Approved')),0),
    'activeProjectValue',COALESCE((SELECT sum(pr.project_value) FROM public.projects pr WHERE pr.currency=c.currency AND pr.completed_at IS NULL AND lower(COALESCE(pr.status,'')) NOT IN ('completed','cancelled')),0)
  ) ORDER BY CASE WHEN c.currency=v_currency THEN 0 ELSE 1 END,c.currency),'[]'::jsonb) INTO v_finance FROM currency_rows c;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'userId',u.id,'name',COALESCE(NULLIF(u.full_name,''),u.email),'role',u.role,'department',u.department,
    'openTasks',(SELECT count(*) FROM public.project_tasks t WHERE t.assigned_to=u.id AND t.completed_at IS NULL AND lower(COALESCE(t.status,'')) NOT IN ('completed','done','cancelled')),
    'overdueActivities',(SELECT count(*) FROM public.crm_activities a WHERE a.assigned_to=u.id AND a.due_at<now() AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled')),
    'meetingsNext7Days',(SELECT count(*) FROM public.sales_meetings m WHERE m.salesperson_id=u.id AND m.status IN ('Scheduled','Rescheduled') AND m.start_at>=now() AND m.start_at<now()+interval '7 days'),
    'atCapacity',((SELECT count(*) FROM public.project_tasks t WHERE t.assigned_to=u.id AND t.completed_at IS NULL AND lower(COALESCE(t.status,'')) NOT IN ('completed','done','cancelled'))>=v_max_tasks)
  ) ORDER BY (SELECT count(*) FROM public.project_tasks t WHERE t.assigned_to=u.id AND t.completed_at IS NULL AND lower(COALESCE(t.status,'')) NOT IN ('completed','done','cancelled')) DESC,COALESCE(NULLIF(u.full_name,''),u.email)),'[]'::jsonb)
  INTO v_workload FROM public.user_profiles u WHERE u.status='active' AND u.role NOT IN ('customer','pending');

  SELECT COALESCE(jsonb_object_agg(stage,cnt),'{}'::jsonb) INTO v_recruit_stages FROM (SELECT stage,count(*) cnt FROM public.applicants GROUP BY stage ORDER BY stage) s;

  v_result:=jsonb_build_object(
    'periodDays',v_days,'primaryCurrency',v_currency,'generatedAt',now(),
    'health',jsonb_build_object('score',v_health,'status',v_health_status,'critical',v_critical,'high',v_high,'medium',v_medium,'openExceptions',jsonb_array_length(v_exceptions)),
    'overview',jsonb_build_object(
      'activeLeads',(SELECT count(*) FROM public.crm_leads WHERE converted_opportunity_id IS NULL AND status<>'Not Qualified'),
      'openOpportunities',(SELECT count(*) FROM public.crm_opportunities WHERE status='Open'),
      'activeProjects',(SELECT count(*) FROM public.projects WHERE completed_at IS NULL AND lower(COALESCE(status,'')) NOT IN ('completed','cancelled')),
      'activeStaff',(SELECT count(*) FROM public.user_profiles WHERE status='active' AND role NOT IN ('customer','pending')),
      'clients',(SELECT count(*) FROM public.clients WHERE lower(COALESCE(status,'')) NOT IN ('inactive','archived'))
    ),
    'sales',jsonb_build_object(
      'leadsCreated',(SELECT count(*) FROM public.crm_leads WHERE created_at>=v_start),
      'opportunitiesCreated',(SELECT count(*) FROM public.crm_opportunities WHERE created_at>=v_start),
      'meetingsCompleted',(SELECT count(*) FROM public.sales_meetings WHERE completed_at>=v_start AND status='Completed'),
      'quotationsSent',(SELECT count(*) FROM public.quotations WHERE sent_at>=v_start),
      'wonDeals',(SELECT count(*) FROM public.crm_opportunities WHERE won_at>=v_start AND status='Won'),
      'lostDeals',(SELECT count(*) FROM public.crm_opportunities WHERE lost_at>=v_start AND status='Lost'),
      'winRate',COALESCE((SELECT round(100.0*count(*) FILTER(WHERE status='Won')/NULLIF(count(*) FILTER(WHERE status IN ('Won','Lost')),0),1) FROM public.crm_opportunities WHERE COALESCE(won_at,lost_at)>=v_start),0),
      'leadToOpportunityRate',COALESCE((SELECT round(100.0*count(*) FILTER(WHERE converted_opportunity_id IS NOT NULL)/NULLIF(count(*),0),1) FROM public.crm_leads WHERE created_at>=v_start),0),
      'averageSalesCycleDays',COALESCE((SELECT round(avg(extract(epoch FROM (won_at-created_at))/86400.0)::numeric,1) FROM public.crm_opportunities WHERE status='Won' AND won_at>=v_start),0),
      'weightedPipelinePrimary',v_weighted_pipeline,'pipelineByCurrency',v_pipeline,'stageCounts',v_stages,'sourcePerformance',v_sources
    ),
    'delivery',jsonb_build_object(
      'activeProjects',(SELECT count(*) FROM public.projects WHERE completed_at IS NULL AND lower(COALESCE(status,'')) NOT IN ('completed','cancelled')),
      'completedProjects',(SELECT count(*) FROM public.projects WHERE completed_at>=v_start),
      'atRiskProjects',(SELECT count(*) FROM jsonb_array_elements(v_exceptions) e WHERE e->>'type'='project_risk'),
      'overdueTasks',(SELECT count(*) FROM public.project_tasks WHERE completed_at IS NULL AND due_date<CURRENT_DATE AND lower(COALESCE(status,'')) NOT IN ('completed','done','cancelled')),
      'tasksDueNext7Days',(SELECT count(*) FROM public.project_tasks WHERE completed_at IS NULL AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7 AND lower(COALESCE(status,'')) NOT IN ('completed','done','cancelled')),
      'unassignedProjects',(SELECT count(*) FROM public.projects WHERE project_manager_id IS NULL AND completed_at IS NULL AND lower(COALESCE(status,'')) NOT IN ('completed','cancelled')),
      'workload',v_workload
    ),
    'finance',jsonb_build_object(
      'primary',jsonb_build_object('currency',v_currency,'verifiedRevenue',v_current_revenue,'previousPeriodRevenue',v_previous_revenue,'revenueChangePercent',CASE WHEN v_previous_revenue=0 THEN NULL ELSE round(((v_current_revenue-v_previous_revenue)/v_previous_revenue*100)::numeric,1) END,'outstanding',v_outstanding),
      'byCurrency',v_finance
    ),
    'recruitment',jsonb_build_object(
      'activeCandidates',(SELECT count(*) FROM public.applicants WHERE stage<>'Activated'),
      'newCandidates',(SELECT count(*) FROM public.applicants WHERE created_at>=v_start),
      'activated',(SELECT count(*) FROM public.applicants WHERE stage='Activated' AND updated_at>=v_start),
      'stuckCandidates',(SELECT count(*) FROM jsonb_array_elements(v_exceptions) e WHERE e->>'type'='stuck_applicant'),
      'stageCounts',v_recruit_stages
    ),
    'team',jsonb_build_object(
      'activeStaff',(SELECT count(*) FROM public.user_profiles WHERE status='active' AND role NOT IN ('customer','pending')),
      'atCapacity',(SELECT count(*) FROM jsonb_array_elements(v_workload) w WHERE COALESCE((w->>'atCapacity')::boolean,false)),
      'workload',v_workload,
      'dayClosesLast7Days',(SELECT count(*) FROM public.productivity_daily_reviews WHERE review_date>=CURRENT_DATE-6)
    ),
    'exceptions',v_exceptions,
    'settingsSummary',jsonb_build_object('thresholds',v_t,'stageForecastWeights',v_weights)
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_intelligence_brief(p_period_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_dashboard jsonb; v_ex jsonb; v_watch jsonb; v_decisions jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  v_dashboard:=public.get_business_intelligence_dashboard(LEAST(GREATEST(COALESCE(p_period_days,7),7),90));
  v_ex:=v_dashboard->'exceptions';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('title',e->>'title','detail',e->>'detail','area',e->>'area','severity',e->>'severity','actionUrl',e->>'actionUrl') ORDER BY (e->>'priorityScore')::integer DESC),'[]'::jsonb)
  INTO v_watch FROM (SELECT value e FROM jsonb_array_elements(v_ex) LIMIT 6) x;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('title',e->>'title','actionLabel',e->>'actionLabel','actionUrl',e->>'actionUrl','severity',e->>'severity') ORDER BY (e->>'priorityScore')::integer DESC),'[]'::jsonb)
  INTO v_decisions FROM (SELECT value e FROM jsonb_array_elements(v_ex) WHERE value->>'severity' IN ('Critical','High') LIMIT 5) x;
  RETURN jsonb_build_object(
    'periodDays',v_dashboard->'periodDays','generatedAt',now(),
    'headline','Operational health is '||(v_dashboard#>>'{health,status}')||' at '||(v_dashboard#>>'{health,score}')||'/100.',
    'pulse',jsonb_build_array(
      jsonb_build_object('label','Verified revenue','value',(v_dashboard#>>'{finance,primary,currency}')||' '||(v_dashboard#>>'{finance,primary,verifiedRevenue}')),
      jsonb_build_object('label','Weighted pipeline','value',(v_dashboard->>'primaryCurrency')||' '||(v_dashboard#>>'{sales,weightedPipelinePrimary}')),
      jsonb_build_object('label','Won deals','value',v_dashboard#>>'{sales,wonDeals}'),
      jsonb_build_object('label','Active projects','value',v_dashboard#>>'{delivery,activeProjects}'),
      jsonb_build_object('label','Open exceptions','value',v_dashboard#>>'{health,openExceptions}')
    ),
    'watch',v_watch,'decisions',v_decisions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_intelligence_default_settings() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.business_intelligence_settings() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_get_business_intelligence_settings() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_business_intelligence_settings(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_business_intelligence_exceptions(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_business_intelligence_dashboard(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_business_intelligence_brief(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_business_intelligence_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_business_intelligence_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_intelligence_exceptions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_intelligence_dashboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_intelligence_brief(integer) TO authenticated;
