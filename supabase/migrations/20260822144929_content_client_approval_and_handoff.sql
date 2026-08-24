-- Client content approval and automatic release to UI/UX.
-- Reuses project_client_approvals and the existing Client Portal. Client decisions never
-- move the whole project through the generic project-level client-approval stages.

create or replace function public.get_client_content_review_items(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_client_id uuid;v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select c.id into v_client_id from public.projects p join public.clients c on c.id=p.client_id
  where p.id=p_project_id and c.linked_user_id=auth.uid();
  if v_client_id is null then raise exception 'Unauthorized: this project is not linked to your client account.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'deliverableId',d.id,'taskId',d.project_task_id,'title',t.title,'contentType',d.content_type,
    'stage',d.lifecycle_stage,'versionNo',v.version_no,'content',v.content,
    'qualityStatus',d.quality_status,'updatedAt',d.updated_at
  ) order by t.created_at),'[]'::jsonb) into v_result
  from public.content_deliverables d
  join public.project_tasks t on t.id=d.project_task_id
  join lateral(
    select x.* from public.content_versions x
    where x.deliverable_id=d.id order by x.version_no desc limit 1
  )v on true
  where d.project_id=p_project_id and d.lifecycle_stage='Ready for Client Review'
    and v.status='Approved';
  return v_result;
end; $$;

create or replace function public.client_approve_content_deliverable(p_deliverable_id uuid,p_notes text default '')
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_d public.content_deliverables%rowtype;v_task public.project_tasks%rowtype;v_project public.projects%rowtype;
  v_client public.clients%rowtype;v_version public.content_versions%rowtype;v_handoff jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_d from public.content_deliverables where id=p_deliverable_id for update; if not found then raise exception 'Content deliverable not found.'; end if;
  if v_d.lifecycle_stage<>'Ready for Client Review' then raise exception 'This content item is not currently awaiting client approval.'; end if;
  if v_d.critical_defect_count>0 or v_d.major_defect_count>0 then raise exception 'Content with unresolved critical or major defects cannot be client-approved.'; end if;
  select * into v_task from public.project_tasks where id=v_d.project_task_id;
  select * into v_project from public.projects where id=v_d.project_id;
  select * into v_client from public.clients where id=v_project.client_id;
  if v_client.id is null or v_client.linked_user_id is distinct from auth.uid() then raise exception 'Unauthorized: this content belongs to a different client account.'; end if;
  select * into v_version from public.content_versions where deliverable_id=v_d.id order by version_no desc limit 1;
  if v_version.id is null or v_version.status<>'Approved' then raise exception 'Only the current internally approved content version can be approved.'; end if;

  insert into public.project_client_approvals(project_id,client_id,client_user_id,from_stage,to_stage,action,notes,content_deliverable_id)
  values(v_project.id,v_client.id,auth.uid(),'Content Review','Content Approved','Approved',nullif(btrim(coalesce(p_notes,'')),''),v_d.id);

  update public.content_deliverables set lifecycle_stage='Client Approved',updated_at=now() where id=v_d.id;
  insert into public.content_delivery_events(deliverable_id,event_type,from_stage,to_stage,notes,metadata,actor_id)
  values(v_d.id,'Client Approved','Ready for Client Review','Client Approved',nullif(btrim(coalesce(p_notes,'')),''),jsonb_build_object('projectId',v_project.id,'versionId',v_version.id,'versionNo',v_version.version_no),auth.uid());

  -- Client approval is the final Content production gate. Release to implementation
  -- automatically; the project-level handoff function waits until every Content item is ready.
  update public.content_deliverables set lifecycle_stage='Ready for Implementation',updated_at=now() where id=v_d.id;
  insert into public.content_delivery_events(deliverable_id,event_type,from_stage,to_stage,notes,metadata,actor_id)
  values(v_d.id,'Content Released','Client Approved','Ready for Implementation','Client approval completed the Content production gate. Waiting for project-level UI/UX handoff readiness.',jsonb_build_object('versionId',v_version.id),auth.uid());
  perform set_config('app.content_delivery_internal','1',true);
  update public.project_tasks set status='Review',updated_at=now() where id=v_task.id;

  v_handoff:=public.maybe_handoff_content_project_to_uiux(v_project.id);
  return case when coalesce((v_handoff->>'handedOff')::boolean,false) then 'Handed off to UI/UX' else 'Ready for Implementation' end;
