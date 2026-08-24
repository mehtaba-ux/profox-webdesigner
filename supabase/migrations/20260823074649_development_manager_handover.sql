-- ProFox Development Delivery — manager-controlled final client handover
-- Development prepares the final technical/client-ready package.
-- The assigned Project Manager (or an independent Admin) must review it.
-- Client handover is released only by the manager approval RPC, never merely by entering the Handover project stage.

update public.system_configuration
set config_value=config_value||jsonb_build_object(
  'managerHandoverRequired',true,
  'handoverRequiredClientFields',jsonb_build_array('productionUrl','documentationReference','releaseEvidence','accessOwnership','supportBoundary'),
  'requiredEvidenceByWorkflow',coalesce(config_value->'requiredEvidenceByWorkflow','{}'::jsonb)||jsonb_build_object(
    'development_handover_package',jsonb_build_array('production_url','documentation','release_notes','qa_handoff','handover_reference')
  )
),updated_at=now()
where config_key='development_delivery_sop_v1';

create table if not exists public.development_handover_packages(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_task_id uuid not null references public.project_tasks(id) on delete cascade,
  version integer not null check(version>0),
  status text not null default 'Submitted',
  client_package jsonb not null default '{}'::jsonb,
  submission_note text not null default '',
  prepared_by uuid not null references public.user_profiles(id),
  submitted_at timestamptz not null default now(),
  manager_reviewer_id uuid references public.user_profiles(id),
  manager_notes text not null default '',
  reviewed_at timestamptz,
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_handover_status_check check(status in('Submitted','Changes Required','Released to Client','Superseded')),
  unique(project_id,version)
);

create unique index if not exists development_handover_one_submitted_idx on public.development_handover_packages(project_id) where status='Submitted';
create index if not exists development_handover_project_idx on public.development_handover_packages(project_id,version desc);

alter table public.development_handover_packages enable row level security;
drop policy if exists development_handover_staff_select on public.development_handover_packages;
create policy development_handover_staff_select on public.development_handover_packages
for select to authenticated
using(
  exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.status='active' and u.role<>'customer')
  and public.productivity_can_access_entity('project',project_id)
);
revoke insert,update,delete on public.development_handover_packages from authenticated;
grant select on public.development_handover_packages to authenticated;

create or replace function public.development_handover_validate_client_package(p_package jsonb)
returns void
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_required jsonb; v_missing text:=''; v_key text;
begin
  if jsonb_typeof(coalesce(p_package,'{}'::jsonb))<>'object' then raise exception 'Client handover package must be a structured object.'; end if;
  if lower(p_package::text)~'"(password|secret|token|api[_ -]?key|private[_ -]?key)"\s*:' then raise exception 'Do not store passwords, tokens, API keys or other secrets in the client handover package.'; end if;
  v_required:=coalesce(public.development_delivery_config()->'handoverRequiredClientFields','[]'::jsonb);
  select string_agg(req.value,', ' order by req.value) into v_missing from jsonb_array_elements_text(v_required)req(value)
  where length(trim(coalesce(p_package->>req.value,'')))=0;
  if coalesce(v_missing,'')<>'' then raise exception 'Client handover package is missing required fields: %.',v_missing; end if;
  for v_key in select jsonb_object_keys(p_package) loop
    if length(coalesce(p_package->>v_key,''))>12000 then raise exception 'Handover field % is too large. Link controlled documentation instead of pasting large documents.',v_key; end if;
  end loop;
end;
$$;

