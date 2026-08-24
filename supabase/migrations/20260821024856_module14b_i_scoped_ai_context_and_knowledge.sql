-- Module 14B-I: scoped AI context and approved ProFox knowledge retrieval.

CREATE OR REPLACE FUNCTION public.get_ai_assistance_knowledge(p_capability text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_role text; v_cap text:=lower(trim(COALESCE(p_capability,''))); v_slugs text[]:=ARRAY[]::text[];
  v_academy text:=''; v_catalog jsonb:='[]'::jsonb; v_playbooks jsonb:='[]'::jsonb;
  v_sales_caps text[]:=ARRAY['lead_research','outreach_drafting','loom_preparation','meeting_preparation','meeting_summary','sales_coaching','next_best_action_explanation','quotation_assistant'];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT role INTO v_role FROM public.user_profiles WHERE id=v_uid AND status='active';
  IF v_role IS NULL OR v_role IN ('customer','pending') THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
  IF v_cap=ANY(v_sales_caps) AND v_role NOT IN ('admin','sales','sales_rep','sales_team') THEN RAISE EXCEPTION 'Sales AI knowledge is not available for this role.'; END IF;
  IF v_cap='management_intelligence' AND v_role<>'admin' THEN RAISE EXCEPTION 'Administrator access required.'; END IF;

  v_slugs:=CASE v_cap
    WHEN 'lead_research' THEN ARRAY['lead-research']
    WHEN 'outreach_drafting' THEN ARRAY['outreach-cadence']
    WHEN 'loom_preparation' THEN ARRAY['loom-outreach']
    WHEN 'meeting_preparation' THEN ARRAY['discovery-script','product-training']
    WHEN 'meeting_summary' THEN ARRAY['discovery-script']
    WHEN 'sales_coaching' THEN ARRAY['objections','closing']
    WHEN 'next_best_action_explanation' THEN ARRAY['crm-training']
    WHEN 'quotation_assistant' THEN ARRAY['quotation-process','product-training']
    ELSE ARRAY[]::text[] END;

  IF cardinality(v_slugs)>0 THEN
    SELECT left(COALESCE(string_agg('['||m.title||' / '||l.title||']'||chr(10)||left(COALESCE(l.content,''),1400),chr(10)||chr(10) ORDER BY m.sort_order,l.sort_order),''),12000)
    INTO v_academy
    FROM public.training_modules m
    JOIN public.training_lessons l ON l.module_id=m.id AND l.active=true
    WHERE m.active=true AND m.slug=ANY(v_slugs);
  END IF;

  IF v_cap IN ('quotation_assistant','meeting_preparation','lead_research','sales_coaching') THEN
    SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.sort_order),'[]'::jsonb) INTO v_catalog
    FROM (
      SELECT sp.sort_order,jsonb_build_object(
        'code',sp.code,'name',sp.name,'category',sp.category,'productType',sp.product_type,'priceMode',sp.price_mode,
        'basePrice',sp.base_price,'currency',sp.currency,'billingPeriod',sp.billing_period,'description',sp.short_description,
        'managerApprovalRequired',sp.manager_approval_required,'standardPaymentTerms',sp.standard_payment_terms,'paymentSchedule',sp.payment_schedule
      ) obj
      FROM public.sales_products sp WHERE sp.active=true ORDER BY sp.sort_order,sp.name LIMIT 30
    ) x;
  END IF;

  SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.sort_order),'[]'::jsonb) INTO v_playbooks
  FROM (
    SELECT p.sort_order,jsonb_build_object('name',p.name,'entityType',p.entity_type,'stage',p.stage,'description',p.description,'checklist',p.checklist) obj
    FROM public.productivity_playbooks p
    WHERE p.active=true AND (cardinality(p.roles)=0 OR v_role=ANY(p.roles) OR v_role='admin')
    ORDER BY p.sort_order,p.name LIMIT 12
  ) x;

  RETURN jsonb_build_object(
    'sourcePolicy','Approved ProFox sources only. Academy and catalog remain Admin-editable sources of truth.',
    'academyGuidance',COALESCE(v_academy,''),
    'activeCatalog',COALESCE(v_catalog,'[]'::jsonb),
    'operationalPlaybooks',COALESCE(v_playbooks,'[]'::jsonb),
    'brandGuidance',CASE WHEN v_cap IN ('outreach_drafting','loom_preparation') THEN jsonb_build_object(
      'voice','Calm, intelligent, concise, certain and human.',
      'rules',jsonb_build_array('No emojis in customer-facing email copy.','No em dash in customer-facing email copy.','No fake urgency or inflated claims.','Use one clear next action.','Use only verifiable facts.'),
      'masterLine','From site to system.'
    ) ELSE '{}'::jsonb END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_productivity_ai_context(p_entity_type text,p_entity_id uuid,p_mode text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_type text:=lower(trim(COALESCE(p_entity_type,''))); v_mode text:=lower(trim(COALESCE(p_mode,''))); v_cap text:=public.ai_capability_from_mode(p_mode);
  v_context jsonb; v_next jsonb; v_allowed boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF v_cap='' THEN RAISE EXCEPTION 'Unsupported AI mode.'; END IF;
  IF NOT public.ai_assistance_is_enabled(v_cap) THEN RAISE EXCEPTION 'This AI capability is currently disabled.'; END IF;
  IF NOT public.productivity_can_access_entity(v_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;

  v_allowed:=CASE v_mode
    WHEN 'lead_research' THEN v_type IN ('lead','opportunity')
    WHEN 'loom_brief' THEN v_type IN ('lead','opportunity')
    WHEN 'meeting_brief' THEN v_type IN ('meeting','opportunity')
    WHEN 'meeting_summary' THEN v_type='meeting'
    WHEN 'objection_coaching' THEN v_type IN ('meeting','opportunity')
    WHEN 'next_action_explanation' THEN v_type IN ('lead','opportunity','meeting','quotation','payment','client','project','project_task')
    WHEN 'follow_up_draft' THEN v_type IN ('lead','opportunity','meeting','quotation','client')
    WHEN 'quotation_draft' THEN v_type IN ('opportunity','quotation')
    WHEN 'project_handover' THEN v_type='project'
    WHEN 'task_breakdown' THEN v_type='project'
    WHEN 'lost_reason_summary' THEN v_type='opportunity'
    ELSE false END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'This AI mode is not available for this record type.'; END IF;

  v_next:=public.get_productivity_next_action(v_type,p_entity_id);

  IF v_type='meeting' THEN
    SELECT jsonb_build_object(
      'meeting',jsonb_build_object('title',m.title,'meetingType',m.meeting_type,'startAt',m.start_at,'timezone',m.timezone,'status',m.status,'outcome',m.outcome,'requirements',m.requirements_summary,'problems',m.problems_identified,'decisionMakers',m.decision_makers,'commercialNotes',m.commercial_notes,'timeline',m.timeline_notes,'nextStep',m.next_step),
      'prospect',jsonb_build_object('name',COALESCE(b.contact_name,o.contact_name,l.contact_name,m.attendee_name),'company',COALESCE(b.company_name,o.company_name,l.company_name),'website',COALESCE(b.website,o.website,l.website),'country',COALESCE(b.country,o.country,l.country),'industry',COALESCE(b.industry,o.industry,l.industry),'service',COALESCE(b.service_interest,o.service_interest,l.service_interest)),
      'qualification',COALESCE(b.qualification_answers,'{}'::jsonb),
      'recentActivities',COALESCE((SELECT jsonb_agg(z.obj ORDER BY z.created_at DESC) FROM (SELECT a.created_at,jsonb_build_object('type',a.activity_type,'subject',a.subject,'status',a.status,'channel',a.channel,'dueAt',a.due_at,'notes',left(COALESCE(a.notes,''),600)) obj FROM public.crm_activities a WHERE (a.lead_id=m.lead_id OR a.opportunity_id=m.opportunity_id) ORDER BY a.created_at DESC LIMIT 8) z),'[]'::jsonb),
      'nextBestAction',v_next)
    INTO v_context
    FROM public.sales_meetings m
    LEFT JOIN public.public_booking_submissions b ON b.meeting_id=m.id
    LEFT JOIN public.crm_opportunities o ON o.id=m.opportunity_id
    LEFT JOIN public.crm_leads l ON l.id=m.lead_id
    WHERE m.id=p_entity_id;
  ELSIF v_type='lead' THEN
    SELECT jsonb_build_object(
      'lead',jsonb_build_object('title',l.title,'company',l.company_name,'contact',l.contact_name,'website',l.website,'country',l.country,'industry',l.industry,'source',l.source,'service',l.service_interest,'estimatedValue',l.estimated_value,'currency',l.currency,'status',l.status,'lastContactAt',l.last_contact_at,'nextFollowUpAt',l.next_follow_up_at,'notes',left(COALESCE(l.notes,''),2500)),
      'recentActivities',COALESCE((SELECT jsonb_agg(z.obj ORDER BY z.created_at DESC) FROM (SELECT a.created_at,jsonb_build_object('type',a.activity_type,'subject',a.subject,'status',a.status,'channel',a.channel,'dueAt',a.due_at,'notes',left(COALESCE(a.notes,''),600)) obj FROM public.crm_activities a WHERE a.lead_id=l.id ORDER BY a.created_at DESC LIMIT 8) z),'[]'::jsonb),
      'nextBestAction',v_next)
    INTO v_context FROM public.crm_leads l WHERE l.id=p_entity_id;
  ELSIF v_type='opportunity' THEN
    SELECT jsonb_build_object(
      'opportunity',jsonb_build_object('name',o.name,'company',o.company_name,'contact',o.contact_name,'website',o.website,'country',o.country,'industry',o.industry,'service',o.service_interest,'expectedValue',o.expected_value,'currency',o.currency,'stage',o.stage,'status',o.status,'probability',o.probability,'requirements',o.requirements_summary,'nextFollowUpAt',o.next_follow_up_at,'notes',left(COALESCE(o.notes,''),2500),'lostReason',o.lost_reason),
      'recentActivities',COALESCE((SELECT jsonb_agg(z.obj ORDER BY z.created_at DESC) FROM (SELECT a.created_at,jsonb_build_object('type',a.activity_type,'subject',a.subject,'status',a.status,'channel',a.channel,'dueAt',a.due_at,'notes',left(COALESCE(a.notes,''),600)) obj FROM public.crm_activities a WHERE a.opportunity_id=o.id ORDER BY a.created_at DESC LIMIT 10) z),'[]'::jsonb),
      'recentMeetings',COALESCE((SELECT jsonb_agg(z.obj ORDER BY z.start_at DESC) FROM (SELECT m.start_at,jsonb_build_object('title',m.title,'status',m.status,'outcome',m.outcome,'requirements',left(COALESCE(m.requirements_summary,''),1000),'problems',left(COALESCE(m.problems_identified,''),1000),'nextStep',m.next_step) obj FROM public.sales_meetings m WHERE m.opportunity_id=o.id ORDER BY m.start_at DESC LIMIT 5) z),'[]'::jsonb),
      'quotations',COALESCE((SELECT jsonb_agg(z.obj ORDER BY z.created_at DESC) FROM (SELECT q.created_at,jsonb_build_object('number',q.quotation_number,'status',q.status,'currency',q.currency,'total',q.total,'validUntil',q.valid_until,'scope',left(COALESCE(q.scope_summary,''),1000)) obj FROM public.quotations q WHERE q.opportunity_id=o.id ORDER BY q.created_at DESC LIMIT 5) z),'[]'::jsonb),
      'nextBestAction',v_next)
    INTO v_context FROM public.crm_opportunities o WHERE o.id=p_entity_id;
  ELSIF v_type='quotation' THEN
    SELECT jsonb_build_object('quotation',jsonb_build_object('number',q.quotation_number,'customer',q.customer_name,'contact',q.contact_name,'country',q.country,'currency',q.currency,'status',q.status,'validUntil',q.valid_until,'paymentTerms',q.payment_terms,'scope',q.scope_summary,'exclusions',q.exclusions,'customerNotes',q.customer_notes,'subtotal',q.subtotal,'total',q.total,'sentAt',q.sent_at),'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('description',i.description,'quantity',i.quantity,'unitPrice',i.unit_price,'lineTotal',i.line_total) ORDER BY i.sort_order) FROM public.quotation_items i WHERE i.quotation_id=q.id),'[]'::jsonb),'nextBestAction',v_next)
    INTO v_context FROM public.quotations q WHERE q.id=p_entity_id;
  ELSIF v_type='project' THEN
    SELECT jsonb_build_object('project',jsonb_build_object('number',p.project_number,'name',p.project_name,'value',p.project_value,'currency',p.currency,'stage',p.stage,'priority',p.priority,'status',p.status,'startDate',p.start_date,'targetDate',p.target_date,'requirements',p.requirements_summary,'scope',p.scope_summary,'exclusions',p.exclusions,'salesHandover',p.sales_handover_notes),'openTasks',COALESCE((SELECT jsonb_agg(jsonb_build_object('title',t.title,'description',left(COALESCE(t.description,''),1000),'department',t.department,'priority',t.priority,'status',t.status,'dueDate',t.due_date) ORDER BY t.due_date NULLS LAST) FROM public.project_tasks t WHERE t.project_id=p.id AND t.completed_at IS NULL),'[]'::jsonb),'nextBestAction',v_next)
    INTO v_context FROM public.projects p WHERE p.id=p_entity_id;
  ELSIF v_type='client' THEN
    SELECT jsonb_build_object('client',jsonb_build_object('company',c.company_name,'contact',c.primary_contact_name,'website',c.website,'country',c.country,'industry',c.industry,'salesValue',c.total_sales_value,'currency',c.currency,'status',c.status,'notes',left(COALESCE(c.notes,''),1800)),'projects',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.project_name,'stage',p.stage,'status',p.status,'targetDate',p.target_date) ORDER BY p.created_at DESC) FROM public.projects p WHERE p.client_id=c.id),'[]'::jsonb),'nextBestAction',v_next)
    INTO v_context FROM public.clients c WHERE c.id=p_entity_id;
  ELSIF v_type='payment' THEN
    SELECT jsonb_build_object('payment',jsonb_build_object('status',p.status,'currency',p.currency,'amountDue',p.amount_due,'amountReceived',p.amount_received,'dueDate',p.due_date,'verifiedAt',p.verified_at),'nextBestAction',v_next)
    INTO v_context FROM public.payments p WHERE p.id=p_entity_id;
  ELSIF v_type='project_task' THEN
    SELECT jsonb_build_object('task',jsonb_build_object('title',t.title,'description',left(COALESCE(t.description,''),1600),'department',t.department,'priority',t.priority,'status',t.status,'dueDate',t.due_date),'nextBestAction',v_next)
    INTO v_context FROM public.project_tasks t WHERE t.id=p_entity_id;
  END IF;

  RETURN jsonb_build_object('mode',v_mode,'capability',v_cap,'entityType',v_type,'entityId',p_entity_id,'context',COALESCE(v_context,'{}'::jsonb),'dataMinimization','Direct email addresses and phone numbers are excluded from AI context.','guardrail','Advisory/draft only. Do not claim actions were executed. Do not invent facts absent from context.');
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_assistance_knowledge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_assistance_knowledge(text) TO authenticated, service_role;
