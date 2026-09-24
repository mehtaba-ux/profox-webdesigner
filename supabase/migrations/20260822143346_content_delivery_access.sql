-- -----------------------------------------------------------------------------
-- 3. Access helpers
-- -----------------------------------------------------------------------------
create or replace function public.content_json_has_value(p_doc jsonb,p_key text)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if p_doc is null or not (p_doc ? p_key) then return false; end if;
  v:=p_doc->p_key;
  if v is null or v='null'::jsonb then return false; end if;
  case jsonb_typeof(v)
    when 'string' then return length(btrim(v#>>'{}'))>0;
    when 'array' then return jsonb_array_length(v)>0;
    when 'object' then return v<>'{}'::jsonb;
    else return true;
  end case;
end; $$;

create or replace function public.content_delivery_task_access(p_task_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_role text; v_status text;
begin
  if v_uid is null or p_task_id is null then return false; end if;
  select role,status into v_role,v_status from public.user_profiles where id=v_uid;
  if v_status is distinct from 'active' or v_role is null or v_role in ('customer','pending') then return false; end if;
  if v_role='admin' then return true; end if;

  if v_role in ('editor','qa','site_manager') then
    return exists(
      select 1 from public.project_tasks t
      left join public.user_profiles writer on writer.id=t.assigned_to
      where t.id=p_task_id and (lower(coalesce(t.department,'')) like 'content%' or writer.role='content_writer')
    );
  end if;

  return exists(
    select 1 from public.project_tasks t join public.projects p on p.id=t.project_id
    where t.id=p_task_id and (
      t.assigned_to=v_uid or p.project_manager_id=v_uid
      or exists(select 1 from public.project_team pt where pt.project_id=p.id and pt.user_id=v_uid)
    )
  );
end; $$;

create or replace function public.content_delivery_can_access(p_deliverable_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select public.content_delivery_task_access(d.project_task_id) from public.content_deliverables d where d.id=p_deliverable_id),false)
$$;

create or replace function public.content_delivery_can_edit(p_deliverable_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_role text;
begin
  if v_uid is null then return false; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_role='admin' then return true; end if;
  return exists(
    select 1 from public.content_deliverables d
    join public.project_tasks t on t.id=d.project_task_id
    join public.projects p on p.id=d.project_id
    where d.id=p_deliverable_id and (t.assigned_to=v_uid or (v_role='project_manager' and p.project_manager_id=v_uid))
  );
end; $$;

create or replace function public.content_delivery_is_reviewer()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.status='active' and u.role in ('admin','project_manager','editor','qa','site_manager'))
$$;

create or replace function public.content_delivery_management_project_access(p_project_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_role text;
begin
  if v_uid is null or p_project_id is null then return false; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_role in ('admin','editor','qa','site_manager') then return true; end if;
  if v_role='project_manager' then
    return exists(select 1 from public.projects p where p.id=p_project_id and (p.project_manager_id=v_uid or exists(select 1 from public.project_team pt where pt.project_id=p.id and pt.user_id=v_uid)));
  end if;
  return false;
end; $$;

create or replace function public.content_package_context(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_quotation_id uuid; v_snapshot text; v_code text; v_name text; v_product_id uuid;
  v_config jsonb:='{}'::jsonb; v_profile jsonb:='{}'::jsonb; v_catalog jsonb:='{}'::jsonb;
begin
  select quotation_id,package_snapshot into v_quotation_id,v_snapshot from public.projects where id=p_project_id;
  if v_quotation_id is not null then
    select qi.product_code_snapshot,qi.product_name_snapshot,qi.sales_product_id into v_code,v_name,v_product_id
    from public.quotation_items qi
    where qi.quotation_id=v_quotation_id and qi.item_type='package'
    order by qi.sort_order,qi.created_at limit 1;
  end if;
  if v_code is null and v_snapshot is not null then
    select sp.code,sp.name,sp.id into v_code,v_name,v_product_id
    from public.sales_products sp where sp.active is true and (sp.name=v_snapshot or sp.code=v_snapshot)
    order by sp.sort_order limit 1;
  end if;
  select coalesce(config_value,'{}'::jsonb) into v_config from public.system_configuration where config_key='content_delivery_sop_v1';
  v_profile:=coalesce(v_config->'packageProfiles'->coalesce(v_code,''),v_config->'defaultPackageProfile','{}'::jsonb);
  if v_product_id is not null then
    select jsonb_build_object('id',sp.id,'code',sp.code,'name',sp.name,'priceMode',sp.price_mode,'basePrice',sp.base_price,'currency',sp.currency,'scope',coalesce(sp.scope,'[]'::jsonb))
    into v_catalog from public.sales_products sp where sp.id=v_product_id;
  end if;
  return jsonb_build_object('code',v_code,'name',coalesce(v_name,v_snapshot),'profile',v_profile,'catalog',coalesce(v_catalog,'{}'::jsonb));
end; $$;

create or replace function public.content_compute_brief_readiness(p_deliverable_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_doc jsonb:='{}'::jsonb; v_required jsonb:='[]'::jsonb; v_missing jsonb:='[]'::jsonb; v_key text;
  v_task_id uuid; v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_pkg jsonb:='{}'::jsonb;
  v_total integer:=0; v_ready integer:=0;
begin
  select d.brief,d.project_task_id into v_doc,v_task_id from public.content_deliverables d where d.id=p_deliverable_id;
  if v_task_id is null then return jsonb_build_object('ready',false,'percent',0,'missing',jsonb_build_array('deliverable'),'complete',0,'total',1); end if;
  select * into v_task from public.project_tasks where id=v_task_id;
  if v_task.id is null then return jsonb_build_object('ready',false,'percent',0,'missing',jsonb_build_array('project_task'),'complete',0,'total',1); end if;
  select * into v_project from public.projects where id=v_task.project_id;
  v_pkg:=public.content_package_context(v_project.id);
  select coalesce(config_value->'requiredBriefFields','[]'::jsonb) into v_required from public.system_configuration where config_key='content_delivery_sop_v1';
  v_required:=coalesce(v_required,'[]'::jsonb);

  for v_key in select jsonb_array_elements_text(v_required) loop
    v_total:=v_total+1;
    if public.content_json_has_value(v_doc,v_key) then v_ready:=v_ready+1; else v_missing:=v_missing||jsonb_build_array(v_key); end if;
  end loop;

  v_total:=v_total+7;
  if coalesce(btrim(v_task.title),'')<>'' then v_ready:=v_ready+1; else v_missing:=v_missing||jsonb_build_array('assignment'); end if;
  if v_task.due_date is not null then v_ready:=v_ready+1; else v_missing:=v_missing||jsonb_build_array('deadline'); end if;
  if coalesce(btrim(v_project.scope_summary),'')<>'' then v_ready:=v_ready+1; else v_missing:=v_missing||jsonb_build_array('approved_scope'); end if;
  if coalesce(btrim(v_project.requirements_summary),'')<>'' then v_ready:=v_ready+1; else v_missing:=v_missing||jsonb_build_array('project_requirements'); end if;
  if v_project.project_manager_id is not null then v_ready:=v_ready+1; else v_missing:=v_missing||jsonb_build_array('approval_owner'); end if;
  if v_project.client_id is not null then v_ready:=v_ready+1; else v_missing:=v_missing||jsonb_build_array('client'); end if;
  if coalesce(v_pkg->>'code',v_pkg->>'name','')<>'' then v_ready:=v_ready+1; else v_missing:=v_missing||jsonb_build_array('purchased_package'); end if;

  return jsonb_build_object('ready',v_ready=v_total,'percent',case when v_total=0 then 0 else round((v_ready::numeric/v_total::numeric)*100)::int end,'missing',v_missing,'complete',v_ready,'total',v_total);
end; $$;

create or replace function public.content_writer_playbook_complete(p_deliverable_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_task_id uuid; v_writer uuid; v_playbook_id uuid; v_checklist jsonb; v_completed jsonb:='[]'::jsonb;
begin
  select d.project_task_id,t.assigned_to into v_task_id,v_writer from public.content_deliverables d join public.project_tasks t on t.id=d.project_task_id where d.id=p_deliverable_id;
  if v_task_id is null or v_writer is null then return false; end if;
  select id,checklist into v_playbook_id,v_checklist from public.productivity_playbooks where playbook_key='content_task_production' and active is true limit 1;
  if v_playbook_id is null then return false; end if;
  select coalesce(completed_items,'[]'::jsonb) into v_completed
  from public.productivity_checklist_progress
  where playbook_id=v_playbook_id and entity_type='project_task' and entity_id=v_task_id and user_id=v_writer;
  return not exists(
    select 1 from jsonb_array_elements(coalesce(v_checklist,'[]'::jsonb)) item
    where not (coalesce(v_completed,'[]'::jsonb) ? (item->>'key'))
  );
end; $$;