-- Entering Handover creates one required Development-owned preparation task inside the existing canonical stage.
create or replace function public.development_handover_ensure_task(p_project_id uuid)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_project public.projects%rowtype; v_dev uuid; v_task uuid; v_creator uuid;
begin
  select * into v_project from public.projects where id=p_project_id; if not found then raise exception 'Project not found.'; end if;
  select id into v_task from public.project_tasks where project_id=p_project_id and workflow_key='development_handover_package' limit 1;
  if v_task is not null then return v_task; end if;
  select u.id into v_dev from public.project_team pt join public.user_profiles u on u.id=pt.user_id
  where pt.project_id=p_project_id and u.status='active' and u.role in('developer','web_developer','developer_designer')
  order by case when lower(coalesce(pt.role,'')) like '%developer%' then 0 else 1 end,pt.assigned_at limit 1;
  v_creator:=coalesce(v_project.project_manager_id,v_project.created_by,auth.uid());
  if v_creator is null then raise exception 'Handover task creator could not be resolved.'; end if;
  insert into public.project_tasks(project_id,title,description,department,assigned_to,created_by,priority,status,workflow_key,workflow_stage,required_for_stage)
  values(p_project_id,'Technical Handover Package Preparation','Prepare the client-ready technical handover package and evidence. Do not include passwords, tokens, private keys or secret-bearing URLs. Submit through Development Delivery for independent Project Manager/Management approval before anything is released to the client.','Development',v_dev,v_creator,'High','To Do','development_handover_package','Handover',true)
  on conflict(project_id,workflow_key) where workflow_key is not null do update set workflow_stage='Handover',required_for_stage=true
  returning id into v_task;
  return v_task;
end;
$$;

-- Extend the existing Development stage hook without creating another project lifecycle.
create or replace function public.development_delivery_on_project_stage_change()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if new.stage='Development' and old.stage is distinct from 'Development' then perform public.development_delivery_assign_stage_tasks(new.id); end if;
  if new.stage='Handover' and old.stage is distinct from 'Handover' then perform public.development_handover_ensure_task(new.id); end if;
  return new;
end;
$$;

-- Crucial behavior change: Handover stage means internal preparation/review, not client release.
-- All other existing customer lifecycle notifications are preserved.
create or replace function public.notify_project_customer_event()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_cycle text;
begin
  if tg_op='INSERT' then
    perform public.queue_project_customer_message(new.id,'customer-project-started:'||new.id::text,'customer_project_started');
    return new;
  end if;
  if new.stage is distinct from old.stage then
    v_cycle:=floor(extract(epoch from new.stage_changed_at)*1000)::bigint::text;
    if new.stage in('Client Design Approval','Client Review') then
      perform public.queue_project_customer_message(new.id,'customer-project-review:'||new.id::text||':'||lower(replace(new.stage,' ','-'))||':'||v_cycle,'customer_project_review_required');
    elsif new.stage='Launch' then
      perform public.queue_project_customer_message(new.id,'customer-project-launch:'||new.id::text,'customer_project_launch');
    elsif new.stage='Completed' then
      perform public.queue_project_customer_message(new.id,'customer-project-completed:'||new.id::text,'customer_project_completed');
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.status='Paused' then
      perform public.queue_project_customer_message(new.id,'customer-project-paused:'||new.id::text||':'||extract(epoch from new.updated_at)::bigint,'customer_project_paused');
    elsif new.status='Active' and old.status='Paused' then
      perform public.queue_project_customer_message(new.id,'customer-project-resumed:'||new.id::text||':'||extract(epoch from new.updated_at)::bigint,'customer_project_resumed');
    elsif new.status='Cancelled' then
      perform public.queue_project_customer_message(new.id,'customer-project-cancelled:'||new.id::text,'customer_project_cancelled');
    elsif new.status='Completed' then
      perform public.queue_project_customer_message(new.id,'customer-project-completed:'||new.id::text,'customer_project_completed');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.development_handover_submit(p_project_id uuid,p_client_package jsonb,p_submission_note text default '')
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_project public.projects%rowtype; v_task public.project_tasks%rowtype; v_role text; v_version int; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_project from public.projects where id=p_project_id for update; if not found then raise exception 'Project not found.'; end if;
  if v_project.stage<>'Handover' then raise exception 'The project must be in Handover before the final package is submitted.'; end if;
  select * into v_task from public.project_tasks where project_id=p_project_id and workflow_key='development_handover_package' for update;
  if not found then perform public.development_handover_ensure_task(p_project_id); select * into v_task from public.project_tasks where project_id=p_project_id and workflow_key='development_handover_package' for update; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_task.assigned_to is distinct from v_uid or v_role not in('developer','web_developer','developer_designer') then raise exception 'Only the assigned Web Developer may submit the final technical handover package.'; end if;
  if v_task.status<>'In Progress' then raise exception 'Start the Technical Handover Package task before submitting it for manager review.'; end if;
  if exists(select 1 from public.development_handover_packages where project_id=p_project_id and status='Submitted') then raise exception 'A handover package is already awaiting manager review.'; end if;
  perform public.development_delivery_assert_current_playbook_complete(v_task.id,v_uid);
  perform public.development_delivery_assert_required_evidence(v_task.id);
  perform public.development_handover_validate_client_package(p_client_package);
  select coalesce(max(version),0)+1 into v_version from public.development_handover_packages where project_id=p_project_id;
  insert into public.development_handover_packages(project_id,project_task_id,version,status,client_package,submission_note,prepared_by)
  values(p_project_id,v_task.id,v_version,'Submitted',p_client_package,left(trim(coalesce(p_submission_note,'')),6000),v_uid) returning id into v_id;
  update public.project_tasks set status='Review',updated_at=now() where id=v_task.id;
  if v_project.project_manager_id is not null then
    perform public.enqueue_in_app_notification(v_project.project_manager_id,'Final Handover','Final client handover requires your review',coalesce(v_project.project_number,'Project')||' · '||coalesce(v_project.project_name,'')||' has a Development handover package ready. Review it before anything is released to the client.','/admin?tab=projects','development-handover-review:'||v_id::text||':'||v_project.project_manager_id::text);
  else
    perform public.service_queue_active_admins_operational_notification('development-handover-unowned:'||v_id::text,'development_handover_needs_manager','Final Handover','Final client handover needs a manager reviewer',coalesce(v_project.project_number,'Project')||' has a submitted handover package but no assigned Project Manager.','/admin?tab=projects',jsonb_build_object('projectId',p_project_id,'handoverPackageId',v_id),now());
  end if;
  return jsonb_build_object('packageId',v_id,'version',v_version,'status','Submitted','taskStatus','Review');
