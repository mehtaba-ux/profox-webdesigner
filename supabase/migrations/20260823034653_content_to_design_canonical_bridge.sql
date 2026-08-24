-- Canonical Content -> Design evidence bridge.
-- Recovered from the production-applied migration so source control can fully reproduce production.
-- Reuses canonical content_deliverables, project_tasks and design_delivery_evidence; no parallel handoff store.

create or replace function public.design_delivery_sync_approved_content(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_gate jsonb;
  v_actor uuid;
  v_refs text;
  v_count integer:=0;
  v_task record;
  v_note text;
  v_version_label text;
  v_inserted integer:=0;
begin
  v_gate:=public.content_project_ready_for_uiux(p_project_id);
  if coalesce((v_gate->>'ready')::boolean,false) is not true then
    return v_gate||jsonb_build_object('synced',false,'reason','Content Delivery is not ready for UI/UX.');
  end if;

  select coalesce(p.project_manager_id,p.created_by,
    (select id from public.user_profiles where role='admin' and status='active' order by created_at limit 1))
  into v_actor
  from public.projects p where p.id=p_project_id;
  if v_actor is null then raise exception 'Approved Content handoff has no authorized audit actor.'; end if;

  select count(*),
         string_agg(d.id::text||':v'||d.current_version_no::text,', ' order by d.created_at,d.id)
  into v_count,v_refs
  from public.content_deliverables d
  where d.project_id=p_project_id and d.uiux_handoff_at is not null;

  if v_count=0 then
    return v_gate||jsonb_build_object('synced',false,'reason','No Content Delivery handoff rows are available yet.');
  end if;

  v_note:='Canonical Content Delivery package. Deliverable/current-version references: '||v_refs||'. Open the Approved Content Handoff section in Design Delivery to read the current approved copy, verified material claims and client approvals.';
  v_version_label:='Content handoff · '||v_count::text||case when v_count=1 then ' deliverable' else ' deliverables' end;

  for v_task in
    select id from public.project_tasks
    where project_id=p_project_id and (lower(coalesce(department,''))='ui/ux design' or workflow_key='uiux_design')
    order by created_at
  loop
    if not exists(
      select 1 from public.design_delivery_evidence e
      where e.project_task_id=v_task.id and e.evidence_type='approved_content' and e.active and e.status='Approved'
        and e.reference_note=v_note
    ) then
      update public.design_delivery_evidence
      set active=false,status='Superseded'
      where project_task_id=v_task.id and evidence_type='approved_content' and active;

      insert into public.design_delivery_evidence(
        project_task_id,project_id,evidence_type,label,reference_url,reference_note,version_label,status,active,created_by
      ) values (
        v_task.id,p_project_id,'approved_content','Approved Content Delivery Package','',v_note,v_version_label,'Approved',true,v_actor
      );
      v_inserted:=v_inserted+1;
    end if;
  end loop;

  return v_gate||jsonb_build_object('synced',true,'inserted',v_inserted,'deliverableCount',v_count);
end;
$$;

create or replace function public.design_delivery_sync_content_handoff_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.uiux_handoff_at is not null then
    perform public.design_delivery_sync_approved_content(new.project_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_design_delivery_sync_content_handoff on public.content_deliverables;
create trigger trg_design_delivery_sync_content_handoff
after update of uiux_handoff_at,uiux_task_id on public.content_deliverables
for each row execute function public.design_delivery_sync_content_handoff_trigger();

revoke all on function public.design_delivery_sync_approved_content(uuid) from public,anon,authenticated;
revoke all on function public.design_delivery_sync_content_handoff_trigger() from public,anon,authenticated;
grant execute on function public.design_delivery_sync_approved_content(uuid) to service_role;
grant execute on function public.design_delivery_sync_content_handoff_trigger() to service_role;
