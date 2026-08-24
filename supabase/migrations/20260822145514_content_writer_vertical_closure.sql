-- Final Content Writer vertical hardening.
-- Keeps Sales recruitment behavior unchanged and closes only proven Content-specific gaps.

-- Content recruitment managers may read only the profile linked to a Content Writer candidate.
-- Existing self/Admin/Project Manager profile policies remain the canonical broader access rules.
drop policy if exists user_profiles_content_recruitment_select on public.user_profiles;
create policy user_profiles_content_recruitment_select
on public.user_profiles
for select
to authenticated
using (
  public.content_recruitment_manager()
  and exists (
    select 1
    from public.applicants a
    join public.career_jobs j on j.id=a.career_job_id
    where a.linked_user_id=user_profiles.id
      and j.application_type='content_writer'
  )
);

-- Preserve the existing stage notification trigger, but avoid double-sending the Content
-- activation email when activation came from the protected practical-review RPC. That RPC
-- already queues the activation message with a deterministic dedupe key.
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
  v_type text;
  v_manager_count integer:=0;
begin
  select application_type into v_type from public.career_jobs where id=new.career_job_id;
  v_type:=coalesce(v_type,'sales_representative');

  if v_type='content_writer' then
    if tg_op='INSERT' then
      perform public.enqueue_notification(
        'recruitment:'||new.id::text||':content-application-received',
        'content_recruitment_application_received',lower(btrim(new.email)),null,
        public.recruitment_notification_payload(new),now()
      );
      for v_admin in select id from public.user_profiles where status='active' and role in('editor','site_manager') loop
        perform public.enqueue_in_app_notification(
          v_admin.id,'Recruitment','New Content Writer application',
          new.full_name||' submitted a Content Writer application.',
          '/admin/app/recruitment?tab=recruitment',
          'content-recruitment:new:'||new.id::text||':'||v_admin.id::text
        );
        v_manager_count:=v_manager_count+1;
      end loop;
      if v_manager_count=0 then
        for v_admin in select id from public.user_profiles where status='active' and role='admin' loop
          perform public.enqueue_in_app_notification(
            v_admin.id,'Recruitment','Content recruitment needs an owner',
            new.full_name||' submitted a Content Writer application and no active Content Manager is available.',
            '/admin/app/recruitment?tab=recruitment',
            'content-recruitment:unowned:'||new.id::text||':'||v_admin.id::text
          );
        end loop;
      end if;
      return new;
    end if;

    if new.refusal_reason is distinct from old.refusal_reason and coalesce(btrim(new.refusal_reason),'')<>'' then
      perform public.enqueue_notification(
        'recruitment:'||new.id::text||':content-not-selected',
        'content_recruitment_not_selected',lower(btrim(new.email)),null,
        public.recruitment_notification_payload(new),now()
      );
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
          v_template,lower(btrim(new.email)),new.linked_user_id,
          public.recruitment_notification_payload(new),now()
        );
      end if;
    end if;
    return new;
  end if;

  -- Existing Sales recruitment behavior remains unchanged.
  if tg_op='INSERT' then
    if new.stage='Video Pending' then
      perform public.queue_recruitment_email(new,'recruitment_video_pending','video-pending-'||v_cycle,now());
      perform public.queue_recruitment_video_pending_followups(new,v_cycle);
    else
      perform public.queue_recruitment_email(new,'recruitment_application_received','application-received',now());
    end if;
    for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
      perform public.enqueue_in_app_notification(
        v_admin.id,'Recruitment','New sales application',
        new.full_name||' submitted an application for the Independent Sales Representative role.',
        '/admin/app/recruitment','recruitment:new-applicant:'||new.id::text||':'||v_admin.id::text
      );
    end loop;
    return new;
  end if;
  if new.refusal_reason is distinct from old.refusal_reason and coalesce(btrim(new.refusal_reason),'')<>'' then
    perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate application was closed.');
    perform public.queue_recruitment_email(new,'recruitment_not_selected','not-selected',now());
    return new;
  end if;
  if new.stage is distinct from old.stage then
    if old.stage='Video Pending' and new.stage<>'Video Pending' then
      perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate progressed beyond Video Pending.');
    end if;
    if new.stage='Agreement Pending' and old.stage='Selected' and coalesce(new.agreement_status,'not_sent')='not_sent' then
      perform public.create_sales_partner_agreement_internal(new.id);
      v_secure_issue:=true;
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
      else null
    end;
    if v_template is not null then
      perform public.queue_recruitment_email(new,v_template,'stage-'||lower(replace(new.stage,' ','-'))||'-'||v_cycle,now());
    end if;
    if new.stage='Video Pending' then perform public.queue_recruitment_video_pending_followups(new,v_cycle); end if;
  end if;
  return new;
