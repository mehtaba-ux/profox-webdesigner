-- Content Writer project flow: Content-stage initialization -> assignment -> approved UI/UX handoff.
-- Reuses projects, project_tasks, project_team, existing task workflow fields and notifications.
-- No parallel project/task/handoff system is introduced.

alter table public.content_deliverables
  add column if not exists uiux_handoff_at timestamptz,
  add column if not exists uiux_task_id uuid references public.project_tasks(id) on delete set null;

create index if not exists idx_content_deliverables_uiux_task
  on public.content_deliverables(uiux_task_id) where uiux_task_id is not null;

insert into public.notification_templates(template_key,name,subject_template,body_template,active,description)
values
('content_uiux_handoff_ready','Content handoff ready for UI/UX','Approved content is ready for UI/UX - {{projectName}}','{{projectName}} has completed the required Content Delivery gates. Open your assigned UI/UX task to review the approved copy, hierarchy, CTA, evidence and client approval context before designing.','true','Internal notification when approved Content work is handed to UI/UX.'),
('content_capacity_exception','Content capacity exception','Content work needs an available writer - {{projectName}}','{{projectName}} has entered Content Delivery but no eligible active Content Writer is currently available within the configured WIP limit. Review the project exception and capacity.','true','Internal exception when Content work cannot be auto-assigned.'),
('uiux_capacity_exception','UI/UX capacity exception','Approved content needs a UI/UX owner - {{projectName}}','{{projectName}} has completed Content Delivery but no active UI/UX Designer is currently available. The UI/UX task is ready but unassigned.','true','Internal exception when Content handoff cannot be assigned to UI/UX.')
on conflict (template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  active=excluded.active,description=excluded.description,updated_at=now();

create or replace function public.content_delivery_config()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select config_value from public.system_configuration where config_key='content_delivery_sop_v1'),'{}'::jsonb);
$$;

create or replace function public.content_delivery_wip_limit()
returns integer language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_config jsonb;v_limit integer;
begin
  v_config:=public.content_delivery_config();
  begin v_limit:=greatest(1,least(20,coalesce((v_config->>'wipLimit')::integer,2))); exception when others then v_limit:=2; end;
  return v_limit;
end; $$;

