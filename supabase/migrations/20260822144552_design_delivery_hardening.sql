-- PF-SOP-08 Design Delivery hardening
-- Adds reviewer-safe access, data minimization and package-aware evidence requirements
-- using canonical quotation_items -> sales_products codes. No package price is hardcoded.

update public.system_configuration
set config_value = config_value || jsonb_build_object(
  'packageDepthByProductCode',jsonb_build_object(
    'PF-WEB-LAUNCH','Launch',
    'PF-WEB-GROWTH','Growth',
    'PF-WEB-SCALE','Scale',
    'PF-CUSTOM','Custom'
  ),
  'requiredSubmissionEvidenceByDepth',jsonb_build_object(
    'Launch',jsonb_build_array('design_file'),
    'Growth',jsonb_build_array('research','information_architecture','user_flow','wireframe','design_system','design_file'),
    'Scale',jsonb_build_array('research','information_architecture','user_flow','wireframe','design_system','design_file','prototype'),
    'Custom',jsonb_build_array('user_flow','wireframe','design_system','design_file','prototype'),
    'Unmapped',jsonb_build_array('design_file')
  )
),
description='PF-SOP-08 executable Design Delivery controls. Package depth is mapped from canonical Sales Catalog product codes and can be changed by Admin without application code.',
updated_at=now()
where config_key='design_delivery_sop_v1';

alter table public.design_delivery_evidence drop constraint if exists design_delivery_evidence_type_check;
alter table public.design_delivery_evidence add constraint design_delivery_evidence_type_check check (evidence_type in (
  'business_objective',
  'target_audience',
  'primary_conversion',
  'approved_content',
  'brand_assets',
  'research',
  'information_architecture',
  'user_flow',
  'wireframe',
  'design_system',
  'design_file',
  'prototype',
  'handoff_notes',
  'implementation_reference'
));

create or replace function public.design_delivery_can_access_task(p_task_id uuid)
returns boolean
language sql
stable security definer
set search_path=public,pg_temp
as $$
  select auth.uid() is not null and (
    public.productivity_can_access_entity('project_task',p_task_id)
    or exists(
      select 1 from public.design_delivery_reviews r
      where r.project_task_id=p_task_id and r.reviewer_user_id=auth.uid()
    )
  );
$$;

drop policy if exists design_delivery_evidence_select on public.design_delivery_evidence;
create policy design_delivery_evidence_select
on public.design_delivery_evidence
for select
to authenticated
using (public.design_delivery_can_access_task(project_task_id));

create or replace function public.design_delivery_package_context(p_project_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.projects%rowtype;
  v_config jsonb:='{}'::jsonb;
  v_products jsonb:='[]'::jsonb;
  v_primary_code text:='';
  v_depth text:='Unmapped';
  v_required jsonb:='["design_file"]'::jsonb;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found then return jsonb_build_object('depth','Unmapped','products','[]'::jsonb,'requiredSubmissionEvidence',v_required); end if;

  select coalesce(config_value,'{}'::jsonb) into v_config
  from public.system_configuration where config_key='design_delivery_sop_v1';

  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',sp.id,
    'code',coalesce(qi.product_code_snapshot,sp.code),
    'name',coalesce(qi.product_name_snapshot,sp.name),
    'type',coalesce(qi.item_type,sp.product_type),
    'scope',coalesce(sp.scope,'[]'::jsonb),
    'quantity',qi.quantity
  ) order by qi.sort_order,qi.created_at),'[]'::jsonb)
  into v_products
  from public.quotation_items qi
  left join public.sales_products sp on sp.id=qi.sales_product_id
  where qi.quotation_id=v_project.quotation_id;

  select coalesce(qi.product_code_snapshot,sp.code,'') into v_primary_code
  from public.quotation_items qi
  left join public.sales_products sp on sp.id=qi.sales_product_id
  where qi.quotation_id=v_project.quotation_id
    and coalesce(qi.item_type,sp.product_type)='package'
  order by qi.sort_order,qi.created_at
  limit 1;

  if length(v_primary_code)>0 then
    v_depth:=coalesce(v_config->'packageDepthByProductCode'->>v_primary_code,'Unmapped');
  end if;
  v_required:=coalesce(v_config->'requiredSubmissionEvidenceByDepth'->v_depth,v_config->'requiredSubmissionEvidenceByDepth'->'Unmapped','["design_file"]'::jsonb);

  return jsonb_build_object(
    'primaryProductCode',nullif(v_primary_code,''),
    'depth',v_depth,
    'packageSnapshot',v_project.package_snapshot,
    'products',v_products,
    'requiredSubmissionEvidence',v_required
  );