end;
$$;

-- Fix Content SLA payload typing while continuing to reuse the existing operational
-- notification and two-minute notification-worker path. No new scheduler is introduced.
create or replace function public.queue_due_recruitment_stage_sla()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  r record;
  a record;
  v_app public.applicants%rowtype;
  v_candidate_count integer:=0;
  v_inapp integer:=0;
  v_email integer:=0;
  v_stage_key text;
  v_managers integer;
  v_payload jsonb;
begin
  for r in
    select ap.id,ap.full_name,ap.stage,ap.stage_entered_at,p.sla_hours,j.application_type
    from public.applicants ap
    join public.career_jobs j on j.id=public.recruitment_job_for_applicant(ap.id)
    join public.recruitment_stage_policies p on p.job_id=j.id and p.stage=ap.stage and p.active=true
    where coalesce(btrim(ap.refusal_reason),'')=''
      and ap.stage<>'Activated'
      and p.sla_hours>0
      and ap.stage_entered_at+make_interval(hours=>p.sla_hours)<=now()
  loop
    v_candidate_count:=v_candidate_count+1;
    v_stage_key:=lower(regexp_replace(r.stage,'[^a-zA-Z0-9]+','-','g'))||':'||to_char(r.stage_entered_at at time zone 'UTC','YYYYMMDDHH24MISS');
    select * into v_app from public.applicants where id=r.id;
    v_payload:=public.recruitment_notification_payload(v_app);

    if r.application_type='content_writer' then
      v_managers:=0;
      for a in select id from public.user_profiles where status='active' and role in('editor','site_manager') loop
        perform public.service_queue_staff_operational_notification(
          a.id,'content-recruitment:sla:'||r.id::text||':'||v_stage_key||':'||a.id::text,
          'recruitment_admin_stage_overdue','Recruitment','Content recruitment review overdue',
          r.full_name||' has remained in '||r.stage||' beyond the configured '||r.sla_hours||'-hour SLA.',
          '/admin/app/recruitment?tab=recruitment',coalesce(v_payload,'{}'::jsonb),now()
        );
        v_managers:=v_managers+1;
        v_inapp:=v_inapp+1;
      end loop;
      if v_managers=0 then
        v_inapp:=v_inapp+public.service_queue_active_admins_operational_notification(
          'content-recruitment:sla:'||r.id::text||':'||v_stage_key,
          'recruitment_admin_stage_overdue','Recruitment','Content recruitment needs attention',
          r.full_name||' is overdue in '||r.stage||' and no Content Manager is active.',
          '/admin/app/recruitment?tab=recruitment',coalesce(v_payload,'{}'::jsonb),now()
        );
      end if;
    else
      for a in select id from public.user_profiles where role='admin' and status='active' loop
        perform public.enqueue_in_app_notification(
          a.id,'Recruitment','Recruitment review overdue',
          r.full_name||' has remained in '||r.stage||' beyond the configured '||r.sla_hours||'-hour SLA.',
          '/admin/app/recruitment?tab=recruitment','recruitment:sla:'||r.id::text||':'||v_stage_key||':'||a.id::text
        );
        v_inapp:=v_inapp+1;
      end loop;
      if public.queue_recruitment_admin_email(v_app,'recruitment_admin_stage_overdue','stage-sla-'||v_stage_key,now()) is not null then
        v_email:=v_email+1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('overdueCandidates',v_candidate_count,'staffNotifications',v_inapp,'adminEmails',v_email);
end;
$$;
