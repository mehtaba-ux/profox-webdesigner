-- PF-SOP-08 final flow integration
-- Reuses the existing project/customer communication trigger and project-team model.
-- This migration removes duplicate customer notification behavior, fixes reviewer RLS execution,
-- and connects approved design into Development / post-build Design QA.

-- The evidence RLS policy calls this safe boolean helper, so authenticated users need EXECUTE.
-- It reveals only whether the caller can access one design task; all data remains protected by RLS/RPC checks.
grant execute on function public.design_delivery_can_access_task(uuid) to authenticated;

-- Read-only approved design handoff for project delivery team members.
-- No client PII and no copied design payload: only active approved references are returned.
create or replace function public.design_delivery_get_project_handoff(p_project_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.projects%rowtype;
  v_evidence jsonb:='[]'::jsonb;
  v_approval jsonb:='{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.productivity_can_access_entity('project',p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'taskId',e.project_task_id,
    'type',e.evidence_type,
    'label',e.label,
    'url',e.reference_url,
    'note',e.reference_note,
    'version',e.version_label,
    'createdAt',e.created_at
  ) order by
    case e.evidence_type
      when 'design_file' then 0
      when 'prototype' then 1
      when 'design_system' then 2
      when 'handoff_notes' then 3
      else 9
    end,
    e.created_at desc
  ),'[]'::jsonb)
  into v_evidence
  from public.design_delivery_evidence e
  where e.project_id=p_project_id
    and e.active
    and e.status='Approved'
    and e.evidence_type in ('design_file','prototype','design_system','handoff_notes');

  select coalesce(jsonb_build_object(
    'action',a.action,
    'notes',a.notes,
    'approvedAt',a.created_at,
    'toStage',a.to_stage
  ),'{}'::jsonb)
  into v_approval
  from public.project_client_approvals a
  where a.project_id=p_project_id
    and a.from_stage='Client Design Approval'
    and a.action='Approved'
  order by a.created_at desc
  limit 1;

  return jsonb_build_object(
    'projectId',v_project.id,
    'projectNumber',v_project.project_number,
    'projectName',v_project.project_name,
    'stage',v_project.stage,
    'package',public.design_delivery_package_context(v_project.id),
    'clientApproval',v_approval,
    'evidence',v_evidence
  );
end;
$$;

revoke all on function public.design_delivery_get_project_handoff(uuid) from public,anon;
grant execute on function public.design_delivery_get_project_handoff(uuid) to authenticated;

