-- Reconcile shared Recruitment triggers/RPCs across Sales, Content Writer and UI/UX Designer.
-- Each job keeps its own protected progression, notification and activation rules while
-- continuing to use the same canonical applicants/recruitment infrastructure.

update public.career_jobs
set role_details=jsonb_set(coalesce(role_details,'{}'::jsonb),'{systemRole}','"content_writer"'::jsonb,true),updated_at=now()
where application_type='content_writer' and slug='content-writer';

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

  if not public.is_admin() and not (v_job.application_type='content_writer' and public.can_manage_content_applicant(v_app.id)) then
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
       and (coalesce(v_app.video_url,'')<>'' or coalesce(v_app.video_storage_path,'')<>'') then
      v_target:='Video Review';
    end if;
    if v_app.stage='Video Pending' and v_target='Video Review'
       and coalesce(v_app.video_url,'')='' and coalesce(v_app.video_storage_path,'')='' then
      raise exception 'Introduction video is required before Video Review.';
    end if;
  end if;

  select * into v_policy
  from public.recruitment_stage_policies
  where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  if found and v_policy.assessment_required and not public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) then
    raise exception 'A passed structured assessment for % is required before progression.',v_app.stage;
  end if;
  if found and v_policy.interview_required and not exists(
    select 1 from public.recruitment_interviews ri
    join public.sales_meetings m on m.id=ri.meeting_id
    where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Completed'
  ) then
    raise exception 'A completed structured interview for % is required before progression.',v_app.stage;
  end if;

  if v_job.application_type='content_writer' then
    if v_app.stage='Selected' then raise exception 'Content Academy access is provisioned through the protected recruitment account invitation flow.'; end if;
    if v_app.stage='Content Academy' then raise exception 'Content Academy completion and practical submission control the next stage.'; end if;
    if v_app.stage='Practical Certification' or v_target='Activated' then raise exception 'Content Writer activation is controlled by the protected practical certification gate.'; end if;
  else
    if v_app.stage='Selected' then raise exception 'Issue the approved candidate agreement to move a Selected candidate into Agreement Pending.'; end if;
    if v_app.stage='Agreement Pending' then raise exception 'A verified agreement and protected account invitation are required before onboarding training.'; end if;
    if v_app.stage in('One-Day Training','Design Academy') then raise exception 'The candidate must complete the assigned Academy and request Final Approval through the protected workflow.'; end if;
    if v_app.stage='Final Approval' then raise exception 'Use the protected Final Approval action.'; end if;
    if v_app.stage='Ready for System Access' then raise exception 'Use protected workforce activation.'; end if;
  end if;

  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage=v_target,updated_at=now() where id=v_app.id;
  return jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',v_target,'systemRole',v_role,'applicationType',v_job.application_type);
