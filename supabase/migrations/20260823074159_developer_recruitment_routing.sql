-- Shared recruitment reconciliation: preserve Sales, Content Writer and UI/UX behavior while adding Developer.
create or replace function public.admin_get_applicant_review_snapshot(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.applicants%rowtype;
  j public.career_jobs%rowtype;
  cfg jsonb;
  answers jsonb;
  checks jsonb;
  passed integer;
  total integer;
  min_months integer;
  min_hours integer;
  v_role text;
  v_is_content boolean:=false;
begin
  select * into a from public.applicants where id=p_applicant_id;
  if not found then return null; end if;
  select * into j from public.career_jobs where id=a.career_job_id;
  if not found then
    select * into j from public.career_jobs where application_type='sales_representative'
    order by(status='Published') desc,featured desc,published_at desc nulls last limit 1;
  end if;
  v_is_content:=coalesce(j.application_type,'')='content_writer';
  if not public.is_admin() and not(v_is_content and public.can_manage_content_applicant(a.id)) then
    raise exception 'Recruitment management access required.';
  end if;
  cfg:=coalesce(j.role_details->'applicationForm','{}'::jsonb);
  answers:=coalesce(a.application_answers,'{}'::jsonb);
  v_role:=coalesce(j.role_details->>'systemRole',case when j.application_type='sales_representative' then 'sales' else 'pending' end);
  begin min_hours:=greatest(1,coalesce((cfg->>'minimumWeeklyHours')::integer,20)); exception when others then min_hours:=20; end;

  if v_is_content then
    checks:=jsonb_build_array(
      jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.email,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
      jsonb_build_object('key','portfolio','label','Portfolio / writing sample supplied','passed',coalesce(answers->>'portfolioUrl','')<>'' or(jsonb_typeof(answers->'writingSamples')='array' and jsonb_array_length(answers->'writingSamples')>0)),
      jsonb_build_object('key','experience','label','Relevant content experience described','passed',char_length(coalesce(answers->>'contentExperience',''))>=30),
      jsonb_build_object('key','research','label','Research process described','passed',char_length(coalesce(answers->>'researchApproach',''))>=30),
      jsonb_build_object('key','quality','label','Quality / self-review process described','passed',char_length(coalesce(answers->>'qualityProcess',''))>=30),
      jsonb_build_object('key','availability','label','Minimum weekly availability','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
      jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
      jsonb_build_object('key','equipment','label','Laptop and reliable internet confirmed','passed',a.has_laptop_internet is true),
      jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null));
  elsif v_role='developer' then
    checks:=jsonb_build_array(
      jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.email,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
      jsonb_build_object('key','github','label','GitHub/profile URL available','passed',coalesce(answers->>'githubUrl','')~*'^https?://'),
      jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
      jsonb_build_object('key','availability','label','Weekly availability meets role requirement','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
      jsonb_build_object('key','stack','label','Primary stack answered','passed',length(trim(coalesce(answers->>'primaryStack','')))>2),
      jsonb_build_object('key','git','label','Git/GitHub workflow evidence answered','passed',length(trim(coalesce(answers->>'gitWorkflowExperience','')))>10),
      jsonb_build_object('key','testing','label','Testing experience answered','passed',length(trim(coalesce(answers->>'testingExperience','')))>10),
      jsonb_build_object('key','quality','label','Accessibility/performance/security evidence answered','passed',length(trim(coalesce(answers->>'accessibilityExperience','')))>5 and length(trim(coalesce(answers->>'performanceExperience','')))>5 and length(trim(coalesce(answers->>'securityExperience','')))>5),
      jsonb_build_object('key','project','label','Strongest shipped project and contribution answered','passed',length(trim(coalesce(answers->>'strongestProject','')))>15 and length(trim(coalesce(answers->>'projectContribution','')))>15),
      jsonb_build_object('key','handoff','label','Design handoff experience answered','passed',length(trim(coalesce(answers->>'designHandoffExperience','')))>5),
      jsonb_build_object('key','workSetup','label','Laptop and internet confirmed','passed',a.has_laptop_internet is true),
      jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null));
  elsif v_role='uiux_designer' then
    checks:=jsonb_build_array(
      jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.email,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
      jsonb_build_object('key','portfolio','label','Portfolio URL available','passed',coalesce(a.portfolio_url,'')~*'^https?://'),
      jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
      jsonb_build_object('key','availability','label','Weekly availability meets role requirement','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
      jsonb_build_object('key','figma','label','Figma experience answered','passed',length(trim(coalesce(answers->>'figmaExperience','')))>5),
      jsonb_build_object('key','responsive','label','Responsive design experience answered','passed',length(trim(coalesce(answers->>'responsiveExperience','')))>5),
      jsonb_build_object('key','systems','label','Design-system experience answered','passed',length(trim(coalesce(answers->>'designSystemsExperience','')))>5),
      jsonb_build_object('key','caseStudy','label','Case-study evidence answered','passed',length(trim(coalesce(answers->>'strongestCaseStudy','')))>10 and length(trim(coalesce(answers->>'caseStudyContribution','')))>10),
      jsonb_build_object('key','handoff','label','Developer handoff experience answered','passed',length(trim(coalesce(answers->>'developerHandoffExperience','')))>5),
      jsonb_build_object('key','workSetup','label','Laptop and internet confirmed','passed',a.has_laptop_internet is true),
      jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null));
  else
    begin min_months:=greatest(0,coalesce((cfg->>'minimumSalesExperienceMonths')::integer,6)); exception when others then min_months:=6; end;
    checks:=jsonb_build_array(
      jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.phone,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
      jsonb_build_object('key','linkedin','label','LinkedIn profile provided','passed',coalesce(a.linkedin_url,'')<>''),
      jsonb_build_object('key','experience','label','Minimum sales experience','passed',coalesce(a.sales_experience_months,0)>=min_months,'detail',coalesce(a.sales_experience_months,0)||' / '||min_months||' months'),
      jsonb_build_object('key','availability','label','Minimum weekly availability','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
      jsonb_build_object('key','prospecting','label','Prospecting experience selected','passed',cardinality(coalesce(a.prospecting_channels,'{}'))>0),
      jsonb_build_object('key','result','label','Previous sales result provided','passed',char_length(coalesce(a.previous_sales_results,''))>=20),
      jsonb_build_object('key','outreach','label','Sample outreach provided','passed',char_length(coalesce(a.sample_outreach_message,''))>=20),
      jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
      jsonb_build_object('key','video','label','Introduction video available','passed',coalesce(a.video_storage_path,'')<>'' or coalesce(a.video_url,'')<>''),
      jsonb_build_object('key','confirmations','label','Required applicant confirmations recorded','passed',a.has_laptop_internet is true and a.comfortable_commission is true and a.comfortable_sourcing is true and a.comfortable_english_calls is true and a.video_commitment is true),
      jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null));
  end if;

  select count(*),count(*) filter(where(x->>'passed')::boolean) into total,passed from jsonb_array_elements(checks)x;
  return jsonb_build_object(
    'reference',a.application_reference,'applicationVersion',a.application_version,'policyVersion',a.application_policy_version,
    'submittedAt',coalesce(a.application_submitted_at,a.created_at),'currentStage',a.stage,'jobId',j.id,'jobTitle',j.title,
    'systemRole',v_role,'portfolioUrl',coalesce(a.portfolio_url,answers->>'portfolioUrl'),'answers',answers,
    'checks',checks,'passedChecks',passed,'totalChecks',total,
    'completenessPercent',case when total=0 then 0 else round((passed::numeric/total::numeric)*100) end,
    'readyForReview',passed=total,
    'currentPolicy',jsonb_build_object('minimumWeeklyHours',min_hours,'jobUpdatedAt',j.updated_at,'applicationType',j.application_type));
end;$$;

create or replace function public.admin_advance_applicant_stage(p_applicant_id uuid,p_target_stage text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_job public.career_jobs%rowtype;
  v_target text;
  v_policy public.recruitment_stage_policies%rowtype;
  v_from_rank integer;
  v_to_rank integer;
  v_role text;
begin
  select * into v_app from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  select * into v_job from public.career_jobs where id=v_app.career_job_id;
  if not found then raise exception 'Candidate career job is missing.'; end if;
  if not public.is_admin() and not(v_job.application_type='content_writer' and public.can_manage_content_applicant(v_app.id)) then
    raise exception 'Recruitment management access required.';
  end if;
  if coalesce(trim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot progress.'; end if;
  v_role:=coalesce(public.career_job_system_role(v_app.career_job_id),case when v_job.application_type='sales_representative' then 'sales' else 'pending' end);
  v_target:=coalesce(p_target_stage,public.recruitment_next_stage_for_job(v_app.career_job_id,v_app.stage));
  if v_target is null then raise exception 'No next stage is available.'; end if;
  v_from_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);
  v_to_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_target);
  if v_from_rank is null or v_to_rank is null or v_to_rank<>v_from_rank+1 then
    raise exception 'Recruitment stages must progress sequentially through the selected job workflow.';
  end if;

  if v_job.application_type='sales_representative' or v_role='sales' then
    if v_app.stage='New Application' and v_target='Video Pending'
       and(coalesce(v_app.video_url,'')<>'' or coalesce(v_app.video_storage_path,'')<>'') then v_target:='Video Review'; end if;
    if v_app.stage='Video Pending' and v_target='Video Review'
       and coalesce(v_app.video_url,'')='' and coalesce(v_app.video_storage_path,'')='' then
      raise exception 'Introduction video is required before Video Review.';
    end if;
  end if;

  select * into v_policy from public.recruitment_stage_policies
  where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  if found and v_policy.assessment_required and not public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) then
    raise exception 'A passed structured assessment for % is required before progression.',v_app.stage;
  end if;
  if found and v_policy.interview_required and not exists(
    select 1 from public.recruitment_interviews ri
    join public.sales_meetings m on m.id=ri.meeting_id
    where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Completed') then
    raise exception 'A completed structured interview for % is required before progression.',v_app.stage;
  end if;

  if v_job.application_type='content_writer' then
    if v_app.stage='Selected' then raise exception 'Content Academy access is provisioned through the protected recruitment account invitation flow.'; end if;
    if v_app.stage='Content Academy' then raise exception 'Content Academy completion and practical submission control the next stage.'; end if;
    if v_app.stage='Practical Certification' or v_target='Activated' then raise exception 'Content Writer activation is controlled by the protected practical certification gate.'; end if;
  else
    if v_app.stage='Selected' then raise exception 'Issue the approved candidate agreement to move a Selected candidate into Agreement Pending.'; end if;
    if v_app.stage='Agreement Pending' then raise exception 'A verified agreement and protected account invitation are required before onboarding training.'; end if;
    if v_app.stage in('One-Day Training','Design Academy','Developer Academy') then raise exception 'The candidate must complete the assigned Academy and request Final Approval through the protected workflow.'; end if;
    if v_app.stage='Final Approval' then raise exception 'Use the protected Final Approval action.'; end if;
    if v_app.stage='Ready for System Access' then raise exception 'Use protected workforce activation.'; end if;
  end if;

  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage=v_target,updated_at=now() where id=v_app.id;
  return jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',v_target,'systemRole',v_role,'applicationType',v_job.application_type);
end;$$;

create or replace function public.queue_recruitment_stage_notifications()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_admin record;
  v_template text;
  v_cycle text:=md5(clock_timestamp()::text||random()::text||new.id::text);
  v_secure_issue boolean:=coalesce(current_setting('profox.agreement_issue_stage',true),'')='1';
  v_content_activation boolean:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'')='1';
  v_application_type text;
  v_role text;
  v_admin_path text;
  v_manager_count integer:=0;
