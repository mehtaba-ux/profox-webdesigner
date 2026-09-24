create or replace function public.sales_academy_training_ready(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_total integer:=0;
  v_missing integer:=0;
  v_missing_reviews integer:=0;
  v_final_module_id uuid;
  v_final_passing integer:=90;
  v_final_progress_id uuid;
  v_final_status text;
  v_final_score integer;
  v_live_ok boolean:=false;
begin
  if p_user_id is null then return false; end if;

  select count(*)::integer into v_total
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true;
  if v_total=0 then return false; end if;

  select count(*)::integer into v_missing
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=p_user_id and p.module_id=m.id
        and p.status in('Passed','Completed')
        and (coalesce(tm.passing_score_override,m.passing_score) is null
             or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
    );
  if v_missing>0 then return false; end if;

  select count(*)::integer into v_missing_reviews
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true
    and not exists(
      select 1
      from public.user_training_progress p
      join lateral(
        select tr.status,tr.score,tr.reviewer_id
        from public.training_reviews tr
        where tr.progress_id=p.id
        order by tr.created_at desc,tr.id desc
        limit 1
      ) r on true
      where p.user_id=p_user_id and p.module_id=m.id
        and p.status='Passed'
        and r.status='Passed'
        and r.reviewer_id is not null
        and (coalesce(tm.passing_score_override,m.passing_score) is null
             or coalesce(r.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
    );
  if v_missing_reviews>0 then return false; end if;

  select m.id,coalesce(tm.passing_score_override,m.passing_score,90)
    into v_final_module_id,v_final_passing
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and m.active=true and m.slug='final-certification'
  order by tm.sort_order desc limit 1;
  if v_final_module_id is null then return false; end if;

  select p.id,p.status,p.score
    into v_final_progress_id,v_final_status,v_final_score
  from public.user_training_progress p
  where p.user_id=p_user_id and p.module_id=v_final_module_id
  limit 1;
  if v_final_progress_id is null or v_final_status<>'Passed' or coalesce(v_final_score,0)<v_final_passing then return false; end if;

  select exists(
    select 1 from public.final_certification_sessions s
    where s.progress_id=v_final_progress_id
      and s.status='passed'
      and coalesce(s.score,0)>=v_final_passing
      and jsonb_array_length(coalesce(s.critical_failures,'[]'::jsonb))=0
  ) into v_live_ok;

  return coalesce(v_live_ok,false);
end;
$function$;

revoke all on function public.sales_academy_training_ready(uuid) from public,anon,authenticated;

create or replace function public.admin_get_sales_academy_gate_status(p_applicant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_app public.applicants%rowtype;
  v_total integer:=0;
  v_completed integer:=0;
  v_review_total integer:=0;
  v_review_passed integer:=0;
  v_ready boolean:=false;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id;
  if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(public.career_job_system_role(v_app.career_job_id),'')<>'sales' then
    raise exception 'Sales Academy gate status is only available for Sales candidates.';
  end if;

  select count(*)::integer into v_total
  from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true;

  select count(*)::integer into v_completed
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  join public.user_training_progress p on p.module_id=m.id and p.user_id=v_app.linked_user_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and p.status in('Passed','Completed')
    and (coalesce(tm.passing_score_override,m.passing_score) is null
         or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score));

  select count(*)::integer into v_review_total
  from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true;

  select count(*)::integer into v_review_passed
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  join public.user_training_progress p on p.module_id=m.id and p.user_id=v_app.linked_user_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true
    and p.status='Passed'
    and exists(
      select 1 from public.training_reviews tr
      where tr.progress_id=p.id and tr.status='Passed' and tr.reviewer_id is not null
        and (coalesce(tm.passing_score_override,m.passing_score) is null
             or coalesce(tr.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
      order by tr.created_at desc,tr.id desc limit 1
    );

  v_ready:=public.sales_academy_training_ready(v_app.linked_user_id);
  return jsonb_build_object(
    'stage',v_app.stage,
    'startedAt',v_app.academy_started_at,
    'dueAt',v_app.academy_due_at,
    'completedAt',v_app.academy_completed_at,
    'pausedForReview',v_app.academy_review_wait_started_at is not null and v_app.academy_completed_at is null,
    'totalRequired',v_total,
    'completedRequired',v_completed,
    'remainingRequired',greatest(v_total-v_completed,0),
    'reviewRequired',v_review_total,
    'reviewPassed',v_review_passed,
    'remainingReviews',greatest(v_review_total-v_review_passed,0),
    'trainingReady',v_ready,
    'canAdvance',v_ready and v_app.academy_started_at is not null and v_app.academy_due_at is not null
      and v_app.academy_review_wait_started_at is null
      and (v_app.academy_completed_at is not null or now()<=v_app.academy_due_at)
  );
end;
$function$;

revoke all on function public.admin_get_sales_academy_gate_status(uuid) from public,anon;
grant execute on function public.admin_get_sales_academy_gate_status(uuid) to authenticated;

create or replace function public.enforce_sales_academy_non_bypassable_gate()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text;
  v_ready boolean:=false;
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

  if new.stage in('Final Approval','Ready for System Access','Activated')
     or (new.final_approval is true and old.final_approval is distinct from true) then
    if new.linked_user_id is null then raise exception 'A linked Sales Academy account is required before advanced access.'; end if;
    if lower(coalesce(new.agreement_status,''))<>'signed' then raise exception 'A verified Sales Partner Agreement is required before advanced access.'; end if;
    if new.academy_started_at is null or new.academy_due_at is null then raise exception 'Sales Academy Training must be started before advanced access.'; end if;
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
  return new;
end;
$function$;

drop trigger if exists trg_enforce_sales_academy_non_bypassable_gate on public.applicants;
create trigger trg_enforce_sales_academy_non_bypassable_gate
before update of stage,final_approval on public.applicants
for each row execute function public.enforce_sales_academy_non_bypassable_gate();

create or replace function public.approve_sales_candidate_final(p_applicant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_app public.applicants%rowtype;
  v_missing_required integer;
  v_missing_reviews integer;
  v_final_module public.training_modules%rowtype;
  v_final_progress public.user_training_progress%rowtype;
  v_final_review public.training_reviews%rowtype;
  v_final_session public.final_certification_sessions%rowtype;
  v_final_required_score integer:=90;
begin
  if not public.is_admin() then raise exception 'Unauthorized: only an active Admin may grant final approval.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if v_app.stage='Ready for System Access' and coalesce(v_app.final_approval,false)=true then return; end if;
  if v_app.linked_user_id is null then raise exception 'Candidate account must be linked before final approval.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'Signed sales agreement is required.'; end if;
  if v_app.stage<>'Final Approval' then raise exception 'Candidate must complete Sales Academy Training and request Final Approval before Admin approval.'; end if;
  if not public.sales_academy_training_ready(v_app.linked_user_id) then
    raise exception 'Sales Academy completion is mandatory before final approval.';
  end if;

  select count(*) into v_missing_required
  from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=v_app.linked_user_id and p.module_id=m.id and p.status in('Passed','Completed')
        and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
    );
  if v_missing_required>0 then raise exception 'All required Sales Academy modules must be passed before final approval. Missing: %',v_missing_required; end if;

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
      where p.user_id=v_app.linked_user_id and p.module_id=m.id and p.status='Passed'
        and r.status='Passed' and r.reviewer_id is not null
        and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(r.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
    );
  if v_missing_reviews>0 then raise exception 'All Management-reviewed Sales Academy gates must pass before final approval. Missing: %',v_missing_reviews; end if;

  select m.* into v_final_module
  from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and m.slug='final-certification' and m.active=true
  order by tm.sort_order desc limit 1;
  if not found then raise exception 'Sales Final Certification module is unavailable.'; end if;
  select coalesce(tm.passing_score_override,v_final_module.passing_score,90) into v_final_required_score
  from public.training_track_modules tm where tm.track_key='sales' and tm.module_id=v_final_module.id limit 1;

  select * into v_final_progress from public.user_training_progress
  where user_id=v_app.linked_user_id and module_id=v_final_module.id for update;
  if not found or v_final_progress.status<>'Passed' or coalesce(v_final_progress.score,0)<v_final_required_score then
    raise exception 'Sales Final Certification must be passed at the current configured standard before final approval.';
  end if;
  select * into v_final_review from public.training_reviews where progress_id=v_final_progress.id order by created_at desc,id desc limit 1;
  if not found or v_final_review.status<>'Passed' or v_final_review.reviewer_id is null or coalesce(v_final_review.score,0)<v_final_required_score then
    raise exception 'Sales Final Certification requires a passing Management live review at the current configured standard.';
  end if;
  select * into v_final_session from public.final_certification_sessions where progress_id=v_final_progress.id and status='passed' order by attempt_no desc limit 1;
  if not found or coalesce(v_final_session.score,0)<v_final_required_score or jsonb_array_length(coalesce(v_final_session.critical_failures,'[]'::jsonb))>0 then
    raise exception 'A passing live Sales Final Certification session with zero critical failures is required.';
  end if;

  perform set_config('profox.final_approval_rpc','1',true);
  update public.applicants
  set final_approval=true,stage='Ready for System Access',onboarding_status='in_progress',onboarding_progress=100,updated_at=now()
  where id=p_applicant_id;
  update public.user_profiles
  set onboarding_progress=100,onboarding_status='in_progress',status='onboarding',updated_at=now()
  where id=v_app.linked_user_id;
end;
$function$;

create or replace function public.activate_salesperson(target_user_id uuid, admin_id uuid default null::uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_app public.applicants%rowtype;
  v_missing_required integer;
  v_missing_reviews integer;
  v_final_module public.training_modules%rowtype;
  v_final_progress public.user_training_progress%rowtype;
  v_final_review public.training_reviews%rowtype;
  v_final_session public.final_certification_sessions%rowtype;
  v_final_required_score integer:=90;
begin
  if not public.is_admin() then raise exception 'Unauthorized: only an active Admin may activate a salesperson.'; end if;
  select * into v_app from public.applicants where linked_user_id=target_user_id order by created_at desc limit 1 for update;
  if not found then raise exception 'Candidate record not found for the linked account.'; end if;
  if v_app.stage='Activated' and exists(select 1 from public.user_profiles where id=target_user_id and role='sales' and status='active') then return; end if;
  if v_app.stage<>'Ready for System Access' then raise exception 'Candidate must reach Ready for System Access through the protected Sales Academy and Final Approval workflow before activation.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'Signed sales agreement is required before activation.'; end if;
  if coalesce(v_app.final_approval,false) is not true then raise exception 'Final Admin approval is required before activation.'; end if;
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

  perform set_config('profox.sales_activation_rpc','1',true);
  update public.user_profiles set role='sales',department='Sales',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=target_user_id;
  if not found then raise exception 'Linked user profile not found.'; end if;
  update public.applicants set stage='Activated',onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=v_app.id;
end;
$function$;