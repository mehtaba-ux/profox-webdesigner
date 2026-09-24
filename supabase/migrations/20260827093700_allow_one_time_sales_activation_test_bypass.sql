alter table public.sales_academy_test_bypasses
  add column if not exists test_activated_at timestamptz,
  add column if not exists test_activated_by uuid references public.user_profiles(id) on delete set null;

create or replace function public.sales_academy_test_activation_allowed(p_applicant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.sales_academy_test_bypasses b
    where b.applicant_id = p_applicant_id
      and b.status = 'consumed'
      and b.advanced_to_final_at is not null
      and b.consumed_at is not null
      and b.expires_at > now()
      and b.test_activated_at is null
  );
$$;
revoke all on function public.sales_academy_test_activation_allowed(uuid) from public, anon, authenticated;

create or replace function public.enforce_sales_academy_non_bypassable_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_ready boolean := false;
  v_test_bypass boolean := false;
  v_test_context text := coalesce(current_setting('profox.sales_academy_test_bypass_applicant',true),'');
  v_test_activation_context text := coalesce(current_setting('profox.sales_academy_test_activation_applicant',true),'');
begin
  v_role:=coalesce(public.career_job_system_role(coalesce(new.career_job_id,old.career_job_id)), '');
  if v_role<>'sales' then return new; end if;

  if new.stage is distinct from old.stage then
    if new.stage='Final Approval' and old.stage<>'Sales Academy Training' then
      raise exception 'Sales candidates can enter Final Approval only after completing Sales Academy Training.';
    end if;
    if new.stage='Ready for System Access' and old.stage<>'Final Approval' then
      raise exception 'Sales candidates can enter Ready for System Access only from Final Approval.';
    end if;
    if new.stage='Activated' and old.stage<>'Ready for System Access' then
      raise exception 'Sales candidates can be activated only from Ready for System Access.';
    end if;
  end if;

  if new.stage='Final Approval' and old.stage='Sales Academy Training' and v_test_context=new.id::text then
    v_test_bypass:=true;
  elsif new.stage='Ready for System Access' or (new.final_approval is true and old.final_approval is distinct from true) then
    v_test_bypass:=public.sales_academy_test_bypass_active(new.id);
  elsif new.stage='Activated'
        and old.stage='Ready for System Access'
        and v_test_activation_context=new.id::text
        and public.sales_academy_test_activation_allowed(new.id) then
    v_test_bypass:=true;
  end if;

  if new.stage in('Final Approval','Ready for System Access','Activated')
     or (new.final_approval is true and old.final_approval is distinct from true) then
    if new.linked_user_id is null then raise exception 'A linked Sales Academy account is required before advanced access.'; end if;
    if lower(coalesce(new.agreement_status,''))<>'signed' then raise exception 'A verified Sales Partner Agreement is required before advanced access.'; end if;
    if new.academy_started_at is null or new.academy_due_at is null then raise exception 'Sales Academy Training must be started before advanced access.'; end if;

    if not v_test_bypass then
      if new.academy_review_wait_started_at is not null and new.academy_completed_at is null then
        raise exception 'Sales Academy progression is locked while a required Management review is pending.';
      end if;
      v_ready:=public.sales_academy_training_ready(new.linked_user_id);
      if not v_ready then
        raise exception 'Sales Academy completion is mandatory. All required Sales modules, passing scores, Management reviews and Final Certification must be complete before advanced access.';
      end if;
      if new.academy_completed_at is null and now()>new.academy_due_at then
        raise exception 'The Sales Academy deadline has passed. Complete the controlled Management review process before advanced access.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.activate_salesperson(target_user_id uuid, admin_id uuid default null::uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_missing_required integer;
  v_missing_reviews integer;
  v_final_module public.training_modules%rowtype;
  v_final_progress public.user_training_progress%rowtype;
  v_final_review public.training_reviews%rowtype;
  v_final_session public.final_certification_sessions%rowtype;
  v_final_required_score integer:=90;
  v_test_activation boolean:=false;
