-- PF UI/UX Designer Team — Admin Academy/certification review snapshot
-- Reuses training track/module/progress/assignment/review records.

create or replace function public.admin_get_uiux_academy_status(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.applicants a where a.linked_user_id=p_user_id and coalesce(public.career_job_system_role(a.career_job_id),'')='uiux_designer') then
    raise exception 'UI/UX Designer onboarding record not found.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'moduleId',m.id,'title',m.title,'slug',m.slug,'sortOrder',tm.sort_order,'required',tm.required,
    'passingScore',coalesce(tm.passing_score_override,m.passing_score),'requiresReview',coalesce(tm.requires_review_override,m.requires_admin_review,false),
    'progressId',p.id,'status',coalesce(p.status,'Not Started'),'progressPercent',coalesce(p.progress_percent,0),'score',p.score,
    'reviewStatus',p.review_status,'reviewedAt',p.reviewed_at,'feedback',p.feedback,
    'latestSubmission',(select ta.submission_data from public.training_assignments ta where ta.user_id=p_user_id and ta.module_id=m.id order by ta.created_at desc,ta.id desc limit 1),
    'latestReview',(select jsonb_build_object('status',r.status,'score',r.score,'feedback',r.feedback,'reviewerId',r.reviewer_id,'createdAt',r.created_at) from public.training_reviews r where r.progress_id=p.id order by r.created_at desc,r.id desc limit 1)
  ) order by tm.sort_order),'[]'::jsonb)
  into v_result
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  left join public.user_training_progress p on p.module_id=m.id and p.user_id=p_user_id
  where tm.track_key='uiux_design' and m.active=true;

  return jsonb_build_object(
    'track','uiux_design',
    'modules',v_result,
    'readyForFinalApproval',public.uiux_training_ready(p_user_id),
    'generatedAt',now()
  );
end;
$$;

revoke all on function public.admin_get_uiux_academy_status(uuid) from public,anon;
grant execute on function public.admin_get_uiux_academy_status(uuid) to authenticated;
