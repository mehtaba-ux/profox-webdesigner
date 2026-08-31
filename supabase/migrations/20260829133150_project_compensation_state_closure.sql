-- Close project-compensation lifecycle edge cases found during the final workflow audit.
-- Canonical projects/tasks/content deliverables remain the only source of delivery scope.

update public.system_configuration
set config_value=jsonb_set(coalesce(config_value,'{}'::jsonb),'{version}',to_jsonb(coalesce((config_value->>'version')::integer,1)),true)
where config_key='project_work_compensation_v1';

create or replace function public.admin_save_worker_compensation_config(p_config jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb:=coalesce(p_config,'{}'::jsonb); v_models jsonb; v_model jsonb; v_previous jsonb; v_version integer;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  if jsonb_typeof(v)<>'object' then raise exception 'Configuration must be an object.'; end if;
  v_models:=coalesce(v->'enabledModels','[]'::jsonb);
  if jsonb_typeof(v_models)<>'array' or jsonb_array_length(v_models)=0 then raise exception 'Enable at least one compensation model.'; end if;
  for v_model in select value from jsonb_array_elements(v_models) loop
    if v_model#>>'{}' not in ('Fixed Project Fee','Fixed Deliverable Fee','Per Unit','Custom Project Amount','Package-Based Rate') then raise exception 'Unsupported compensation model.'; end if;
  end loop;
  if coalesce(v->>'defaultModel','') not in (select value#>>'{}' from jsonb_array_elements(v_models)) then raise exception 'Default model must be enabled.'; end if;
  if coalesce(v->>'defaultCurrency','') !~ '^[A-Z]{3}$' then raise exception 'Default currency must be a three-letter code.'; end if;
  if coalesce((v->>'qualityThreshold')::numeric,-1) not between 0 and 100 then raise exception 'Quality threshold must be between 0 and 100.'; end if;
  if coalesce((v->>'includedRevisions')::integer,-1)<0 then raise exception 'Included revisions cannot be negative.'; end if;
  if coalesce((v->>'payoutHoldDays')::integer,-1)<0 or coalesce((v->>'minimumPayout')::numeric,-1)<0 then raise exception 'Payout controls cannot be negative.'; end if;
  if coalesce((v->>'managerOverridePercent')::numeric,-1)<0 or coalesce((v->>'customApprovalThreshold')::numeric,-1)<0 then raise exception 'Approval controls cannot be negative.'; end if;
  select config_value into v_previous from public.system_configuration where config_key='project_work_compensation_v1' for update;
  v_version:=coalesce((v_previous->>'version')::integer,0)+1;
  v:=jsonb_set(v,'{version}',to_jsonb(v_version),true);
  update public.system_configuration set config_value=v,updated_by=(select auth.uid()),updated_at=now() where config_key='project_work_compensation_v1';
  if not found then insert into public.system_configuration(config_key,config_value,description,updated_by) values('project_work_compensation_v1',v,'Dynamic project-work compensation policy.',(select auth.uid())); end if;
  return v;
end $$;

create or replace function public.prepare_worker_assignment_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_cfg jsonb:=public.worker_compensation_config();
begin
  new.configuration_version:=greatest(1,coalesce((v_cfg->>'version')::integer,1));
  new.configuration_snapshot:=jsonb_set(coalesce(new.configuration_snapshot,v_cfg),'{version}',to_jsonb(new.configuration_version),true);
  if new.status='Accepted' and new.acceptance_required is false then
    new.accepted_at:=coalesce(new.accepted_at,now());
    new.accepted_by:=coalesce(new.accepted_by,new.created_by,(select auth.uid()));
  end if;
  return new;
end $$;
drop trigger if exists trg_prepare_worker_assignment_snapshot on public.worker_work_assignments;
create trigger trg_prepare_worker_assignment_snapshot before insert on public.worker_work_assignments for each row execute function public.prepare_worker_assignment_snapshot();

create or replace function public.enforce_worker_assignment_wip()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_writer uuid; v_assignment uuid; v_limit integer; v_count integer;
begin
  if tg_table_name='worker_work_assignments' then
    if new.status not in ('Accepted','In Progress','Changes Required') or old.status in ('Accepted','In Progress','Changes Required') then return new; end if;
    v_writer:=new.writer_user_id; v_assignment:=new.id;
  else
    select a.writer_user_id into v_writer from public.worker_work_assignments a where a.id=new.assignment_id and a.status in ('Accepted','In Progress','Changes Required');
    if v_writer is null then return new; end if;
    v_assignment:=new.assignment_id;
  end if;
  select greatest(1,coalesce((sc.config_value->>'wipLimit')::integer,2)) into v_limit from public.system_configuration sc where sc.config_key='content_delivery_sop_v1';
  select count(distinct i.project_task_id) into v_count
  from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id
  where a.writer_user_id=v_writer and a.status in ('Accepted','In Progress','Changes Required')
    and (tg_table_name<>'worker_assignment_items' or i.id<>new.id);
  if tg_table_name='worker_assignment_items' then v_count:=v_count+1;
  else v_count:=v_count+(select count(*) from public.worker_assignment_items i where i.assignment_id=v_assignment and not exists(select 1 from public.worker_assignment_items x join public.worker_work_assignments ax on ax.id=x.assignment_id where ax.writer_user_id=v_writer and ax.status in ('Accepted','In Progress','Changes Required') and x.project_task_id=i.project_task_id));
  end if;
  if v_count>coalesce(v_limit,2) then raise exception 'Accepting this work would exceed the configured Content Creator WIP limit (%).',v_limit; end if;
  return new;
end $$;
drop trigger if exists trg_enforce_worker_assignment_wip_status on public.worker_work_assignments;
create trigger trg_enforce_worker_assignment_wip_status before update of status on public.worker_work_assignments for each row execute function public.enforce_worker_assignment_wip();
drop trigger if exists trg_enforce_worker_assignment_wip_item on public.worker_assignment_items;
create trigger trg_enforce_worker_assignment_wip_item before insert on public.worker_assignment_items for each row execute function public.enforce_worker_assignment_wip();

create or replace function public.guard_and_sync_worker_assignment_content_state()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record; v_status text;
begin
  if new.lifecycle_stage in ('Drafting','Writer Self-QA') and old.lifecycle_stage is distinct from new.lifecycle_stage and exists(
    select 1 from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id
    where i.content_deliverable_id=new.id and a.acceptance_required is true and a.accepted_at is null and a.status not in ('Cancelled','Voided','Reversed')
  ) then raise exception 'The Content Creator must accept the project assignment before authoring can begin.'; end if;
  v_status:=case
    when new.lifecycle_stage='Drafting' and new.quality_status in ('Revision Required','Rework') then 'Changes Required'
    when new.lifecycle_stage in ('Drafting','Writer Self-QA') then 'In Progress'
    when new.lifecycle_stage in ('SME / Fact Check','2i Editorial Review','SEO / Conversion Review','Ready for Client Review','Client Approved','Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained') then 'In Review'
    else null end;
  if v_status is not null then
    for r in select distinct i.assignment_id from public.worker_assignment_items i where i.content_deliverable_id=new.id loop
      update public.worker_work_assignments a set status=v_status,started_at=case when v_status='In Progress' then coalesce(a.started_at,now()) else a.started_at end,updated_at=now()
      where a.id=r.assignment_id and a.status in ('Accepted','In Progress','In Review','Changes Required');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_sync_worker_assignment_content_state on public.content_deliverables;
create trigger trg_guard_sync_worker_assignment_content_state after update of lifecycle_stage on public.content_deliverables for each row execute function public.guard_and_sync_worker_assignment_content_state();

create or replace function public.sync_worker_assignment_review_result()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.decision in ('Changes Required','Rework','Rejected') then
    update public.worker_work_assignments a set status='Changes Required',updated_at=now()
    where a.id in (select i.assignment_id from public.worker_assignment_items i where i.content_deliverable_id=new.deliverable_id)
      and a.status in ('Accepted','In Progress','In Review','Changes Required');
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_worker_assignment_review_result on public.content_reviews;
create trigger trg_sync_worker_assignment_review_result after insert on public.content_reviews for each row execute function public.sync_worker_assignment_review_result();

create or replace function public.apply_worker_scope_change(p_change_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c public.worker_assignment_scope_changes%rowtype; a public.worker_work_assignments%rowtype; v_item jsonb; v_task public.project_tasks%rowtype; v_deliverable uuid; v_rate public.worker_compensation_rate_cards%rowtype; v_quantity numeric; v_item_count integer:=0;
begin
  if coalesce(current_setting('profox.worker_compensation_internal',true),'')<>'1' then raise exception 'Controlled scope-change workflow required.'; end if;
  select * into c from public.worker_assignment_scope_changes where id=p_change_id for update;
  select * into a from public.worker_work_assignments where id=c.assignment_id for update;
  if c.status<>'Approved' or a.status in ('Earned','Scheduled for Payout','Paid','Cancelled','Voided','Reversed') then raise exception 'This scope change cannot be applied.'; end if;
  if a.scope_version<>c.from_scope_version then raise exception 'The assignment scope has changed; review this request again.'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(c.added_items,'[]'::jsonb)) loop
    select * into v_task from public.project_tasks where id=(v_item->>'taskId')::uuid and project_id=a.project_id and (lower(coalesce(department,''))='content' or workflow_key='content_delivery');
    if not found then raise exception 'Every added item must use an existing Content task from this project.'; end if;
    if exists(select 1 from public.worker_assignment_items wi join public.worker_work_assignments wa on wa.id=wi.assignment_id where wi.project_task_id=v_task.id and wa.status not in ('Cancelled','Voided','Reversed')) then raise exception 'An added task already belongs to an active compensation assignment.'; end if;
    select d.id into v_deliverable from public.content_deliverables d where d.project_task_id=v_task.id;
    if v_deliverable is null then raise exception 'Every added Content task must have its canonical PF-SOP-07 deliverable.'; end if;
    v_quantity:=greatest(coalesce((v_item->>'quantity')::numeric,1),0.01);
    select * into v_rate from public.worker_compensation_rate_cards r where r.department='Content' and r.active is true and r.currency=a.currency and (r.sales_product_id=nullif(v_item->>'salesProductId','')::uuid or lower(r.content_type)=lower(coalesce(nullif(v_item->>'contentType',''),v_task.title))) order by (r.sales_product_id is not null) desc,r.configuration_version desc limit 1;
    insert into public.worker_assignment_items(assignment_id,project_task_id,content_deliverable_id,content_type,quantity,unit_label,rate_card_id,unit_rate_snapshot,amount_snapshot,scope_snapshot)
    values(a.id,v_task.id,v_deliverable,coalesce(nullif(v_item->>'contentType',''),v_task.title),v_quantity,coalesce(nullif(v_item->>'unitLabel',''),'deliverable'),v_rate.id,case when v_rate.compensation_model='Per Unit' then coalesce(v_rate.per_unit_rate,v_rate.default_fee,0) else coalesce(v_rate.default_fee,0) end,case when v_rate.compensation_model='Per Unit' then coalesce(v_rate.per_unit_rate,v_rate.default_fee,0)*v_quantity else coalesce(v_rate.default_fee,0) end,coalesce(v_item->'scope','{}'::jsonb));
    update public.project_tasks set assigned_to=a.writer_user_id,due_date=a.due_date_snapshot,updated_at=now() where id=v_task.id;
    v_item_count:=v_item_count+1;
  end loop;
  update public.worker_work_assignments set status='Accepted',scope_snapshot=c.new_scope_snapshot,deliverable_snapshot=deliverable_snapshot||coalesce(c.added_items,'[]'::jsonb),agreed_fee=agreed_fee+c.additional_fee_agreed,scope_version=c.to_scope_version,updated_by=(select auth.uid()),updated_at=now() where id=a.id;
  insert into public.worker_compensation_events(assignment_id,event_type,new_value,actor_id) values(a.id,'Scope Change Applied',jsonb_build_object('scopeChangeId',c.id,'scopeVersion',c.to_scope_version,'addedItemCount',v_item_count,'additionalFee',c.additional_fee_agreed),(select auth.uid()));
end $$;

create or replace function public.manager_propose_worker_scope_change(p_assignment_id uuid,p_new_scope jsonb,p_added_items jsonb,p_additional_fee numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.worker_work_assignments%rowtype; v_id uuid; v_cfg jsonb; v_needs_admin boolean:=false; v_needs_writer boolean;
begin
  select * into v from public.worker_work_assignments where id=p_assignment_id for update;
  if not found or not public.worker_compensation_is_manager(v.project_id) then raise exception 'Responsible Project Manager permission required.'; end if;
  if v.accepted_at is null or v.status not in ('Accepted','In Progress','In Review','Changes Required') then raise exception 'Only an accepted, financially unrecognized assignment can receive a scope change.'; end if;
  if exists(select 1 from public.worker_assignment_scope_changes c where c.assignment_id=v.id and c.status in ('Pending Approval','Pending Writer Acceptance')) then raise exception 'Resolve the existing scope change first.'; end if;
  if jsonb_typeof(coalesce(p_new_scope,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_added_items,'[]'::jsonb))<>'array' then raise exception 'Scope change payload is invalid.'; end if;
  if coalesce(p_additional_fee,-1)<0 or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A non-negative additional fee and change reason are required.'; end if;
  v_cfg:=v.configuration_snapshot; v_needs_writer:=coalesce((v_cfg->>'scopeChangeAcceptanceRequired')::boolean,true);
  if not public.is_admin() and (coalesce((v_cfg->>'pmOverrideAllowed')::boolean,false) is false or (coalesce((v_cfg->>'customApprovalThreshold')::numeric,0)>0 and p_additional_fee>=coalesce((v_cfg->>'customApprovalThreshold')::numeric,0)) or (v.agreed_fee>0 and p_additional_fee*100/v.agreed_fee>coalesce((v_cfg->>'managerOverridePercent')::numeric,0))) then v_needs_admin:=true; end if;
  insert into public.worker_assignment_scope_changes(assignment_id,from_scope_version,to_scope_version,old_scope_snapshot,new_scope_snapshot,added_items,additional_fee_suggested,additional_fee_agreed,status,writer_acceptance_required,reason,requested_by)
  values(v.id,v.scope_version,v.scope_version+1,v.scope_snapshot,p_new_scope,coalesce(p_added_items,'[]'::jsonb),p_additional_fee,p_additional_fee,case when v_needs_admin then 'Pending Approval' when v_needs_writer then 'Pending Writer Acceptance' else 'Approved' end,v_needs_writer,btrim(p_reason),(select auth.uid())) returning id into v_id;
  if v_needs_admin or v_needs_writer then update public.worker_work_assignments set status='On Hold',updated_by=(select auth.uid()),updated_at=now() where id=v.id;
  else perform set_config('profox.worker_compensation_internal','1',true); perform public.apply_worker_scope_change(v_id); end if;
  insert into public.worker_compensation_events(assignment_id,event_type,reason,old_value,new_value,actor_id) values(v.id,'Scope Change Proposed',p_reason,jsonb_build_object('scopeVersion',v.scope_version,'scope',v.scope_snapshot,'agreedFee',v.agreed_fee),jsonb_build_object('scopeVersion',v.scope_version+1,'scope',p_new_scope,'additionalFee',p_additional_fee,'approvalRequired',v_needs_admin,'writerAcceptanceRequired',v_needs_writer),(select auth.uid()));
  perform public.service_queue_staff_operational_notification(v.writer_user_id,'worker-scope-change:'||v_id::text,'content_assignment_changed','Content Work','Project scope change proposed','Review the updated scope and compensation before continuing.','/admin/app/projects?tab=myWork',jsonb_build_object('assignmentId',v.id,'scopeChangeId',v_id),now());
  return v_id;
end $$;

create or replace function public.admin_review_worker_scope_change(p_change_id uuid,p_approved boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.worker_assignment_scope_changes%rowtype; a public.worker_work_assignments%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  select * into c from public.worker_assignment_scope_changes where id=p_change_id for update;
  if not found or c.status<>'Pending Approval' then raise exception 'Scope change is not waiting for Admin approval.'; end if;
  select * into a from public.worker_work_assignments where id=c.assignment_id for update;
  if a.status in ('Earned','Scheduled for Payout','Paid','Cancelled','Voided','Reversed') then raise exception 'The assignment is no longer eligible for a scope change.'; end if;
  if not p_approved then update public.worker_assignment_scope_changes set status='Rejected',approved_by=(select auth.uid()),approved_at=now() where id=c.id; update public.worker_work_assignments set status='Accepted',updated_by=(select auth.uid()),updated_at=now() where id=a.id;
  elsif c.writer_acceptance_required then update public.worker_assignment_scope_changes set status='Pending Writer Acceptance',approved_by=(select auth.uid()),approved_at=now() where id=c.id;
  else update public.worker_assignment_scope_changes set status='Approved',approved_by=(select auth.uid()),approved_at=now() where id=c.id; perform set_config('profox.worker_compensation_internal','1',true); perform public.apply_worker_scope_change(c.id); end if;
  insert into public.worker_compensation_events(assignment_id,event_type,reason,new_value,actor_id) values(a.id,case when p_approved then 'Scope Change Approved' else 'Scope Change Rejected' end,p_reason,jsonb_build_object('scopeChangeId',c.id,'writerAcceptanceRequired',c.writer_acceptance_required),(select auth.uid()));
end $$;

create or replace function public.writer_respond_worker_scope_change(p_change_id uuid,p_accepted boolean,p_message text default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.worker_assignment_scope_changes%rowtype; a public.worker_work_assignments%rowtype;
begin
  select sc.* into c from public.worker_assignment_scope_changes sc join public.worker_work_assignments wa on wa.id=sc.assignment_id where sc.id=p_change_id and wa.writer_user_id=(select auth.uid()) for update of sc;
  if not found or c.status<>'Pending Writer Acceptance' then raise exception 'Scope change is not waiting for your response.'; end if;
  select * into a from public.worker_work_assignments where id=c.assignment_id for update;
  if a.status in ('Earned','Scheduled for Payout','Paid','Cancelled','Voided','Reversed') then raise exception 'The assignment is no longer eligible for a scope change.'; end if;
  if p_accepted then update public.worker_assignment_scope_changes set status='Approved',writer_accepted_at=now() where id=c.id; perform set_config('profox.worker_compensation_internal','1',true); perform public.apply_worker_scope_change(c.id);
  else if length(btrim(coalesce(p_message,'')))<3 then raise exception 'Explain why the scope change is not accepted.'; end if; update public.worker_assignment_scope_changes set status='Rejected' where id=c.id; update public.worker_work_assignments set status='Accepted',updated_by=(select auth.uid()),updated_at=now() where id=a.id; end if;
  insert into public.worker_compensation_events(assignment_id,event_type,reason,new_value,actor_id) values(a.id,case when p_accepted then 'Writer Accepted Scope Change' else 'Writer Rejected Scope Change' end,p_message,jsonb_build_object('scopeChangeId',c.id,'accepted',p_accepted),(select auth.uid()));
end $$;

create or replace function public.writer_respond_work_assignment(p_assignment_id uuid,p_action text,p_message text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.worker_work_assignments%rowtype;
begin
  select * into v from public.worker_work_assignments where id=p_assignment_id and writer_user_id=(select auth.uid()) for update;
  if not found then raise exception 'Assignment not found.'; end if;
  if p_action='Accept' then
    if v.status<>'Offered' then raise exception 'This assignment can only be accepted after any clarification has been answered.'; end if;
    update public.worker_work_assignments set status='Accepted',accepted_at=coalesce(accepted_at,now()),accepted_by=(select auth.uid()),updated_by=(select auth.uid()),updated_at=now() where id=v.id;
    insert into public.worker_compensation_events(assignment_id,event_type,reason,old_value,new_value,actor_id) values(v.id,'Writer Accepted',p_message,jsonb_build_object('status',v.status),jsonb_build_object('status','Accepted','commercialSnapshotLocked',true),(select auth.uid()));
  elsif p_action='Request Clarification' then
    if v.status<>'Offered' or length(btrim(coalesce(p_message,'')))<3 then raise exception 'Provide a clarification question for an offered assignment.'; end if;
    update public.worker_work_assignments set status='Clarification Requested',updated_by=(select auth.uid()),updated_at=now() where id=v.id;
    insert into public.worker_compensation_events(assignment_id,event_type,reason,old_value,new_value,actor_id) values(v.id,'Clarification Requested',p_message,jsonb_build_object('status',v.status),jsonb_build_object('status','Clarification Requested'),(select auth.uid()));
  else raise exception 'Unsupported assignment response.'; end if;
end $$;

revoke all on function public.prepare_worker_assignment_snapshot() from public,anon,authenticated;
revoke all on function public.enforce_worker_assignment_wip() from public,anon,authenticated;
revoke all on function public.guard_and_sync_worker_assignment_content_state() from public,anon,authenticated;
revoke all on function public.sync_worker_assignment_review_result() from public,anon,authenticated;
revoke all on function public.apply_worker_scope_change(uuid) from public,anon,authenticated;
