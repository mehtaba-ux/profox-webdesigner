-- Organize the Sales recruitment assessment journey without weakening post-agreement Academy access.

insert into public.recruitment_task_templates(
  task_key,system_role,stage,title,description,target_market,target_niche,
  required_items,deadline_hours,estimated_minutes,max_attempts,instructions,version,active
)
select
  'sales_assessment_hub','sales','Shortlisted','ProFox Sales Assessment Guide',
  'Your assessment onboarding guide for the ProFox Independent Commission-Based Sales Representative selection process.',
  'United States, United Kingdom, Canada and Australia','ProFox target customer niches',
  1,720,15,1,
  jsonb_build_array(
    'Review the role, commission-based working model and assessment sequence before starting the practical stages.',
    'Step 1 is the Sales Practical Interview. Your separate booking email contains the confirmed date, time and Google Meet link.',
    'Step 2 is the Lead Research Test. Use only the secure task link sent by ProFox and submit five researched businesses with public evidence.',
    'Step 3 is the CRM Assessment. Follow only the assessment instructions sent by the Recruitment Team and do not use real customer data unless explicitly authorized.',
    'This assessment access is not an employment offer and does not provide live Sales or CRM permissions.',
    'Full ProFox Sales Academy account access is issued only after selection and verification of the signed Sales Partner Agreement.'
  ),1,true
where not exists (
  select 1 from public.recruitment_task_templates
  where task_key='sales_assessment_hub' and system_role='sales' and stage='Shortlisted' and active=true
);

create or replace function public.close_inactive_recruitment_tasks()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.closed_at is not null or new.stage is distinct from old.stage then
    update public.recruitment_task_instances
    set status='Revoked',revoked_at=now(),revoked_by=auth.uid(),token_hash=null,updated_at=now()
    where applicant_id=new.id
      and status in ('Issued','Viewed','In Progress')
      and (
        new.closed_at is not null
        or (
          stage<>new.stage
          and not (
            coalesce(template_snapshot->>'taskKey','')='sales_assessment_hub'
            and new.stage in ('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment')
          )
        )
      );
  end if;
  return new;
end;
$function$;

