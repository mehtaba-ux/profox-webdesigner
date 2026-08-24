-- Align the protected PF-SOP-07 Content -> UI/UX handoff with the canonical project workflow guard.
-- The handoff remains automatic only after the Content gate passes; the generic project
-- workflow guard is not bypassed for any other stage transition.

create or replace function public.protect_project_stage_workflow()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_expected text;
  v_incomplete integer:=0;
  v_client_decision boolean:=coalesce(current_setting('profox.project_client_decision_rpc',true),'')='1';
  v_content_handoff boolean:=coalesce(current_setting('profox.content_handoff_rpc',true),'')='1';
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if old.status<>'Active' then raise exception 'Only an active project may change delivery stage.'; end if;

  -- Content client approval may call the protected Content handoff as the client identity.
  -- Permit only the one approved Content -> UI/UX transition, and still enforce completion
  -- of every canonical Content workflow task before returning.
  if v_content_handoff then
    if old.stage<>'Content' or new.stage<>'UI/UX Design' then
      raise exception 'Invalid protected Content handoff transition.';
    end if;
    select count(*) into v_incomplete
    from public.project_tasks t
    where t.project_id=old.id
      and t.workflow_stage='Content'
      and t.required_for_stage is true
      and t.status<>'Done';
    if v_incomplete>0 then
      raise exception 'Complete all required Content workflow tasks before advancing the project. Remaining: %.',v_incomplete;
    end if;
    return new;
  end if;

  if v_client_decision then
    if old.stage='Client Design Approval' and new.stage in ('Development','UI/UX Design') then return new; end if;
    if old.stage='Client Review' and new.stage='Final Revisions' then return new; end if;
    raise exception 'Invalid client-controlled project transition.';
  end if;

  if not public.is_admin() and old.project_manager_id is distinct from auth.uid() then
    raise exception 'Only the assigned Project Manager or Administrator may advance the project.';
  end if;
  if old.stage in ('Client Design Approval','Client Review') then
    raise exception 'This stage requires a recorded client decision before delivery can continue.';
  end if;

  v_expected:=case old.stage
    when 'Sales Handover' then 'Client Onboarding'
    when 'Client Onboarding' then 'Requirements'
    when 'Requirements' then 'Content'
    when 'Content' then 'UI/UX Design'
    when 'UI/UX Design' then 'Client Design Approval'
    when 'Development' then 'QA'
    when 'QA' then 'Client Review'
    when 'Final Revisions' then 'Launch'
    when 'Launch' then 'Handover'
    when 'Handover' then 'Completed'
    else null
  end;
  if v_expected is null or new.stage<>v_expected then
    raise exception 'Project stages must follow the approved delivery sequence. Expected next stage: %.',coalesce(v_expected,'none');
  end if;
  if old.stage='Sales Handover' then
    if old.project_manager_id is null then raise exception 'Assign an active Project Manager before completing Sales Handover.'; end if;
    if length(btrim(coalesce(old.sales_handover_notes,'')))<10 then raise exception 'Record the Sales Handover notes before Client Onboarding.'; end if;
  end if;
  select count(*) into v_incomplete
  from public.project_tasks t
  where t.project_id=old.id and t.workflow_stage=old.stage and t.required_for_stage is true and t.status<>'Done';
  if v_incomplete>0 then
    raise exception 'Complete all required % workflow tasks before advancing the project. Remaining: %.',old.stage,v_incomplete;
  end if;
  if new.stage='Completed' then
    new.status:='Completed';
    new.completed_at:=coalesce(new.completed_at,now());
  end if;
  return new;
end;
$$;

