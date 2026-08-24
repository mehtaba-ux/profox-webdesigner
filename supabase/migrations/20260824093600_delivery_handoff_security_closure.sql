-- Close duplicate Content initialization, raw client data exposure, canonical task
-- tampering, incomplete launch payment checks, and inherited function privileges.

create or replace function public.initialize_content_task_record(p_task_id uuid,p_auto_assign boolean default true)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype;v_project public.projects%rowtype;v_writer uuid;v_deliverable uuid;v_actor uuid;
begin
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found then raise exception 'Project task not found.'; end if;
  if coalesce(v_task.workflow_key,'') not in('content_delivery','content_curation') then return null; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  if not found then raise exception 'Project not found.'; end if;
  v_actor:=coalesce(v_project.project_manager_id,v_project.created_by,(select id from public.user_profiles where role='admin' and status='active' order by created_at limit 1));

  if v_task.workflow_stage is distinct from 'Content' or v_task.required_for_stage is false then
    update public.project_tasks set workflow_stage='Content',required_for_stage=true,updated_at=now() where id=v_task.id;
  end if;
  if p_auto_assign and v_task.assigned_to is null and v_project.stage='Content' then
    v_writer:=public.pick_content_writer(v_project.id);
    if v_writer is not null then
      update public.project_tasks set assigned_to=v_writer,updated_at=now() where id=v_task.id;
      insert into public.project_team(project_id,user_id,role) values(v_project.id,v_writer,'Content Writer')
      on conflict(project_id,user_id) do update set role='Content Writer';
    else
      perform public.queue_content_capacity_exception(v_project.id);
    end if;
  end if;
  insert into public.content_deliverables(project_task_id,project_id,content_type)
  values(v_task.id,v_task.project_id,'Website Copy') on conflict(project_task_id) do nothing;
  select id into v_deliverable from public.content_deliverables where project_task_id=v_task.id;
  if not exists(select 1 from public.content_delivery_events e where e.deliverable_id=v_deliverable and e.event_type='Created') then
    insert into public.content_delivery_events(deliverable_id,event_type,to_stage,notes,actor_id)
    values(v_deliverable,'Created','Requested','Content Delivery initialized automatically from the canonical Content Curation task.',v_actor);
  end if;
  return v_deliverable;
end;
$$;