create or replace function public.service_prepare_recruitment_task_delivery(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_token text;
  v_task_key text;
  v_is_assessment_hub boolean;
  v_task_url text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required.'; end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_is_assessment_hub:=v_task_key='sales_assessment_hub';
  if v_task.status not in ('Issued','Viewed','In Progress') then raise exception 'Recruitment task is not eligible for link delivery.'; end if;
  if v_task.due_at<now() then raise exception 'Recruitment task deadline has passed.'; end if;
  if v_app.closed_at is not null then raise exception 'Recruitment task is no longer active.'; end if;
  if v_is_assessment_hub then
    if v_app.stage not in ('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment') then raise exception 'Assessment onboarding access is no longer active.'; end if;
  elsif v_app.stage<>v_task.stage then
    raise exception 'Recruitment task is no longer active.';
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  update public.recruitment_task_instances set token_hash=public.recruitment_task_token_hash(v_token),updated_at=now() where id=v_task.id;
  v_task_url:=case when v_is_assessment_hub
    then 'https://calabtayklhltyiriiwo.supabase.co/functions/v1/sales-assessment-hub?token='||v_token
    else 'https://www.profoxwebdesigner.com/recruitment/task/'||v_token end;
  return jsonb_build_object(
    'taskUrl',v_task_url,'taskKey',v_task_key,'taskTitle',v_task.template_snapshot->>'title',
    'taskDueDate',to_char(v_task.due_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),
    'taskEstimatedTime',(v_task.template_snapshot->>'estimatedMinutes')||' minutes',
    'taskRequiredItems',v_task.template_snapshot->>'requiredItems','taskTargetMarket',v_task.template_snapshot->>'targetMarket',
    'taskTargetNiche',v_task.template_snapshot->>'targetNiche','taskAttempt',v_task.attempt_no,'taskFeedback',v_task.retry_feedback
  );
end;
$function$;

create or replace function public.public_open_sales_assessment_hub(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_job public.career_jobs%rowtype;
  v_now timestamptz:=now();
  v_current_rank integer;
  v_sales_rank integer;
  v_lead_rank integer;
  v_crm_rank integer;
  v_current_label text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid assessment access link.'; end if;
  select * into v_task from public.recruitment_task_instances
  where token_hash is not null and token_hash=public.recruitment_task_token_hash(p_token)
    and coalesce(template_snapshot->>'taskKey','')='sales_assessment_hub' for update;
  if not found then raise exception 'This assessment access link is invalid or no longer active.'; end if;
  perform public.check_recruitment_task_rate_limit(v_task.id,'assessment_hub_open',180);
  select * into v_app from public.applicants where id=v_task.applicant_id;
  select * into v_job from public.career_jobs where id=v_app.career_job_id;
  if v_task.status='Revoked' or v_app.closed_at is not null then raise exception 'This assessment access has been closed. Contact the ProFox Recruitment Team if you need help.'; end if;
  if v_task.due_at<v_now then raise exception 'This assessment guide link has expired. Contact the ProFox Recruitment Team for assistance.'; end if;
  if v_app.stage not in ('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment') then raise exception 'This assessment guide is no longer active for your current recruitment stage.'; end if;
  if v_task.viewed_at is null then
    update public.recruitment_task_instances set viewed_at=v_now,status=case when status='Issued' then 'Viewed' else status end,updated_at=v_now where id=v_task.id returning * into v_task;
    perform public.log_applicant_event(v_app.id,'Recruitment','Assessment Guide Viewed','Sales Assessment Guide opened','Candidate opened the secure Sales Assessment onboarding guide.',null,'Viewed','Candidate',null,'recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_app.stage,'taskKey','sales_assessment_hub'));
  end if;
  v_current_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);
  v_sales_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,'Sales Assessment');
  v_lead_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,'Lead Research Test');
  v_crm_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,'CRM Assessment');
  v_current_label:=case v_app.stage when 'Sales Assessment' then 'Sales Practical Interview' when 'Lead Research Test' then 'Lead Research Test' when 'CRM Assessment' then 'CRM Assessment' else 'Assessment Onboarding' end;
  return jsonb_build_object(
    'title',v_task.template_snapshot->>'title','description',v_task.template_snapshot->>'description','candidateName',v_app.full_name,
    'applicationReference',v_app.application_reference,'roleTitle',coalesce(v_job.title,v_app.position),'currentStage',v_app.stage,
    'currentStageLabel',v_current_label,'dueAt',v_task.due_at,'instructions',coalesce(v_task.template_snapshot->'instructions','[]'::jsonb),
    'roleOverview',coalesce(v_job.role_details->>'roleOverview',''),'focusMarkets',coalesce(v_job.role_details->'focusMarkets','[]'::jsonb),
    'targetCustomers',coalesce(v_job.role_details->'targetCustomers','[]'::jsonb),'workingArrangement',coalesce(v_job.role_details->'workingArrangement','{}'::jsonb),
    'supportEmail','admin@profoxwebdesigner.com',
    'steps',jsonb_build_array(
      jsonb_build_object('number',1,'title','Sales Practical Interview','description','A structured practical interview covering communication, discovery, listening, objection handling and next-step control. Booking details are sent separately by email.','status',case when v_current_rank>v_sales_rank then 'Completed' when v_current_rank=v_sales_rank then 'Current' else 'Upcoming' end),
      jsonb_build_object('number',2,'title','Lead Research Test','description','Research and qualify five businesses using public information, evidence and clear reasoning. Use only the secure test link sent by ProFox.','status',case when v_current_rank>v_lead_rank then 'Completed' when v_current_rank=v_lead_rank then 'Current' else 'Upcoming' end),
      jsonb_build_object('number',3,'title','CRM Assessment','description','Demonstrate clear lead records, notes, follow-ups, meetings and next actions in the assessment process. Do not use live customer data unless ProFox explicitly authorizes it.','status',case when v_current_rank>v_crm_rank then 'Completed' when v_current_rank=v_crm_rank then 'Current' else 'Upcoming' end)
    ),
    'academyRule','Full ProFox Sales Academy account access is granted only after selection and verification of the signed Sales Partner Agreement. Live Sales and CRM access remains locked until Academy completion, Final Approval and activation.'
  );
end;
$function$;

grant execute on function public.public_open_sales_assessment_hub(text) to anon, authenticated;

