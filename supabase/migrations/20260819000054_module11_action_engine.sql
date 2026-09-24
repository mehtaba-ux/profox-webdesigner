-- Module 11 — connected priority ranking, next-best-action, safe one-click actions, search and day close.

CREATE OR REPLACE FUNCTION public.get_productivity_next_action(p_entity_type text,p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_type text:=lower(trim(COALESCE(p_entity_type,''))); v_row record; v_label text; v_key text; v_url text; v_reason text; v_quick boolean:=false; v_input boolean:=false; v_confirm boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.productivity_can_access_entity(v_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;
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
        IF EXISTS(SELECT 1 FROM public.projects p WHERE p.source_opportunity_id=p_entity_id) THEN v_label:='Open delivery project';v_key:='open';v_url:='/admin/app/projects?tab=projects';v_reason:='The verified sale already has a delivery project.';
        ELSE v_label:='Create delivery project';v_key:='create_project_from_sale';v_url:='/admin/app/projects?tab=projects';v_reason:='Turn the verified sale into delivery without manual re-entry.';v_quick:=true;v_confirm:=true; END IF;
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
      ELSIF public.is_admin() THEN v_label:='Verify payment';v_key:='open';v_url:='/admin/app/sales?tab=payments';v_reason:='Payment verification is a protected Admin workflow.';
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
DECLARE v_uid uuid:=auth.uid();v_role text;v_status text;v_admin boolean;v_team boolean;v_quote_days integer:=2;v_settings jsonb;v_items jsonb;v_counts jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT role,status INTO v_role,v_status FROM public.user_profiles WHERE id=v_uid;
  IF v_status<>'active' OR v_role IN ('customer','pending') THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
  v_admin:=public.is_admin();v_team:=v_admin AND lower(COALESCE(p_scope,'mine'))='team';
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings';
  v_quote_days:=LEAST(GREATEST(COALESCE((v_settings->>'quotationFollowUpDays')::integer,2),1),30);
  WITH raw AS (
    SELECT 'activity:'||a.id::text item_key,'activity' source_type,'activity' entity_type,a.id entity_id,a.subject title,
      COALESCE(a.activity_type,'Activity')||CASE WHEN a.channel<>'' THEN ' · '||a.channel ELSE '' END subtitle,a.due_at due_at,
      CASE WHEN a.due_at<now() THEN 98 ELSE 84 END score,
      CASE WHEN a.due_at<now() THEN 'Overdue' ELSE 'Do Now' END bucket,
      'Mark complete' action_label,'complete_activity' action_key,'/admin/app/crm?tab=activities' action_url,true quick,false confirm,
      jsonb_build_object('assignedTo',a.assigned_to,'leadId',a.lead_id,'opportunityId',a.opportunity_id) metadata
    FROM public.crm_activities a WHERE lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled') AND a.due_at<=now()+interval '1 day' AND (v_team OR a.assigned_to=v_uid)
    UNION ALL
    SELECT 'meeting:'||m.id,'meeting','meeting',m.id,COALESCE(NULLIF(m.title,''),'Sales meeting'),COALESCE(NULLIF(m.attendee_name,''),'Prospect'),m.start_at,
      CASE WHEN m.start_at<=now()+interval '60 minutes' THEN 100 WHEN (m.start_at::date=CURRENT_DATE) THEN 92 ELSE 65 END,
      CASE WHEN m.start_at<now() THEN 'Overdue' WHEN m.start_at<=now()+interval '2 hours' THEN 'Do Now' ELSE 'Upcoming' END,
      'Open prep','open','/admin/meeting-prep/'||m.id,false,false,jsonb_build_object('meetingUrl',m.meeting_url,'timezone',m.timezone)
    FROM public.sales_meetings m WHERE m.status IN ('Scheduled','Rescheduled') AND m.start_at<now()+interval '7 days' AND (v_team OR m.salesperson_id=v_uid)
    UNION ALL
    SELECT 'task:'||t.id,'project_task','project_task',t.id,t.title,COALESCE(NULLIF(p.project_name,''),'Project work'),COALESCE(t.due_date::timestamptz,now()+interval '7 days'),
      CASE WHEN t.due_date<CURRENT_DATE THEN 96 WHEN t.due_date=CURRENT_DATE THEN 84 WHEN lower(COALESCE(t.priority,''))='high' THEN 78 ELSE 62 END,
      CASE WHEN t.due_date<CURRENT_DATE THEN 'Overdue' WHEN t.due_date=CURRENT_DATE OR lower(COALESCE(t.priority,''))='high' THEN 'Do Now' ELSE 'Upcoming' END,
      'Mark complete','complete_project_task','/admin/app/projects?tab=myWork',true,false,jsonb_build_object('projectId',p.id,'priority',t.priority,'department',t.department)
    FROM public.project_tasks t JOIN public.projects p ON p.id=t.project_id
    WHERE lower(COALESCE(t.status,'')) NOT IN ('completed','done','cancelled') AND t.completed_at IS NULL AND (v_team OR t.assigned_to=v_uid OR p.project_manager_id=v_uid)
    UNION ALL
    SELECT 'lead:'||l.id,'lead','lead',l.id,COALESCE(NULLIF(l.company_name,''),l.title),COALESCE(NULLIF(l.contact_name,''),'New inbound lead'),l.created_at,
      88,'Do Now','Open lead','open','/admin/app/crm?tab=crm_leads',false,false,jsonb_build_object('service',l.service_interest,'source',l.source,'country',l.country)
    FROM public.crm_leads l WHERE l.status='New' AND l.created_at>=now()-interval '24 hours' AND v_role IN ('admin','sales','sales_rep','sales_team') AND (v_team OR l.salesperson_id=v_uid)
    UNION ALL
    SELECT 'quote:'||q.id,'quotation','quotation',q.id,COALESCE(NULLIF(q.customer_name,''),q.quotation_number),q.quotation_number||' · '||q.currency||' '||COALESCE(q.total,0)::text,q.sent_at+make_interval(days=>v_quote_days),
      80,CASE WHEN q.sent_at+make_interval(days=>v_quote_days)<now() THEN 'Overdue' ELSE 'Waiting' END,'Follow up','open','/admin/app/sales?tab=quotations',false,false,jsonb_build_object('total',q.total,'currency',q.currency,'sentAt',q.sent_at)
    FROM public.quotations q WHERE lower(COALESCE(q.status,''))='sent' AND q.accepted_at IS NULL AND q.rejected_at IS NULL AND q.sent_at<=now()-make_interval(days=>v_quote_days) AND v_role IN ('admin','sales','sales_rep','sales_team') AND (v_team OR q.salesperson_id=v_uid)
    UNION ALL
    SELECT 'payment:'||p.id,'payment','payment',p.id,COALESCE(NULLIF(p.customer_name,''),p.payment_reference),'Payment '||COALESCE(NULLIF(p.status,''),'Pending')||' · '||p.currency||' '||COALESCE(p.amount_due,0)::text,COALESCE(p.due_date::timestamptz,now()),
      CASE WHEN p.due_date<CURRENT_DATE THEN 94 ELSE 79 END,CASE WHEN p.due_date<CURRENT_DATE THEN 'Overdue' ELSE 'Do Now' END,'Open payment','open','/admin/app/sales?tab=payments',false,false,jsonb_build_object('amountDue',p.amount_due,'amountPaid',p.amount_paid,'currency',p.currency)
    FROM public.payments p WHERE p.verified_at IS NULL AND lower(COALESCE(p.status,'')) NOT IN ('verified','cancelled','failed') AND (p.due_date IS NULL OR p.due_date<=CURRENT_DATE) AND v_role IN ('admin','sales','sales_rep','sales_team') AND (v_team OR p.salesperson_id=v_uid)
    UNION ALL
    SELECT 'applicant:'||a.id,'applicant','applicant',a.id,a.full_name,a.stage,a.updated_at,
      CASE WHEN a.updated_at<now()-interval '2 days' THEN 90 ELSE 76 END,CASE WHEN a.updated_at<now()-interval '2 days' THEN 'Overdue' ELSE 'Do Now' END,'Review candidate','open','/admin/app/recruitment?tab=recruitment',false,false,jsonb_build_object('stage',a.stage,'country',a.country,'position',a.position)
    FROM public.applicants a WHERE v_admin AND a.stage NOT IN ('Activated')
    UNION ALL
    SELECT 'notification:'||n.id,'notification','notification',n.id,n.title,n.message,n.created_at,58,'Upcoming','Open','open',COALESCE(NULLIF(n.action_url,''),'/admin/today'),false,false,jsonb_build_object('type',n.notification_type)
    FROM public.in_app_notifications n WHERE n.read_at IS NULL AND (v_team OR n.recipient_user_id=v_uid)
  ), dedup AS (
    SELECT DISTINCT ON(item_key) * FROM raw ORDER BY item_key,score DESC
  ), ranked AS (
    SELECT * FROM dedup ORDER BY score DESC,due_at NULLS LAST LIMIT 40
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('itemKey',item_key,'sourceType',source_type,'entityType',entity_type,'entityId',entity_id,'title',title,'subtitle',subtitle,'dueAt',due_at,'priorityScore',score,'bucket',bucket,'actionLabel',action_label,'actionKey',action_key,'actionUrl',action_url,'quick',quick,'requiresConfirmation',confirm,'metadata',metadata) ORDER BY score DESC,due_at NULLS LAST),'[]'::jsonb) INTO v_items FROM ranked;
  SELECT jsonb_build_object(
    'doNow',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Do Now'),0),
    'overdue',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Overdue'),0),
    'upcoming',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Upcoming'),0),
    'waiting',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Waiting'),0),
    'total',jsonb_array_length(v_items)
  ) INTO v_counts;
  RETURN jsonb_build_object('scope',CASE WHEN v_team THEN 'team' ELSE 'mine' END,'role',v_role,'counts',v_counts,'items',v_items,'generatedAt',now());
END; $$;

CREATE OR REPLACE FUNCTION public.execute_productivity_action(p_action_key text,p_entity_type text,p_entity_id uuid,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_action text:=lower(trim(COALESCE(p_action_key,'')));v_type text:=lower(trim(COALESCE(p_entity_type,'')));v_result jsonb:='{}'::jsonb;v_new_id uuid;v_owner uuid;v_due timestamptz;v_subject text;v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.productivity_can_access_entity(v_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;
  IF v_action='complete_activity' AND v_type='activity' THEN
    UPDATE public.crm_activities SET status='Completed',completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=p_entity_id AND lower(COALESCE(status,'')) NOT IN ('completed','cancelled');
    v_result:=jsonb_build_object('completed',true,'activityId',p_entity_id);
  ELSIF v_action='complete_project_task' AND v_type='project_task' THEN
    UPDATE public.project_tasks SET status='Completed',completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=p_entity_id AND completed_at IS NULL;
    v_result:=jsonb_build_object('completed',true,'taskId',p_entity_id);
  ELSIF v_action='mark_lead_contacted' AND v_type='lead' THEN
    UPDATE public.crm_leads SET status='Contacted',last_contact_at=now(),updated_at=now() WHERE id=p_entity_id AND status IN ('New','Researching');
    v_result:=jsonb_build_object('status','Contacted','leadId',p_entity_id);
  ELSIF v_action='schedule_follow_up' AND v_type IN ('lead','opportunity','meeting','quotation') THEN
    BEGIN v_due:=(p_payload->>'dueAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'A valid follow-up date/time is required.'; END;
    IF v_due<=now() THEN RAISE EXCEPTION 'Follow-up must be scheduled in the future.'; END IF;
    IF v_type='lead' THEN SELECT salesperson_id INTO v_owner FROM public.crm_leads WHERE id=p_entity_id;
    ELSIF v_type='opportunity' THEN SELECT salesperson_id INTO v_owner FROM public.crm_opportunities WHERE id=p_entity_id;
    ELSIF v_type='meeting' THEN SELECT salesperson_id INTO v_owner FROM public.sales_meetings WHERE id=p_entity_id;
    ELSE SELECT salesperson_id INTO v_owner FROM public.quotations WHERE id=p_entity_id; END IF;
    v_owner:=COALESCE(v_owner,v_uid);v_subject:=left(trim(COALESCE(NULLIF(p_payload->>'subject',''),'Follow up')),240);
    SELECT id INTO v_existing FROM public.crm_activities WHERE assigned_to=v_owner AND lower(COALESCE(status,'')) NOT IN ('completed','cancelled') AND subject=v_subject
      AND ((v_type='lead' AND lead_id=p_entity_id) OR (v_type='opportunity' AND opportunity_id=p_entity_id)) ORDER BY created_at DESC LIMIT 1;
    IF v_existing IS NULL THEN
      INSERT INTO public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
      VALUES(CASE WHEN v_type='lead' THEN p_entity_id WHEN v_type='meeting' THEN (SELECT lead_id FROM public.sales_meetings WHERE id=p_entity_id) ELSE NULL END,
             CASE WHEN v_type='opportunity' THEN p_entity_id WHEN v_type='meeting' THEN (SELECT opportunity_id FROM public.sales_meetings WHERE id=p_entity_id) WHEN v_type='quotation' THEN (SELECT opportunity_id FROM public.quotations WHERE id=p_entity_id) ELSE NULL END,
             v_owner,CASE WHEN v_type='quotation' THEN 'Quotation Follow-Up' ELSE 'Follow-Up' END,v_subject,v_due,'Scheduled','CRM',left(COALESCE(p_payload->>'notes',''),4000),v_uid)
      RETURNING id INTO v_existing;
    ELSE
      UPDATE public.crm_activities SET due_at=v_due,notes=left(COALESCE(p_payload->>'notes',notes),4000),updated_at=now() WHERE id=v_existing;
    END IF;
    IF v_type='lead' THEN UPDATE public.crm_leads SET next_follow_up_at=v_due,updated_at=now() WHERE id=p_entity_id;
    ELSIF v_type='opportunity' THEN UPDATE public.crm_opportunities SET next_follow_up_at=v_due,updated_at=now() WHERE id=p_entity_id;
    ELSIF v_type='meeting' THEN UPDATE public.sales_meetings SET follow_up_at=v_due,next_step=COALESCE(NULLIF(v_subject,''),next_step),updated_at=now() WHERE id=p_entity_id;
    END IF;
    v_result:=jsonb_build_object('activityId',v_existing,'dueAt',v_due);
  ELSIF v_action='convert_lead' AND v_type='lead' THEN
    SELECT public.convert_lead_to_opportunity(p_entity_id,left(COALESCE(NULLIF(p_payload->>'name',''),(SELECT title FROM public.crm_leads WHERE id=p_entity_id)),200),GREATEST(COALESCE((p_payload->>'expectedValue')::numeric,0),0)) INTO v_new_id;
    v_result:=jsonb_build_object('opportunityId',v_new_id);
  ELSIF v_action='create_project_from_sale' AND v_type='opportunity' THEN
    SELECT id INTO v_new_id FROM public.projects WHERE source_opportunity_id=p_entity_id ORDER BY created_at LIMIT 1;
    IF v_new_id IS NULL THEN SELECT public.create_project_from_sale(p_entity_id) INTO v_new_id; END IF;
    v_result:=jsonb_build_object('projectId',v_new_id);
  ELSE RAISE EXCEPTION 'This action is not available as a one-click workflow.';
  END IF;
  INSERT INTO public.productivity_action_log(user_id,action_key,entity_type,entity_id,payload,result,status) VALUES(v_uid,v_action,v_type,p_entity_id,COALESCE(p_payload,'{}'::jsonb),v_result,'Completed');
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  BEGIN INSERT INTO public.productivity_action_log(user_id,action_key,entity_type,entity_id,payload,result,status) VALUES(v_uid,v_action,v_type,p_entity_id,COALESCE(p_payload,'{}'::jsonb),jsonb_build_object('error',SQLERRM),'Failed'); EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE;
END; $$;

CREATE OR REPLACE FUNCTION public.search_productivity_workspace(p_query text,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_status text;v_q text:='%'||lower(trim(COALESCE(p_query,'')))||'%';v_limit int:=LEAST(GREATEST(COALESCE(p_limit,20),1),40);v_rows jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF; SELECT role,status INTO v_role,v_status FROM public.user_profiles WHERE id=v_uid; IF v_status<>'active' THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
 IF length(trim(COALESCE(p_query,'')))<2 THEN RETURN '[]'::jsonb; END IF;
 WITH results AS (
   SELECT 'lead' entity_type,l.id entity_id,COALESCE(NULLIF(l.company_name,''),l.title) title,COALESCE(NULLIF(l.contact_name,''),l.email,'Lead') subtitle,'/admin/app/crm?tab=crm_leads' url,10 rank FROM public.crm_leads l WHERE (public.is_admin() OR l.salesperson_id=v_uid) AND lower(COALESCE(l.company_name,'')||' '||COALESCE(l.title,'')||' '||COALESCE(l.contact_name,'')||' '||COALESCE(l.email,'')) LIKE v_q
   UNION ALL SELECT 'opportunity',o.id,COALESCE(NULLIF(o.company_name,''),o.name),o.stage||' · '||COALESCE(o.contact_name,''),'/admin/app/crm?tab=pipeline',20 FROM public.crm_opportunities o WHERE (public.is_admin() OR o.salesperson_id=v_uid) AND lower(COALESCE(o.company_name,'')||' '||COALESCE(o.name,'')||' '||COALESCE(o.contact_name,'')||' '||COALESCE(o.email,'')) LIKE v_q
   UNION ALL SELECT 'client',c.id,c.company_name,COALESCE(NULLIF(c.primary_contact_name,''),c.email,'Client'),'/admin/app/clients?tab=clients',30 FROM public.clients c WHERE (public.is_admin() OR c.salesperson_id=v_uid) AND lower(COALESCE(c.company_name,'')||' '||COALESCE(c.primary_contact_name,'')||' '||COALESCE(c.email,'')) LIKE v_q
   UNION ALL SELECT 'quotation',q.id,COALESCE(NULLIF(q.customer_name,''),q.quotation_number),q.quotation_number||' · '||q.status,'/admin/app/sales?tab=quotations',40 FROM public.quotations q WHERE (public.is_admin() OR q.salesperson_id=v_uid) AND lower(COALESCE(q.customer_name,'')||' '||COALESCE(q.contact_name,'')||' '||COALESCE(q.email,'')||' '||COALESCE(q.quotation_number,'')) LIKE v_q
   UNION ALL SELECT 'project',p.id,p.project_name,p.project_number||' · '||COALESCE(p.stage,p.status,''),'/admin/app/projects?tab=projects',50 FROM public.projects p WHERE (public.is_admin() OR p.project_manager_id=v_uid OR EXISTS(SELECT 1 FROM public.project_team pt WHERE pt.project_id=p.id AND pt.user_id=v_uid)) AND lower(COALESCE(p.project_name,'')||' '||COALESCE(p.project_number,'')||' '||COALESCE(p.requirements_summary,'')) LIKE v_q
   UNION ALL SELECT 'meeting',m.id,COALESCE(NULLIF(m.title,''),'Meeting'),COALESCE(NULLIF(m.attendee_name,''),m.attendee_email,'Meeting'),'/admin/meeting-prep/'||m.id,60 FROM public.sales_meetings m WHERE (public.is_admin() OR m.salesperson_id=v_uid) AND lower(COALESCE(m.title,'')||' '||COALESCE(m.attendee_name,'')||' '||COALESCE(m.attendee_email,'')) LIKE v_q
   UNION ALL SELECT 'applicant',a.id,a.full_name,a.stage||' · '||a.email,'/admin/app/recruitment?tab=recruitment',70 FROM public.applicants a WHERE public.is_admin() AND lower(COALESCE(a.full_name,'')||' '||COALESCE(a.email,'')||' '||COALESCE(a.position,'')||' '||COALESCE(a.stage,'')) LIKE v_q
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object('entityType',entity_type,'entityId',entity_id,'title',title,'subtitle',subtitle,'url',url) ORDER BY rank,title),'[]'::jsonb) INTO v_rows FROM (SELECT * FROM results ORDER BY rank,title LIMIT v_limit) x;
 RETURN v_rows;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_productivity_day(p_notes text DEFAULT '',p_tomorrow_focus text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_center jsonb;v_metrics jsonb;v_row public.productivity_daily_reviews%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 v_center:=public.get_productivity_command_center('mine');
 v_metrics:=jsonb_build_object('counts',v_center->'counts','actionsCompletedToday',(SELECT count(*) FROM public.productivity_action_log WHERE user_id=v_uid AND status='Completed' AND created_at::date=CURRENT_DATE),'completedActivitiesToday',(SELECT count(*) FROM public.crm_activities WHERE assigned_to=v_uid AND completed_at::date=CURRENT_DATE),'completedProjectTasksToday',(SELECT count(*) FROM public.project_tasks WHERE assigned_to=v_uid AND completed_at::date=CURRENT_DATE));
 INSERT INTO public.productivity_daily_reviews(user_id,review_date,metrics_snapshot,notes,tomorrow_focus,completed_at,updated_at)
 VALUES(v_uid,CURRENT_DATE,v_metrics,left(trim(COALESCE(p_notes,'')),4000),left(trim(COALESCE(p_tomorrow_focus,'')),2000),now(),now())
 ON CONFLICT(user_id,review_date) DO UPDATE SET metrics_snapshot=EXCLUDED.metrics_snapshot,notes=EXCLUDED.notes,tomorrow_focus=EXCLUDED.tomorrow_focus,completed_at=now(),updated_at=now() RETURNING * INTO v_row;
 RETURN jsonb_build_object('reviewDate',v_row.review_date,'metrics',v_row.metrics_snapshot,'notes',v_row.notes,'tomorrowFocus',v_row.tomorrow_focus,'completedAt',v_row.completed_at);
END; $$;

CREATE OR REPLACE FUNCTION public.get_productivity_metrics(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_days int:=LEAST(GREATEST(COALESCE(p_days,7),1),90);v_admin boolean;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;v_admin:=public.is_admin();
 RETURN jsonb_build_object('days',v_days,'actionsCompleted',(SELECT count(*) FROM public.productivity_action_log WHERE (v_admin OR user_id=v_uid) AND status='Completed' AND created_at>=now()-make_interval(days=>v_days)),'activitiesCompleted',(SELECT count(*) FROM public.crm_activities WHERE (v_admin OR assigned_to=v_uid) AND completed_at>=now()-make_interval(days=>v_days)),'projectTasksCompleted',(SELECT count(*) FROM public.project_tasks WHERE (v_admin OR assigned_to=v_uid) AND completed_at>=now()-make_interval(days=>v_days)),'meetingsCompleted',(SELECT count(*) FROM public.sales_meetings WHERE (v_admin OR salesperson_id=v_uid) AND completed_at>=now()-make_interval(days=>v_days)),'dayReviews',(SELECT count(*) FROM public.productivity_daily_reviews WHERE (v_admin OR user_id=v_uid) AND review_date>=CURRENT_DATE-v_days));
END; $$;

REVOKE ALL ON FUNCTION public.get_productivity_next_action(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_productivity_command_center(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.execute_productivity_action(text,text,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.search_productivity_workspace(text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_productivity_day(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_productivity_metrics(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_productivity_next_action(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_productivity_command_center(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_productivity_action(text,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_productivity_workspace(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_productivity_day(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_productivity_metrics(integer) TO authenticated;