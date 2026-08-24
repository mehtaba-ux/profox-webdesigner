-- Production-reconciled Recruitment -> Sales activation defense in depth.
-- Current Training Module configuration and recorded reviews/sessions are authoritative.
-- Resume checkpoints never participate in approval or activation.

create or replace function public.approve_sales_candidate_final(p_applicant_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_missing_required integer;
  v_missing_reviews integer;
  v_final_module public.training_modules%rowtype;
  v_final_progress public.user_training_progress%rowtype;
  v_final_review public.training_reviews%rowtype;
  v_final_session public.final_certification_sessions%rowtype;
begin
  if not public.is_admin() then raise exception 'Unauthorized: only an active Admin may grant final approval.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if v_app.linked_user_id is null then raise exception 'Candidate account must be linked before final approval.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'Signed sales agreement is required.'; end if;
  if v_app.stage not in ('Final Approval','Ready for System Access') then raise exception 'Candidate must request Final Approval before Admin approval.'; end if;

  select count(*) into v_missing_required
  from public.training_modules m
  where m.active=true and m.required=true
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=v_app.linked_user_id and p.module_id=m.id
        and p.status in ('Passed','Completed')
        and (m.passing_score is null or coalesce(p.score,0)>=m.passing_score)
    );
  if v_missing_required>0 then raise exception 'All required Sales Academy modules must be passed before final approval. Missing: %',v_missing_required; end if;

  select count(*) into v_missing_reviews
  from public.training_modules m
  where m.active=true and m.requires_admin_review=true
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
      where p.user_id=v_app.linked_user_id and p.module_id=m.id
        and p.status='Passed' and r.status='Passed' and r.reviewer_id is not null
        and (m.passing_score is null or coalesce(r.score,0)>=m.passing_score)
    );
  if v_missing_reviews>0 then raise exception 'All Admin-reviewed training gates must pass before final approval. Missing: %',v_missing_reviews; end if;

  select * into v_final_module from public.training_modules where slug='final-certification' and active=true;
  if not found then raise exception 'Final Certification module is unavailable.'; end if;

  select * into v_final_progress
  from public.user_training_progress
  where user_id=v_app.linked_user_id and module_id=v_final_module.id
  for update;
  if not found or v_final_progress.status<>'Passed' or coalesce(v_final_progress.score,0)<coalesce(v_final_module.passing_score,90) then
    raise exception 'Final Certification must be passed at the current configured standard before final approval.';
  end if;

  select * into v_final_review
  from public.training_reviews
  where progress_id=v_final_progress.id
  order by created_at desc,id desc
  limit 1;
  if not found or v_final_review.status<>'Passed' or v_final_review.reviewer_id is null or coalesce(v_final_review.score,0)<coalesce(v_final_module.passing_score,90) then
    raise exception 'Final Certification requires a passing Management live review at the current configured standard.';
  end if;

  select * into v_final_session
  from public.final_certification_sessions
  where progress_id=v_final_progress.id and status='passed'
  order by attempt_no desc
  limit 1;
  if not found or coalesce(v_final_session.score,0)<coalesce(v_final_module.passing_score,90)
     or jsonb_array_length(coalesce(v_final_session.critical_failures,'[]'::jsonb))>0 then
    raise exception 'A passing live Final Certification session with zero critical failures is required.';
  end if;

  perform set_config('profox.final_approval_rpc','1',true);
  update public.applicants
     set final_approval=true,stage='Ready for System Access',onboarding_status='in_progress',onboarding_progress=100,updated_at=now()
   where id=p_applicant_id;
  update public.user_profiles
     set onboarding_progress=100,onboarding_status='in_progress',status='onboarding',updated_at=now()
   where id=v_app.linked_user_id;
end;
$$;

create or replace function public.activate_salesperson(target_user_id uuid,admin_id uuid default null::uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_missing_required integer;
  v_missing_reviews integer;
  v_final_module public.training_modules%rowtype;
  v_final_progress public.user_training_progress%rowtype;
  v_final_review public.training_reviews%rowtype;
  v_final_session public.final_certification_sessions%rowtype;
begin
  if not public.is_admin() then raise exception 'Unauthorized: only an active Admin may activate a salesperson.'; end if;
  select * into v_app
  from public.applicants
  where linked_user_id=target_user_id
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'Candidate record not found for the linked account.'; end if;
  if v_app.stage='Activated' and exists(select 1 from public.user_profiles where id=target_user_id and role='sales' and status='active') then return; end if;
  if v_app.stage<>'Ready for System Access' then raise exception 'Candidate must reach Ready for System Access before activation.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'Signed sales agreement is required before activation.'; end if;
  if coalesce(v_app.final_approval,false) is not true then raise exception 'Final Admin approval is required before activation.'; end if;

  select count(*) into v_missing_required
  from public.training_modules m
  where m.active=true and m.required=true
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=target_user_id and p.module_id=m.id
        and p.status in ('Passed','Completed')
        and (m.passing_score is null or coalesce(p.score,0)>=m.passing_score)
    );
  if v_missing_required>0 then raise exception 'All required Sales Academy modules must be completed before activation. Missing: %',v_missing_required; end if;

  select count(*) into v_missing_reviews
  from public.training_modules m
  where m.active=true and m.requires_admin_review=true
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
      where p.user_id=target_user_id and p.module_id=m.id
        and p.status='Passed' and r.status='Passed' and r.reviewer_id is not null
        and (m.passing_score is null or coalesce(r.score,0)>=m.passing_score)
    );
  if v_missing_reviews>0 then raise exception 'All Admin-reviewed training gates must be passed before activation. Missing: %',v_missing_reviews; end if;

  select * into v_final_module from public.training_modules where slug='final-certification' and active=true;
  if not found then raise exception 'Final Certification module is unavailable.'; end if;
  select * into v_final_progress from public.user_training_progress where user_id=target_user_id and module_id=v_final_module.id;
  if not found or v_final_progress.status<>'Passed' or coalesce(v_final_progress.score,0)<coalesce(v_final_module.passing_score,90) then
    raise exception 'Final Certification is not valid at the current configured standard.';
  end if;
  select * into v_final_review from public.training_reviews where progress_id=v_final_progress.id order by created_at desc,id desc limit 1;
  if not found or v_final_review.status<>'Passed' or v_final_review.reviewer_id is null or coalesce(v_final_review.score,0)<coalesce(v_final_module.passing_score,90) then
    raise exception 'Final Certification Management review is not valid at the current configured standard.';
  end if;
  select * into v_final_session from public.final_certification_sessions where progress_id=v_final_progress.id and status='passed' order by attempt_no desc limit 1;
  if not found or coalesce(v_final_session.score,0)<coalesce(v_final_module.passing_score,90)
     or jsonb_array_length(coalesce(v_final_session.critical_failures,'[]'::jsonb))>0 then
    raise exception 'A valid passed live Final Certification session with zero critical failures is required before activation.';
  end if;

  perform set_config('profox.sales_activation_rpc','1',true);
  update public.user_profiles
     set role='sales',department='Sales',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now()
   where id=target_user_id;
  if not found then raise exception 'Linked user profile not found.'; end if;
  update public.applicants
     set stage='Activated',onboarding_status='completed',onboarding_progress=100,updated_at=now()
   where id=v_app.id;
end;
$$;

revoke all on function public.approve_sales_candidate_final(uuid) from anon;
revoke all on function public.activate_salesperson(uuid,uuid) from anon;
grant execute on function public.approve_sales_candidate_final(uuid) to authenticated;
grant execute on function public.activate_salesperson(uuid,uuid) to authenticated;
