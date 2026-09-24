-- Reuse the existing notification outbox and email standard. All copy is ASCII-safe
-- because the live ProFox email-quality trigger rejects emoji and em dashes.

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,html_template,description,active,updated_at)
VALUES
('recruitment_sales_practical_assessment','Recruitment - Sales Practical Assessment','Certification step 1: Sales Practical Assessment - {{applicationReference}}','Hi {{fullName}},\n\nYou have completed the Sales Academy training phase. Your formal ProFox competency certification now begins.\n\nStep 1 of 3 is the Sales Practical Assessment. This evaluates discovery, listening, solution positioning, objection handling and clear next-step control using the process you learned in the Academy.\n\nIf an interview booking is required, use the separate booking confirmation as the source of truth for the date, time and meeting link.\n\nPassing this stage moves you to the Lead Research Assessment.\n\nRegards,\nProFox Recruitment Team','<div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:28px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #000080;padding:28px;border-radius:10px"><h2 style="color:#000080;margin-top:0">Sales Practical Assessment</h2><p>Hi {{fullName}},</p><p>You have completed the <strong>Sales Academy training phase</strong>. Your formal ProFox competency certification now begins.</p><p><strong>Step 1 of 3:</strong> Sales Practical Assessment.</p><p>This evaluates discovery, listening, solution positioning, objection handling and clear next-step control using the process you learned in the Academy.</p><p>If an interview booking is required, use the separate booking confirmation as the source of truth for the date, time and meeting link.</p><p>Passing this stage moves you to the <strong>Lead Research Assessment</strong>.</p><p>Regards,<br>ProFox Recruitment Team</p></div></div>','Post-Academy Sales practical certification invitation.',true,now()),
('recruitment_final_certification','Recruitment - Final Certification','Final Certification - {{applicationReference}}','Hi {{fullName}},\n\nYou have passed the Sales Practical, Lead Research and CRM assessments. Your final competency gate is now available.\n\nComplete the protected Final Certification inside the ProFox Sales Academy. The configured passing score, Management review and zero-critical-failure requirements remain mandatory.\n\nAfter you pass Final Certification, submit the protected Final Approval request.\n\nRegards,\nProFox Recruitment Team','<div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:28px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #000080;padding:28px;border-radius:10px"><h2 style="color:#000080;margin-top:0">Final Certification</h2><p>Hi {{fullName}},</p><p>You have passed the <strong>Sales Practical, Lead Research and CRM assessments</strong>.</p><p>Your final competency gate is now available inside the protected ProFox Sales Academy.</p><p>The configured passing score, Management review and zero-critical-failure requirements remain mandatory.</p><p>After you pass Final Certification, submit the protected <strong>Final Approval</strong> request.</p><p>Regards,<br>ProFox Recruitment Team</p></div></div>','Final certification invitation after all post-Academy competency assessments pass.',true,now())
ON CONFLICT (template_key) DO UPDATE SET name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,html_template=excluded.html_template,description=excluded.description,active=true,updated_at=now();

CREATE OR REPLACE FUNCTION public.queue_sales_post_academy_stage_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_template text;
BEGIN
 IF new.stage IS NOT DISTINCT FROM old.stage OR coalesce(public.career_job_system_role(new.career_job_id),'')<>'sales' OR coalesce(trim(new.refusal_reason),'')<>'' OR new.closed_at IS NOT NULL THEN RETURN new;END IF;
 v_template:=CASE new.stage WHEN 'Sales Practical Assessment' THEN 'recruitment_sales_practical_assessment' WHEN 'Final Certification' THEN 'recruitment_final_certification' ELSE NULL END;
 IF v_template IS NULL THEN RETURN new;END IF;
 PERFORM public.enqueue_notification(
  'recruitment:'||new.id::text||':stage:'||replace(lower(new.stage),' ','-')||':'||coalesce(to_char(new.stage_entered_at,'YYYYMMDDHH24MISSUS'),'na'),
  v_template,lower(trim(new.email)),new.linked_user_id,
  public.recruitment_notification_payload(new)||jsonb_build_object('stageLabel',public.recruitment_candidate_stage_label(new.stage)),now());
 RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS trg_queue_sales_post_academy_stage_notifications ON public.applicants;
CREATE TRIGGER trg_queue_sales_post_academy_stage_notifications
AFTER UPDATE OF stage ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.queue_sales_post_academy_stage_notifications();

