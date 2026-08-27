create or replace function public.close_inactive_recruitment_tasks()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.closed_at is not null or new.stage is distinct from old.stage then
    update public.recruitment_task_instances
    set status='Revoked',
        revoked_at=now(),
        revoked_by=auth.uid(),
        token_hash=case when coalesce(template_snapshot->>'taskKey','')='sales_assessment_hub' then token_hash else null end,
        updated_at=now()
    where applicant_id=new.id
      and status in ('Issued','Viewed','In Progress')
      and (
        new.closed_at is not null
        or (
          stage<>new.stage
          and not (
            coalesce(template_snapshot->>'taskKey','')='sales_assessment_hub'
            and new.stage in ('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment','Selected','Agreement Pending','One-Day Training','Final Approval','Ready for System Access','Activated')
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
    if v_app.stage not in ('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment','Selected','Agreement Pending','One-Day Training','Final Approval','Ready for System Access','Activated') then
      raise exception 'Assessment Preparation Center access is not available for the current recruitment stage.';
    end if;
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
  v_access_state text;
  v_current_label text;
  v_next_action text;
  v_prep jsonb:='[]'::jsonb;
  v_rubrics jsonb:='{}'::jsonb;
  v_track_name text;
  v_track_description text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid assessment access link.'; end if;

  select * into v_task
  from public.recruitment_task_instances
  where token_hash is not null and token_hash=public.recruitment_task_token_hash(p_token)
    and coalesce(template_snapshot->>'taskKey','')='sales_assessment_hub'
  for update;
  if not found then raise exception 'This assessment access link is invalid or no longer active.'; end if;

  perform public.check_recruitment_task_rate_limit(v_task.id,'assessment_hub_open',180);
  select * into v_app from public.applicants where id=v_task.applicant_id;
  select * into v_job from public.career_jobs where id=v_app.career_job_id;

  v_access_state:=case
    when v_app.closed_at is not null then 'closed'
    when v_task.due_at<v_now then 'expired'
    when v_app.stage in ('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment') then 'active'
    when v_app.stage in ('Selected','Agreement Pending','One-Day Training','Final Approval','Ready for System Access','Activated') then 'completed'
    else 'inactive'
  end;

  v_current_label:=coalesce(public.recruitment_candidate_stage_label(v_app.stage),v_app.stage,'Recruitment');
  v_next_action:=case v_app.stage
    when 'Shortlisted' then 'Use this Preparation Center before the practical assessment stages and follow the latest Recruitment email for the exact next action.'
    when 'Sales Assessment' then 'Prepare for the Sales Practical Interview and use the separate interview booking email as the source of truth for date, time and meeting link.'
    when 'Lead Research Test' then 'Complete the five-business Lead Research Test using only the secure task link and deadline sent by ProFox Recruitment.'
    when 'CRM Assessment' then 'Complete the CRM Assessment using only the simulation or task instructions provided by ProFox Recruitment.'
    when 'Selected' then 'Your assessment phase is complete. Follow the latest secure email for the ProFox Independent Sales Partner Agreement.'
    when 'Agreement Pending' then 'Your assessment phase is complete. Complete or await verification of the ProFox Independent Sales Partner Agreement using the latest secure instructions.'
    when 'One-Day Training' then 'Your assessment phase is complete. Continue your protected ProFox Sales Academy onboarding using your authenticated account.'
    when 'Final Approval' then 'Your assessment phase is complete. Your Sales Academy evidence is at Final Approval; live Sales access remains protected until approval.'
    when 'Ready for System Access' then 'Your assessment phase is complete. Follow the latest protected activation/access instructions from ProFox.'
    when 'Activated' then 'Your recruitment onboarding has reached activation. Use your authenticated ProFox account for current Sales work and training records.'
    else 'Follow the latest message from the ProFox Recruitment Team.'
  end;

  select name,description into v_track_name,v_track_description from public.training_tracks where track_key='sales_assessment_prep' and active=true;

  if v_access_state in ('active','completed') then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'number',ttm.sort_order,
        'title',tm.title,
        'description',coalesce(tm.description,''),
        'moduleType',tm.module_type,
        'lessons',coalesce((
          select jsonb_agg(jsonb_build_object('title',tl.title,'content',coalesce(tl.content,''),'sortOrder',coalesce(tl.sort_order,0)) order by coalesce(tl.sort_order,0),tl.title)
          from public.training_lessons tl where tl.module_id=tm.id and coalesce(tl.active,true)=true
        ),'[]'::jsonb)
      ) order by ttm.sort_order
    ),'[]'::jsonb)
    into v_prep
    from public.training_track_modules ttm
    join public.training_modules tm on tm.id=ttm.module_id
    where ttm.track_key='sales_assessment_prep' and coalesce(tm.active,true)=true;

    v_rubrics:=jsonb_build_object(
      'salesPractical',coalesce((select jsonb_build_object('title','Sales Practical Interview','passingScore',p.passing_score,'rubric',coalesce(p.rubric,'[]'::jsonb)) from public.recruitment_stage_policies p where p.job_id=v_app.career_job_id and p.stage='Sales Assessment' and p.active=true order by p.updated_at desc limit 1),jsonb_build_object('title','Sales Practical Interview','passingScore',null,'rubric','[]'::jsonb)),
      'leadResearch',coalesce((select jsonb_build_object('title','Lead Research Test','passingScore',p.passing_score,'rubric',coalesce(p.rubric,'[]'::jsonb)) from public.recruitment_stage_policies p where p.job_id=v_app.career_job_id and p.stage='Lead Research Test' and p.active=true order by p.updated_at desc limit 1),jsonb_build_object('title','Lead Research Test','passingScore',null,'rubric','[]'::jsonb)),
      'crmAssessment',coalesce((select jsonb_build_object('title','CRM Assessment','passingScore',p.passing_score,'rubric',coalesce(p.rubric,'[]'::jsonb)) from public.recruitment_stage_policies p where p.job_id=v_app.career_job_id and p.stage='CRM Assessment' and p.active=true order by p.updated_at desc limit 1),jsonb_build_object('title','CRM Assessment','passingScore',null,'rubric','[]'::jsonb))
    );
  end if;

  if v_access_state in ('active','completed') and v_task.viewed_at is null then
    update public.recruitment_task_instances
    set viewed_at=v_now,status=case when status='Issued' then 'Viewed' else status end,updated_at=v_now
    where id=v_task.id returning * into v_task;
    perform public.log_applicant_event(v_app.id,'Recruitment','Assessment Preparation Center Viewed','Sales Assessment Preparation Center opened','Candidate opened the secure Sales Assessment Preparation Center.',null,'Viewed','Candidate',null,'recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_app.stage,'taskKey','sales_assessment_hub','accessState',v_access_state));
  end if;

  v_current_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);
  v_sales_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,'Sales Assessment');
  v_lead_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,'Lead Research Test');
  v_crm_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,'CRM Assessment');

  return jsonb_build_object(
    'title',coalesce(v_track_name,'ProFox Sales Assessment Preparation Center'),
    'description',coalesce(v_track_description,'Practical preparation for the ProFox Sales assessment journey.'),
    'accessState',v_access_state,'readOnly',v_access_state<>'active',
    'candidateName',v_app.full_name,'applicationReference',v_app.application_reference,
    'roleTitle',coalesce(v_job.title,v_app.position),'currentStage',v_app.stage,'currentStageLabel',v_current_label,
    'nextAction',v_next_action,'dueAt',v_task.due_at,
    'instructions',coalesce(v_task.template_snapshot->'instructions','[]'::jsonb),
    'roleOverview',coalesce(v_job.role_details->>'roleOverview',''),
    'focusMarkets',coalesce(v_job.role_details->'focusMarkets','[]'::jsonb),
    'targetCustomers',coalesce(v_job.role_details->'targetCustomers','[]'::jsonb),
    'workingArrangement',coalesce(v_job.role_details->'workingArrangement','{}'::jsonb),
    'supportEmail','admin@profoxwebdesigner.com',
    'steps',jsonb_build_array(
      jsonb_build_object('number',1,'title','Sales Practical Interview','description','A structured practical interview covering communication, discovery, listening, solution judgment, objection handling and next-step control. Booking details are sent separately by email.','status',case when coalesce(v_current_rank,0)>coalesce(v_sales_rank,999) then 'Completed' when v_current_rank=v_sales_rank then 'Current' else 'Upcoming' end),
      jsonb_build_object('number',2,'title','Lead Research Test','description','Research and qualify five businesses using public information, evidence and clear reasoning. Use only the secure task link sent by ProFox.','status',case when coalesce(v_current_rank,0)>coalesce(v_lead_rank,999) then 'Completed' when v_current_rank=v_lead_rank then 'Current' else 'Upcoming' end),
      jsonb_build_object('number',3,'title','CRM Assessment','description','Demonstrate clear records, truthful status discipline, useful notes, follow-ups and next actions using only the assessment simulation/instructions provided by ProFox.','status',case when coalesce(v_current_rank,0)>coalesce(v_crm_rank,999) then 'Completed' when v_current_rank=v_crm_rank then 'Current' else 'Upcoming' end)
    ),
    'rubrics',v_rubrics,'preparationSections',v_prep,
    'academyRule','The Preparation Center is pre-selection learning only. Full ProFox Sales Academy account access is granted only after selection and verification of the signed Sales Partner Agreement. Live Sales and CRM access remains locked until the required Academy, Final Approval and activation gates are complete.'
  );