create or replace function public.initialize_project_content_delivery(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_project public.projects%rowtype;v_task record;v_task_id uuid;v_created boolean:=false;v_actor uuid;v_count integer:=0;v_assigned integer:=0;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  if v_project.stage<>'Content' then return jsonb_build_object('initialized',false,'reason','Project is not in Content stage.'); end if;
  v_actor:=coalesce(v_project.project_manager_id,v_project.created_by,(select id from public.user_profiles where role='admin' and status='active' order by created_at limit 1));

  -- This trigger runs before the generic stage seeder. Seed first so PF-SOP-07 uses
  -- the existing content_curation task instead of creating a parallel module/task.
  perform public.ensure_project_delivery_stage_tasks(p_project_id,'Content');
  if not exists(select 1 from public.project_tasks where project_id=p_project_id and workflow_key in('content_delivery','content_curation')) then
    insert into public.project_tasks(project_id,title,description,department,assigned_to,created_by,priority,status,due_date,workflow_key,workflow_stage,required_for_stage)
    values(p_project_id,'Content Strategy & Website Copy','Create the project content through PF-SOP-07 using the approved project scope, client facts and package requirements. Complete independent quality and client review before UI/UX handoff.','Content',null,v_actor,coalesce(v_project.priority,'Normal'),'To Do',v_project.target_date,'content_delivery','Content',true)
    returning id into v_task_id;
    v_created:=true;
  end if;
  for v_task in select id from public.project_tasks where project_id=p_project_id and workflow_key in('content_delivery','content_curation') order by created_at loop
    perform public.initialize_content_task_record(v_task.id,true);
    v_count:=v_count+1;
  end loop;
  select count(*) into v_assigned from public.project_tasks where project_id=p_project_id and workflow_key in('content_delivery','content_curation') and assigned_to is not null;
  return jsonb_build_object('initialized',true,'createdFallbackTask',v_created,'contentDeliverables',v_count,'assignedTasks',v_assigned);
end;
$$;

create or replace function public.trigger_initialize_content_project_task()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if new.workflow_key in('content_delivery','content_curation') then
    perform public.initialize_content_task_record(new.id,true);
  end if;
  return new;
end;
$$;

create or replace function public.protect_required_project_task_delete()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if old.required_for_stage or old.workflow_key is not null then
    raise exception 'Required workflow tasks cannot be deleted. Deactivate or update the delivery template for future projects instead.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_required_project_task_delete on public.project_tasks;
create trigger trg_protect_required_project_task_delete
before delete on public.project_tasks
for each row execute function public.protect_required_project_task_delete();

create or replace function public.protect_project_task_integrity()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_pm uuid;v_role text;v_can_manage boolean:=false;
begin
  if new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by then
    raise exception 'A project task cannot be moved to another project or assigned a different creator.';
  end if;
  select project_manager_id into v_pm from public.projects where id=old.project_id;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  v_can_manage:=auth.role()='service_role' or public.is_admin() or v_role='site_manager' or v_pm=auth.uid();
  if old.workflow_key is not null and (
    new.workflow_key is distinct from old.workflow_key or new.workflow_stage is distinct from old.workflow_stage or new.required_for_stage is distinct from old.required_for_stage
  ) and auth.role()<>'service_role' then
    raise exception 'Canonical workflow identity and stage requirements are immutable after task creation.';
  end if;
  if not v_can_manage and (
    new.title is distinct from old.title or new.description is distinct from old.description or new.department is distinct from old.department or
    new.assigned_to is distinct from old.assigned_to or new.priority is distinct from old.priority or new.due_date is distinct from old.due_date or
    new.workflow_key is distinct from old.workflow_key or new.workflow_stage is distinct from old.workflow_stage or new.required_for_stage is distinct from old.required_for_stage
  ) then
    raise exception 'Assigned specialists may update work status and notes, but only Delivery Management can change task structure or assignment.';
  end if;
  if new.status='Done' then new.completed_at:=coalesce(new.completed_at,now());
  elsif new.status is distinct from old.status then new.completed_at:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_project_task_integrity on public.project_tasks;
create trigger trg_protect_project_task_integrity
before update on public.project_tasks
for each row execute function public.protect_project_task_integrity();

create or replace function public.protect_project_sale_snapshot()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if new.project_number is distinct from old.project_number or new.client_id is distinct from old.client_id or
     new.source_opportunity_id is distinct from old.source_opportunity_id or new.quotation_id is distinct from old.quotation_id or
     new.package_snapshot is distinct from old.package_snapshot or new.project_value is distinct from old.project_value or
     new.currency is distinct from old.currency or new.created_by is distinct from old.created_by then
    raise exception 'Sale-derived project identity, client, package and commercial values are immutable after project creation.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_project_sale_snapshot on public.projects;
create trigger trg_protect_project_sale_snapshot
before update on public.projects
for each row execute function public.protect_project_sale_snapshot();

create or replace function public.protect_project_launch_gate()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_verified numeric:=0;
begin
  if new.stage='Launch' and old.stage is distinct from new.stage then
    if not exists(select 1 from public.payments p where (p.quotation_id=new.quotation_id or p.opportunity_id=new.source_opportunity_id) and p.status='Verified' and p.payment_type in('Final Payment','Full Payment')) then
      raise exception 'Verified final/full payment is required before Launch.';
    end if;
    select coalesce(sum(p.amount_paid),0) into v_verified from public.payments p
    where (p.quotation_id=new.quotation_id or p.opportunity_id=new.source_opportunity_id) and p.status='Verified';
    if round(v_verified,2)<round(coalesce(new.project_value,0),2) then
      raise exception 'Full project payment is required before Launch. Verified total: % %, project value: % %.',new.currency,v_verified,new.currency,new.project_value;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.delivery_release_staffing_blockers(p_stage text)
returns text[]
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_blockers text[]:='{}';
begin
  if p_stage in('Final Revisions','Launch') and not exists(
    select 1 from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.status='active' and u.onboarding_status='completed' and u.role in('developer','web_developer','developer_designer') and coalesce(cp.availability_status,'Available')<>'Unavailable'
  ) then
    v_blockers:=array_append(v_blockers,'At least one active, onboarded and available Developer is required for revisions and release implementation.');
  end if;
  return v_blockers;
end;
$$;

create or replace function public.delivery_stage_staffing_readiness(p_project_id uuid,p_stage text)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_role text;v_pm uuid;v_blockers text[];
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  select project_manager_id into v_pm from public.projects where id=p_project_id;
  if not(public.is_admin() or v_role='site_manager' or (v_role='project_manager' and v_pm=auth.uid())) then raise exception 'Only the assigned Project Manager, Site Manager or Admin can inspect delivery staffing readiness.'; end if;
  v_blockers:=public.delivery_stage_staffing_blockers(p_stage)||public.delivery_release_staffing_blockers(p_stage);
  return jsonb_build_object('stage',p_stage,'ready',coalesce(array_length(v_blockers,1),0)=0,'blockers',to_jsonb(v_blockers));
end;
$$;

create or replace function public.protect_delivery_release_staffing()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_blockers text[];
begin
  if new.stage is not distinct from old.stage then return new; end if;
  v_blockers:=public.delivery_release_staffing_blockers(new.stage);
  if coalesce(array_length(v_blockers,1),0)>0 then raise exception 'Cannot enter %: %',new.stage,array_to_string(v_blockers,' '); end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_delivery_release_staffing on public.projects;
create trigger trg_protect_delivery_release_staffing
before update of stage on public.projects
for each row execute function public.protect_delivery_release_staffing();

-- Client portal reads must use client_get_portal_projects(), which explicitly
-- projects safe fields. Raw operational rows remain staff-only.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or project_manager_id=auth.uid() or exists(select 1 from public.project_team pt where pt.project_id=projects.id and pt.user_id=auth.uid())
);