end;
$$;

create or replace function public.development_manager_review_handover(p_package_id uuid,p_decision text,p_notes text default '')
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_package public.development_handover_packages%rowtype; v_project public.projects%rowtype; v_task public.project_tasks%rowtype; v_client_user uuid; v_outbox uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_decision not in('Approved','Changes Required') then raise exception 'Decision must be Approved or Changes Required.'; end if;
  select * into v_package from public.development_handover_packages where id=p_package_id for update; if not found then raise exception 'Handover package not found.'; end if;
  if v_package.status<>'Submitted' then raise exception 'This handover package is no longer awaiting review.'; end if;
  select * into v_project from public.projects where id=v_package.project_id for update; if not found then raise exception 'Project not found.'; end if;
  select * into v_task from public.project_tasks where id=v_package.project_task_id for update;
  if v_project.stage<>'Handover' then raise exception 'Manager handover review is only available while the project is in Handover.'; end if;
  if not public.is_admin() and v_project.project_manager_id is distinct from v_uid then raise exception 'Only the assigned Project Manager or Administrator may review final client handover.'; end if;
  if v_package.prepared_by=v_uid then raise exception 'The person who prepared the handover package cannot approve their own final client handover.'; end if;

  if p_decision='Changes Required' then
    if length(trim(coalesce(p_notes,'')))<10 then raise exception 'Specific manager feedback is required when changes are requested.'; end if;
    update public.development_handover_packages set status='Changes Required',manager_reviewer_id=v_uid,manager_notes=left(trim(p_notes),6000),reviewed_at=now(),updated_at=now() where id=p_package_id;
    update public.project_tasks set status='Changes Required',completed_at=null,updated_at=now() where id=v_task.id;
    if v_task.assigned_to is not null then perform public.enqueue_in_app_notification(v_task.assigned_to,'Final Handover Changes','Manager requested handover changes',coalesce(v_project.project_number,'Project')||' final handover requires changes before client release. Open the same Development handover task and resolve the manager feedback.','/admin?tab=myWork&focusTask='||v_task.id::text,'development-handover-changes:'||p_package_id::text); end if;
    return jsonb_build_object('packageId',p_package_id,'status','Changes Required','taskStatus','Changes Required');
  end if;

  perform public.development_handover_validate_client_package(v_package.client_package);
  if exists(select 1 from public.development_handover_packages x where x.project_id=v_project.id and x.status='Released to Client') then raise exception 'A final Development handover package has already been released to this client.'; end if;

  update public.development_handover_packages set status='Released to Client',manager_reviewer_id=v_uid,manager_notes=left(trim(coalesce(p_notes,'')),6000),reviewed_at=now(),approved_at=now(),released_at=now(),updated_at=now() where id=p_package_id;
  perform set_config('profox.development_handover_release','1',true);
  update public.project_tasks set status='Done',completed_at=now(),updated_at=now() where id=v_task.id;
  perform set_config('profox.development_handover_release','',true);

  v_outbox:=public.queue_project_customer_message(v_project.id,'customer-project-handover:'||v_project.id::text||':'||p_package_id::text,'customer_project_handover',jsonb_build_object('handoverPackageId',p_package_id,'managerApproved',true,'handoverVersion',v_package.version));
  select linked_user_id into v_client_user from public.clients where id=v_project.client_id;
  if v_client_user is not null then
    perform public.enqueue_in_app_notification(v_client_user,'Project Handover','Your final project handover is ready',coalesce(v_project.project_name,'Your project')||' has passed final Management handover review. Your approved handover package is now available.','/client-portal','client-development-handover:'||p_package_id::text);
  end if;
  if v_task.assigned_to is not null then
    perform public.enqueue_in_app_notification(v_task.assigned_to,'Final Handover Approved','Manager approved and released the client handover',coalesce(v_project.project_number,'Project')||' final handover passed Management review and has been released to the client.','/admin?tab=myWork','development-handover-approved:'||p_package_id::text||':'||v_task.assigned_to::text);
  end if;
  return jsonb_build_object('packageId',p_package_id,'status','Released to Client','taskStatus','Done','customerCommunicationId',v_outbox);