end;
$$;

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
      perform public.enqueue_notification(
        'recruitment:'||new.id::text||':content-application-received','content_recruitment_application_received',
        lower(btrim(new.email)),null,public.recruitment_notification_payload(new),now()
      );
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
      v_template:=case new.stage
        when 'Selected' then 'content_recruitment_selected'
        when 'Activated' then case when v_content_activation then null else 'content_recruitment_activated' end
        when 'Content Academy' then null
        when 'Practical Certification' then null
        else 'content_recruitment_stage'
      end;
      if v_template is not null then
        perform public.enqueue_notification(
          'recruitment:'||new.id::text||':content-stage:'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||':'||v_cycle,
          v_template,lower(btrim(new.email)),new.linked_user_id,public.recruitment_notification_payload(new),now()
        );
      end if;
    end if;
    return new;
  end if;

  if tg_op='INSERT' then
    if v_role='sales' then
      if new.stage='Video Pending' then
        perform public.queue_recruitment_email(new,'recruitment_video_pending','video-pending-'||v_cycle,now());
        perform public.queue_recruitment_video_pending_followups(new,v_cycle);
      else
        perform public.queue_recruitment_email(new,'recruitment_application_received','application-received',now());
      end if;
    elsif v_role='uiux_designer' then
      perform public.queue_recruitment_email(new,'recruitment_uiux_application_received','application-received',now());
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
      if new.stage='Agreement Pending' and old.stage='Selected' and coalesce(new.agreement_status,'not_sent')='not_sent' then
        perform public.create_sales_partner_agreement_internal(new.id); v_secure_issue:=true;
      end if;
      v_template:=case new.stage
        when 'New Application' then 'recruitment_application_received'
        when 'Video Pending' then 'recruitment_video_pending'
        when 'Video Review' then 'recruitment_video_received'
        when 'Initial Screening' then 'recruitment_initial_screening'
        when 'Shortlisted' then 'recruitment_shortlisted'
        when 'Sales Assessment' then 'recruitment_sales_assessment'
        when 'Lead Research Test' then 'recruitment_lead_research'
        when 'CRM Assessment' then 'recruitment_crm_assessment'
        when 'Selected' then 'recruitment_selected'
        when 'Agreement Pending' then case when v_secure_issue then null else 'recruitment_agreement_pending' end
        when 'One-Day Training' then 'recruitment_training'
        when 'Final Approval' then 'recruitment_final_review'
        when 'Ready for System Access' then 'recruitment_final_approved'
        when 'Activated' then 'recruitment_activated'
        else null end;
      if v_template is not null then perform public.queue_recruitment_email(new,v_template,'stage-'||lower(replace(new.stage,' ','-'))||'-'||v_cycle,now()); end if;
      if new.stage='Video Pending' then perform public.queue_recruitment_video_pending_followups(new,v_cycle); end if;
    elsif v_role='uiux_designer' then
      v_template:=case new.stage
        when 'Portfolio Review' then 'recruitment_uiux_portfolio_review'
        when 'Initial Screening' then 'recruitment_uiux_assessment'
        when 'Design Assessment' then 'recruitment_uiux_assessment'
        when 'Figma Practical' then 'recruitment_uiux_assessment'
        when 'Design Interview' then 'recruitment_uiux_assessment'
        when 'Selected' then 'recruitment_uiux_selected'
        when 'Design Academy' then 'recruitment_uiux_design_academy'
        when 'Final Approval' then 'recruitment_uiux_final_review'
        when 'Activated' then 'recruitment_uiux_activated'
        else null end;
      if v_template is not null then
        perform public.queue_recruitment_email(new,v_template,'stage-'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||'-'||v_cycle,now());
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_sales_candidate_activation()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_final_rpc text:=coalesce(current_setting('profox.final_approval_rpc',true),'');
  v_sales_activation text:=coalesce(current_setting('profox.sales_activation_rpc',true),'');
  v_content_activation text:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'');
  v_recruitment_rpc text:=coalesce(current_setting('profox.recruitment_stage_rpc',true),'');
  v_application_type text;
  v_role text;
begin
  select application_type into v_application_type from public.career_jobs where id=coalesce(new.career_job_id,old.career_job_id);
  v_role:=coalesce(public.career_job_system_role(coalesce(new.career_job_id,old.career_job_id)),case when v_application_type='sales_representative' then 'sales' else 'pending' end);

  if old.stage='Activated' and new.stage is distinct from old.stage then
    raise exception 'Activated candidate stage is immutable through direct updates.';
  end if;

  if v_application_type='content_writer' or v_role='content_writer' then
    if ((new.final_approval is true and old.final_approval is distinct from true)
        or (new.stage='Activated' and old.stage is distinct from new.stage))
       and v_content_activation<>'1' then
      raise exception 'Content Writer approval and activation must use the protected practical certification workflow.';
    end if;
    if new.stage='Ready for System Access' and old.stage is distinct from new.stage then
      raise exception 'Content Writer activation does not use the Sales system-access stage.';
    end if;
    return new;
  end if;

  if v_role='uiux_designer' then
    if ((new.final_approval is true and old.final_approval is distinct from true)
        or (new.stage='Ready for System Access' and old.stage is distinct from new.stage))
       and v_final_rpc<>'1' then
      raise exception 'UI/UX Final Approval must use the protected final-approval workflow.';
    end if;
    if new.stage='Activated' and old.stage is distinct from new.stage and v_recruitment_rpc<>'1' then
      raise exception 'UI/UX Designer activation must use the protected workforce activation workflow.';
    end if;
    return new;
  end if;

  if (new.final_approval is true and old.final_approval is distinct from true)
     or (new.stage='Ready for System Access' and old.stage is distinct from new.stage) then
    if v_final_rpc<>'1' and v_sales_activation<>'1' then
      raise exception 'Final approval must use the secure final-approval workflow.';
    end if;
  end if;
  if new.stage='Activated' and old.stage is distinct from new.stage and v_sales_activation<>'1' then
    raise exception 'Candidate activation must use the secure activation workflow.';
  end if;
  return new;
end;
$$;

-- Shared trigger functions are internal, not browser RPCs.
revoke all on function public.queue_recruitment_stage_notifications() from public,anon,authenticated;
revoke all on function public.protect_sales_candidate_activation() from public,anon,authenticated;

-- The shared stage RPC is an authenticated management interface; its own job-aware checks
-- decide whether Admin or scoped Content management may act.
revoke all on function public.admin_advance_applicant_stage(uuid,text) from public,anon;
grant execute on function public.admin_advance_applicant_stage(uuid,text) to authenticated;