drop policy if exists project_tasks_select on public.project_tasks;
create policy project_tasks_select on public.project_tasks for select to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or assigned_to=auth.uid() or exists(select 1 from public.projects p where p.id=project_tasks.project_id and p.project_manager_id=auth.uid()) or exists(select 1 from public.project_team pt where pt.project_id=project_tasks.project_id and pt.user_id=auth.uid())
);

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using(
  public.is_admin() or salesperson_id=auth.uid() or public.has_active_role(array['project_manager','site_manager']) or exists(select 1 from public.projects p join public.project_team pt on pt.project_id=p.id where (p.quotation_id=payments.quotation_id or p.source_opportunity_id=payments.opportunity_id) and pt.user_id=auth.uid())
);

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using(
  public.is_admin() or salesperson_id=auth.uid() or public.has_active_role(array['project_manager','site_manager']) or exists(select 1 from public.projects p join public.project_team pt on pt.project_id=p.id where p.client_id=clients.id and pt.user_id=auth.uid())
);

drop policy if exists quotations_select on public.quotations;
create policy quotations_select on public.quotations for select to authenticated using(
  public.is_admin() or salesperson_id=auth.uid() or public.has_active_role(array['project_manager','site_manager']) or exists(select 1 from public.projects p join public.project_team pt on pt.project_id=p.id where p.quotation_id=quotations.id and pt.user_id=auth.uid())
);

drop policy if exists quotation_items_select on public.quotation_items;
create policy quotation_items_select on public.quotation_items for select to authenticated using(
  exists(select 1 from public.quotations q where q.id=quotation_items.quotation_id and (public.is_admin() or q.salesperson_id=auth.uid() or public.has_active_role(array['project_manager','site_manager']) or exists(select 1 from public.projects p join public.project_team pt on pt.project_id=p.id where p.quotation_id=q.id and pt.user_id=auth.uid())))
);

-- Remove inherited PUBLIC execution from authenticated-only and trigger-only functions.
revoke all on function public.activate_uiux_designer(uuid) from public,anon;
revoke all on function public.admin_get_design_operations() from public,anon;
revoke all on function public.admin_upsert_delivery_task_template(jsonb) from public,anon;
revoke all on function public.admin_upsert_workforce_capability_profile(uuid,jsonb) from public,anon;
revoke all on function public.approve_uiux_candidate_final(uuid) from public,anon;
revoke all on function public.get_design_delivery_metrics(integer) from public,anon;
revoke all on function public.get_my_training_modules() from public,anon;
revoke all on function public.request_uiux_final_approval() from public,anon;
revoke all on function public.training_user_has_module(uuid) from public,anon;
grant execute on function public.activate_uiux_designer(uuid) to authenticated;
grant execute on function public.admin_get_design_operations() to authenticated;
grant execute on function public.admin_upsert_delivery_task_template(jsonb) to authenticated;
grant execute on function public.admin_upsert_workforce_capability_profile(uuid,jsonb) to authenticated;
grant execute on function public.approve_uiux_candidate_final(uuid) to authenticated;
grant execute on function public.get_design_delivery_metrics(integer) to authenticated;
grant execute on function public.get_my_training_modules() to authenticated;
grant execute on function public.request_uiux_final_approval() to authenticated;
grant execute on function public.training_user_has_module(uuid) to authenticated;

revoke all on function public.protect_call_practice_mock_progress_write() from public,anon,authenticated;
revoke all on function public.protect_discovery_call_progress_write() from public,anon,authenticated;
revoke all on function public.protect_meeting_booking_progress_write() from public,anon,authenticated;
revoke all on function public.protect_required_project_task_delete() from public,anon,authenticated;
revoke all on function public.protect_project_task_integrity() from public,anon,authenticated;
revoke all on function public.protect_project_sale_snapshot() from public,anon,authenticated;
revoke all on function public.delivery_release_staffing_blockers(text) from public,anon,authenticated;
revoke all on function public.protect_delivery_release_staffing() from public,anon,authenticated;
revoke all on function public.trigger_initialize_content_project_task() from public,anon,authenticated;
revoke all on function public.initialize_content_task_record(uuid,boolean) from public,anon,authenticated;
revoke all on function public.initialize_project_content_delivery(uuid) from public,anon,authenticated;
grant execute on function public.initialize_content_task_record(uuid,boolean) to service_role;
grant execute on function public.initialize_project_content_delivery(uuid) to service_role;