UPDATE public.notification_templates SET
 subject_template='Shortlisted - Sales Suitability Assessment next - {{applicationReference}}',
 body_template='Hi {{fullName}},\n\nYou have been shortlisted for the ProFox Independent Commission-Based Sales Representative opportunity.\n\nYour next step is the Sales Suitability Assessment. This early assessment checks communication, listening, general sales judgment, professionalism and coachability. You are not expected to know the ProFox-specific CRM or lead-research process yet.\n\nIf you pass, you will be Conditional Selected, complete the Sales Partner Agreement, and then receive Sales Academy training before the formal competency assessments.\n\nRegards,\nProFox Recruitment Team',
 html_template='<div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:28px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #000080;padding:28px;border-radius:10px"><h2 style="color:#000080;margin-top:0">You are shortlisted</h2><p>Hi {{fullName}},</p><p>Your next step is the <strong>Sales Suitability Assessment</strong>.</p><p>This early assessment checks communication, listening, general sales judgment, professionalism and coachability. You are <strong>not expected to know the ProFox-specific CRM or lead-research process yet</strong>.</p><p>If you pass, you will be <strong>Conditional Selected</strong>, complete the Sales Partner Agreement, and then receive Sales Academy training before formal competency assessments.</p><p>Regards,<br>ProFox Recruitment Team</p></div></div>',updated_at=now()
WHERE template_key='recruitment_shortlisted';

UPDATE public.notification_templates SET
 name='Recruitment - Sales Suitability Assessment',
 subject_template='Next step: Sales Suitability Assessment - {{applicationReference}}',
 body_template='Hi {{fullName}},\n\nYou are now at the Sales Suitability Assessment.\n\nThis is a pre-training suitability check covering communication, listening, general sales judgment, professionalism and coachability. It does not test ProFox-specific CRM, lead research, quotation or payment procedures.\n\nIf an interview booking is required, use the separate booking confirmation for the exact meeting details.\n\nPassing this stage moves you to Conditional Selected.\n\nRegards,\nProFox Recruitment Team',
 html_template='<div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:28px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #000080;padding:28px;border-radius:10px"><h2 style="color:#000080;margin-top:0">Sales Suitability Assessment</h2><p>Hi {{fullName}},</p><p>This is a <strong>pre-training suitability check</strong> covering communication, listening, general sales judgment, professionalism and coachability.</p><p>It does not test ProFox-specific CRM, lead research, quotation or payment procedures.</p><p>If an interview booking is required, use the separate booking confirmation for exact meeting details.</p><p>Passing this stage moves you to <strong>Conditional Selected</strong>.</p><p>Regards,<br>ProFox Recruitment Team</p></div></div>',updated_at=now()
WHERE template_key='recruitment_sales_assessment';

UPDATE public.notification_templates SET
 name='Recruitment - Conditional Selected',
 subject_template='Conditional Selected - Agreement next - {{applicationReference}}',
 body_template='Hi {{fullName}},\n\nCongratulations. You have passed the recruitment suitability stage and are now Conditional Selected.\n\nThis is not activation or live Sales access. Your next required step is the ProFox Independent Sales Partner Agreement. After the agreement is verified, you will receive Sales Academy access.\n\nThe formal Sales Practical, Lead Research and CRM assessments happen after Academy training, followed by Final Certification, Final Approval, System Access and activation.\n\nRegards,\nProFox Recruitment Team',
 html_template='<div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:28px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #000080;padding:28px;border-radius:10px"><h2 style="color:#000080;margin-top:0">Conditional Selected</h2><p>Hi {{fullName}},</p><p>Congratulations. You have passed the recruitment suitability stage and are now <strong>Conditional Selected</strong>.</p><p>This is not activation or live Sales access. Your next required step is the <strong>ProFox Independent Sales Partner Agreement</strong>.</p><p>After agreement verification, you will receive Sales Academy access. Formal Sales Practical, Lead Research and CRM assessments happen after Academy training, followed by Final Certification, Final Approval, System Access and activation.</p><p>Regards,<br>ProFox Recruitment Team</p></div></div>',updated_at=now()
WHERE template_key='recruitment_selected';