create or replace function public.recruitment_candidate_stage_label(p_stage text)
returns text language sql immutable as $function$
select case p_stage when 'Sales Assessment' then 'Sales Practical Interview' when 'One-Day Training' then 'Sales Academy Onboarding' when 'Ready for System Access' then 'Ready for Sales Access' else p_stage end;
$function$;

update public.career_jobs
set selection_process=jsonb_build_array(
  jsonb_build_object('title','Apply','text','Submit your application and required English introduction video.'),
  jsonb_build_object('title','Application review','text','We review communication, experience, role fit and the information provided in your application.'),
  jsonb_build_object('title','Initial screening','text','Qualified candidates complete a structured screening interview.'),
  jsonb_build_object('title','Assessment onboarding','text','Shortlisted candidates receive the ProFox Sales Assessment Guide and clear instructions for the practical selection stages.'),
  jsonb_build_object('title','Sales assessments','text','Complete the Sales Practical Interview, five-business Lead Research Test and CRM Assessment.'),
  jsonb_build_object('title','Selection and agreement','text','Candidates who pass the required assessments may be selected to review and sign the ProFox Independent Sales Partner Agreement.'),
  jsonb_build_object('title','Sales Academy onboarding','text','After the agreement is verified, approved candidates receive a protected onboarding account for the required 20-module Sales Academy, practical reviews and final certification.'),
  jsonb_build_object('title','Final approval and activation','text','ProFox reviews Academy evidence and readiness before live Sales access is activated.')
),updated_at=now()
where id='6672b102-bf96-4f68-aa0b-a0224587a5fe';

update public.notification_templates set subject_template='You are shortlisted: start your ProFox Sales Assessment onboarding',body_template=$body$Hi {{fullName}},

You have been shortlisted for the {{roleTitle}} opportunity at ProFox.

Your next phase is the ProFox Sales Assessment. Before the practical stages begin, review your secure Assessment Guide:
{{taskUrl}}

Your assessment sequence:
1. Sales Practical Interview - communication, discovery, listening, objection handling and next-step control. Your confirmed date, time and Google Meet link will arrive in a separate booking email.
2. Lead Research Test - research and qualify 5 businesses using public information, evidence and clear reasoning. A separate secure test link and deadline will be emailed when you reach this step.
3. CRM Assessment - demonstrate accurate lead records, notes, follow-ups, meetings and next actions using only the assessment instructions provided by ProFox.

Important:
- Follow only the latest ProFox Recruitment email for each assessment step.
- Do not create another candidate or Sales account.
- Assessment access is not an employment offer and does not provide live Sales or CRM permissions.
- Full Sales Academy account access is issued only after selection and verification of the signed Sales Partner Agreement.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,description='Sent at Shortlisted with secure Sales Assessment onboarding guide and full three-step assessment roadmap.',updated_at=now() where template_key='recruitment_shortlisted';

update public.notification_templates set subject_template='Next step: ProFox Sales Practical Interview',body_template=$body$Hi {{fullName}},

You have progressed to Step 1 of 3 in the ProFox Sales Assessment: the Sales Practical Interview.

What we assess:
- clear, professional English communication
- discovery and listening
- ability to understand a prospect's needs
- objection handling and judgment
- ability to move a conversation toward a clear next action

Your interview date, local time, interviewer, duration and Google Meet link are sent in the separate interview booking confirmation. Please use that booking email as the source of truth for meeting details.

Prepare by reviewing the role and ProFox service context already provided. Do not memorize a script. We want to understand how you think and communicate in a realistic sales conversation.

After this step is reviewed, successful candidates progress to the 5-business Lead Research Test.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,description='Step 1 of 3 candidate instructions for the structured Sales Practical Interview.',updated_at=now() where template_key='recruitment_sales_assessment';

update public.notification_templates set subject_template='Step 2 of 3: Complete your ProFox Lead Research Test',body_template=$body$Hi {{fullName}},

You have progressed to Step 2 of 3 in the ProFox Sales Assessment: the Lead Research Test.

Task: {{taskTitle}}
Target market: {{taskTargetMarket}}
Target niche: {{taskTargetNiche}}
Businesses required: {{taskRequiredItems}}
Estimated time: {{taskEstimatedTime}}
Deadline: {{taskDueDate}}