end;
$function$;

grant execute on function public.public_open_sales_assessment_hub(text) to anon, authenticated;

update public.notification_templates
set subject_template='You are shortlisted: open your ProFox Sales Assessment Preparation Center',
    body_template=$body$Hi {{fullName}},

You have been shortlisted for the {{roleTitle}} opportunity at ProFox.

Before the practical assessment stages, use your secure Sales Assessment Preparation Center:
{{taskUrl}}

This is a practical preparation resource, not just an assessment overview. It contains short learning sections, worked examples, practice exercises, self-checks and readiness checklists for:
1. Sales Practical Interview
2. Lead Research Test - 5 researched businesses
3. CRM Assessment

Use it to practise before each stage. Your separate ProFox Recruitment emails remain the source of truth for the actual interview date/time, secure assessment link, deadline and submission action.

Important:
- Practise with fictional or non-assessment examples; do not copy training examples into your live submission.
- Do not create another ProFox account.
- This Preparation Center does not provide live CRM, customer or active Sales access.
- Full Sales Academy access is issued only after selection and verification of the signed Sales Partner Agreement.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,
    html_template=$html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#000080">PROFOX SALES ASSESSMENT</div><h1 style="font-size:24px;line-height:32px;margin:8px 0 14px">Your Preparation Center is ready</h1><p style="font-size:15px;line-height:24px;color:#334155">Hi {{fullName}},<br><br>You have been shortlisted for the {{roleTitle}} opportunity. Before the practical assessments, use this secure Preparation Center to <strong>learn, see examples, practise and check your readiness</strong>.</p><p><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700">Open Preparation Center</a></p><div style="margin-top:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:14px;line-height:23px;color:#334155"><strong>Prepare for:</strong><br>1. Sales Practical Interview<br>2. Lead Research Test - 5 businesses<br>3. CRM Assessment</div><p style="font-size:13px;line-height:21px;color:#64748b">Your separate Recruitment emails remain the source of truth for live dates, secure assessment links and deadlines. This center is preparation-only and does not grant live CRM or Sales access.</p><p style="font-size:13px;color:#64748b">Application reference: {{applicationReference}}<br>Support: {{supportEmail}}</p></td></tr></table></td></tr></table></body></html>$html$,
    description='Sent at Shortlisted with the secure, admin-editable Sales Assessment Preparation Center and three-step practical roadmap.',updated_at=now()
