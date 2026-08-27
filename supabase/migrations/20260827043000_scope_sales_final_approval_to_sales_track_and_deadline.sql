create or replace function public.can_access_sales_academy_module(p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select public.is_admin()
    or (
      exists(
        select 1
        from public.training_track_modules tm
        join public.training_modules m on m.id=tm.module_id
        where tm.track_key='sales'
          and tm.module_id=p_module_id
          and m.active=true
      )
      and (
        exists(
          select 1 from public.applicants a
          where a.linked_user_id=auth.uid()
            and a.stage = any(array['Sales Academy Training'::text,'Final Approval'::text,'Ready for System Access'::text,'Activated'::text])
            and coalesce(trim(a.refusal_reason),'')=''
        )
        or public.has_active_role(array['sales'::text])
      )
    );
$$;

create or replace function public.request_sales_final_approval()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_final public.user_training_progress%rowtype;
  v_final_module public.training_modules%rowtype;
  v_missing_prior int;
  v_missing_prior_reviews int;
  v_review public.training_reviews%rowtype;
  v_session public.final_certification_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  select * into v_app
  from public.applicants
  where linked_user_id=auth.uid()
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'Linked sales candidate record not found.'; end if;

  if v_app.stage='Final Approval' then return; end if;
  if v_app.stage<>'Sales Academy Training' then raise exception 'Candidate must be in Sales Academy Training before requesting Final Approval.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'Signed sales agreement is required.'; end if;
  if v_app.academy_started_at is null or v_app.academy_due_at is null then raise exception 'The 10-day Sales Academy training window has not started.'; end if;
  if v_app.academy_review_wait_started_at is not null then raise exception 'A required Sales Academy submission is still waiting for Management review.'; end if;
  if now()>v_app.academy_due_at then raise exception 'The 10-day Sales Academy deadline has passed. Management review is required before the recruitment process can continue.'; end if;

  select m.* into v_final_module
  from public.training_modules m
  join public.training_track_modules tm on tm.module_id=m.id
  where tm.track_key='sales'
    and m.slug='final-certification'
    and m.active=true
  order by tm.sort_order desc
  limit 1;
  if not found then raise exception 'Sales Final Certification module is unavailable.'; end if;

  select * into v_final
  from public.user_training_progress
  where user_id=auth.uid() and module_id=v_final_module.id
  for update;
  if not found or v_final.status<>'Passed' or coalesce(v_final.score,0)<coalesce(v_final_module.passing_score,90) then
    raise exception 'Pass the complete Module 20 capstone, including the live Management certification, before requesting Final Approval.';
  end if;

  select * into v_review
  from public.training_reviews
  where progress_id=v_final.id
  order by created_at desc,id desc
  limit 1;
  if not found or v_review.status<>'Passed' or v_review.reviewer_id is null or coalesce(v_review.score,0)<coalesce(v_final_module.passing_score,90) then
    raise exception 'Final Certification requires a passing Management live review.';
  end if;

  select * into v_session
  from public.final_certification_sessions
  where progress_id=v_final.id and status='passed'
  order by attempt_no desc
  limit 1;
  if not found or coalesce(v_session.score,0)<coalesce(v_final_module.passing_score,90) or jsonb_array_length(coalesce(v_session.critical_failures,'[]'::jsonb))>0 then
    raise exception 'A passing live capstone with zero critical failures is required.';
  end if;

  select count(*) into v_missing_prior
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales'
    and tm.required=true
    and m.active=true
    and tm.sort_order < (
      select ftm.sort_order from public.training_track_modules ftm
      where ftm.track_key='sales' and ftm.module_id=v_final_module.id
      limit 1
    )
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=auth.uid()
        and p.module_id=m.id
        and p.status in('Passed','Completed')
        and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(p.score,0)>=coalesce(tm.passing_score_override,m.passing_score))
    );
  if v_missing_prior>0 then raise exception 'All previous required Sales Academy modules must be complete before Final Approval. Missing: %',v_missing_prior; end if;

  select count(*) into v_missing_prior_reviews
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales'
    and tm.required=true
    and m.active=true
    and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true
    and tm.sort_order < (
      select ftm.sort_order from public.training_track_modules ftm
      where ftm.track_key='sales' and ftm.module_id=v_final_module.id
      limit 1
    )
    and not exists(
      select 1
      from public.user_training_progress p
      join lateral(
        select tr.status,tr.reviewer_id
        from public.training_reviews tr
        where tr.progress_id=p.id
        order by tr.created_at desc,tr.id desc
        limit 1
      ) r on true
      where p.user_id=auth.uid()
        and p.module_id=m.id
        and p.status='Passed'
        and r.status='Passed'
        and r.reviewer_id is not null
    );
  if v_missing_prior_reviews>0 then raise exception 'All prior Management-reviewed Sales Academy practical gates must be passed before Final Approval. Missing: %',v_missing_prior_reviews; end if;

  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants
  set stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now()
  where id=v_app.id;
end;
$$;

grant execute on function public.request_sales_final_approval() to authenticated;