-- Keep the controlled review decision, but intentionally DO NOT notify the client here.
-- Existing notify_project_customer_event() already queues the canonical customer communication
-- when the project enters Client Design Approval.
create or replace function public.design_delivery_submit_review_decision(
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
  v_review public.design_delivery_reviews%rowtype;
  v_task public.project_tasks%rowtype;
  v_project public.projects%rowtype;
  v_config jsonb:='{}'::jsonb;
  v_min_score numeric:=90;
  v_failed boolean:=false;
  v_all_pass boolean:=false;
  v_developer uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_decision not in ('Pass','Minor Revision','Major Revision','Reject / Rework') then
    raise exception 'Unsupported review decision.';
  end if;

  select * into v_review from public.design_delivery_reviews where id=p_review_id for update;
  if not found then raise exception 'Review not found.'; end if;
  if v_review.status<>'Pending' then raise exception 'This review is already completed.'; end if;
  if v_review.reviewer_user_id is distinct from v_uid and not public.is_admin() then
    raise exception 'Only the assigned reviewer can complete this gate.';
  end if;

  select * into v_task from public.project_tasks where id=v_review.project_task_id for update;
  select * into v_project from public.projects where id=v_review.project_id for update;
  select coalesce(config_value,'{}'::jsonb) into v_config
  from public.system_configuration where config_key='design_delivery_sop_v1';
  v_min_score:=greatest(0,least(100,coalesce((v_config->>'minimumDesignQaScore')::numeric,90)));

  if v_review.review_type='Independent Design QA'
     and p_decision='Pass'
     and (p_quality_score is null or p_quality_score<v_min_score) then
    raise exception 'Independent Design QA requires a score of % or higher to pass.',v_min_score;
  end if;

  update public.design_delivery_reviews
  set status=p_decision,
      quality_score=p_quality_score,
      notes=trim(coalesce(p_notes,'')),
      completed_at=now()
  where id=p_review_id;
  v_failed:=p_decision<>'Pass';

  -- Post-development implementation QA loop.
  if v_review.review_type='Implementation QA' then
    if v_failed then
      select pt.user_id into v_developer
      from public.project_team pt
      join public.user_profiles u on u.id=pt.user_id
      where pt.project_id=v_project.id
        and u.status='active'
        and u.role in ('developer','web_developer','developer_designer')
      order by case when lower(coalesce(pt.role,'')) like '%developer%' then 0 else 1 end,
               pt.assigned_at
      limit 1;

      if v_developer is null then
        select u.id into v_developer
        from public.user_profiles u
        where u.status='active'
          and u.role in ('developer','web_developer','developer_designer')
        order by u.full_name
        limit 1;
      end if;

      if v_developer is not null and not exists(
        select 1 from public.project_tasks x
        where x.project_id=v_project.id
          and x.status<>'Done'
          and x.title='Resolve Design Implementation QA · '||v_task.title
      ) then
        insert into public.project_tasks(
          project_id,title,description,department,assigned_to,created_by,priority,status,due_date,notes
        ) values (
          v_project.id,
          'Resolve Design Implementation QA · '||v_task.title,
          'Resolve the structured PF-SOP-08 Design Implementation QA findings before launch.',
          'Development',
          v_developer,
          v_uid,
          'High',
          'To Do',
          current_date+2,
          trim(coalesce(p_notes,''))
        );
        -- Existing project-task trigger owns assignment/due communications.
      elsif v_developer is null and v_project.project_manager_id is not null then
        perform public.enqueue_in_app_notification(
          v_project.project_manager_id,
          'Design Implementation QA',
          'Design implementation changes need a developer',
          'PF-SOP-08 implementation QA found issues, but no active Developer is assigned to the project. Assign a developer to resolve them.',
          '/admin?tab=projects',
          'design-implementation-unowned:'||p_review_id::text
        );
      end if;
    elsif v_project.project_manager_id is not null then
      perform public.enqueue_in_app_notification(
        v_project.project_manager_id,
        'Design Implementation QA',
        'Design implementation QA passed',
        coalesce(v_project.project_number,'Project')||' passed the UX/UI implementation review and can continue through technical QA.',
        '/admin?tab=projects',
        'design-implementation-pass:'||p_review_id::text
      );
    end if;

    return jsonb_build_object('reviewId',p_review_id,'status',p_decision,'implementationQa',true);
  end if;

  if v_failed then
    update public.design_delivery_reviews
    set status='Cancelled',
        completed_at=now(),
        notes=case when length(notes)>0 then notes else 'Cancelled because another review gate required revision.' end
    where project_task_id=v_review.project_task_id
      and review_round=v_review.review_round
      and status='Pending';

    update public.project_tasks
    set status='Changes Required',completed_at=null,updated_at=now()
    where id=v_review.project_task_id;

    update public.projects
    set stage='UI/UX Design',updated_at=now()
    where id=v_project.id;

    if v_task.assigned_to is not null then
      perform public.enqueue_in_app_notification(
        v_task.assigned_to,
        'Design Changes',
        'Design changes required',
        v_review.review_type||' returned '||p_decision||' for "'||coalesce(v_task.title,'Design')||'". Open the same Design Delivery workspace and resolve the structured feedback.',
        '/admin?tab=myWork&focusTask='||v_task.id::text,
        'design-review-return:'||p_review_id::text
      );
    end if;

    return jsonb_build_object('reviewId',p_review_id,'status',p_decision,'taskStatus','Changes Required');
  end if;

  select not exists(
    select 1 from public.design_delivery_reviews r
    where r.project_task_id=v_review.project_task_id
      and r.review_round=v_review.review_round
      and r.review_type<>'Implementation QA'
      and r.status<>'Pass'
  ) into v_all_pass;

  if v_all_pass then
    update public.project_tasks
    set status='Done',completed_at=now(),updated_at=now()
    where id=v_review.project_task_id;

    -- This stage transition intentionally invokes the existing canonical customer communication trigger.
    update public.projects
    set stage='Client Design Approval',updated_at=now()
    where id=v_project.id;

    if v_project.project_manager_id is not null then
      perform public.enqueue_in_app_notification(
        v_project.project_manager_id,
        'Design Approval',
        'Design passed all internal gates',
        coalesce(v_task.title,'Design')||' passed Design QA, accessibility and technical feasibility and is ready for client approval.',
        '/admin?tab=projects',
        'design-internal-pass:'||v_task.id::text||':'||v_review.review_round::text
      );
    end if;
  end if;

  return jsonb_build_object(
    'reviewId',p_review_id,
    'status',p_decision,
    'allRequiredReviewsPassed',v_all_pass,
    'projectStage',case when v_all_pass then 'Client Design Approval' else v_project.stage end
  );
end;
$$;

-- Extend the existing Design Delivery project-stage hook:
-- 1) entering Development makes the approved design handoff visible to assigned developers,
-- 2) entering QA brings the original designer back for implementation fidelity review.
create or replace function public.design_delivery_on_project_stage_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.project_tasks%rowtype;
  v_round integer:=1;
  v_dev record;
  v_has_handoff boolean:=false;