where template_key='recruitment_shortlisted';

update public.notification_templates
set name='Sales Assessment Preparation Center Access',
    subject_template='Your ProFox Sales Assessment Preparation Center is available',
    body_template=$body$Hi {{fullName}},

Your secure ProFox Sales Assessment Preparation Center is available.

Open it here:
{{taskUrl}}

The center is designed for practical preparation. It contains short lessons, worked examples, practice activities, self-checks, current assessment scoring criteria and readiness checklists for the Sales Practical Interview, Lead Research Test and CRM Assessment.

If you have already completed the assessment phase, the same secure center will show your progress as complete and explain the next recruitment step instead of showing a broken assessment page.

Please continue from your current recruitment stage and follow the latest ProFox email for the exact action required.

Important:
- Do not create another ProFox account.
- This center does not grant live CRM, customer or active Sales access.
- Full Sales Academy account access is issued only after selection and verification of the signed Sales Partner Agreement.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,
    html_template=$html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#000080">PROFOX SALES ASSESSMENT</div><h1 style="font-size:24px;line-height:32px;margin:8px 0 16px">Your Sales Assessment Preparation Center is available</h1><p style="font-size:15px;line-height:24px;color:#334155">Hi {{fullName}},<br><br>Your secure preparation center is ready. It is organized around <strong>Learn, Example, Practice and Check</strong> so you can build confidence before each assessment stage.</p><p><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700">Open Preparation Center</a></p><div style="margin-top:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:14px;line-height:23px;color:#334155"><strong>1. Sales Practical Interview</strong><br><strong>2. Lead Research Test</strong> - 5 researched businesses<br><strong>3. CRM Assessment</strong></div><p style="font-size:13px;line-height:21px;color:#64748b">Follow the most recent ProFox Recruitment email for the exact action required at your current stage. The center remains a preparation/reference resource and does not grant production Sales or CRM access.</p><p style="font-size:13px;color:#64748b">Application reference: {{applicationReference}}<br>Support: {{supportEmail}}</p></td></tr></table></td></tr></table></body></html>$html$,
    active=true,description='Secure stage-neutral access email for the admin-editable ProFox Sales Assessment Preparation Center.',updated_at=now()
where template_key='recruitment_assessment_guide_access';