create or replace function public.maybe_handoff_content_project_to_uiux(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.projects%rowtype;
  v_gate jsonb;
  v_designer uuid;
  v_task record;
  v_uiux_task uuid;
  v_actor uuid;
  v_payload jsonb;
  v_assigned integer:=0;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;

  v_gate:=public.content_project_ready_for_uiux(p_project_id);
  if coalesce((v_gate->>'ready')::boolean,false) is not true then
    return v_gate||jsonb_build_object('handedOff',false);
  end if;
  if v_project.stage not in ('Content','UI/UX Design') then
    return v_gate||jsonb_build_object('handedOff',false,'reason','Project is not in a Content-to-UI/UX stage.');
  end if;

  v_actor:=coalesce(
    v_project.project_manager_id,
    v_project.created_by,
    (select id from public.user_profiles where role='admin' and status='active' order by created_at limit 1)
  );
  v_designer:=public.pick_uiux_designer(p_project_id);

  if not exists(
    select 1 from public.project_tasks
    where project_id=p_project_id
      and (lower(coalesce(department,''))='ui/ux design' or workflow_key='uiux_design')
  ) then
    insert into public.project_tasks(
      project_id,title,description,department,assigned_to,created_by,priority,status,due_date,notes,
      workflow_key,workflow_stage,required_for_stage
    ) values(
      p_project_id,'UI/UX Design — Approved Content Handoff',
      'Design from the final approved Content Delivery package. Review the approved copy, message hierarchy, CTA, evidence, client approval and implementation notes before starting layouts.',
      'UI/UX Design',v_designer,v_actor,coalesce(v_project.priority,'Normal'),'To Do',v_project.target_date,
      'Content Delivery gates passed. Use the connected approved-content handoff panel as the source of truth.',
      'uiux_design','UI/UX Design',true
    ) returning id into v_uiux_task;
  end if;

  for v_task in
    select * from public.project_tasks
    where project_id=p_project_id
      and (lower(coalesce(department,''))='ui/ux design' or workflow_key='uiux_design')
    order by created_at
  loop
    v_uiux_task:=coalesce(v_uiux_task,v_task.id);
    if v_task.assigned_to is null and v_designer is not null then
      update public.project_tasks
      set assigned_to=v_designer,workflow_key=coalesce(workflow_key,'uiux_design'),
          workflow_stage='UI/UX Design',required_for_stage=true,updated_at=now()
      where id=v_task.id;
      v_assigned:=v_assigned+1;
    else
      update public.project_tasks
      set workflow_key=coalesce(workflow_key,'uiux_design'),workflow_stage='UI/UX Design',
          required_for_stage=true,updated_at=now()
      where id=v_task.id;
      if v_task.assigned_to is not null then v_assigned:=v_assigned+1; end if;
    end if;
  end loop;

  if v_designer is not null then
    insert into public.project_team(project_id,user_id,role)
    values(p_project_id,v_designer,'UI/UX Designer')
    on conflict(project_id,user_id) do update set role='UI/UX Designer';
  end if;

  -- Satisfy the existing canonical project-stage task gate first.
  perform set_config('app.content_delivery_internal','1',true);
  update public.project_tasks
  set status='Done',completed_at=coalesce(completed_at,now()),updated_at=now()
  where project_id=p_project_id
    and (lower(coalesce(department,''))='content' or workflow_key='content_delivery')
    and status<>'Done';

  -- The project guard recognizes only this protected Content -> UI/UX transition and
  -- independently verifies that no required Content task remains incomplete.
  perform set_config('profox.content_handoff_rpc','1',true);
  if v_project.stage='Content' then
    update public.projects set stage='UI/UX Design',updated_at=now() where id=p_project_id;
  end if;

  update public.content_deliverables
  set uiux_handoff_at=coalesce(uiux_handoff_at,now()),uiux_task_id=coalesce(uiux_task_id,v_uiux_task),updated_at=now()
  where project_id=p_project_id;

  insert into public.content_delivery_events(deliverable_id,event_type,from_stage,to_stage,notes,metadata,actor_id)
  select d.id,'UI/UX Handoff',d.lifecycle_stage,d.lifecycle_stage,
    'Approved content handed to the existing UI/UX project workflow.',
    jsonb_build_object('uiuxTaskId',v_uiux_task,'designerId',v_designer,'gate',v_gate),v_actor
  from public.content_deliverables d
  where d.project_id=p_project_id
    and not exists(
      select 1 from public.content_delivery_events e
      where e.deliverable_id=d.id and e.event_type='UI/UX Handoff'
    );

  v_payload:=public.content_project_payload(p_project_id)||jsonb_build_object('uiuxTaskId',v_uiux_task,'handoffAt',now());
  if v_designer is not null then
    perform public.service_queue_staff_operational_notification(
      v_designer,'content-uiux-handoff:'||p_project_id::text,'content_uiux_handoff_ready','Handoff',
      'Approved content ready for UI/UX',
      v_project.project_name||' has completed Content Delivery. Open the assigned UI/UX task and approved-content handoff package.',
      '/admin/app/projects?tab=myWork',v_payload,now()
    );
  else
    if v_project.project_manager_id is not null then
      perform public.service_queue_staff_operational_notification(
        v_project.project_manager_id,'uiux-capacity:'||p_project_id::text,'uiux_capacity_exception','Delivery Exception',
        'Approved content needs a UI/UX owner',
        v_project.project_name||' completed Content Delivery, but no active UI/UX Designer is available. The UI/UX task is ready but unassigned.',
        '/admin/app/projects?tab=projects',v_payload,now()
      );
    else
      perform public.service_queue_active_admins_operational_notification(
        'uiux-capacity:'||p_project_id::text,'uiux_capacity_exception','Delivery Exception',
        'Approved content needs a UI/UX owner',
        v_project.project_name||' completed Content Delivery, but no active UI/UX Designer or Project Manager is available.',
        '/admin/app/projects?tab=projects',v_payload,now()
      );
    end if;
  end if;

  return v_gate||jsonb_build_object(
    'handedOff',true,'uiuxTaskId',v_uiux_task,'designerId',v_designer,'assignedUiuxTasks',v_assigned
  );
end;
$$;

-- Preserve the runtime-hardening ACL: this mutation remains internal/service-only.
revoke all on function public.maybe_handoff_content_project_to_uiux(uuid) from public,anon,authenticated;
grant execute on function public.maybe_handoff_content_project_to_uiux(uuid) to service_role;