end; $$;

create or replace function public.client_request_content_changes(p_deliverable_id uuid,p_notes text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_d public.content_deliverables%rowtype;v_task public.project_tasks%rowtype;v_project public.projects%rowtype;
  v_client public.clients%rowtype;v_version public.content_versions%rowtype;v_writer uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Please describe the requested changes so the team has one clear revision brief.'; end if;
  select * into v_d from public.content_deliverables where id=p_deliverable_id for update; if not found then raise exception 'Content deliverable not found.'; end if;
  if v_d.lifecycle_stage<>'Ready for Client Review' then raise exception 'This content item is not currently awaiting client review.'; end if;
  select * into v_task from public.project_tasks where id=v_d.project_task_id;
  select * into v_project from public.projects where id=v_d.project_id;
  select * into v_client from public.clients where id=v_project.client_id;
  if v_client.id is null or v_client.linked_user_id is distinct from auth.uid() then raise exception 'Unauthorized: this content belongs to a different client account.'; end if;
  select * into v_version from public.content_versions where deliverable_id=v_d.id order by version_no desc limit 1;
  if v_version.id is null then raise exception 'No content version is available for revision.'; end if;
  v_writer:=v_task.assigned_to;

  insert into public.project_client_approvals(project_id,client_id,client_user_id,from_stage,to_stage,action,notes,content_deliverable_id)
  values(v_project.id,v_client.id,auth.uid(),'Content Review','Content Revision','Changes Requested',btrim(p_notes),v_d.id);

  update public.content_versions set status='Submitted' where id=v_version.id and status='Approved';
  update public.content_deliverables set
    lifecycle_stage='Drafting',revision_round=revision_round+1,quality_score=null,quality_status='Revision Required',
    critical_defect_count=0,major_defect_count=0,updated_at=now()
  where id=v_d.id;
  perform set_config('app.content_delivery_internal','1',true);
  update public.project_tasks set status='Changes Required',completed_at=null,updated_at=now() where id=v_task.id;

  -- The new revision cycle must earn its own PF-SOP-07 production/self-QA evidence.
  update public.productivity_checklist_progress pc
    set completed_items='[]'::jsonb,completed_at=null,started_at=now(),updated_at=now()
  from public.productivity_playbooks pb
  where pc.playbook_id=pb.id and pb.playbook_key='content_task_production'
    and pc.entity_type='project_task' and pc.entity_id=v_task.id and pc.user_id=v_writer;

  insert into public.content_delivery_events(deliverable_id,event_type,from_stage,to_stage,notes,metadata,actor_id)
  values(v_d.id,'Client Changes Requested','Ready for Client Review','Drafting',btrim(p_notes),jsonb_build_object('projectId',v_project.id,'versionId',v_version.id,'clientRevisionRound',v_d.revision_round+1),auth.uid());
  return 'Drafting';
end; $$;

-- Customer-safe trigger behavior: content-specific decisions are handled above and must
-- not be interpreted as whole-project stage approvals by the legacy project notifier.
create or replace function public.notify_project_client_response()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_project public.projects%rowtype;v_extra jsonb;v_template text;v_key text;
begin
  if new.content_deliverable_id is not null then return new; end if;
  select * into v_project from public.projects where id=new.project_id; if not found then return new; end if;
  v_extra:=jsonb_build_object('previousStage',new.from_stage,'nextStage',new.to_stage,'clientResponseNotes',coalesce(new.notes,''));
  if new.action='Changes Requested' then v_template:='customer_project_changes_recorded';v_key:='customer-project-changes-recorded:'||new.id::text;
  else v_template:='customer_project_approval_recorded';v_key:='customer-project-approval-recorded:'||new.id::text; end if;
  perform public.queue_project_customer_message(new.project_id,v_key,v_template,v_extra);
  return new;
end; $$;

create or replace function public.content_delivery_notify_event()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.project_tasks%rowtype;v_project public.projects%rowtype;v_writer_name text;v_project_label text;v_decision text;
begin
  select t.* into v_task from public.content_deliverables d join public.project_tasks t on t.id=d.project_task_id where d.id=new.deliverable_id;
  if v_task.id is null then return new; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select full_name into v_writer_name from public.user_profiles where id=v_task.assigned_to;
  v_project_label:=coalesce(v_project.project_number,'Project')||' · '||coalesce(v_project.project_name,'Content Delivery');
  v_decision:=coalesce(new.metadata->>'decision','');

  if new.event_type='Stage Advanced' and new.to_stage in('SME / Fact Check','2i Editorial Review','SEO / Conversion Review','Ready for Client Review') and v_project.project_manager_id is not null then
    perform public.enqueue_in_app_notification(v_project.project_manager_id,'Content Review',case when new.to_stage='Ready for Client Review' then 'Content ready for client review' else 'Content review required' end,coalesce(v_writer_name,'Content Writer')||' moved "'||coalesce(v_task.title,'Content')||'" to '||new.to_stage||' for '||v_project_label||'.','/admin/app/projects?tab=myWork','content-stage:'||new.deliverable_id::text||':'||replace(lower(new.to_stage),' ','-')||':'||new.id::text);
  end if;
  if (new.event_type='Review Recorded' and v_decision in('Changes Required','Rework','Rejected')) or new.event_type='Client Changes Requested' then
    if v_task.assigned_to is not null then
      perform public.enqueue_in_app_notification(v_task.assigned_to,'Content Changes',case when new.event_type='Client Changes Requested' then 'Client requested content changes' else 'Content changes required' end,coalesce(new.notes,'Review feedback was returned for "'||coalesce(v_task.title,'Content')||'".')||' Open the same Content Delivery workspace to revise it.','/admin/app/projects?tab=myWork','content-return:'||new.deliverable_id::text||':'||new.id::text);
    end if;
  end if;
  if new.event_type='Client Approved' and v_project.project_manager_id is not null then
    perform public.enqueue_in_app_notification(v_project.project_manager_id,'Content Approval','Client approved content','The client approved "'||coalesce(v_task.title,'Content')||'" for '||v_project_label||'. ProFox will hand off to UI/UX when every required Content item is ready.','/admin/app/projects?tab=projects','content-client-approved:'||new.deliverable_id::text||':'||new.id::text);
  end if;
  if new.event_type='Blocked' and v_project.project_manager_id is not null then
    perform public.enqueue_in_app_notification(v_project.project_manager_id,'Content Blocker','Content is blocked — information required',coalesce(v_writer_name,'Content Writer')||' blocked "'||coalesce(v_task.title,'Content')||'": '||left(coalesce(new.notes,'Missing information'),800),'/admin/app/projects?tab=projects','content-blocked:'||new.deliverable_id::text||':'||new.id::text);
  end if;
  return new;
end; $$;

drop trigger if exists trg_content_delivery_notify_event on public.content_delivery_events;
create trigger trg_content_delivery_notify_event after insert on public.content_delivery_events
for each row execute function public.content_delivery_notify_event();

revoke all on function public.get_client_content_review_items(uuid) from public,anon;
revoke all on function public.client_approve_content_deliverable(uuid,text) from public,anon;
revoke all on function public.client_request_content_changes(uuid,text) from public,anon;
grant execute on function public.get_client_content_review_items(uuid) to authenticated;
grant execute on function public.client_approve_content_deliverable(uuid,text) to authenticated;
grant execute on function public.client_request_content_changes(uuid,text) to authenticated;