create or replace function public.pick_content_writer(p_project_id uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  with workload as (
    select u.id,
      count(distinct t.id) filter(where t.status not in('Done')) as open_tasks,
      count(distinct d.id) filter(where d.lifecycle_stage in('Drafting','Writer Self-QA')) as active_wip
    from public.user_profiles u
    left join public.project_tasks t on t.assigned_to=u.id and lower(coalesce(t.department,''))='content'
    left join public.content_deliverables d on d.project_task_id=t.id
    where u.status='active' and u.role='content_writer'
    group by u.id
  )
  select id from workload
  where active_wip < public.content_delivery_wip_limit()
  order by active_wip asc,open_tasks asc,id asc
  limit 1;
$$;

create or replace function public.pick_uiux_designer(p_project_id uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  with workload as (
    select u.id,count(t.id) filter(where t.status<>'Done') as open_tasks
    from public.user_profiles u
    left join public.project_tasks t on t.assigned_to=u.id and lower(coalesce(t.department,'')) in('ui/ux design','design')
    where u.status='active' and u.role='uiux_designer'
    group by u.id
  )
  select id from workload order by open_tasks asc,id asc limit 1;
$$;

create or replace function public.content_project_payload(p_project_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'projectId',p.id,'projectName',p.project_name,'projectNumber',p.project_number,
    'package',p.package_snapshot,'projectStage',p.stage,'priority',p.priority,
    'clientId',p.client_id,'clientName',coalesce(c.company_name,c.primary_contact_name,'Client')
  )
  from public.projects p join public.clients c on c.id=p.client_id where p.id=p_project_id;
$$;

create or replace function public.queue_content_capacity_exception(p_project_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_p public.projects%rowtype;v_payload jsonb;
begin
  select * into v_p from public.projects where id=p_project_id; if not found then return; end if;
  v_payload:=public.content_project_payload(p_project_id);
  if v_p.project_manager_id is not null then
    perform public.service_queue_staff_operational_notification(
      v_p.project_manager_id,'content-capacity:'||p_project_id::text||':'||to_char(now(),'YYYYMMDD'),
      'content_capacity_exception','Delivery Exception','Content work needs an available writer',
      v_p.project_name||' is ready for Content Delivery but no eligible writer is currently within the WIP limit.',
      '/admin/app/projects?tab=projects',v_payload,now()
    );
  else
    perform public.service_queue_active_admins_operational_notification(
      'content-capacity:'||p_project_id::text||':'||to_char(now(),'YYYYMMDD'),
      'content_capacity_exception','Delivery Exception','Content work needs an available writer',
      v_p.project_name||' is ready for Content Delivery but has no eligible writer and no project manager assigned.',
      '/admin/app/projects?tab=projects',v_payload,now()
    );
  end if;
end; $$;

create or replace function public.initialize_content_task_record(p_task_id uuid,p_auto_assign boolean default true)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_task public.project_tasks%rowtype;v_project public.projects%rowtype;v_writer uuid;v_deliverable uuid;v_actor uuid;
begin
  select * into v_task from public.project_tasks where id=p_task_id for update; if not found then raise exception 'Project task not found.'; end if;
  if lower(coalesce(v_task.department,''))<>'content' and coalesce(v_task.workflow_key,'')<>'content_delivery' then return null; end if;
  select * into v_project from public.projects where id=v_task.project_id; if not found then raise exception 'Project not found.'; end if;
  v_actor:=coalesce(v_project.project_manager_id,v_project.created_by,(select id from public.user_profiles where role='admin' and status='active' order by created_at limit 1));

  if v_task.workflow_key is null or v_task.workflow_stage is null or v_task.required_for_stage is false then
    update public.project_tasks set
      workflow_key=coalesce(workflow_key,'content_delivery'),workflow_stage=coalesce(workflow_stage,'Content'),required_for_stage=true,updated_at=now()
    where id=v_task.id;
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
  values(v_task.id,v_task.project_id,'Website Copy')
  on conflict(project_task_id) do nothing;
  select id into v_deliverable from public.content_deliverables where project_task_id=v_task.id;
  if not exists(select 1 from public.content_delivery_events e where e.deliverable_id=v_deliverable and e.event_type='Created') then
    insert into public.content_delivery_events(deliverable_id,event_type,to_stage,notes,actor_id)
    values(v_deliverable,'Created','Requested','Content Delivery initialized automatically from the canonical project task.',v_actor);
  end if;
  return v_deliverable;
end; $$;

create or replace function public.initialize_project_content_delivery(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_project public.projects%rowtype;v_task record;v_task_id uuid;v_created boolean:=false;v_actor uuid;v_count integer:=0;v_assigned integer:=0;
begin
  select * into v_project from public.projects where id=p_project_id for update; if not found then raise exception 'Project not found.'; end if;
  if v_project.stage<>'Content' then return jsonb_build_object('initialized',false,'reason','Project is not in Content stage.'); end if;
  v_actor:=coalesce(v_project.project_manager_id,v_project.created_by,(select id from public.user_profiles where role='admin' and status='active' order by created_at limit 1));

  if not exists(select 1 from public.project_tasks where project_id=p_project_id and (lower(coalesce(department,''))='content' or workflow_key='content_delivery')) then
    insert into public.project_tasks(project_id,title,description,department,assigned_to,created_by,priority,status,due_date,workflow_key,workflow_stage,required_for_stage)
    values(
      p_project_id,'Content Strategy & Website Copy',
      'Create the project content through PF-SOP-07 using the approved project scope, client facts and package requirements. Complete independent quality and client review before UI/UX handoff.',
      'Content',null,v_actor,coalesce(v_project.priority,'Normal'),'To Do',v_project.target_date,'content_delivery','Content',true
    ) returning id into v_task_id;
    v_created:=true;
  end if;

  for v_task in select id from public.project_tasks where project_id=p_project_id and (lower(coalesce(department,''))='content' or workflow_key='content_delivery') order by created_at loop
    perform public.initialize_content_task_record(v_task.id,true);
    v_count:=v_count+1;
  end loop;
  select count(*) into v_assigned from public.project_tasks where project_id=p_project_id and (lower(coalesce(department,''))='content' or workflow_key='content_delivery') and assigned_to is not null;
  return jsonb_build_object('initialized',true,'createdCanonicalTask',v_created,'contentTasks',v_count,'assignedTasks',v_assigned);
end; $$;

create or replace function public.trigger_initialize_project_content_delivery()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.stage='Content' and (tg_op='INSERT' or old.stage is distinct from new.stage) then
    perform public.initialize_project_content_delivery(new.id);
  end if;
  return new;
end; $$;

drop trigger if exists trg_initialize_project_content_delivery on public.projects;
create trigger trg_initialize_project_content_delivery
after insert or update of stage on public.projects
for each row execute function public.trigger_initialize_project_content_delivery();

create or replace function public.trigger_initialize_content_project_task()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if lower(coalesce(new.department,''))='content' or new.workflow_key='content_delivery' then
    perform public.initialize_content_task_record(new.id,true);
  end if;
  return new;
end; $$;

drop trigger if exists trg_initialize_content_project_task on public.project_tasks;
create trigger trg_initialize_content_project_task
after insert or update of department,workflow_key on public.project_tasks
for each row execute function public.trigger_initialize_content_project_task();

create or replace function public.content_project_ready_for_uiux(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_total integer;v_ready integer;v_blocked integer;v_c0c1 integer;v_unapproved integer;
begin
  select count(*),
    count(*) filter(where lifecycle_stage in('Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained')),
    count(*) filter(where lifecycle_stage='Blocked — Information Required'),
    count(*) filter(where critical_defect_count>0 or major_defect_count>0)
  into v_total,v_ready,v_blocked,v_c0c1
  from public.content_deliverables where project_id=p_project_id;

  select count(*) into v_unapproved
  from public.content_deliverables d
  where d.project_id=p_project_id
    and not exists(
      select 1 from public.project_client_approvals a
      where a.content_deliverable_id=d.id and coalesce(a.action,'Approved')='Approved'
    );

  return jsonb_build_object(
    'ready',v_total>0 and v_total=v_ready and v_blocked=0 and v_c0c1=0 and v_unapproved=0,
    'total',v_total,'readyCount',v_ready,'blocked',v_blocked,'criticalOrMajor',v_c0c1,'missingClientApproval',v_unapproved
  );
end; $$;

create or replace function public.maybe_handoff_content_project_to_uiux(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_project public.projects%rowtype;v_gate jsonb;v_designer uuid;v_task record;v_uiux_task uuid;v_actor uuid;v_payload jsonb;v_assigned integer:=0;
begin
  select * into v_project from public.projects where id=p_project_id for update; if not found then raise exception 'Project not found.'; end if;
  v_gate:=public.content_project_ready_for_uiux(p_project_id);
  if coalesce((v_gate->>'ready')::boolean,false) is not true then return v_gate||jsonb_build_object('handedOff',false); end if;
  if v_project.stage not in('Content','UI/UX Design') then return v_gate||jsonb_build_object('handedOff',false,'reason','Project is not in a Content-to-UI/UX stage.'); end if;
  v_actor:=coalesce(v_project.project_manager_id,v_project.created_by,(select id from public.user_profiles where role='admin' and status='active' order by created_at limit 1));
  v_designer:=public.pick_uiux_designer(p_project_id);

  if not exists(select 1 from public.project_tasks where project_id=p_project_id and (lower(coalesce(department,''))='ui/ux design' or workflow_key='uiux_design')) then
    insert into public.project_tasks(project_id,title,description,department,assigned_to,created_by,priority,status,due_date,notes,workflow_key,workflow_stage,required_for_stage)
    values(
      p_project_id,'UI/UX Design — Approved Content Handoff',
      'Design from the final approved Content Delivery package. Review the approved copy, message hierarchy, CTA, evidence, client approval and implementation notes before starting layouts.',
      'UI/UX Design',v_designer,v_actor,coalesce(v_project.priority,'Normal'),'To Do',v_project.target_date,
      'Content Delivery gates passed. Use the connected approved-content handoff panel as the source of truth.','uiux_design','UI/UX Design',true
    ) returning id into v_uiux_task;
  end if;

  for v_task in select * from public.project_tasks where project_id=p_project_id and (lower(coalesce(department,''))='ui/ux design' or workflow_key='uiux_design') order by created_at loop
    v_uiux_task:=coalesce(v_uiux_task,v_task.id);
    if v_task.assigned_to is null and v_designer is not null then
      update public.project_tasks set assigned_to=v_designer,workflow_key=coalesce(workflow_key,'uiux_design'),workflow_stage='UI/UX Design',required_for_stage=true,updated_at=now() where id=v_task.id;
      v_assigned:=v_assigned+1;
    else
      update public.project_tasks set workflow_key=coalesce(workflow_key,'uiux_design'),workflow_stage='UI/UX Design',required_for_stage=true,updated_at=now() where id=v_task.id;
      if v_task.assigned_to is not null then v_assigned:=v_assigned+1; end if;
    end if;
  end loop;

  if v_designer is not null then
    insert into public.project_team(project_id,user_id,role) values(p_project_id,v_designer,'UI/UX Designer')
    on conflict(project_id,user_id) do update set role='UI/UX Designer';
  end if;

  perform set_config('profox.content_handoff_rpc','1',true);
  if v_project.stage='Content' then update public.projects set stage='UI/UX Design',updated_at=now() where id=p_project_id; end if;

  update public.project_tasks set status='Done',completed_at=coalesce(completed_at,now()),updated_at=now()
  where project_id=p_project_id and (lower(coalesce(department,''))='content' or workflow_key='content_delivery') and status<>'Done';
  update public.content_deliverables set uiux_handoff_at=coalesce(uiux_handoff_at,now()),uiux_task_id=coalesce(uiux_task_id,v_uiux_task),updated_at=now()
  where project_id=p_project_id;
  insert into public.content_delivery_events(deliverable_id,event_type,from_stage,to_stage,notes,metadata,actor_id)
  select d.id,'UI/UX Handoff',d.lifecycle_stage,d.lifecycle_stage,'Approved content handed to the existing UI/UX project workflow.',jsonb_build_object('uiuxTaskId',v_uiux_task,'designerId',v_designer,'gate',v_gate),v_actor
  from public.content_deliverables d where d.project_id=p_project_id
    and not exists(select 1 from public.content_delivery_events e where e.deliverable_id=d.id and e.event_type='UI/UX Handoff');

  v_payload:=public.content_project_payload(p_project_id)||jsonb_build_object('uiuxTaskId',v_uiux_task,'handoffAt',now());
  if v_designer is not null then
    perform public.service_queue_staff_operational_notification(
      v_designer,'content-uiux-handoff:'||p_project_id::text,'content_uiux_handoff_ready','Handoff','Approved content ready for UI/UX',
      v_project.project_name||' has completed Content Delivery. Open the assigned UI/UX task and approved-content handoff package.',
      '/admin/app/projects?tab=myWork',v_payload,now()
    );
  else
    if v_project.project_manager_id is not null then
      perform public.service_queue_staff_operational_notification(
        v_project.project_manager_id,'uiux-capacity:'||p_project_id::text,'uiux_capacity_exception','Delivery Exception','Approved content needs a UI/UX owner',
        v_project.project_name||' completed Content Delivery, but no active UI/UX Designer is available. The UI/UX task is ready but unassigned.',
        '/admin/app/projects?tab=projects',v_payload,now()
      );
    else
      perform public.service_queue_active_admins_operational_notification(
        'uiux-capacity:'||p_project_id::text,'uiux_capacity_exception','Delivery Exception','Approved content needs a UI/UX owner',
        v_project.project_name||' completed Content Delivery, but no active UI/UX Designer or Project Manager is available.',
        '/admin/app/projects?tab=projects',v_payload,now()
      );
    end if;
  end if;
  return v_gate||jsonb_build_object('handedOff',true,'uiuxTaskId',v_uiux_task,'designerId',v_designer,'assignedUiuxTasks',v_assigned);
end; $$;

create or replace function public.protect_content_project_handoff()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.stage='Content' and new.stage='UI/UX Design' and coalesce(current_setting('profox.content_handoff_rpc',true),'')<>'1' then
    raise exception 'Content-to-UI/UX progression is automatic after all required Content Delivery gates and client approvals pass.';
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_content_project_handoff on public.projects;
create trigger trg_protect_content_project_handoff before update of stage on public.projects
for each row execute function public.protect_content_project_handoff();

create or replace function public.get_content_uiux_handoff(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and not exists(
    select 1 from public.projects p left join public.project_team pt on pt.project_id=p.id and pt.user_id=auth.uid()
    where p.id=p_project_id and (p.project_manager_id=auth.uid() or pt.user_id=auth.uid())
  ) then raise exception 'Project-team access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliverableId',d.id,'taskId',d.project_task_id,'title',t.title,'contentType',d.content_type,
    'handoffAt',d.uiux_handoff_at,'lifecycleStage',d.lifecycle_stage,'brief',d.brief,
    'version',jsonb_build_object('id',v.id,'versionNo',v.version_no,'content',v.content,'changeSummary',v.change_summary,'status',v.status,'createdAt',v.created_at),
    'claims',coalesce((select jsonb_agg(jsonb_build_object('claim',c.claim_text,'type',c.claim_type,'sourceUrl',c.source_url,'sourceNote',c.source_note,'verificationStatus',c.verification_status)) from public.content_claims c where c.deliverable_id=d.id and c.material=true and c.verification_status in('Verified','Not Required')),'[]'::jsonb),
    'clientApproval',coalesce((select jsonb_build_object('id',a.id,'action',coalesce(a.action,'Approved'),'notes',a.notes,'createdAt',a.created_at) from public.project_client_approvals a where a.content_deliverable_id=d.id order by a.created_at desc limit 1),'{}'::jsonb)
  ) order by t.created_at),'[]'::jsonb) into v_result
  from public.content_deliverables d
  join public.project_tasks t on t.id=d.project_task_id
  left join lateral(select * from public.content_versions x where x.deliverable_id=d.id order by x.version_no desc limit 1)v on true
  where d.project_id=p_project_id and d.uiux_handoff_at is not null;
  return jsonb_build_object('projectId',p_project_id,'items',v_result);
end; $$;

grant execute on function public.get_content_uiux_handoff(uuid) to authenticated;