UPDATE public.notification_templates SET
 subject_template='Sales Academy access - train before certification - {{applicationReference}}',
 body_template='Hi {{fullName}},\n\nYour verified agreement is complete and your ProFox Sales Academy onboarding is ready.\n\nComplete the required training, practice and Management-reviewed Academy gates first. After the Academy training phase is complete, your formal certification sequence will be: Sales Practical Assessment, Lead Research Assessment, CRM Assessment, then Final Certification.\n\nOnly after those gates, Final Approval and System Access can you be Activated for live Sales work.\n\nRegards,\nProFox Recruitment Team',
 html_template='<div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:28px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #000080;padding:28px;border-radius:10px"><h2 style="color:#000080;margin-top:0">ProFox Sales Academy</h2><p>Hi {{fullName}},</p><p>Your verified agreement is complete and your <strong>Sales Academy onboarding</strong> is ready.</p><p>Complete the required training, practice and Management-reviewed gates first.</p><p>After training, your formal certification sequence is <strong>Sales Practical Assessment, Lead Research Assessment, CRM Assessment, then Final Certification</strong>.</p><p>Final Approval and System Access must still be completed before activation for live Sales work.</p><p>Regards,<br>ProFox Recruitment Team</p></div></div>',updated_at=now()
WHERE template_key='recruitment_training';

UPDATE public.notification_templates SET
 name='Recruitment - Lead Research Assessment',
 subject_template='Certification step 2: Lead Research Assessment - {{applicationReference}}',
 body_template='Hi {{fullName}},\n\nYou passed the Sales Practical Assessment. Step 2 of 3 is the Lead Research Assessment.\n\nUse only the secure ProFox recruitment task link and current deadline. Apply the lead research and qualification standards you learned in the Sales Academy.\n\nPassing this stage moves you to the CRM Assessment.\n\nRegards,\nProFox Recruitment Team',
 html_template='<div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:28px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #000080;padding:28px;border-radius:10px"><h2 style="color:#000080;margin-top:0">Lead Research Assessment</h2><p>Hi {{fullName}},</p><p>You passed the Sales Practical Assessment. <strong>Step 2 of 3</strong> is the Lead Research Assessment.</p><p>Use only the secure ProFox recruitment task link and current deadline. Apply the research and qualification standards learned in the Sales Academy.</p><p>Passing this stage moves you to the <strong>CRM Assessment</strong>.</p><p>Regards,<br>ProFox Recruitment Team</p></div></div>',updated_at=now()
WHERE template_key='recruitment_lead_research';

UPDATE public.notification_templates SET
 subject_template='Certification step 3: CRM Assessment - {{applicationReference}}',
 body_template='Hi {{fullName}},\n\nYou passed the Lead Research Assessment. Step 3 of 3 is the CRM Assessment.\n\nDemonstrate the ProFox CRM process you learned in the Sales Academy: accurate records, correct pipeline and status discipline, useful notes, clear next activities and reliable data ownership.\n\nPassing this stage unlocks Final Certification.\n\nRegards,\nProFox Recruitment Team',
 html_template='<div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:28px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #000080;padding:28px;border-radius:10px"><h2 style="color:#000080;margin-top:0">CRM Assessment</h2><p>Hi {{fullName}},</p><p>You passed the Lead Research Assessment. <strong>Step 3 of 3</strong> is the CRM Assessment.</p><p>Demonstrate the ProFox CRM process learned in the Sales Academy: accurate records, correct pipeline and status discipline, useful notes, clear next activities and reliable data ownership.</p><p>Passing this stage unlocks <strong>Final Certification</strong>.</p><p>Regards,<br>ProFox Recruitment Team</p></div></div>',updated_at=now()
WHERE template_key='recruitment_crm_assessment';

UPDATE public.notification_templates SET
 subject_template='Final Certification complete - Final Approval review - {{applicationReference}}',
 body_template='Hi {{fullName}},\n\nYour required training, post-Academy competency assessments and Final Certification are complete. Your application is now at Final Approval.\n\nFinal Approval is an administrative control and does not yet mean your live Sales account is Activated. After approval, System Access must be prepared before activation.\n\nRegards,\nProFox Recruitment Team',updated_at=now()
WHERE template_key='recruitment_final_review';

UPDATE public.notification_templates SET
 subject_template='Final Approval complete - System Access next - {{applicationReference}}',
 body_template='Hi {{fullName}},\n\nFinal Approval is complete. Your next stage is System Access.\n\nYour ProFox access must be prepared and verified before the final Activated stage. Until activation is confirmed, do not treat your account as authorized for live Sales work.\n\nRegards,\nProFox Recruitment Team',updated_at=now()
WHERE template_key='recruitment_final_approved';