begin
  if not public.is_admin() then raise exception 'Unauthorized: only an active Admin may activate a salesperson.'; end if;
  select * into v_app from public.applicants where linked_user_id=target_user_id order by created_at desc limit 1 for update;
  if not found then raise exception 'Candidate record not found for the linked account.'; end if;
  if v_app.stage='Activated' and exists(select 1 from public.user_profiles where id=target_user_id and role='sales' and status='active') then return; end if;
  if v_app.stage<>'Ready for System Access' then raise exception 'Candidate must reach Ready for System Access through the protected Sales Academy and Final Approval workflow before activation.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'Signed sales agreement is required before activation.'; end if;
  if coalesce(v_app.final_approval,false) is not true then raise exception 'Final Admin approval is required before activation.'; end if;

  v_test_activation:=public.sales_academy_test_activation_allowed(v_app.id);

  if not v_test_activation then
    if not public.sales_academy_training_ready(target_user_id) then raise exception 'Sales Academy completion is mandatory before activation.'; end if;

    select count(*) into v_missing_required
    from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
    where tm.track_key='sales' and tm.required=true and m.active=true
      and not exists(
        select 1 from public.user_training_progress p
        where p.user_id=target_user_id and p.module_id=m.id and p.status in('Passed','Completed')
          and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
      );
    if v_missing_required>0 then raise exception 'All required Sales Academy modules must be completed before activation. Missing: %',v_missing_required; end if;

    select count(*) into v_missing_reviews
    from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
    where tm.track_key='sales' and tm.required=true and m.active=true
      and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true
      and not exists(
        select 1 from public.user_training_progress p
        join lateral(
          select tr.status,tr.score,tr.reviewer_id from public.training_reviews tr
          where tr.progress_id=p.id order by tr.created_at desc,tr.id desc limit 1
        ) r on true
        where p.user_id=target_user_id and p.module_id=m.id and p.status='Passed'
          and r.status='Passed' and r.reviewer_id is not null
          and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(r.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
      );
    if v_missing_reviews>0 then raise exception 'All Management-reviewed Sales Academy gates must be passed before activation. Missing: %',v_missing_reviews; end if;

    select m.* into v_final_module
    from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
    where tm.track_key='sales' and m.slug='final-certification' and m.active=true
    order by tm.sort_order desc limit 1;
    if not found then raise exception 'Sales Final Certification module is unavailable.'; end if;
    select coalesce(tm.passing_score_override,v_final_module.passing_score,90) into v_final_required_score
    from public.training_track_modules tm where tm.track_key='sales' and tm.module_id=v_final_module.id limit 1;
    select * into v_final_progress from public.user_training_progress where user_id=target_user_id and module_id=v_final_module.id;
    if not found or v_final_progress.status<>'Passed' or coalesce(v_final_progress.score,0)<v_final_required_score then raise exception 'Sales Final Certification is not valid at the current configured standard.'; end if;
    select * into v_final_review from public.training_reviews where progress_id=v_final_progress.id order by created_at desc,id desc limit 1;
    if not found or v_final_review.status<>'Passed' or v_final_review.reviewer_id is null or coalesce(v_final_review.score,0)<v_final_required_score then raise exception 'Sales Final Certification Management review is not valid at the current configured standard.'; end if;
    select * into v_final_session from public.final_certification_sessions where progress_id=v_final_progress.id and status='passed' order by attempt_no desc limit 1;
    if not found or coalesce(v_final_session.score,0)<v_final_required_score or jsonb_array_length(coalesce(v_final_session.critical_failures,'[]'::jsonb))>0 then raise exception 'A valid passed live Sales Final Certification session with zero critical failures is required before activation.'; end if;
  end if;

  perform set_config('profox.sales_activation_rpc','1',true);
  if v_test_activation then
    perform set_config('profox.sales_academy_test_activation_applicant',v_app.id::text,true);
  end if;

  update public.user_profiles
  set role='sales',
      department='Sales',
      status='active',
      onboarding_status=case when v_test_activation then onboarding_status else 'completed' end,
      onboarding_progress=case when v_test_activation then onboarding_progress else 100 end,
      updated_at=now()
  where id=target_user_id;
  if not found then raise exception 'Linked user profile not found.'; end if;

  update public.applicants
  set stage='Activated',
      onboarding_status=case when v_test_activation then onboarding_status else 'completed' end,
      onboarding_progress=case when v_test_activation then onboarding_progress else 100 end,
      updated_at=now()
  where id=v_app.id;

  if v_test_activation then
    update public.sales_academy_test_bypasses
    set test_activated_at=now(),
        test_activated_by=coalesce(admin_id,auth.uid()),
        updated_at=now()
    where applicant_id=v_app.id
      and status='consumed'
      and test_activated_at is null;

    perform public.log_applicant_event(
      v_app.id,
      'recruitment',
      'test_activation_bypass',
      'TEST ONLY: Sales activation bypass used',
      'Admin activated the test Sales account using the existing one-time Academy testing exception. Real Academy progress and certification evidence were not marked complete.',
      'Ready for System Access',
      'Activated',
      'admin',
      coalesce(admin_id,auth.uid()),
      'sales_academy_test_bypasses',
      (select id from public.sales_academy_test_bypasses where applicant_id=v_app.id limit 1),
      jsonb_build_object('testOnly',true,'trainingProgressPreserved',true,'academyCompletedAt',v_app.academy_completed_at)
    );
  end if;
end;
$$;
