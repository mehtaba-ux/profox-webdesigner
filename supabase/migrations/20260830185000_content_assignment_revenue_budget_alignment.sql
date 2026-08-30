-- Keep the existing Content assignment workflow, but re-read the row after the revenue-budget trigger
-- so events and notifications use the authoritative post-trigger amount.
create or replace function public.create_content_work_assignment(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_project public.projects%rowtype;
  v_writer uuid:=(p_input->>'writerUserId')::uuid;
  v_cfg jsonb:=public.worker_compensation_config();
  v_id uuid;
  v_item jsonb;
  v_task public.project_tasks%rowtype;
  v_deliverable uuid;
  v_rate public.worker_compensation_rate_cards%rowtype;
  v_suggested numeric:=0;
  v_amount numeric;
  v_model text;
  v_currency text;
  v_revisions integer;
  v_quality numeric;
  v_gate text;
  v_due date;
  v_requires_approval boolean:=false;
  v_accept boolean;
  v_scope jsonb:=coalesce(p_input->'scopeSnapshot','{}'::jsonb);
  v_items jsonb:=coalesce(p_input->'items','[]'::jsonb);
  v_task_count integer:=0;
  v_active integer;
  v_wip integer;
  v_assignment_status text;
begin
  select * into v_project from public.projects where id=(p_input->>'projectId')::uuid;
  if not found or not public.worker_compensation_is_manager(v_project.id) then raise exception 'Responsible Project Manager permission required.'; end if;
  if not public.content_writer_assignment_eligible(v_writer) then raise exception 'Select an activated Content Creator.'; end if;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 then raise exception 'Select at least one existing Content task/deliverable.'; end if;

  select greatest(1,coalesce((sc.config_value->>'wipLimit')::integer,2)) into v_wip
  from public.system_configuration sc where sc.config_key='content_delivery_sop_v1';
  select count(*) into v_active from public.worker_work_assignments a
  where a.writer_user_id=v_writer and a.status in ('Accepted','In Progress','Changes Required');
  if v_active>=coalesce(v_wip,2) then raise exception 'The selected writer is at the configured WIP limit.'; end if;

  v_model:=coalesce(nullif(p_input->>'compensationModel',''),v_cfg->>'defaultModel');
  if not (coalesce(v_cfg->'enabledModels','[]'::jsonb) ? v_model) then raise exception 'This compensation model is disabled.'; end if;
  v_currency:=upper(coalesce(nullif(p_input->>'currency',''),v_project.currency,v_cfg->>'defaultCurrency'));
  v_due:=coalesce(nullif(p_input->>'dueDate','')::date,v_project.target_date);
  if v_due is null then raise exception 'A due date is required.'; end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    select * into v_task from public.project_tasks
    where id=(v_item->>'taskId')::uuid and project_id=v_project.id and (lower(coalesce(department,''))='content' or workflow_key='content_delivery');
    if not found then raise exception 'Every assignment item must use an existing Content task from this project.'; end if;
    select d.id into v_deliverable from public.content_deliverables d where d.project_task_id=v_task.id;
    if exists(
      select 1 from public.worker_assignment_items wi
      join public.worker_work_assignments wa on wa.id=wi.assignment_id
      where wi.project_task_id=v_task.id and wa.status not in ('Cancelled','Voided','Reversed')
    ) then raise exception 'A selected task already belongs to an active compensation assignment.'; end if;
    select * into v_rate from public.worker_compensation_rate_cards r
    where r.department='Content' and r.active is true and r.currency=v_currency
      and (r.sales_product_id=nullif(v_item->>'salesProductId','')::uuid or lower(r.content_type)=lower(coalesce(nullif(v_item->>'contentType',''),v_task.title)))
    order by (r.sales_product_id is not null) desc,r.configuration_version desc limit 1;
    v_suggested:=v_suggested+case
      when v_rate.id is null then 0
      when v_rate.compensation_model='Per Unit' then coalesce(v_rate.per_unit_rate,v_rate.default_fee)*greatest(coalesce((v_item->>'quantity')::numeric,1),0)
      else v_rate.default_fee end;
    v_task_count:=v_task_count+1;
  end loop;

  v_amount:=coalesce(nullif(p_input->>'agreedFee','')::numeric,v_suggested);
  if v_amount<0 then raise exception 'Agreed compensation cannot be negative.'; end if;
  v_revisions:=coalesce(nullif(p_input->>'includedRevisions','')::integer,(v_cfg->>'includedRevisions')::integer,0);
  v_quality:=coalesce(nullif(p_input->>'qualityThreshold','')::numeric,(v_cfg->>'qualityThreshold')::numeric,0);
  v_gate:=coalesce(nullif(p_input->>'approvalGate',''),v_cfg->>'earningTrigger','Independent Editorial Approval');
  v_accept:=coalesce((v_cfg->>'acceptanceRequired')::boolean,true);

  if not public.is_admin() and v_amount<>v_suggested then
    if coalesce((v_cfg->>'pmOverrideAllowed')::boolean,false) is false then v_requires_approval:=true;
    elsif v_suggested=0 then v_requires_approval:=true;
    elsif abs(v_amount-v_suggested)*100/v_suggested>coalesce((v_cfg->>'managerOverridePercent')::numeric,0) then v_requires_approval:=true;
    elsif v_amount>=coalesce((v_cfg->>'customApprovalThreshold')::numeric,0) and coalesce((v_cfg->>'customApprovalThreshold')::numeric,0)>0 then v_requires_approval:=true;
    end if;
  end if;

  insert into public.worker_work_assignments(
    project_id,writer_user_id,status,compensation_model,suggested_amount,agreed_fee,currency,scope_snapshot,deliverable_snapshot,
    due_date_snapshot,included_revisions_snapshot,quality_threshold_snapshot,approval_gate_snapshot,earning_trigger_snapshot,
    acceptance_required,configuration_snapshot,override_status,override_reason,created_by,updated_by
  ) values(
    v_project.id,v_writer,case when v_requires_approval then 'Pending Approval' when v_accept then 'Offered' else 'Accepted' end,
    v_model,v_suggested,v_amount,v_currency,v_scope,v_items,v_due,v_revisions,v_quality,v_gate,v_gate,v_accept,v_cfg,
    case when v_requires_approval then 'Pending' when v_amount<>v_suggested then 'Approved' else 'Not Required' end,
    nullif(p_input->>'overrideReason',''),auth.uid(),auth.uid()
  ) returning id into v_id;

  -- The revenue-distribution BEFORE trigger may have filled a zero/no-rate-card assignment from the protected role budget.
  -- Re-read these values before writing items, events or notifications so all downstream metadata agrees with the ledger.
  select suggested_amount,agreed_fee,status into v_suggested,v_amount,v_assignment_status
  from public.worker_work_assignments where id=v_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    select * into v_task from public.project_tasks where id=(v_item->>'taskId')::uuid;
    select d.id into v_deliverable from public.content_deliverables d where d.project_task_id=v_task.id;
    select * into v_rate from public.worker_compensation_rate_cards r
    where r.department='Content' and r.active is true and r.currency=v_currency
      and (r.sales_product_id=nullif(v_item->>'salesProductId','')::uuid or lower(r.content_type)=lower(coalesce(nullif(v_item->>'contentType',''),v_task.title)))
    order by (r.sales_product_id is not null) desc,r.configuration_version desc limit 1;
    insert into public.worker_assignment_items(
      assignment_id,project_task_id,content_deliverable_id,content_type,quantity,unit_label,rate_card_id,unit_rate_snapshot,amount_snapshot,scope_snapshot
    ) values(
      v_id,v_task.id,v_deliverable,coalesce(nullif(v_item->>'contentType',''),v_task.title),greatest(coalesce((v_item->>'quantity')::numeric,1),0.01),
      coalesce(nullif(v_item->>'unitLabel',''),'deliverable'),v_rate.id,
      case when v_rate.compensation_model='Per Unit' then coalesce(v_rate.per_unit_rate,v_rate.default_fee) else v_rate.default_fee end,
      case when v_rate.compensation_model='Per Unit' then coalesce(v_rate.per_unit_rate,v_rate.default_fee)*greatest(coalesce((v_item->>'quantity')::numeric,1),0) else coalesce(v_rate.default_fee,0) end,
      coalesce(v_item->'scope','{}'::jsonb)
    );
    update public.project_tasks set assigned_to=v_writer,due_date=v_due,updated_at=now() where id=v_task.id;
  end loop;

  insert into public.project_team(project_id,user_id,role)
  values(v_project.id,v_writer,'Content Writer')
  on conflict(project_id,user_id) do update set role='Content Writer';

  insert into public.worker_compensation_events(assignment_id,event_type,reason,new_value,actor_id)
  values(v_id,'Assignment Created',nullif(p_input->>'overrideReason',''),
    jsonb_build_object('suggestedAmount',v_suggested,'agreedFee',v_amount,'status',v_assignment_status,'taskCount',v_task_count,'revenueBudgetAligned',true),auth.uid());

  if not v_requires_approval then
    perform public.service_queue_staff_operational_notification(
      v_writer,'worker-assignment-offered:'||v_id::text,'content_assignment_offered','Content Work','New project assignment',
      v_project.project_name||' has been assigned with agreed compensation '||v_currency||' '||v_amount::text,
      '/admin/app/projects?tab=myWork',jsonb_build_object('assignmentId',v_id,'projectId',v_project.id),now()
    );
  end if;
  return v_id;
end;
$$;
