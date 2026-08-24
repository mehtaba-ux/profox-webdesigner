-- Development Delivery hardening
-- Prevent generic project/task controls from bypassing Development quality gates.
-- A Development task can become Done only inside an approved technical-review pass,
-- or (for the final handover task) inside the manager-approved client release transaction.

create or replace function public.protect_development_task_completion()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_review_pass boolean:=coalesce(current_setting('profox.development_review_pass',true),'')='1';
  v_handover_release boolean:=coalesce(current_setting('profox.development_handover_release',true),'')='1';
begin
  if new.status is not distinct from old.status or new.status<>'Done' or coalesce(new.department,'')<>'Development' then
    return new;
  end if;

  if new.workflow_key='development_handover_package' then
    if not v_handover_release or not exists(
      select 1 from public.development_handover_packages h
      where h.project_task_id=new.id
        and h.project_id=new.project_id
        and h.status='Released to Client'
        and h.manager_reviewer_id is not null
        and h.released_at is not null
    ) then
      raise exception 'Final handover can be completed only by the manager-approved client release action.';
    end if;
    return new;
  end if;

  if not v_review_pass or not exists(
    select 1 from public.development_delivery_reviews r
    where r.project_task_id=new.id
      and r.project_id=new.project_id
      and r.status='Pass'
      and r.completed_at is not null
      and r.reviewer_user_id is distinct from new.assigned_to
  ) then
    raise exception 'Development work can be completed only after an independent technical review passes.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_development_task_completion on public.project_tasks;
create trigger trg_protect_development_task_completion
before update of status on public.project_tasks
for each row execute function public.protect_development_task_completion();

-- Re-issue the protected review decision function with an explicit completion context.
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
  if v_review.reviewer_user_id is distinct from v_uid and not public.is_admin() then
    raise exception 'Only the assigned reviewer can complete this gate.';
  end if;
  if p_decision='Changes Required' and length(trim(coalesce(p_notes,'')))<10 then
    raise exception 'Specific review feedback is required when changes are requested.';
  end if;

  select * into v_task from public.project_tasks where id=v_review.project_task_id for update;
  select * into v_project from public.projects where id=v_review.project_id;
  if v_task.assigned_to is not null and v_review.reviewer_user_id=v_task.assigned_to then
    raise exception 'A Developer cannot independently approve their own Development task.';
  end if;

  update public.development_delivery_reviews
  set status=p_decision,
      quality_score=p_quality_score,
      notes=left(trim(coalesce(p_notes,'')),6000),
      completed_at=now()
  where id=p_review_id;

  if p_decision='Changes Required' then
    update public.project_tasks
    set status='Changes Required',completed_at=null,updated_at=now()
    where id=v_task.id;
    if v_task.assigned_to is not null then
      perform public.enqueue_in_app_notification(
        v_task.assigned_to,
        'Development Changes',
        'Technical review changes required',
        coalesce(v_task.title,'Development task')||' requires changes. Open the same Development Delivery workspace and resolve the structured review feedback.',
        '/admin?tab=myWork&focusTask='||v_task.id::text,
        'development-review-return:'||p_review_id::text
      );
    end if;
    return jsonb_build_object('reviewId',p_review_id,'status',p_decision,'taskStatus','Changes Required');
  end if;

  perform set_config('profox.development_review_pass','1',true);
  update public.project_tasks set status='Done',completed_at=now(),updated_at=now() where id=v_task.id;
  perform set_config('profox.development_review_pass','',true);

  select not exists(
    select 1 from public.project_tasks x
    where x.project_id=v_project.id
      and x.workflow_stage='Development'
      and x.required_for_stage
      and x.status<>'Done'
  ) into v_all_done;

  if v_all_done and v_project.project_manager_id is not null then
    perform public.enqueue_in_app_notification(
      v_project.project_manager_id,
      'Development Ready for QA',
      'All required Development tasks passed technical review',
      coalesce(v_project.project_number,'Project')||' · '||coalesce(v_project.project_name,'')||' has completed the required Development tasks. Review the project and advance to QA when ready.',
      '/admin?tab=projects',
      'development-ready-qa:'||v_project.id::text||':'||extract(epoch from now())::bigint::text
    );
  end if;

  return jsonb_build_object(
    'reviewId',p_review_id,
    'status','Pass',
    'taskStatus','Done',
    'allRequiredDevelopmentTasksDone',v_all_done
  );
end;
$$;

revoke all on function public.protect_development_task_completion() from public,anon,authenticated;
grant execute on function public.development_delivery_submit_review_decision(uuid,text,numeric,text) to authenticated;