Use only publicly available business information. Accuracy, evidence and reasoning matter more than finding perfect prospects. Do not submit private personal information.

Start or continue your secure test:
{{taskUrl}}

Your work saves as a draft and you can return using the same secure link until final submission. After you submit, the attempt becomes read-only while ProFox reviews it.

Successful candidates progress to Step 3: CRM Assessment.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,description='Step 2 of 3 secure candidate task invitation for the five-business Lead Research Test.',updated_at=now() where template_key='recruitment_lead_research';

update public.notification_templates set subject_template='Step 3 of 3: ProFox CRM Assessment',body_template=$body$Hi {{fullName}},

You have progressed to Step 3 of 3 in the ProFox Sales Assessment: the CRM Assessment.

This stage evaluates whether you can keep a sales pipeline accurate and actionable. You may be asked to demonstrate how you would:
- create or update a lead correctly
- record useful notes and activity history
- set a clear next action and follow-up date
- keep meeting and follow-up information organized
- use the correct pipeline status without overstating progress

Important assessment rules:
- Follow only the task or simulation instructions provided by the ProFox Recruitment Team.
- Do not create a second ProFox account.
- Do not enter or copy real customer information unless ProFox explicitly authorizes it for the assessment.
- This assessment does not provide live production CRM or customer access.

After this assessment is reviewed, candidates who pass all required selection gates move to the Selection Review. If selected, the next controlled step is the ProFox Independent Sales Partner Agreement.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,description='Step 3 of 3 CRM simulation guidance with explicit data and production-access protections.',updated_at=now() where template_key='recruitment_crm_assessment';

update public.notification_templates set subject_template='Selected to continue: ProFox Sales Partner Agreement next',body_template=$body$Hi {{fullName}},

You have successfully completed the required ProFox sales selection assessments and have been selected to continue.

Your next controlled step is the ProFox Independent Sales Partner Agreement. Please review the agreement carefully when the secure signing email is sent.

What happens after the agreement is signed and verified:
1. ProFox issues your protected Sales Academy onboarding account.
2. You receive a secure account setup link by email.
3. You complete the required 20-module Sales Academy, practical reviews and final certification.
4. ProFox completes Final Approval.
5. Live Sales access is activated only after all required gates are passed.

Do not create a separate ProFox account. Receiving this selection notice does not yet provide live Sales or CRM access.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,description='Selection decision email explaining agreement, protected Sales Academy onboarding and activation sequence.',updated_at=now() where template_key='recruitment_selected';

update public.notification_templates set subject_template='Set up your ProFox Sales Academy onboarding access',body_template=$body$Hi {{fullName}},

Your verified ProFox Independent Sales Partner Agreement is complete, and your protected Sales Academy onboarding account is ready.

Set up your account using this secure link:
{{accountInviteUrl}}

Your onboarding track contains the required 20-module ProFox Sales Academy, including product and package training, niche training, lead research, outreach, meeting booking, discovery, call practice, mock call review, presentation, objection handling, closing, quotation, payment process, CRM, calendar setup, confidentiality and final certification.

Important access rules:
- This account is for onboarding and training while recruitment is still in progress.
- Do not create a second account. If this link does not work, contact ProFox Recruitment.
- Live CRM, customer and active Sales permissions remain locked until the required Academy gates, Final Approval and activation are complete.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,description='Secure account setup email issued only after verified Sales Partner Agreement, with full Sales Academy onboarding scope and access rules.',updated_at=now() where template_key='recruitment_account_invite';

update public.notification_templates set subject_template='ProFox Sales Academy onboarding has started',body_template=$body$Hi {{fullName}},

Your agreement is verified and your ProFox Sales Academy onboarding has started.

Complete every required module, assessment, practical review and final certification assigned to your Sales training track. Your progress and required review gates determine when you can move to Final Approval.

Training access is not live Sales access. CRM, customer and active selling permissions remain protected until the Academy requirements are complete, Final Approval is granted and your account is activated.

If you have not completed your secure account setup, use the most recent ProFox Sales Academy account invitation email. Do not create another account.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Sales Academy
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,description='Candidate-facing Sales Academy onboarding stage message. Replaces the misleading One-Day Training wording without changing the protected database stage key.',updated_at=now() where template_key='recruitment_training';