-- Keep the public assessment preparation hub focused on the pre-training suitability stage.
CREATE OR REPLACE FUNCTION public.public_open_sales_assessment_hub(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_job public.career_jobs%rowtype;v_now timestamptz:=now();
 v_current_rank integer;v_sales_rank integer;v_access_state text;v_current_label text;v_next_action text;v_prep jsonb:='[]'::jsonb;v_rubrics jsonb:='{}'::jsonb;v_track_name text;v_track_description text;
BEGIN
 IF char_length(coalesce(p_token,''))<40 OR char_length(p_token)>200 THEN RAISE EXCEPTION 'Invalid assessment access link.';END IF;
 SELECT * INTO v_task FROM public.recruitment_task_instances WHERE token_hash IS NOT NULL AND token_hash=public.recruitment_task_token_hash(p_token) AND coalesce(template_snapshot->>'taskKey','')='sales_assessment_hub' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This assessment access link is invalid or no longer active.';END IF;
 PERFORM public.check_recruitment_task_rate_limit(v_task.id,'assessment_hub_open',180);
 SELECT * INTO v_app FROM public.applicants WHERE id=v_task.applicant_id;SELECT * INTO v_job FROM public.career_jobs WHERE id=v_app.career_job_id;
 v_access_state:=case when v_app.closed_at is not null then 'closed' when v_task.due_at<v_now then 'expired' when v_app.stage in('Shortlisted','Sales Assessment') then 'active' when v_app.stage in('Selected','Agreement Pending','Sales Academy Training','Sales Practical Assessment','Lead Research Test','CRM Assessment','Final Certification','Final Approval','Ready for System Access','Activated') then 'completed' else 'inactive' end;
 v_current_label:=coalesce(public.recruitment_candidate_stage_label(v_app.stage),v_app.stage,'Recruitment');
 v_next_action:=case v_app.stage
  when 'Shortlisted' then 'Use this Preparation Center for the Sales Suitability Assessment and follow the latest Recruitment email for the exact next action.'
  when 'Sales Assessment' then 'Prepare for the Sales Suitability Assessment. Use the separate interview booking email as the source of truth for date, time and meeting link.'
  when 'Selected' then 'Your suitability phase is complete. Follow the latest secure email for the ProFox Independent Sales Partner Agreement.'
  when 'Agreement Pending' then 'Complete or await verification of the ProFox Independent Sales Partner Agreement using the latest secure instructions.'
  when 'Sales Academy Training' then 'Continue your protected ProFox Sales Academy training. Formal competency assessments happen after training.'
  when 'Sales Practical Assessment' then 'Your formal post-Academy certification has started with the Sales Practical Assessment.'
  when 'Lead Research Test' then 'Complete the Lead Research Assessment using only the secure task link and deadline sent by ProFox Recruitment.'
  when 'CRM Assessment' then 'Complete the CRM Assessment using the current protected assessment instructions.'
  when 'Final Certification' then 'Complete Final Certification inside your protected ProFox Sales Academy account.'
  when 'Final Approval' then 'Your Final Certification is complete and the application is at Final Approval.'
  when 'Ready for System Access' then 'Final Approval is complete. Follow the protected System Access instructions.'
  when 'Activated' then 'Recruitment onboarding is complete. Use your authenticated ProFox account for live Sales work.'
  else 'Follow the latest message from the ProFox Recruitment Team.' end;
 SELECT name,description INTO v_track_name,v_track_description FROM public.training_tracks WHERE track_key='sales_assessment_prep' AND active=true;
 IF v_access_state IN('active','completed') THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('number',ttm.sort_order,'title',tm.title,'description',coalesce(tm.description,''),'moduleType',tm.module_type,'lessons',coalesce((SELECT jsonb_agg(jsonb_build_object('title',tl.title,'content',coalesce(tl.content,''),'sortOrder',coalesce(tl.sort_order,0)) ORDER BY coalesce(tl.sort_order,0),tl.title) FROM public.training_lessons tl WHERE tl.module_id=tm.id AND coalesce(tl.active,true)=true),'[]'::jsonb)) ORDER BY ttm.sort_order),'[]'::jsonb) INTO v_prep
  FROM public.training_track_modules ttm JOIN public.training_modules tm ON tm.id=ttm.module_id WHERE ttm.track_key='sales_assessment_prep' AND coalesce(tm.active,true)=true;
  v_rubrics:=jsonb_build_object(
   'salesSuitability',coalesce((SELECT jsonb_build_object('title','Sales Suitability Assessment','passingScore',p.passing_score,'rubric',coalesce(p.rubric,'[]'::jsonb)) FROM public.recruitment_stage_policies p WHERE p.job_id=v_app.career_job_id AND p.stage='Sales Assessment' AND p.active=true ORDER BY p.updated_at DESC LIMIT 1),jsonb_build_object('title','Sales Suitability Assessment','passingScore',null,'rubric','[]'::jsonb)),
   'salesPractical',coalesce((SELECT jsonb_build_object('title','Sales Practical Assessment','passingScore',p.passing_score,'rubric',coalesce(p.rubric,'[]'::jsonb)) FROM public.recruitment_stage_policies p WHERE p.job_id=v_app.career_job_id AND p.stage='Sales Practical Assessment' AND p.active=true ORDER BY p.updated_at DESC LIMIT 1),jsonb_build_object('title','Sales Practical Assessment','passingScore',null,'rubric','[]'::jsonb)),
   'leadResearch',coalesce((SELECT jsonb_build_object('title','Lead Research Assessment','passingScore',p.passing_score,'rubric',coalesce(p.rubric,'[]'::jsonb)) FROM public.recruitment_stage_policies p WHERE p.job_id=v_app.career_job_id AND p.stage='Lead Research Test' AND p.active=true ORDER BY p.updated_at DESC LIMIT 1),jsonb_build_object('title','Lead Research Assessment','passingScore',null,'rubric','[]'::jsonb)),
   'crmAssessment',coalesce((SELECT jsonb_build_object('title','CRM Assessment','passingScore',p.passing_score,'rubric',coalesce(p.rubric,'[]'::jsonb)) FROM public.recruitment_stage_policies p WHERE p.job_id=v_app.career_job_id AND p.stage='CRM Assessment' AND p.active=true ORDER BY p.updated_at DESC LIMIT 1),jsonb_build_object('title','CRM Assessment','passingScore',null,'rubric','[]'::jsonb)));
 END IF;
 IF v_access_state IN('active','completed') AND v_task.viewed_at IS NULL THEN
  UPDATE public.recruitment_task_instances SET viewed_at=v_now,status=case when status='Issued' then 'Viewed' else status end,updated_at=v_now WHERE id=v_task.id RETURNING * INTO v_task;
  PERFORM public.log_applicant_event(v_app.id,'Recruitment','Assessment Preparation Center Viewed','Sales Assessment Preparation Center opened','Candidate opened the secure Sales Assessment Preparation Center.',null,'Viewed','Candidate',null,'recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_app.stage,'taskKey','sales_assessment_hub','accessState',v_access_state));
 END IF;
 v_current_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);v_sales_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,'Sales Assessment');
 RETURN jsonb_build_object(
  'title',coalesce(v_track_name,'ProFox Sales Assessment Preparation Center'),'description',coalesce(v_track_description,'Preparation for the ProFox Sales recruitment and certification journey.'),
  'accessState',v_access_state,'readOnly',v_access_state<>'active','candidateName',v_app.full_name,'applicationReference',v_app.application_reference,
  'roleTitle',coalesce(v_job.title,v_app.position),'currentStage',v_app.stage,'currentStageLabel',v_current_label,'nextAction',v_next_action,'dueAt',v_task.due_at,
  'instructions',coalesce(v_task.template_snapshot->'instructions','[]'::jsonb),'roleOverview',coalesce(v_job.role_details->>'roleOverview',''),'focusMarkets',coalesce(v_job.role_details->'focusMarkets','[]'::jsonb),
  'targetCustomers',coalesce(v_job.role_details->'targetCustomers','[]'::jsonb),'workingArrangement',coalesce(v_job.role_details->'workingArrangement','{}'::jsonb),'supportEmail','admin@profoxwebdesigner.com',
  'steps',jsonb_build_array(
   jsonb_build_object('number',1,'title','Sales Suitability Assessment','description','Pre-training suitability check for communication, listening, general sales judgment, professionalism and coachability.','status',case when coalesce(v_current_rank,0)>coalesce(v_sales_rank,999) then 'Completed' when v_current_rank=v_sales_rank then 'Current' else 'Upcoming' end),
   jsonb_build_object('number',2,'title','Sales Academy','description','Learn and practice the ProFox service, lead research, outreach, sales, CRM, quotation and payment process before formal competency certification.','status','Upcoming'),
   jsonb_build_object('number',3,'title','Post-Academy Assessments','description','Sales Practical Assessment, Lead Research Assessment and CRM Assessment are completed after Academy training.','status','Upcoming'),
   jsonb_build_object('number',4,'title','Final Certification','description','The final protected competency gate before Final Approval and System Access.','status','Upcoming')),
  'rubrics',v_rubrics,'preparationSections',v_prep,
  'academyRule','This Preparation Center supports pre-selection readiness. Conditional selection and a verified Sales Partner Agreement come before Sales Academy. ProFox-specific competency assessments and Final Certification happen after training. Live Sales and CRM access remains locked until Final Approval, System Access and activation are complete.');
END;
$function$;