begin
  select application_type into v_application_type from public.career_jobs where id=new.career_job_id;
  v_role:=coalesce(public.career_job_system_role(new.career_job_id),case when v_application_type='sales_representative' then 'sales' else 'pending' end);
  v_admin_path:=case when v_role='uiux_designer' then '/admin/uiux-recruitment' else '/admin/app/recruitment?tab=recruitment' end;

  if v_application_type='content_writer' then
    if tg_op='INSERT' then
      perform public.enqueue_notification('recruitment:'||new.id::text||':content-application-received','content_recruitment_application_received',lower(btrim(new.email)),null,public.recruitment_notification_payload(new),now());
      for v_admin in select id from public.user_profiles where status='active' and role in('editor','site_manager') loop
        perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','New Content Writer application',new.full_name||' submitted a Content Writer application.','/admin/app/recruitment?tab=recruitment','content-recruitment:new:'||new.id::text||':'||v_admin.id::text);
        v_manager_count:=v_manager_count+1;
      end loop;
      if v_manager_count=0 then
        for v_admin in select id from public.user_profiles where status='active' and role='admin' loop
          perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','Content recruitment needs an owner',new.full_name||' submitted a Content Writer application and no active Content Manager is available.','/admin/app/recruitment?tab=recruitment','content-recruitment:unowned:'||new.id::text||':'||v_admin.id::text);
        end loop;
      end if;
      return new;
    end if;
    if new.refusal_reason is distinct from old.refusal_reason and coalesce(btrim(new.refusal_reason),'')<>'' then
      perform public.enqueue_notification('recruitment:'||new.id::text||':content-not-selected','content_recruitment_not_selected',lower(btrim(new.email)),null,public.recruitment_notification_payload(new),now());
      return new;
    end if;
    if new.stage is distinct from old.stage then
      v_template:=case new.stage when 'Selected' then 'content_recruitment_selected' when 'Activated' then case when v_content_activation then null else 'content_recruitment_activated' end when 'Content Academy' then null when 'Practical Certification' then null else 'content_recruitment_stage' end;
      if v_template is not null then
        perform public.enqueue_notification('recruitment:'||new.id::text||':content-stage:'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||':'||v_cycle,v_template,lower(btrim(new.email)),new.linked_user_id,public.recruitment_notification_payload(new),now());
      end if;
    end if;
    return new;
  end if;

  if tg_op='INSERT' then
    if v_role='sales' then
      if new.stage='Video Pending' then
        perform public.queue_recruitment_email(new,'recruitment_video_pending','video-pending-'||v_cycle,now());
        perform public.queue_recruitment_video_pending_followups(new,v_cycle);
      else perform public.queue_recruitment_email(new,'recruitment_application_received','application-received',now()); end if;
    elsif v_role='uiux_designer' then perform public.queue_recruitment_email(new,'recruitment_uiux_application_received','application-received',now());
    elsif v_role='developer' then perform public.queue_recruitment_email(new,'recruitment_developer_application_received','application-received',now());
    end if;
    for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
      perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','New '||coalesce((select title from public.career_jobs where id=new.career_job_id),new.position)||' application',new.full_name||' submitted application '||coalesce(new.application_reference,'')||'.',v_admin_path,'recruitment:new-applicant:'||new.id::text||':'||v_admin.id::text);
    end loop;
    return new;
  end if;

  if new.refusal_reason is distinct from old.refusal_reason and coalesce(trim(new.refusal_reason),'')<>'' then
    if v_role='sales' then perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate application was closed.'); end if;
    perform public.queue_recruitment_email(new,'recruitment_not_selected','not-selected',now());
    return new;
  end if;

  if new.stage is distinct from old.stage then
    if v_role='sales' then
      if old.stage='Video Pending' and new.stage<>'Video Pending' then perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate progressed beyond Video Pending.'); end if;
      if new.stage='Agreement Pending' and old.stage='Selected' and coalesce(new.agreement_status,'not_sent')='not_sent' then perform public.create_sales_partner_agreement_internal(new.id); v_secure_issue:=true; end if;
      v_template:=case new.stage
        when 'New Application' then 'recruitment_application_received' when 'Video Pending' then 'recruitment_video_pending'
        when 'Video Review' then 'recruitment_video_received' when 'Initial Screening' then 'recruitment_initial_screening'
        when 'Shortlisted' then 'recruitment_shortlisted' when 'Sales Assessment' then 'recruitment_sales_assessment'
        when 'Lead Research Test' then 'recruitment_lead_research' when 'CRM Assessment' then 'recruitment_crm_assessment'
        when 'Selected' then 'recruitment_selected' when 'Agreement Pending' then case when v_secure_issue then null else 'recruitment_agreement_pending' end
        when 'One-Day Training' then 'recruitment_training' when 'Final Approval' then 'recruitment_final_review'
        when 'Ready for System Access' then 'recruitment_final_approved' when 'Activated' then 'recruitment_activated' else null end;
      if v_template is not null then perform public.queue_recruitment_email(new,v_template,'stage-'||lower(replace(new.stage,' ','-'))||'-'||v_cycle,now()); end if;
      if new.stage='Video Pending' then perform public.queue_recruitment_video_pending_followups(new,v_cycle); end if;
    elsif v_role='uiux_designer' then
      v_template:=case new.stage
        when 'Portfolio Review' then 'recruitment_uiux_portfolio_review' when 'Initial Screening' then 'recruitment_uiux_assessment'
        when 'Design Assessment' then 'recruitment_uiux_assessment' when 'Figma Practical' then 'recruitment_uiux_assessment'
        when 'Design Interview' then 'recruitment_uiux_assessment' when 'Selected' then 'recruitment_uiux_selected'
        when 'Design Academy' then 'recruitment_uiux_design_academy' when 'Final Approval' then 'recruitment_uiux_final_review'
        when 'Activated' then 'recruitment_uiux_activated' else null end;
      if v_template is not null then perform public.queue_recruitment_email(new,v_template,'stage-'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||'-'||v_cycle,now()); end if;
    elsif v_role='developer' then
      v_template:=case new.stage
        when 'Code & Portfolio Review' then 'recruitment_developer_review' when 'Initial Screening' then 'recruitment_developer_review'
        when 'Technical Assessment' then 'recruitment_developer_review' when 'Development Practical' then 'recruitment_developer_review'
        when 'Technical Interview' then 'recruitment_developer_review' when 'Selected' then 'recruitment_developer_selected'
        when 'Developer Academy' then 'recruitment_developer_academy' when 'Final Approval' then 'recruitment_developer_final_review'
        when 'Activated' then 'recruitment_developer_activated' else null end;
      if v_template is not null then perform public.queue_recruitment_email(new,v_template,'stage-'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||'-'||v_cycle,now()); end if;
    end if;
  end if;
  return new;
end;$$;