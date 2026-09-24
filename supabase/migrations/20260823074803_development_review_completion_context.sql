-- Reissue the independent review decision with an explicit protected completion context.
create or replace function public.development_delivery_submit_review_decision(
  p_review_id uuid,
  p_decision text,
  p_quality_score numeric default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_review public.development_delivery_reviews%rowtype;
  v_task public.project_tasks%rowtype;
  v_project public.projects%rowtype;
  v_all_done boolean;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_decision not in('Pass','Changes Required') then raise exception 'Unsupported review decision.'; end if;
  select * into v_review from public.development_delivery_reviews where id=p_review_id for update;
  if not found then raise exception 'Review not found.'; end if;
  if v_review.status<>'Pending' then raise exception 'This review is already complete.'; end if;
  if v_review.reviewer_user_id is distinct from v_uid and not public.is_admin() then raise exception 'Only the assigned reviewer can complete this gate.'; end if;
  if p_decision='Changes Required' and length(trim(coalesce(p_notes,'')))<10 then raise exception 'Specific review feedback is required when changes are requested.'; end if;
  select * into v_task from public.project_tasks where id=v_review.project_task_id for update;
  select * into v_project from public.projects where id=v_review.project_id;
  if v_task.assigned_to is not null and v_review.reviewer_user_id=v_task.assigned_to then raise exception 'A Developer cannot independently approve their own Development task.'; end if;

  update public.development_delivery_reviews
  set status=p_decision,quality_score=p_quality_score,notes=left(trim(coalesce(p_notes,'')),6000),completed_at=now()
  where id=p_review_id;

  if p_decision='Changes Required' then
    update public.project_tasks set status='Changes Required',completed_at=null,updated_at=now() where id=v_task.id;
    if v_task.assigned_to is not null then
      perform public.enqueue_in_app_notification(
        v_task.assigned_to,'Development Changes','Technical review changes required',
        coalesce(v_task.title,'Development task')||' requires changes. Open the same Development Delivery workspace and resolve the structured review feedback.',
        '/admin?tab=myWork&focusTask='||v_task.id::text,'development-review-return:'||p_review_id::text
      );
    end if;
    return jsonb_build_object('reviewId',p_review_id,'status',p_decision,'taskStatus','Changes Required');
  end if;

  perform set_config('profox.development_review_pass','1',true);
  update public.project_tasks set status='Done',completed_at=now(),updated_at=now() where id=v_task.id;
  perform set_config('profox.development_review_pass','',true);

  select not exists(
    select 1 from public.project_tasks x
    where x.project_id=v_project.id and x.workflow_stage='Development' and x.required_for_stage and x.status<>'Done'
  ) into v_all_done;

  if v_all_done and v_project.project_manager_id is not null then
    perform public.enqueue_in_app_notification(
      v_project.project_manager_id,'Development Ready for QA','All required Development tasks passed technical review',
      coalesce(v_project.project_number,'Project')||' · '||coalesce(v_project.project_name,'')||' has completed the required Development tasks. Review the project and advance to QA when ready.',
      '/admin?tab=projects','development-ready-qa:'||v_project.id::text||':'||extract(epoch from now())::bigint::text
    );
  end if;

  return jsonb_build_object('reviewId',p_review_id,'status','Pass','taskStatus','Done','allRequiredDevelopmentTasksDone',v_all_done);
end;
$$;

grant execute on function public.development_delivery_submit_review_decision(uuid,text,numeric,text) to authenticated;