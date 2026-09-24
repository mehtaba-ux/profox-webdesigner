-- Module 11 final alignment: keep the productivity layer role-correct and driven by one configuration source.

CREATE OR REPLACE FUNCTION public.get_productivity_next_action(p_entity_type text,p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_type text:=lower(trim(COALESCE(p_entity_type,'')));
  v_row record;
  v_role text;
  v_label text; v_key text; v_url text; v_reason text;
  v_quick boolean:=false; v_input boolean:=false; v_confirm boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.productivity_can_access_entity(v_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;
  SELECT role INTO v_role FROM public.user_profiles WHERE id=auth.uid() AND status='active';

  CASE v_type
    WHEN 'lead' THEN
      SELECT * INTO v_row FROM public.crm_leads WHERE id=p_entity_id;
      IF v_row.converted_opportunity_id IS NOT NULL THEN v_label:='Open opportunity';v_key:='open';v_url:='/admin/app/crm?tab=pipeline';v_reason:='This lead is already converted.';
      ELSIF v_row.status='New' THEN v_label:='Research this lead';v_key:='open';v_url:='/admin/app/crm?tab=crm_leads';v_reason:='New leads should be researched before outreach.';
      ELSIF v_row.status='Researching' THEN v_label:='Record first contact';v_key:='mark_lead_contacted';v_url:='/admin/app/crm?tab=crm_leads';v_reason:='Research is ready to turn into outreach.';v_quick:=true;v_confirm:=true;
      ELSIF v_row.status IN ('Contacted','Follow-Up','Interested') THEN v_label:='Schedule next follow-up';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='Keep a dated next action so this lead cannot go stale.';v_input:=true;
      ELSIF v_row.status='Qualified' THEN v_label:='Convert to opportunity';v_key:='convert_lead';v_url:='/admin/app/crm?tab=pipeline';v_reason:='Qualified leads should enter the deal pipeline.';v_input:=true;v_confirm:=true;
      ELSE v_label:='Review lead';v_key:='open';v_url:='/admin/app/crm?tab=crm_leads';v_reason:='Review the record and decide the next useful action.'; END IF;

    WHEN 'opportunity' THEN
      SELECT * INTO v_row FROM public.crm_opportunities WHERE id=p_entity_id;
      IF v_row.status='Won' THEN
        IF EXISTS(SELECT 1 FROM public.projects p WHERE p.source_opportunity_id=p_entity_id) THEN
          v_label:='Open delivery project';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='The verified sale already has a delivery project.';
        ELSIF v_role IN ('admin','project_manager') THEN
          v_label:='Create delivery project';v_key:='create_project_from_sale';v_url:='/admin/app/projects?tab=projects';v_reason:='The verified sale is ready for a controlled Sales-to-Delivery handoff.';v_quick:=true;v_confirm:=true;
        ELSE
          v_label:='Delivery handoff queued';v_key:='open';v_url:='/admin/app/crm?tab=pipeline';v_reason:='Sales is complete. ProFox has handed project launch to Admin/Project Management; no delivery data needs to be re-entered.';
        END IF;
      ELSIF v_row.status='Lost' THEN v_label:='Review loss notes';v_key:='open';v_url:='/admin/app/crm?tab=pipeline';v_reason:='Use the loss reason to improve future qualification.';
      ELSIF v_row.stage='Qualified' THEN v_label:='Schedule discovery meeting';v_key:='open';v_url:='/admin/meetings?opportunityId='||p_entity_id;v_reason:='The deal is qualified and ready for discovery.';
      ELSIF v_row.stage='Meeting Scheduled' THEN v_label:='Prepare for meeting';v_key:='open';v_url:=CASE WHEN v_row.meeting_at IS NULL THEN '/admin/meetings?opportunityId='||p_entity_id ELSE '/admin/app/crm?tab=pipeline' END;v_reason:='Preparation should happen before the call, not during it.';
      ELSIF v_row.stage='Requirements Confirmed' THEN v_label:='Create quotation';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='Requirements are confirmed; move to a commercial proposal.';
      ELSIF v_row.stage='Quotation Sent' THEN v_label:='Schedule quotation follow-up';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='Every sent quotation needs a dated follow-up.';v_input:=true;
      ELSIF v_row.stage='Negotiation / Decision Pending' THEN v_label:='Follow up decision';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='Keep the decision process moving with a clear next date.';v_input:=true;
      ELSIF v_row.stage='Awaiting Advance Payment' THEN v_label:='Follow up payment';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='The deal is commercially agreed and waiting for payment.';
      ELSE v_label:='Review opportunity';v_key:='open';v_url:='/admin/app/crm?tab=pipeline';v_reason:='Review the deal stage and next commitment.'; END IF;

    WHEN 'activity' THEN
      SELECT * INTO v_row FROM public.crm_activities WHERE id=p_entity_id;
      IF lower(COALESCE(v_row.status,'')) IN ('completed','cancelled') THEN v_label:='Open CRM activities';v_key:='open';v_url:='/admin/app/crm?tab=activities';v_reason:='This activity is already closed.';
      ELSE v_label:='Mark activity complete';v_key:='complete_activity';v_url:='/admin/app/crm?tab=activities';v_reason:='Close the action when it is done so the queue stays accurate.';v_quick:=true; END IF;

    WHEN 'meeting' THEN
      SELECT * INTO v_row FROM public.sales_meetings WHERE id=p_entity_id;
      IF v_row.status IN ('Scheduled','Rescheduled') THEN v_label:='Open meeting preparation';v_key:='open';v_url:='/admin/meeting-prep/'||p_entity_id;v_reason:='Prepare from qualification and CRM context before joining.';
      ELSIF v_row.status='No Show' THEN v_label:='Schedule rebooking follow-up';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='A no-show should create a clear rebooking action.';v_input:=true;
      ELSE v_label:='Review outcome and next step';v_key:='open';v_url:='/admin/meeting-prep/'||p_entity_id;v_reason:='Make sure the meeting outcome has a dated next action.'; END IF;

    WHEN 'quotation' THEN
      SELECT * INTO v_row FROM public.quotations WHERE id=p_entity_id;
      IF v_row.status='Draft' THEN v_label:='Complete quotation';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='Finish the commercial details before approval.';
      ELSIF v_row.status='Ready for Approval' THEN v_label:='Review approval';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='This quotation is waiting for approval.';
      ELSIF v_row.status='Approved' THEN v_label:='Send quotation';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='Approved quotations should reach the prospect quickly.';
      ELSIF v_row.status='Sent' THEN v_label:='Schedule quotation follow-up';v_key:='schedule_follow_up';v_url:='/admin/app/crm?tab=activities';v_reason:='Do not leave a sent quotation without a next date.';v_input:=true;
      ELSIF v_row.status='Accepted' THEN v_label:='Open payment workflow';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='The customer accepted; move to payment and activation.';
      ELSE v_label:='Review quotation';v_key:='open';v_url:='/admin/app/sales?tab=quotations';v_reason:='Review the current commercial state.'; END IF;

    WHEN 'payment' THEN
      SELECT * INTO v_row FROM public.payments WHERE id=p_entity_id;
      IF lower(COALESCE(v_row.status,'')) IN ('verified','paid') OR v_row.verified_at IS NOT NULL THEN v_label:='Open client/project';v_key:='open';v_url:='/admin/app/clients?tab=clients';v_reason:='This payment is already verified.';
      ELSIF public.is_admin() THEN v_label:='Verify payment';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='Payment verification remains a protected Admin workflow.';
      ELSE v_label:='Follow up payment';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='The customer payment still needs action.'; END IF;

    WHEN 'project_task' THEN
      SELECT * INTO v_row FROM public.project_tasks WHERE id=p_entity_id;
      IF lower(COALESCE(v_row.status,'')) IN ('completed','done') OR v_row.completed_at IS NOT NULL THEN v_label:='Open project';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='This task is already complete.';
      ELSE v_label:='Mark task complete';v_key:='complete_project_task';v_url:='/admin/app/projects?tab=myWork';v_reason:='Finish the current owned task before pulling more work.';v_quick:=true; END IF;

    WHEN 'project' THEN
      SELECT * INTO v_row FROM public.projects WHERE id=p_entity_id;
      IF v_row.status='Completed' OR v_row.completed_at IS NOT NULL THEN v_label:='Review project closure';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='Confirm final delivery, approvals and closure history.';
      ELSIF v_row.project_manager_id IS NULL AND public.is_admin() THEN v_label:='Assign project manager';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='Every active project needs one accountable owner.';
      ELSE v_label:='Open current project work';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='Work from the active tasks, blockers and next client approval.'; END IF;

    WHEN 'applicant' THEN
      SELECT * INTO v_row FROM public.applicants WHERE id=p_entity_id;
      v_label:=CASE v_row.stage WHEN 'Video Review' THEN 'Review introduction video' WHEN 'Initial Screening' THEN 'Complete initial screening' WHEN 'Sales Assessment' THEN 'Review sales assessment' WHEN 'Lead Research Test' THEN 'Review lead research test' WHEN 'CRM Assessment' THEN 'Review CRM assessment' WHEN 'Agreement Pending' THEN 'Verify agreement status' WHEN 'Final Approval' THEN 'Complete final approval' WHEN 'Ready for System Access' THEN 'Create system access' ELSE 'Open candidate' END;
      v_key:='open';v_url:='/admin/app/recruitment?tab=recruitment';v_reason:='Move the candidate using the controlled recruitment stage workflow.';

    WHEN 'client' THEN v_label:='Review client activity';v_key:='open';v_url:='/admin/app/clients?tab=clients';v_reason:='See projects, payments, meetings and client history together.';
    ELSE v_label:='Open record';v_key:='open';v_url:='/admin/workspace';v_reason:='Review the connected record.';
  END CASE;

  RETURN jsonb_build_object('entityType',v_type,'entityId',p_entity_id,'label',v_label,'actionKey',v_key,'url',v_url,'reason',v_reason,'quick',v_quick,'requiresInput',v_input,'requiresConfirmation',v_confirm);
END; $$;

CREATE OR REPLACE FUNCTION public.get_productivity_command_center(p_scope text DEFAULT 'mine')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_role text; v_status text; v_admin boolean; v_team boolean;
  v_notify jsonb; v_cfg jsonb; v_priority jsonb;
  v_quote_days integer:=2; v_limit integer:=12;
  v_meeting60 integer:=100; v_overdue integer:=95; v_new_lead integer:=88; v_due_today integer:=82; v_stale_quote integer:=78; v_project_task integer:=72; v_upcoming integer:=55;
  v_items jsonb; v_counts jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT role,status INTO v_role,v_status FROM public.user_profiles WHERE id=v_uid;
  IF v_status<>'active' OR v_role IN ('customer','pending') THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
  v_admin:=public.is_admin(); v_team:=v_admin AND lower(COALESCE(p_scope,'mine'))='team';

  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_notify FROM public.system_configuration WHERE config_key='notification_settings';
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_settings';
  v_priority:=COALESCE(v_cfg->'priority','{}'::jsonb);
  v_quote_days:=LEAST(GREATEST(COALESCE((v_notify->>'quotationFollowUpDays')::integer,2),1),30);
  v_limit:=LEAST(GREATEST(COALESCE((v_cfg->>'maxFocusItems')::integer,12),5),40);
  v_meeting60:=COALESCE((v_priority->>'meetingWithin60Minutes')::integer,100);
  v_overdue:=COALESCE((v_priority->>'overdue')::integer,95);
  v_new_lead:=COALESCE((v_priority->>'newInboundLead')::integer,88);
  v_due_today:=COALESCE((v_priority->>'dueToday')::integer,82);
  v_stale_quote:=COALESCE((v_priority->>'staleQuotation')::integer,78);
  v_project_task:=COALESCE((v_priority->>'projectTask')::integer,72);
  v_upcoming:=COALESCE((v_priority->>'upcoming')::integer,55);

  WITH raw AS (
    SELECT 'activity:'||a.id::text item_key,'activity' source_type,'activity' entity_type,a.id entity_id,a.subject title,
      COALESCE(a.activity_type,'Activity')||CASE WHEN COALESCE(a.channel,'')<>'' THEN ' · '||a.channel ELSE '' END subtitle,a.due_at due_at,
      CASE WHEN a.due_at<now() THEN v_overdue+3 ELSE v_due_today+2 END score,
      CASE WHEN a.due_at<now() THEN 'Overdue' ELSE 'Do Now' END bucket,
      'Mark complete' action_label,'complete_activity' action_key,'/admin/app/crm?tab=activities' action_url,true quick,false confirm,
      jsonb_build_object('assignedTo',a.assigned_to,'leadId',a.lead_id,'opportunityId',a.opportunity_id) metadata
    FROM public.crm_activities a
    WHERE lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled') AND a.due_at<=now()+interval '1 day' AND (v_team OR a.assigned_to=v_uid)

    UNION ALL
    SELECT 'meeting:'||m.id,'meeting','meeting',m.id,COALESCE(NULLIF(m.title,''),'Sales meeting'),COALESCE(NULLIF(m.attendee_name,''),'Prospect'),m.start_at,
      CASE WHEN m.start_at<=now()+interval '60 minutes' THEN v_meeting60 WHEN m.start_at::date=CURRENT_DATE THEN v_due_today+10 ELSE v_upcoming+10 END,
      CASE WHEN m.start_at<now() THEN 'Overdue' WHEN m.start_at<=now()+interval '2 hours' THEN 'Do Now' ELSE 'Upcoming' END,
      'Open prep','open','/admin/meeting-prep/'||m.id,false,false,jsonb_build_object('meetingUrl',m.meeting_url,'timezone',m.timezone)
    FROM public.sales_meetings m
    WHERE m.status IN ('Scheduled','Rescheduled') AND m.start_at<now()+interval '7 days' AND (v_team OR m.salesperson_id=v_uid)

    UNION ALL
    SELECT 'task:'||t.id,'project_task','project_task',t.id,t.title,COALESCE(NULLIF(p.project_name,''),'Project work'),COALESCE(t.due_date::timestamptz,now()+interval '7 days'),
      CASE WHEN t.due_date<CURRENT_DATE THEN v_overdue+1 WHEN t.due_date=CURRENT_DATE THEN v_due_today+2 WHEN lower(COALESCE(t.priority,''))='high' THEN v_project_task+6 ELSE v_project_task END,
      CASE WHEN t.due_date<CURRENT_DATE THEN 'Overdue' WHEN t.due_date=CURRENT_DATE OR lower(COALESCE(t.priority,''))='high' THEN 'Do Now' ELSE 'Upcoming' END,
      'Mark complete','complete_project_task','/admin/app/projects?tab=myWork',true,false,jsonb_build_object('projectId',p.id,'priority',t.priority,'department',t.department)
    FROM public.project_tasks t JOIN public.projects p ON p.id=t.project_id
    WHERE lower(COALESCE(t.status,'')) NOT IN ('completed','done','cancelled') AND t.completed_at IS NULL AND (v_team OR t.assigned_to=v_uid OR p.project_manager_id=v_uid)

    UNION ALL
    SELECT 'lead:'||l.id,'lead','lead',l.id,COALESCE(NULLIF(l.company_name,''),l.title),COALESCE(NULLIF(l.contact_name,''),'New inbound lead'),l.created_at,
      v_new_lead,'Do Now','Open lead','open','/admin/app/crm?tab=crm_leads',false,false,jsonb_build_object('service',l.service_interest,'source',l.source,'country',l.country)
    FROM public.crm_leads l
    WHERE l.status='New' AND l.created_at>=now()-interval '24 hours' AND v_role IN ('admin','sales','sales_rep','sales_team') AND (v_team OR l.salesperson_id=v_uid)

    UNION ALL
    SELECT 'quote:'||q.id,'quotation','quotation',q.id,COALESCE(NULLIF(q.customer_name,''),q.quotation_number),q.quotation_number||' · '||q.currency||' '||COALESCE(q.total,0)::text,q.sent_at+make_interval(days=>v_quote_days),
      CASE WHEN q.sent_at+make_interval(days=>v_quote_days)<now() THEN v_overdue ELSE v_stale_quote END,
      CASE WHEN q.sent_at+make_interval(days=>v_quote_days)<now() THEN 'Overdue' ELSE 'Waiting' END,'Follow up','open','/admin/app/sales?tab=quotations',false,false,jsonb_build_object('total',q.total,'currency',q.currency,'sentAt',q.sent_at)
    FROM public.quotations q
    WHERE lower(COALESCE(q.status,''))='sent' AND q.accepted_at IS NULL AND q.rejected_at IS NULL AND q.sent_at<=now()-make_interval(days=>v_quote_days) AND v_role IN ('admin','sales','sales_rep','sales_team') AND (v_team OR q.salesperson_id=v_uid)

    UNION ALL
    SELECT 'payment:'||p.id,'payment','payment',p.id,COALESCE(NULLIF(p.customer_name,''),p.payment_reference),'Payment '||COALESCE(NULLIF(p.status,''),'Pending')||' · '||p.currency||' '||COALESCE(p.amount_due,0)::text,COALESCE(p.due_date::timestamptz,now()),
      CASE WHEN p.due_date<CURRENT_DATE THEN v_overdue-1 ELSE v_due_today-3 END,
      CASE WHEN p.due_date<CURRENT_DATE THEN 'Overdue' ELSE 'Do Now' END,'Open payment','open','/admin/app/sales?tab=payments',false,false,jsonb_build_object('amountDue',p.amount_due,'amountPaid',p.amount_paid,'currency',p.currency)
    FROM public.payments p
    WHERE p.verified_at IS NULL AND lower(COALESCE(p.status,'')) NOT IN ('verified','cancelled','failed') AND (p.due_date IS NULL OR p.due_date<=CURRENT_DATE) AND v_role IN ('admin','sales','sales_rep','sales_team') AND (v_team OR p.salesperson_id=v_uid)

    UNION ALL
    SELECT 'handoff:'||o.id,'opportunity','opportunity',o.id,COALESCE(NULLIF(o.company_name,''),o.name),
      CASE WHEN v_role IN ('admin','project_manager') THEN 'Verified sale · ready for delivery project' ELSE 'Verified sale · delivery handoff in progress' END,
      COALESCE(o.won_at,o.updated_at),CASE WHEN v_role IN ('admin','project_manager') THEN v_due_today+8 ELSE v_upcoming END,
      CASE WHEN v_role IN ('admin','project_manager') THEN 'Do Now' ELSE 'Waiting' END,
      CASE WHEN v_role IN ('admin','project_manager') THEN 'Create project' ELSE 'Handoff queued' END,
      CASE WHEN v_role IN ('admin','project_manager') THEN 'create_project_from_sale' ELSE 'open' END,
      '/admin/focus/opportunity/'||o.id,
      CASE WHEN v_role IN ('admin','project_manager') THEN true ELSE false END,
      CASE WHEN v_role IN ('admin','project_manager') THEN true ELSE false END,
      jsonb_build_object('status',o.status,'stage',o.stage,'salespersonId',o.salesperson_id) metadata
    FROM public.crm_opportunities o
    WHERE o.status='Won' AND NOT EXISTS(SELECT 1 FROM public.projects pr WHERE pr.source_opportunity_id=o.id)
      AND (
        (v_role IN ('admin','project_manager') AND (v_team OR v_role='project_manager' OR v_admin))
        OR (v_role IN ('sales','sales_rep','sales_team') AND o.salesperson_id=v_uid)
      )

    UNION ALL
    SELECT 'applicant:'||a.id,'applicant','applicant',a.id,a.full_name,a.stage,a.updated_at,
      CASE WHEN a.updated_at<now()-interval '2 days' THEN v_overdue ELSE v_due_today-6 END,
      CASE WHEN a.updated_at<now()-interval '2 days' THEN 'Overdue' ELSE 'Do Now' END,'Review candidate','open','/admin/app/recruitment?tab=recruitment',false,false,jsonb_build_object('stage',a.stage,'country',a.country,'position',a.position)
    FROM public.applicants a WHERE v_admin AND a.stage NOT IN ('Activated')

    UNION ALL
    SELECT 'notification:'||n.id,'notification','notification',n.id,n.title,n.message,n.created_at,v_upcoming+3,'Upcoming','Open','open',COALESCE(NULLIF(n.action_url,''),'/admin/today'),false,false,jsonb_build_object('type',n.notification_type)
    FROM public.in_app_notifications n WHERE n.read_at IS NULL AND (v_team OR n.recipient_user_id=v_uid)
  ), dedup AS (
    SELECT DISTINCT ON(item_key) * FROM raw ORDER BY item_key,score DESC
  ), ranked AS (
    SELECT * FROM dedup ORDER BY score DESC,due_at NULLS LAST LIMIT 40
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('itemKey',item_key,'sourceType',source_type,'entityType',entity_type,'entityId',entity_id,'title',title,'subtitle',subtitle,'dueAt',due_at,'priorityScore',score,'bucket',bucket,'actionLabel',action_label,'actionKey',action_key,'actionUrl',action_url,'quick',quick,'requiresConfirmation',confirm,'metadata',metadata) ORDER BY score DESC,due_at NULLS LAST),'[]'::jsonb)
  INTO v_items FROM ranked;

  SELECT jsonb_build_object(
    'doNow',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Do Now'),0),
    'overdue',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Overdue'),0),
    'upcoming',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Upcoming'),0),
    'waiting',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Waiting'),0),
    'total',jsonb_array_length(v_items)
  ) INTO v_counts;

  RETURN jsonb_build_object('scope',CASE WHEN v_team THEN 'team' ELSE 'mine' END,'role',v_role,'focusLimit',v_limit,'counts',v_counts,'items',v_items,'generatedAt',now());
END; $$;