end;
$$;

-- Safe client read surface. Internal manager notes and developer-only evidence are intentionally excluded.
create or replace function public.client_get_released_development_handover(p_project_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_project public.projects%rowtype; v_client public.clients%rowtype; v_package public.development_handover_packages%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_project from public.projects where id=p_project_id; if not found then raise exception 'Project not found.'; end if;
  select * into v_client from public.clients where id=v_project.client_id; if not found or v_client.linked_user_id is distinct from auth.uid() then raise exception 'Unauthorized: this project is not linked to your client account.'; end if;
  select * into v_package from public.development_handover_packages where project_id=p_project_id and status='Released to Client' order by released_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('projectId',p_project_id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'version',v_package.version,'status',v_package.status,'clientPackage',v_package.client_package,'approvedAt',v_package.approved_at,'releasedAt',v_package.released_at);
end;
$$;

-- Defense in depth: even if a required task were incorrectly marked Done elsewhere, Handover cannot complete without a manager-released package.
create or replace function public.development_handover_completion_gate()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if new.stage='Completed' and old.stage='Handover' and not exists(select 1 from public.development_handover_packages h where h.project_id=old.id and h.status='Released to Client' and h.manager_reviewer_id is not null and h.released_at is not null) then
    raise exception 'Final client handover must pass independent Project Manager/Management review and be released before the project can be completed.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_development_handover_completion_gate on public.projects;
create trigger trg_development_handover_completion_gate before update of stage on public.projects for each row execute function public.development_handover_completion_gate();

revoke all on function public.development_handover_validate_client_package(jsonb) from public,anon,authenticated;
revoke all on function public.development_handover_ensure_task(uuid) from public,anon,authenticated;
revoke all on function public.development_handover_completion_gate() from public,anon,authenticated;
grant execute on function public.development_handover_submit(uuid,jsonb,text) to authenticated;
grant execute on function public.development_manager_review_handover(uuid,text,text) to authenticated;
grant execute on function public.client_get_released_development_handover(uuid) to authenticated;
