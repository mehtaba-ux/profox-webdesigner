DO $$
BEGIN
  UPDATE public.career_jobs
  SET title='Content Creator',
      role_details=coalesce(role_details,'{}'::jsonb)
        || jsonb_build_object(
          'portfolioTiming','post_screening',
          'portfolioMinimumCaseStudies',3,
          'agreementRequiredBeforeAcademy',true,
          'finalApprovalRequired',true,
          'systemAccessRequiredBeforeActivation',true,
          'applicationForm',coalesce(role_details->'applicationForm','{}'::jsonb)
            || jsonb_build_object('cvRequired',true,'portfolioRequired',false,'portfolioDeferred',true,'minimumWeeklyHours',coalesce((role_details->'applicationForm'->>'minimumWeeklyHours')::int,20))
        ),
      updated_at=now()
  WHERE slug='content-writer' AND application_type='content_writer';
END $$;

CREATE OR REPLACE FUNCTION public.issue_recruitment_task_internal(p_applicant_id uuid,p_stage text,p_retry_feedback text DEFAULT '',p_send_email boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_app public.applicants%rowtype;
  v_template public.recruitment_task_templates%rowtype;
  v_existing public.recruitment_task_instances%rowtype;
  v_instance public.recruitment_task_instances%rowtype;
  v_attempt integer;v_snapshot jsonb;v_payload jsonb;v_due timestamptz;v_template_key text;v_task_key text;
BEGIN
  SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id;
  IF NOT FOUND OR v_app.closed_at IS NOT NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_template FROM public.recruitment_task_templates
  WHERE active=true AND system_role=public.career_job_system_role(v_app.career_job_id) AND stage=p_stage
  ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_task_key:=coalesce(v_template.task_key,'');
  SELECT * INTO v_existing FROM public.recruitment_task_instances
  WHERE applicant_id=p_applicant_id AND stage=p_stage ORDER BY attempt_no DESC LIMIT 1;
  IF FOUND AND v_existing.status IN('Issued','Viewed','In Progress','Submitted','Under Review') THEN
    RETURN jsonb_build_object('instanceId',v_existing.id,'attemptNo',v_existing.attempt_no,'status',v_existing.status,'alreadyExists',true,'dueAt',v_existing.due_at,'estimatedMinutes',(v_existing.template_snapshot->>'estimatedMinutes')::integer,'requiredItems',(v_existing.template_snapshot->>'requiredItems')::integer,'targetMarket',v_existing.template_snapshot->>'targetMarket','targetNiche',v_existing.template_snapshot->>'targetNiche','retryFeedback',v_existing.retry_feedback);
  END IF;
  v_attempt:=coalesce(v_existing.attempt_no,0)+1;
  IF v_attempt>v_template.max_attempts THEN RAISE EXCEPTION 'Maximum recruitment task attempts reached.'; END IF;
  v_due:=now()+make_interval(hours=>v_template.deadline_hours);
  v_snapshot:=jsonb_build_object('taskKey',v_template.task_key,'title',v_template.title,'description',v_template.description,'targetMarket',v_template.target_market,'targetNiche',v_template.target_niche,'requiredItems',v_template.required_items,'deadlineHours',v_template.deadline_hours,'estimatedMinutes',v_template.estimated_minutes,'maxAttempts',v_template.max_attempts,'instructions',v_template.instructions,'version',v_template.version);
  INSERT INTO public.recruitment_task_instances(applicant_id,template_id,stage,attempt_no,status,token_hash,template_snapshot,retry_feedback,due_at)
  VALUES(p_applicant_id,v_template.id,p_stage,v_attempt,'Issued',NULL,v_snapshot,coalesce(p_retry_feedback,''),v_due) RETURNING * INTO v_instance;
  INSERT INTO public.recruitment_task_submissions(task_instance_id) VALUES(v_instance.id);
  INSERT INTO public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  VALUES(p_applicant_id,'Recruitment','Task Issued',v_template.title,'Secure practical task attempt '||v_attempt||' issued with a deadline.',case when auth.uid() is null then 'System' else 'Admin' end,auth.uid(),'recruitment_task_instances',v_instance.id,jsonb_build_object('stage',p_stage,'attemptNo',v_attempt,'dueAt',v_due,'templateVersion',v_template.version,'taskKey',v_task_key));
  IF p_send_email THEN
    v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('taskInstanceId',v_instance.id);
    v_template_key:=case
      when v_task_key='content_writer_portfolio_v2' and v_attempt>1 then 'content_recruitment_portfolio_retry'
      when v_task_key='content_writer_portfolio_v2' then 'content_recruitment_portfolio'
      when v_attempt>1 then 'recruitment_lead_research_retry'
      else 'recruitment_lead_research'
    end;
    PERFORM public.enqueue_notification('recruitment-task:'||v_instance.id::text||':issued',v_template_key,v_app.email,NULL,v_payload,now());
  END IF;
  RETURN jsonb_build_object('instanceId',v_instance.id,'attemptNo',v_attempt,'status',v_instance.status,'alreadyExists',false,'dueAt',v_due,'estimatedMinutes',v_template.estimated_minutes,'requiredItems',v_template.required_items,'targetMarket',v_template.target_market,'targetNiche',v_template.target_niche,'retryFeedback',coalesce(p_retry_feedback,''));
END;$$;

CREATE OR REPLACE FUNCTION public.prepare_recruitment_task_on_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_issue jsonb;v_task_id uuid;v_task_key text;
BEGIN
  IF new.stage IS DISTINCT FROM old.stage THEN
    v_issue:=public.issue_recruitment_task_internal(new.id,new.stage,'',false);
    IF v_issue IS NOT NULL THEN
      v_task_id:=(v_issue->>'instanceId')::uuid;
      SELECT coalesce(template_snapshot->>'taskKey','') INTO v_task_key FROM public.recruitment_task_instances WHERE id=v_task_id;
      PERFORM set_config('profox.recruitment_task_email_context',jsonb_build_object('taskInstanceId',v_task_id)::text,true);
      IF v_task_key='content_writer_portfolio_v2' THEN
        PERFORM public.enqueue_notification('recruitment-task:'||v_task_id::text||':content-portfolio-issued','content_recruitment_portfolio',lower(btrim(new.email)),NULL,public.recruitment_notification_payload(new)||jsonb_build_object('taskInstanceId',v_task_id),now());
      END IF;
    END IF;
  END IF;
  RETURN new;
END;$$;

CREATE OR REPLACE FUNCTION public.admin_resend_recruitment_task(p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_template_key text;v_payload jsonb;v_task_key text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_task FROM public.recruitment_task_instances WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recruitment task not found.'; END IF;
  IF v_task.status NOT IN('Issued','Viewed','In Progress') THEN RAISE EXCEPTION 'Only an active editable task link can be resent.'; END IF;
  IF v_task.due_at<now() THEN RAISE EXCEPTION 'Extend the expired deadline before resending this task.'; END IF;
  SELECT * INTO v_app FROM public.applicants WHERE id=v_task.applicant_id;
  UPDATE public.recruitment_task_instances SET token_hash=NULL,updated_at=now() WHERE id=v_task.id;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('taskInstanceId',v_task.id);
  v_template_key:=case
    when v_task_key='content_writer_portfolio_v2' and v_task.attempt_no>1 then 'content_recruitment_portfolio_retry'
    when v_task_key='content_writer_portfolio_v2' then 'content_recruitment_portfolio'
    when v_task.attempt_no>1 then 'recruitment_lead_research_retry'
    else 'recruitment_lead_research'
  end;
  PERFORM public.enqueue_notification('recruitment-task:'||v_task.id::text||':resend:'||extract(epoch from clock_timestamp())::bigint,v_template_key,v_app.email,NULL,v_payload,now());
  INSERT INTO public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  VALUES(v_task.applicant_id,'Recruitment','Task Link Resent',coalesce(v_task.template_snapshot->>'title','Recruitment task')||' link resent','Admin invalidated the previous task link and requested a new secure link.','Admin',auth.uid(),'recruitment_task_instances',v_task.id,jsonb_build_object('attemptNo',v_task.attempt_no,'taskKey',v_task_key));
  RETURN jsonb_build_object('success',true);
END;$$;

CREATE OR REPLACE FUNCTION public.queue_recruitment_stage_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_admin record;v_template text;v_cycle text:=md5(clock_timestamp()::text||random()::text||new.id::text);v_secure_issue boolean:=coalesce(current_setting('profox.agreement_issue_stage',true),'')='1';v_content_activation boolean:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'')='1';v_application_type text;v_role text;v_admin_path text;v_manager_count integer:=0;
BEGIN
 SELECT application_type INTO v_application_type FROM public.career_jobs WHERE id=new.career_job_id;
 v_role:=coalesce(public.career_job_system_role(new.career_job_id),case when v_application_type='sales_representative' then 'sales' else 'pending' end);
 v_admin_path:=case when v_role='uiux_designer' then '/admin/uiux-recruitment' else '/admin/app/recruitment?tab=recruitment' end;
 IF v_application_type='content_writer' THEN
  IF tg_op='INSERT' THEN
   PERFORM public.enqueue_notification('recruitment:'||new.id::text||':content-application-received','content_recruitment_application_received',lower(btrim(new.email)),NULL,public.recruitment_notification_payload(new),now());
   FOR v_admin IN SELECT id FROM public.user_profiles WHERE status='active' AND role IN('editor','site_manager') LOOP
     PERFORM public.enqueue_in_app_notification(v_admin.id,'Recruitment','New Content Creator application',new.full_name||' submitted a Content Creator application.','/admin/content-recruitment','content-recruitment:new:'||new.id::text||':'||v_admin.id::text);v_manager_count:=v_manager_count+1;
   END LOOP;
   IF v_manager_count=0 THEN
     FOR v_admin IN SELECT id FROM public.user_profiles WHERE status='active' AND role='admin' LOOP
       PERFORM public.enqueue_in_app_notification(v_admin.id,'Recruitment','Content recruitment needs an owner',new.full_name||' submitted a Content Creator application and no active Content Manager is available.','/admin/content-recruitment','content-recruitment:unowned:'||new.id::text||':'||v_admin.id::text);
     END LOOP;
   END IF;
   RETURN new;
  END IF;
  IF new.refusal_reason IS DISTINCT FROM old.refusal_reason AND coalesce(btrim(new.refusal_reason),'')<>'' THEN
    PERFORM public.enqueue_notification('recruitment:'||new.id::text||':content-not-selected','content_recruitment_not_selected',lower(btrim(new.email)),NULL,public.recruitment_notification_payload(new),now());RETURN new;
  END IF;
  IF new.stage IS DISTINCT FROM old.stage THEN
    v_template:=case new.stage
      when 'Selected' then 'content_recruitment_selected'
      when 'Activated' then case when v_content_activation then NULL else 'content_recruitment_activated' end
      when 'Portfolio Review' then NULL when 'Agreement Pending' then NULL when 'Content Academy' then NULL
      when 'Practical Certification' then NULL when 'Final Approval' then NULL when 'Ready for System Access' then NULL
      else 'content_recruitment_stage' end;
    IF v_template IS NOT NULL THEN
      PERFORM public.enqueue_notification('recruitment:'||new.id::text||':content-stage:'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||':'||v_cycle,v_template,lower(btrim(new.email)),new.linked_user_id,public.recruitment_notification_payload(new),now());
    END IF;
  END IF;
  RETURN new;
 END IF;
 IF tg_op='INSERT' THEN
  IF v_role='sales' THEN
   IF new.stage='Video Pending' THEN PERFORM public.queue_recruitment_email(new,'recruitment_video_pending','video-pending-'||v_cycle,now());PERFORM public.queue_recruitment_video_pending_followups(new,v_cycle);ELSE PERFORM public.queue_recruitment_email(new,'recruitment_application_received','application-received',now());END IF;
  ELSIF v_role='uiux_designer' THEN PERFORM public.queue_recruitment_email(new,'recruitment_uiux_application_received','application-received',now());
  ELSIF v_role='developer' THEN PERFORM public.queue_recruitment_email(new,'recruitment_developer_application_received','application-received',now());END IF;
  FOR v_admin IN SELECT id FROM public.user_profiles WHERE role='admin' AND status='active' LOOP PERFORM public.enqueue_in_app_notification(v_admin.id,'Recruitment','New '||coalesce((SELECT title FROM public.career_jobs WHERE id=new.career_job_id),new.position)||' application',new.full_name||' submitted application '||coalesce(new.application_reference,'')||'.',v_admin_path,'recruitment:new-applicant:'||new.id::text||':'||v_admin.id::text);END LOOP;
  RETURN new;
 END IF;
 IF new.refusal_reason IS DISTINCT FROM old.refusal_reason AND coalesce(trim(new.refusal_reason),'')<>'' THEN IF v_role='sales' THEN PERFORM public.cancel_recruitment_video_pending_followups(new.id,'Candidate application was closed.');END IF;PERFORM public.queue_recruitment_email(new,'recruitment_not_selected','not-selected',now());RETURN new;END IF;
 IF new.stage IS DISTINCT FROM old.stage THEN
  IF v_role='sales' THEN
   IF old.stage='Video Pending' AND new.stage<>'Video Pending' THEN PERFORM public.cancel_recruitment_video_pending_followups(new.id,'Candidate progressed beyond Video Pending.');END IF;
   IF new.stage='Agreement Pending' AND old.stage='Selected' AND coalesce(new.agreement_status,'not_sent')='not_sent' THEN PERFORM public.create_sales_partner_agreement_internal(new.id);v_secure_issue:=true;END IF;
   v_template:=case new.stage when 'New Application' then 'recruitment_application_received' when 'Video Pending' then 'recruitment_video_pending' when 'Video Review' then 'recruitment_video_received' when 'Initial Screening' then 'recruitment_initial_screening' when 'Shortlisted' then 'recruitment_shortlisted' when 'Sales Assessment' then 'recruitment_sales_assessment' when 'Lead Research Test' then 'recruitment_lead_research' when 'CRM Assessment' then 'recruitment_crm_assessment' when 'Selected' then 'recruitment_selected' when 'Agreement Pending' then case when v_secure_issue then NULL else 'recruitment_agreement_pending' end when 'Sales Academy Training' then 'recruitment_training' when 'Final Approval' then 'recruitment_final_review' when 'Ready for System Access' then 'recruitment_final_approved' when 'Activated' then 'recruitment_activated' else NULL end;
   IF v_template IS NOT NULL THEN PERFORM public.queue_recruitment_email(new,v_template,'stage-'||lower(replace(new.stage,' ','-'))||'-'||v_cycle,now());END IF;IF new.stage='Video Pending' THEN PERFORM public.queue_recruitment_video_pending_followups(new,v_cycle);END IF;
  ELSIF v_role='uiux_designer' THEN
   v_template:=case new.stage when 'Portfolio Review' then 'recruitment_uiux_portfolio_review' when 'Initial Screening' then 'recruitment_uiux_assessment' when 'Design Assessment' then 'recruitment_uiux_assessment' when 'Figma Practical' then 'recruitment_uiux_assessment' when 'Design Interview' then 'recruitment_uiux_assessment' when 'Selected' then 'recruitment_uiux_selected' when 'Design Academy' then 'recruitment_uiux_design_academy' when 'Final Approval' then 'recruitment_uiux_final_review' when 'Activated' then 'recruitment_uiux_activated' else NULL end;
   IF v_template IS NOT NULL THEN PERFORM public.queue_recruitment_email(new,v_template,'stage-'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||'-'||v_cycle,now());END IF;
  ELSIF v_role='developer' THEN
   v_template:=case new.stage when 'Code & Portfolio Review' then 'recruitment_developer_review' when 'Initial Screening' then 'recruitment_developer_review' when 'Technical Assessment' then 'recruitment_developer_review' when 'Development Practical' then 'recruitment_developer_review' when 'Technical Interview' then 'recruitment_developer_review' when 'Selected' then 'recruitment_developer_selected' when 'Developer Academy' then 'recruitment_developer_academy' when 'Final Approval' then 'recruitment_developer_final_review' when 'Activated' then 'recruitment_developer_activated' else NULL end;
   IF v_template IS NOT NULL THEN PERFORM public.queue_recruitment_email(new,v_template,'stage-'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||'-'||v_cycle,now());END IF;
  END IF;
 END IF;
 RETURN new;
END;$$;
