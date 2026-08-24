-- PF UI/UX Designer Team — training dispatcher + capacity-aware development handoff
-- Scope ends when an approved design is handed to an eligible Developer.

create or replace function public.request_my_final_approval()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_track text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_track:=public.training_track_for_user(auth.uid());
  if v_track='uiux_design' then perform public.request_uiux_final_approval(); return; end if;
  if v_track='sales' then perform public.request_sales_final_approval(); return; end if;
  raise exception 'No Final Approval workflow is configured for this training track.';
end;
$$;

grant execute on function public.request_my_final_approval() to authenticated;

-- Finds the least-loaded active Developer under the existing BI open-task capacity threshold.
-- This is a staffing recommendation/selection at the handoff boundary only; it does not create a second Developer workflow.
create or replace function public.design_delivery_select_available_developer(p_project_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_max integer:=8; v_id uuid;
begin
  begin
    v_max:=greatest(1,coalesce(((public.business_intelligence_settings()->'thresholds'->>'maxOpenTasksPerPerson')::integer),8));
  exception when others then v_max:=8; end;

  select u.id into v_id
  from public.user_profiles u
  where u.status='active'
    and u.role in('developer','web_developer','developer_designer')
    and (select count(*) from public.project_tasks t where t.assigned_to=u.id and t.completed_at is null and lower(coalesce(t.status,'')) not in('completed','done','cancelled')) < v_max
  order by
    (select count(*) from public.project_tasks t where t.assigned_to=u.id and t.completed_at is null and lower(coalesce(t.status,'')) not in('completed','done','cancelled')) asc,
    (select count(*) from public.project_team pt join public.projects p on p.id=pt.project_id where pt.user_id=u.id and p.completed_at is null and lower(coalesce(p.status,'')) not in('completed','cancelled')) asc,
    coalesce(nullif(u.full_name,''),u.email),u.id
  limit 1;
  return v_id;
end;
$$;

revoke all on function public.design_delivery_select_available_developer(uuid) from public,anon,authenticated;

-- At approved Design -> Development, reuse project_team/project_tasks and choose the least-loaded available developer if none is already assigned.
-- Existing post-development QA behavior is retained unchanged below, but no new Developer execution system is introduced.
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
  v_selected_dev uuid;
  v_has_handoff boolean:=false;
begin
  if new.stage='Development' and old.stage is distinct from 'Development' then
    select exists(
      select 1 from public.design_delivery_evidence e
      where e.project_id=new.id and e.active and e.status='Approved'
        and e.evidence_type in('design_file','prototype','design_system','handoff_notes')
    ) into v_has_handoff;

    -- Respect an already assigned active project Developer first.
    select u.id into v_selected_dev
    from public.project_team pt join public.user_profiles u on u.id=pt.user_id
    where pt.project_id=new.id and u.status='active' and u.role in('developer','web_developer','developer_designer')
    order by pt.assigned_at
    limit 1;

    -- If Design is approved but no Developer owns the handoff yet, choose the least-loaded eligible active Developer.
    if v_selected_dev is null then
      v_selected_dev:=public.design_delivery_select_available_developer(new.id);
      if v_selected_dev is not null then
        insert into public.project_team(project_id,user_id,role,assigned_at)
        values(new.id,v_selected_dev,'Developer',now())
        on conflict(project_id,user_id) do update set role=excluded.role;

        update public.project_tasks
        set assigned_to=v_selected_dev,updated_at=now()
        where project_id=new.id
          and department='Development'
          and assigned_to is null
          and completed_at is null
          and lower(coalesce(status,'')) not in('completed','done','cancelled');
      end if;
    end if;

    for v_dev in
      select distinct u.id
      from public.project_team pt join public.user_profiles u on u.id=pt.user_id
      where pt.project_id=new.id and u.status='active' and u.role in('developer','web_developer','developer_designer')
    loop
      perform public.enqueue_in_app_notification(
        v_dev.id,'Design Handoff','Approved design ready for development',
        coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||
          case when v_has_handoff then ' has approved PF-SOP-08 design references ready for implementation.' else ' entered Development. Review the approved project/design context before implementation.' end,
        '/admin?tab=myWork','design-dev-handoff:'||new.id::text||':'||v_dev.id::text||':'||coalesce(new.stage_changed_at::text,new.updated_at::text)
      );
    end loop;

    if v_selected_dev is null and not exists(
      select 1 from public.project_team pt join public.user_profiles u on u.id=pt.user_id
      where pt.project_id=new.id and u.status='active' and u.role in('developer','web_developer','developer_designer')
    ) and new.project_manager_id is not null then
      perform public.enqueue_in_app_notification(
        new.project_manager_id,'Design Handoff','Development handoff needs an available developer',
        coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||' is approved for Development, but no active Developer is currently below the configured workload capacity. Assign or free capacity before implementation starts.',
        '/admin?tab=projects','design-dev-unassigned:'||new.id::text||':'||coalesce(new.stage_changed_at::text,new.updated_at::text)
      );
    elsif v_selected_dev is not null and new.project_manager_id is not null then
      perform public.enqueue_in_app_notification(
        new.project_manager_id,'Design Handoff','Developer ownership confirmed',
        coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||' has a Developer owner for the approved design handoff.',
        '/admin?tab=projects','design-dev-owner-confirmed:'||new.id::text||':'||v_selected_dev::text||':'||coalesce(new.stage_changed_at::text,new.updated_at::text)
      );
    end if;
  end if;

  -- Existing downstream implementation-fidelity loop retained from the Design Delivery foundation.
  if new.stage='QA' and old.stage is distinct from 'QA' then
    select * into v_task from public.project_tasks
    where project_id=new.id and department in('UI/UX Design','Design') and assigned_to is not null
    order by completed_at desc nulls last,created_at desc limit 1;

    if v_task.id is not null and not exists(
      select 1 from public.design_delivery_reviews where project_task_id=v_task.id and review_type='Implementation QA' and status='Pending'
    ) then
      select coalesce(max(review_round),0)+1 into v_round from public.design_delivery_reviews where project_task_id=v_task.id and review_type='Implementation QA';
      insert into public.design_delivery_reviews(project_task_id,project_id,review_round,review_type,reviewer_user_id,created_by)
      values(v_task.id,new.id,v_round,'Implementation QA',v_task.assigned_to,coalesce(new.project_manager_id,v_task.assigned_to));
      perform public.enqueue_in_app_notification(v_task.assigned_to,'Design Implementation QA','Implementation is ready for design QA',coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||' entered QA. Compare staging against the approved design before launch.','/admin?tab=myWork&reviewTask='||v_task.id::text,'design-implementation-qa:'||new.id::text||':'||v_round::text);
    elsif v_task.id is null and new.project_manager_id is not null then
      perform public.enqueue_in_app_notification(new.project_manager_id,'Design Implementation QA','Implementation QA needs a design owner',coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||' entered QA but no UI/UX Design task with an assigned designer was found.','/admin?tab=projects','design-implementation-no-owner:'||new.id::text||':'||coalesce(new.stage_changed_at::text,new.updated_at::text));
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.design_delivery_on_project_stage_change() from public,anon,authenticated;
