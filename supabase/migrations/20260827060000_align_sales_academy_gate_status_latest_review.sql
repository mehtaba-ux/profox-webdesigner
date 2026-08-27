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
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
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
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true;

  select count(*)::integer into v_review_passed
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  join public.user_training_progress p on p.module_id=m.id and p.user_id=v_app.linked_user_id
  join lateral (
    select tr.status,tr.score,tr.reviewer_id
    from public.training_reviews tr
    where tr.progress_id=p.id
    order by tr.created_at desc,tr.id desc
    limit 1
  ) r on true
  where tm.track_key='sales' and tm.required=true and m.active=true
    and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true
    and p.status='Passed'
    and r.status='Passed'
    and r.reviewer_id is not null
    and (coalesce(tm.passing_score_override,m.passing_score) is null
         or coalesce(r.score,100)>=coalesce(tm.passing_score_override,m.passing_score));

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