begin
  if new.stage='Development' and old.stage is distinct from 'Development' then
    select exists(
      select 1 from public.design_delivery_evidence e
      where e.project_id=new.id
        and e.active
        and e.status='Approved'
        and e.evidence_type in ('design_file','prototype','design_system','handoff_notes')
    ) into v_has_handoff;

    for v_dev in
      select distinct u.id
      from public.project_team pt
      join public.user_profiles u on u.id=pt.user_id
      where pt.project_id=new.id
        and u.status='active'
        and u.role in ('developer','web_developer','developer_designer')
    loop
      perform public.enqueue_in_app_notification(
        v_dev.id,
        'Design Handoff',
        'Approved design ready for development',
        coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||
          case when v_has_handoff then ' has approved PF-SOP-08 design references ready for implementation.' else ' entered Development. Review the approved project/design context before implementation.' end,
        '/admin?tab=myWork',
        'design-dev-handoff:'||new.id::text||':'||v_dev.id::text||':'||coalesce(new.stage_changed_at::text,new.updated_at::text)
      );
    end loop;

    if not exists(
      select 1 from public.project_team pt
      join public.user_profiles u on u.id=pt.user_id
      where pt.project_id=new.id
        and u.status='active'
        and u.role in ('developer','web_developer','developer_designer')
    ) and new.project_manager_id is not null then
      perform public.enqueue_in_app_notification(
        new.project_manager_id,
        'Design Handoff',
        'Development stage needs a developer',
        coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||' is approved for Development but has no active Developer in the project team.',
        '/admin?tab=projects',
        'design-dev-unassigned:'||new.id::text||':'||coalesce(new.stage_changed_at::text,new.updated_at::text)
      );
    end if;
  end if;

  if new.stage='QA' and old.stage is distinct from 'QA' then
    select * into v_task
    from public.project_tasks
    where project_id=new.id
      and department in ('UI/UX Design','Design')
      and assigned_to is not null
    order by completed_at desc nulls last,created_at desc
    limit 1;

    if v_task.id is not null and not exists(
      select 1 from public.design_delivery_reviews
      where project_task_id=v_task.id
        and review_type='Implementation QA'
        and status='Pending'
    ) then
      select coalesce(max(review_round),0)+1 into v_round
      from public.design_delivery_reviews
      where project_task_id=v_task.id
        and review_type='Implementation QA';

      insert into public.design_delivery_reviews(
        project_task_id,project_id,review_round,review_type,reviewer_user_id,created_by
      ) values (
        v_task.id,new.id,v_round,'Implementation QA',v_task.assigned_to,coalesce(new.project_manager_id,v_task.assigned_to)
      );

      perform public.enqueue_in_app_notification(
        v_task.assigned_to,
        'Design Implementation QA',
        'Implementation is ready for design QA',
        coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||' entered QA. Compare staging against the approved design before launch.',
        '/admin?tab=myWork&reviewTask='||v_task.id::text,
        'design-implementation-qa:'||new.id::text||':'||v_round::text
      );
    elsif v_task.id is null and new.project_manager_id is not null then
      perform public.enqueue_in_app_notification(
        new.project_manager_id,
        'Design Implementation QA',
        'Implementation QA needs a design owner',
        coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||' entered QA but no UI/UX Design task with an assigned designer was found.',
        '/admin?tab=projects',
        'design-implementation-no-owner:'||new.id::text||':'||coalesce(new.stage_changed_at::text,new.updated_at::text)
      );
    end if;
  end if;

  return new;
end;
$$;

-- Keep trigger functions private; PostgreSQL triggers invoke them without client EXECUTE privileges.
revoke all on function public.design_delivery_on_project_stage_change() from public,anon,authenticated;