end;
$$;

create or replace function public.design_delivery_assert_package_evidence(p_task_id uuid)
returns void
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare
  v_project_id uuid;
  v_context jsonb;
  v_required jsonb;
  v_missing text:='';
begin
  select project_id into v_project_id from public.project_tasks where id=p_task_id;
  if v_project_id is null then raise exception 'Project task is not linked to a project.'; end if;
  v_context:=public.design_delivery_package_context(v_project_id);
  v_required:=coalesce(v_context->'requiredSubmissionEvidence','[]'::jsonb);

  select string_agg(replace(req.value,'_',' '),', ' order by req.value)
  into v_missing
  from jsonb_array_elements_text(v_required) req(value)
  where not exists(
    select 1 from public.design_delivery_evidence e
    where e.project_task_id=p_task_id
      and e.active
      and e.status='Approved'
      and e.evidence_type=req.value
  );

  if coalesce(v_missing,'')<>'' then
    raise exception 'PF-SOP-08 % package depth is missing required evidence: %.',coalesce(v_context->>'depth','Unmapped'),v_missing;
  end if;
end;
$$;

-- Enforce package-depth evidence even if a future UI accidentally attempts a direct task transition.
create or replace function public.design_delivery_enforce_review_transition()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_assignee_role text;
begin
  if new.status='Review' and old.status is distinct from 'Review' and new.department in ('UI/UX Design','Design') then
    select role into v_assignee_role from public.user_profiles where id=new.assigned_to and status='active';
    if v_assignee_role='uiux_designer' then perform public.design_delivery_assert_package_evidence(new.id); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_design_delivery_review_evidence on public.project_tasks;
create trigger trg_design_delivery_review_evidence
before update of status on public.project_tasks
for each row execute function public.design_delivery_enforce_review_transition();

-- Reviewer workspace access is intentionally limited to design-review context. Client PII is not returned.
create or replace function public.design_delivery_workspace(p_task_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.project_tasks%rowtype;
  v_project public.projects%rowtype;
  v_client jsonb:='{}'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_reviews jsonb:='[]'::jsonb;
  v_feedback jsonb:='[]'::jsonb;
  v_readiness jsonb:='{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.design_delivery_can_access_task(p_task_id) then raise exception 'You do not have access to this design task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id;
  if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;

  select coalesce(jsonb_build_object(
    'id',c.id,
    'company_name',c.company_name,
    'industry',c.industry,
    'website',c.website,
    'country',c.country
  ),'{}'::jsonb) into v_client
  from public.clients c where c.id=v_project.client_id;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_evidence
  from public.design_delivery_evidence e where e.project_task_id=p_task_id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc),'[]'::jsonb) into v_reviews
  from public.design_delivery_reviews r where r.project_task_id=p_task_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'from_stage',a.from_stage,'to_stage',a.to_stage,'action',a.action,'notes',a.notes,'created_at',a.created_at
  ) order by a.created_at desc),'[]'::jsonb) into v_feedback
  from public.project_client_approvals a where a.project_id=v_project.id and a.from_stage='Client Design Approval';

  if public.productivity_can_access_entity('project_task',p_task_id) then
    v_readiness:=public.design_delivery_compute_readiness(p_task_id);
  else
    v_readiness:=jsonb_build_object('ready',true,'status','REVIEW ACCESS','checks','{}'::jsonb,'blockers','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'task',to_jsonb(v_task),
    'project',to_jsonb(v_project),
    'client',v_client,
    'config',(select coalesce(config_value,'{}'::jsonb) from public.system_configuration where config_key='design_delivery_sop_v1'),
    'packageContext',public.design_delivery_package_context(v_project.id),
    'readiness',v_readiness,
    'evidence',v_evidence,
    'reviews',v_reviews,
    'clientFeedback',v_feedback
  );
end;
$$;

-- Internal helpers should never become public callable SECURITY DEFINER surfaces.
revoke all on function public.design_delivery_config() from authenticated;
revoke all on function public.design_delivery_can_access_task(uuid) from public,anon,authenticated;
revoke all on function public.design_delivery_package_context(uuid) from public,anon,authenticated;
revoke all on function public.design_delivery_assert_package_evidence(uuid) from public,anon,authenticated;
revoke all on function public.design_delivery_assert_current_playbook_complete(uuid,uuid) from public,anon,authenticated;
revoke all on function public.design_delivery_pick_reviewer(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.design_delivery_enforce_review_transition() from public,anon,authenticated;
revoke all on function public.design_delivery_on_client_design_feedback() from public,anon,authenticated;
revoke all on function public.design_delivery_on_project_stage_change() from public,anon,authenticated;
