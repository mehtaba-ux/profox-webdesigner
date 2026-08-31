-- Generic project-work compensation foundation with Content Delivery integration.
-- Existing projects, tasks, quotation scope, PF-SOP-07 reviews and notifications remain authoritative.

create table if not exists public.worker_compensation_rate_cards (
  id uuid primary key default gen_random_uuid(),
  department text not null default 'Content',
  content_type text not null,
  sales_product_id uuid references public.sales_products(id) on delete set null,
  compensation_model text not null,
  default_fee numeric(14,2) not null default 0,
  per_unit_rate numeric(14,2),
  currency text not null,
  included_revisions integer not null default 0,
  quality_threshold numeric(5,2) not null,
  default_timeline_days integer,
  approval_gate text not null,
  active boolean not null default true,
  configuration_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id),
  updated_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_rate_model_check check (compensation_model in ('Fixed Project Fee','Fixed Deliverable Fee','Per Unit','Custom Project Amount','Package-Based Rate')),
  constraint worker_rate_amount_check check (default_fee >= 0 and coalesce(per_unit_rate,0) >= 0),
  constraint worker_rate_revision_check check (included_revisions >= 0),
  constraint worker_rate_quality_check check (quality_threshold between 0 and 100),
  constraint worker_rate_currency_check check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists ux_worker_rate_card_identity
  on public.worker_compensation_rate_cards(department,lower(content_type),coalesce(sales_product_id,'00000000-0000-0000-0000-000000000000'::uuid),configuration_version);
create index if not exists idx_worker_rate_card_lookup
  on public.worker_compensation_rate_cards(department,active,sales_product_id,content_type);

create table if not exists public.worker_performance_tiers (
  id uuid primary key default gen_random_uuid(),
  department text not null default 'Content',
  name text not null,
  minimum_completed_projects integer not null default 0,
  minimum_quality numeric(5,2) not null default 0,
  minimum_on_time_percent numeric(5,2) not null default 0,
  minimum_first_pass_percent numeric(5,2) not null default 0,
  maximum_revision_average numeric(8,2),
  eligible_content_types jsonb not null default '[]'::jsonb,
  rate_modifier_percent numeric(8,2) not null default 0,
  manual_approval_required boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id),
  updated_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_tier_percent_check check (minimum_quality between 0 and 100 and minimum_on_time_percent between 0 and 100 and minimum_first_pass_percent between 0 and 100),
  constraint worker_tier_count_check check (minimum_completed_projects >= 0)
);

create table if not exists public.worker_work_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  writer_user_id uuid not null references public.user_profiles(id) on delete restrict,
  department text not null default 'Content',
  status text not null default 'Offered',
  compensation_model text not null,
  suggested_amount numeric(14,2) not null default 0,
  agreed_fee numeric(14,2) not null,
  earning_amount numeric(14,2),
  currency text not null,
  scope_snapshot jsonb not null,
  deliverable_snapshot jsonb not null default '[]'::jsonb,
  due_date_snapshot date not null,
  included_revisions_snapshot integer not null,
  quality_threshold_snapshot numeric(5,2) not null,
  approval_gate_snapshot text not null,
  earning_trigger_snapshot text not null,
  acceptance_required boolean not null default true,
  configuration_snapshot jsonb not null,
  configuration_version integer not null default 1,
  scope_version integer not null default 1,
  override_status text not null default 'Not Required',
  override_reason text,
  offered_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.user_profiles(id),
  started_at timestamptz,
  approved_at timestamptz,
  earned_at timestamptz,
  payout_status text not null default 'Not Earned',
  cancelled_at timestamptz,
  cancelled_by uuid references public.user_profiles(id),
  cancellation_reason text,
  created_by uuid not null references public.user_profiles(id),
  updated_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_assignment_status_check check (status in ('Pending Approval','Offered','Clarification Requested','Accepted','In Progress','In Review','Changes Required','Approved','Earned','Scheduled for Payout','Paid','Cancelled','On Hold','Disputed','Voided','Reversed')),
  constraint worker_assignment_model_check check (compensation_model in ('Fixed Project Fee','Fixed Deliverable Fee','Per Unit','Custom Project Amount','Package-Based Rate')),
  constraint worker_assignment_amount_check check (suggested_amount >= 0 and agreed_fee >= 0 and coalesce(earning_amount,0) >= 0),
  constraint worker_assignment_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint worker_assignment_snapshot_check check (included_revisions_snapshot >= 0 and quality_threshold_snapshot between 0 and 100 and scope_version > 0),
  constraint worker_assignment_override_check check (override_status in ('Not Required','Pending','Approved','Rejected')),
  constraint worker_assignment_payout_check check (payout_status in ('Not Earned','On Hold','Payable','Scheduled','Paid','Voided','Reversed'))
);

create index if not exists idx_worker_assignment_writer on public.worker_work_assignments(writer_user_id,status,due_date_snapshot);
create index if not exists idx_worker_assignment_project on public.worker_work_assignments(project_id,status);
create index if not exists idx_worker_assignment_payout on public.worker_work_assignments(payout_status,currency,earned_at);

create table if not exists public.worker_assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.worker_work_assignments(id) on delete restrict,
  project_task_id uuid references public.project_tasks(id) on delete restrict,
  content_deliverable_id uuid references public.content_deliverables(id) on delete restrict,
  content_type text not null,
  quantity numeric(12,2) not null default 1,
  unit_label text not null default 'deliverable',
  rate_card_id uuid references public.worker_compensation_rate_cards(id) on delete set null,
  unit_rate_snapshot numeric(14,2) not null default 0,
  amount_snapshot numeric(14,2) not null default 0,
  scope_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint worker_assignment_item_quantity_check check (quantity > 0),
  constraint worker_assignment_item_amount_check check (unit_rate_snapshot >= 0 and amount_snapshot >= 0),
  constraint worker_assignment_item_reference_check check (project_task_id is not null or content_deliverable_id is not null)
);
create index if not exists idx_worker_assignment_items_assignment on public.worker_assignment_items(assignment_id);
create index if not exists idx_worker_assignment_items_task on public.worker_assignment_items(project_task_id) where project_task_id is not null;
create index if not exists idx_worker_assignment_items_deliverable on public.worker_assignment_items(content_deliverable_id) where content_deliverable_id is not null;

create table if not exists public.worker_assignment_scope_changes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.worker_work_assignments(id) on delete restrict,
  from_scope_version integer not null,
  to_scope_version integer not null,
  old_scope_snapshot jsonb not null,
  new_scope_snapshot jsonb not null,
  added_items jsonb not null default '[]'::jsonb,
  additional_fee_suggested numeric(14,2) not null default 0,
  additional_fee_agreed numeric(14,2) not null default 0,
  status text not null default 'Pending Approval',
  writer_acceptance_required boolean not null default true,
  reason text not null,
  requested_by uuid not null references public.user_profiles(id),
  approved_by uuid references public.user_profiles(id),
  approved_at timestamptz,
  writer_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint worker_scope_change_version_check check (to_scope_version > from_scope_version),
  constraint worker_scope_change_amount_check check (additional_fee_suggested >= 0 and additional_fee_agreed >= 0),
  constraint worker_scope_change_status_check check (status in ('Pending Approval','Pending Writer Acceptance','Approved','Rejected','Cancelled'))
);
create unique index if not exists ux_worker_scope_change_version on public.worker_assignment_scope_changes(assignment_id,to_scope_version);

create table if not exists public.worker_earnings (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.worker_work_assignments(id) on delete restrict,
  writer_user_id uuid not null references public.user_profiles(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  scope_version integer not null,
  dedupe_key text not null unique,
  amount numeric(14,2) not null,
  currency text not null,
  status text not null default 'Payable',
  quality_evidence jsonb not null,
  earned_at timestamptz not null,
  eligible_at timestamptz not null,
  hold_reason text,
  reversed_at timestamptz,
  reversed_by uuid references public.user_profiles(id),
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_earning_once unique(assignment_id,scope_version),
  constraint worker_earning_amount_check check (amount >= 0),
  constraint worker_earning_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint worker_earning_status_check check (status in ('On Hold','Payable','Scheduled','Paid','Voided','Reversed'))
);
create index if not exists idx_worker_earning_writer on public.worker_earnings(writer_user_id,status,eligible_at);
create index if not exists idx_worker_earning_project on public.worker_earnings(project_id,status);

create table if not exists public.worker_payout_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique default ('WP-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')),
  status text not null default 'Scheduled',
  scheduled_for date not null,
  currency text not null,
  total_amount numeric(14,2) not null default 0,
  earning_count integer not null default 0,
  worker_count integer not null default 0,
  notes text,
  created_by uuid not null references public.user_profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_batch_status_check check (status in ('Scheduled','Processing','Partially Paid','Paid','Cancelled')),
  constraint worker_batch_currency_check check (currency ~ '^[A-Z]{3}$')
);

create table if not exists public.worker_payouts (
  id uuid primary key default gen_random_uuid(),
  payout_batch_id uuid not null references public.worker_payout_batches(id) on delete restrict,
  writer_user_id uuid not null references public.user_profiles(id) on delete restrict,
  currency text not null,
  amount numeric(14,2) not null,
  status text not null default 'Scheduled',
  payment_method text,
  transaction_reference text,
  hold_reason text,
  processing_started_at timestamptz,
  paid_at timestamptz,
  paid_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_payout_unique_worker unique(payout_batch_id,writer_user_id,currency),
  constraint worker_payout_amount_check check (amount >= 0),
  constraint worker_payout_status_check check (status in ('Scheduled','Processing','On Hold','Paid','Failed','Cancelled'))
);

create table if not exists public.worker_payout_items (
  payout_id uuid not null references public.worker_payouts(id) on delete restrict,
  earning_id uuid not null unique references public.worker_earnings(id) on delete restrict,
  amount_snapshot numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key(payout_id,earning_id),
  constraint worker_payout_item_amount_check check (amount_snapshot >= 0)
);

create table if not exists public.worker_compensation_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.worker_work_assignments(id) on delete restrict,
  earning_id uuid references public.worker_earnings(id) on delete restrict,
  payout_id uuid references public.worker_payouts(id) on delete restrict,
  event_type text not null,
  reason text,
  old_value jsonb,
  new_value jsonb,
  source text not null default 'Application',
  actor_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_worker_comp_events_assignment on public.worker_compensation_events(assignment_id,created_at desc);

insert into public.system_configuration(config_key,config_value,description)
values('project_work_compensation_v1',jsonb_build_object(
  'active',true,
  'enabledModels',jsonb_build_array('Fixed Project Fee','Fixed Deliverable Fee','Per Unit','Custom Project Amount','Package-Based Rate'),
  'defaultModel','Package-Based Rate',
  'defaultCurrency','USD',
  'includedRevisions',2,
  'qualityThreshold',90,
  'earningTrigger','Independent Editorial Approval',
  'acceptanceRequired',true,
  'payoutFrequency','Manual Batch',
  'payoutHoldDays',0,
  'minimumPayout',0,
  'managerOverridePercent',10,
  'customApprovalThreshold',500,
  'pmOverrideAllowed',true,
  'adminOverrideAllowed',true,
  'scopeChangeAcceptanceRequired',true,
  'blockedTimeExcluded',true,
  'priorityPolicy',jsonb_build_object('changesRequired',100,'overdue',90,'dueToday',80,'dueSoon',60,'activeDrafting',40,'waitingReview',10,'blocked',20),
  'deadlineRules',jsonb_build_object('dueSoonDays',3,'lateEscalationHours',24),
  'notificationPolicy',jsonb_build_object('assignment',true,'clarification',true,'deadline',true,'approval',true,'payout',true)
),'Dynamic project-work compensation policy. Rates are maintained separately and accepted assignments snapshot all commercial terms.')
on conflict(config_key) do nothing;

create or replace function public.worker_compensation_config()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select sc.config_value from public.system_configuration sc where sc.config_key='project_work_compensation_v1'),'{}'::jsonb)
$$;

create or replace function public.worker_compensation_is_manager(p_project_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.user_profiles u
    where u.id=(select auth.uid()) and u.status='active' and (
      u.role in ('admin','site_manager') or
      (u.role='project_manager' and (p_project_id is null or exists(select 1 from public.projects p where p.id=p_project_id and p.project_manager_id=u.id)))
    )
  )
$$;

create or replace function public.worker_compensation_is_finance()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_profiles u where u.id=(select auth.uid()) and u.status='active' and u.role in ('admin','finance','accountant'))
$$;

create or replace function public.worker_assignment_can_read(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.worker_work_assignments a
    where a.id=p_assignment_id and (
      a.writer_user_id=(select auth.uid()) or
      public.worker_compensation_is_manager(a.project_id) or
      public.worker_compensation_is_finance()
    )
  )
$$;

create or replace function public.content_writer_assignment_eligible(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_profiles u where u.id=p_user_id and u.status='active' and u.role='content_writer' and coalesce(u.onboarding_progress,0)>=100)
$$;

create or replace function public.content_assignment_writer_can_work(p_deliverable_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(
    select 1 from public.worker_assignment_items i
    join public.worker_work_assignments a on a.id=i.assignment_id
    where i.content_deliverable_id=p_deliverable_id
      and a.writer_user_id=(select auth.uid())
      and a.acceptance_required is true
      and a.status not in ('Accepted','In Progress','In Review','Changes Required','Approved','Earned','Scheduled for Payout','Paid')
  )
$$;

create or replace function public.admin_save_worker_compensation_config(p_config jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb:=coalesce(p_config,'{}'::jsonb); v_models jsonb; v_model jsonb;
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
  update public.system_configuration set config_value=v,updated_by=(select auth.uid()),updated_at=now() where config_key='project_work_compensation_v1';
  if not found then insert into public.system_configuration(config_key,config_value,description,updated_by) values('project_work_compensation_v1',v,'Dynamic project-work compensation policy.',(select auth.uid())); end if;
  return v;
end $$;

create or replace function public.admin_upsert_worker_rate_card(p_card jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_model text:=p_card->>'compensationModel'; v_currency text:=upper(p_card->>'currency');
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  if coalesce(btrim(p_card->>'contentType'),'')='' then raise exception 'Content type is required.'; end if;
  if v_model not in ('Fixed Project Fee','Fixed Deliverable Fee','Per Unit','Custom Project Amount','Package-Based Rate') then raise exception 'Unsupported compensation model.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter code.'; end if;
  if coalesce((p_card->>'defaultFee')::numeric,0)<0 or coalesce((p_card->>'perUnitRate')::numeric,0)<0 then raise exception 'Rates cannot be negative.'; end if;
  if p_card->>'id' is not null then
    update public.worker_compensation_rate_cards set content_type=btrim(p_card->>'contentType'),sales_product_id=nullif(p_card->>'salesProductId','')::uuid,compensation_model=v_model,default_fee=coalesce((p_card->>'defaultFee')::numeric,0),per_unit_rate=nullif(p_card->>'perUnitRate','')::numeric,currency=v_currency,included_revisions=coalesce((p_card->>'includedRevisions')::integer,0),quality_threshold=coalesce((p_card->>'qualityThreshold')::numeric,0),default_timeline_days=nullif(p_card->>'defaultTimelineDays','')::integer,approval_gate=coalesce(nullif(p_card->>'approvalGate',''),'Independent Editorial Approval'),active=coalesce((p_card->>'active')::boolean,true),configuration_version=configuration_version+1,metadata=coalesce(p_card->'metadata','{}'::jsonb),updated_by=(select auth.uid()),updated_at=now() where id=(p_card->>'id')::uuid returning id into v_id;
    if v_id is null then raise exception 'Rate card not found.'; end if;
  else
    insert into public.worker_compensation_rate_cards(content_type,sales_product_id,compensation_model,default_fee,per_unit_rate,currency,included_revisions,quality_threshold,default_timeline_days,approval_gate,active,metadata,created_by,updated_by)
    values(btrim(p_card->>'contentType'),nullif(p_card->>'salesProductId','')::uuid,v_model,coalesce((p_card->>'defaultFee')::numeric,0),nullif(p_card->>'perUnitRate','')::numeric,v_currency,coalesce((p_card->>'includedRevisions')::integer,0),coalesce((p_card->>'qualityThreshold')::numeric,0),nullif(p_card->>'defaultTimelineDays','')::integer,coalesce(nullif(p_card->>'approvalGate',''),'Independent Editorial Approval'),coalesce((p_card->>'active')::boolean,true),coalesce(p_card->'metadata','{}'::jsonb),(select auth.uid()),(select auth.uid())) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.get_content_compensation_admin_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.worker_compensation_is_manager() and not public.worker_compensation_is_finance() then raise exception 'Management permission required.'; end if;
  return jsonb_build_object(
    'config',public.worker_compensation_config(),
    'rateCards',coalesce((select jsonb_agg(to_jsonb(r) order by r.content_type,r.created_at) from public.worker_compensation_rate_cards r),'[]'::jsonb),
    'salesProducts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'scope',s.scope,'active',s.active) order by s.sort_order,s.name) from public.sales_products s where s.active is true),'[]'::jsonb),
    'tiers',coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order,t.name) from public.worker_performance_tiers t where t.department='Content'),'[]'::jsonb)
  );
end $$;

create or replace function public.get_content_assignment_context(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype; v_cfg jsonb:=public.worker_compensation_config(); v_wip integer;
begin
  if not public.worker_compensation_is_manager(p_project_id) then raise exception 'Responsible Project Manager permission required.'; end if;
  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  select greatest(1,coalesce((sc.config_value->>'wipLimit')::integer,2)) into v_wip from public.system_configuration sc where sc.config_key='content_delivery_sop_v1';
  return jsonb_build_object(
    'project',jsonb_build_object('id',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'package',v_project.package_snapshot,'currency',v_project.currency,'dueDate',v_project.target_date,'scope',v_project.scope_summary,'quotationId',v_project.quotation_id),
    'purchasedScope',coalesce((select jsonb_agg(jsonb_build_object('quotationItemId',q.id,'salesProductId',q.sales_product_id,'code',q.product_code_snapshot,'name',q.product_name_snapshot,'description',q.description_snapshot,'quantity',q.quantity,'configuration',q.configuration_snapshot,'catalogScope',s.scope) order by q.sort_order,q.created_at) from public.quotation_items q left join public.sales_products s on s.id=q.sales_product_id where q.quotation_id=v_project.quotation_id and coalesce(q.optional_for_client,false)=false),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object('taskId',t.id,'deliverableId',d.id,'title',t.title,'description',t.description,'contentType',coalesce(d.content_type,t.title),'dueDate',t.due_date,'stage',d.lifecycle_stage,'assignedTo',t.assigned_to) order by t.created_at) from public.project_tasks t left join public.content_deliverables d on d.project_task_id=t.id where t.project_id=p_project_id and (lower(coalesce(t.department,''))='content' or t.workflow_key='content_delivery')),'[]'::jsonb),
    'writers',coalesce((select jsonb_agg(jsonb_build_object('userId',u.id,'name',u.full_name,'activeWip',coalesce(w.active_wip,0),'waitingReview',coalesce(w.waiting_review,0),'wipLimit',v_wip,'available',coalesce(w.active_wip,0)<v_wip,'averageQuality',w.average_quality,'onTimeRate',w.on_time_rate,'firstPassRate',w.first_pass_rate) order by (coalesce(w.active_wip,0)<v_wip) desc,coalesce(w.average_quality,0) desc,u.full_name) from public.user_profiles u left join lateral (select count(*) filter(where a.status in ('Accepted','In Progress','Changes Required')) active_wip,count(*) filter(where a.status='In Review') waiting_review,round(avg(d.quality_score),1) average_quality,round(100.0*count(*) filter(where a.approved_at is not null and a.approved_at::date<=a.due_date_snapshot)/nullif(count(*) filter(where a.approved_at is not null),0),1) on_time_rate,round(100.0*count(*) filter(where a.approved_at is not null and coalesce(d.internal_revision_count,0)=0)/nullif(count(*) filter(where a.approved_at is not null),0),1) first_pass_rate from public.worker_work_assignments a left join public.worker_assignment_items i on i.assignment_id=a.id left join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=u.id) w on true where public.content_writer_assignment_eligible(u.id)),'[]'::jsonb),
    'config',v_cfg,
    'rateCards',coalesce((select jsonb_agg(to_jsonb(r)) from public.worker_compensation_rate_cards r where r.department='Content' and r.active is true),'[]'::jsonb)
  );
end $$;

create or replace function public.create_content_work_assignment(p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype; v_writer uuid:=(p_input->>'writerUserId')::uuid; v_cfg jsonb:=public.worker_compensation_config(); v_id uuid; v_item jsonb; v_task public.project_tasks%rowtype; v_deliverable uuid; v_rate public.worker_compensation_rate_cards%rowtype; v_suggested numeric:=0; v_amount numeric; v_model text; v_currency text; v_revisions integer; v_quality numeric; v_gate text; v_due date; v_requires_approval boolean:=false; v_accept boolean; v_scope jsonb:=coalesce(p_input->'scopeSnapshot','{}'::jsonb); v_items jsonb:=coalesce(p_input->'items','[]'::jsonb); v_task_count integer:=0; v_active integer; v_wip integer;
begin
  select * into v_project from public.projects where id=(p_input->>'projectId')::uuid;
  if not found or not public.worker_compensation_is_manager(v_project.id) then raise exception 'Responsible Project Manager permission required.'; end if;
  if not public.content_writer_assignment_eligible(v_writer) then raise exception 'Select an activated Content Creator.'; end if;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 then raise exception 'Select at least one existing Content task/deliverable.'; end if;
  select greatest(1,coalesce((sc.config_value->>'wipLimit')::integer,2)) into v_wip from public.system_configuration sc where sc.config_key='content_delivery_sop_v1';
  select count(*) into v_active from public.worker_work_assignments a where a.writer_user_id=v_writer and a.status in ('Accepted','In Progress','Changes Required');
  if v_active>=coalesce(v_wip,2) then raise exception 'The selected writer is at the configured WIP limit.'; end if;
  v_model:=coalesce(nullif(p_input->>'compensationModel',''),v_cfg->>'defaultModel');
  if not (coalesce(v_cfg->'enabledModels','[]'::jsonb) ? v_model) then raise exception 'This compensation model is disabled.'; end if;
  v_currency:=upper(coalesce(nullif(p_input->>'currency',''),v_project.currency,v_cfg->>'defaultCurrency'));
  v_due:=coalesce(nullif(p_input->>'dueDate','')::date,v_project.target_date);
  if v_due is null then raise exception 'A due date is required.'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    select * into v_task from public.project_tasks where id=(v_item->>'taskId')::uuid and project_id=v_project.id and (lower(coalesce(department,''))='content' or workflow_key='content_delivery');
    if not found then raise exception 'Every assignment item must use an existing Content task from this project.'; end if;
    select d.id into v_deliverable from public.content_deliverables d where d.project_task_id=v_task.id;
    if exists(select 1 from public.worker_assignment_items wi join public.worker_work_assignments wa on wa.id=wi.assignment_id where wi.project_task_id=v_task.id and wa.status not in ('Cancelled','Voided','Reversed')) then raise exception 'A selected task already belongs to an active compensation assignment.'; end if;
    select * into v_rate from public.worker_compensation_rate_cards r where r.department='Content' and r.active is true and r.currency=v_currency and (r.sales_product_id=nullif(v_item->>'salesProductId','')::uuid or lower(r.content_type)=lower(coalesce(nullif(v_item->>'contentType',''),v_task.title))) order by (r.sales_product_id is not null) desc,r.configuration_version desc limit 1;
    v_suggested:=v_suggested+case when v_rate.id is null then 0 when v_rate.compensation_model='Per Unit' then coalesce(v_rate.per_unit_rate,v_rate.default_fee)*greatest(coalesce((v_item->>'quantity')::numeric,1),0) else v_rate.default_fee end;
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
  insert into public.worker_work_assignments(project_id,writer_user_id,status,compensation_model,suggested_amount,agreed_fee,currency,scope_snapshot,deliverable_snapshot,due_date_snapshot,included_revisions_snapshot,quality_threshold_snapshot,approval_gate_snapshot,earning_trigger_snapshot,acceptance_required,configuration_snapshot,override_status,override_reason,created_by,updated_by)
  values(v_project.id,v_writer,case when v_requires_approval then 'Pending Approval' when v_accept then 'Offered' else 'Accepted' end,v_model,v_suggested,v_amount,v_currency,v_scope,v_items,v_due,v_revisions,v_quality,v_gate,v_gate,v_accept,v_cfg,case when v_requires_approval then 'Pending' when v_amount<>v_suggested then 'Approved' else 'Not Required' end,nullif(p_input->>'overrideReason',''),(select auth.uid()),(select auth.uid())) returning id into v_id;
  for v_item in select value from jsonb_array_elements(v_items) loop
    select * into v_task from public.project_tasks where id=(v_item->>'taskId')::uuid;
    select d.id into v_deliverable from public.content_deliverables d where d.project_task_id=v_task.id;
    select * into v_rate from public.worker_compensation_rate_cards r where r.department='Content' and r.active is true and r.currency=v_currency and (r.sales_product_id=nullif(v_item->>'salesProductId','')::uuid or lower(r.content_type)=lower(coalesce(nullif(v_item->>'contentType',''),v_task.title))) order by (r.sales_product_id is not null) desc,r.configuration_version desc limit 1;
    insert into public.worker_assignment_items(assignment_id,project_task_id,content_deliverable_id,content_type,quantity,unit_label,rate_card_id,unit_rate_snapshot,amount_snapshot,scope_snapshot)
    values(v_id,v_task.id,v_deliverable,coalesce(nullif(v_item->>'contentType',''),v_task.title),greatest(coalesce((v_item->>'quantity')::numeric,1),0.01),coalesce(nullif(v_item->>'unitLabel',''),'deliverable'),v_rate.id,case when v_rate.compensation_model='Per Unit' then coalesce(v_rate.per_unit_rate,v_rate.default_fee) else v_rate.default_fee end,case when v_rate.compensation_model='Per Unit' then coalesce(v_rate.per_unit_rate,v_rate.default_fee)*greatest(coalesce((v_item->>'quantity')::numeric,1),0) else coalesce(v_rate.default_fee,0) end,coalesce(v_item->'scope','{}'::jsonb));
    update public.project_tasks set assigned_to=v_writer,due_date=v_due,updated_at=now() where id=v_task.id;
  end loop;
  insert into public.project_team(project_id,user_id,role) values(v_project.id,v_writer,'Content Writer') on conflict(project_id,user_id) do update set role='Content Writer';
  insert into public.worker_compensation_events(assignment_id,event_type,reason,new_value,actor_id) values(v_id,'Assignment Created',nullif(p_input->>'overrideReason',''),jsonb_build_object('suggestedAmount',v_suggested,'agreedFee',v_amount,'status',case when v_requires_approval then 'Pending Approval' when v_accept then 'Offered' else 'Accepted' end,'taskCount',v_task_count),(select auth.uid()));
  if not v_requires_approval then perform public.service_queue_staff_operational_notification(v_writer,'worker-assignment-offered:'||v_id::text,'content_assignment_offered','Content Work','New project assignment',v_project.project_name||' has been assigned with agreed compensation '||v_currency||' '||v_amount::text,'/admin/app/projects?tab=myWork',jsonb_build_object('assignmentId',v_id,'projectId',v_project.id),now()); end if;
  return v_id;
end $$;

create or replace function public.admin_approve_worker_assignment(p_assignment_id uuid,p_approved boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.worker_work_assignments%rowtype; v_name text;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  select * into v from public.worker_work_assignments where id=p_assignment_id for update;
  if v.status<>'Pending Approval' or v.override_status<>'Pending' then raise exception 'This assignment is not waiting for approval.'; end if;
  update public.worker_work_assignments set status=case when p_approved then case when acceptance_required then 'Offered' else 'Accepted' end else 'Cancelled' end,override_status=case when p_approved then 'Approved' else 'Rejected' end,cancellation_reason=case when p_approved then cancellation_reason else coalesce(nullif(btrim(p_reason),''),'Compensation override rejected') end,updated_by=(select auth.uid()),updated_at=now() where id=p_assignment_id;
  insert into public.worker_compensation_events(assignment_id,event_type,reason,old_value,new_value,actor_id) values(p_assignment_id,case when p_approved then 'Compensation Override Approved' else 'Compensation Override Rejected' end,p_reason,jsonb_build_object('status',v.status,'overrideStatus',v.override_status),jsonb_build_object('status',case when p_approved then 'Offered' else 'Cancelled' end,'overrideStatus',case when p_approved then 'Approved' else 'Rejected' end),(select auth.uid()));
  if p_approved then select p.project_name into v_name from public.projects p where p.id=v.project_id; perform public.service_queue_staff_operational_notification(v.writer_user_id,'worker-assignment-approved:'||v.id::text,'content_assignment_offered','Content Work','Project assignment ready for review',v_name||' is ready for your acceptance.','/admin/app/projects?tab=myWork',jsonb_build_object('assignmentId',v.id,'projectId',v.project_id),now()); end if;
end $$;

create or replace function public.manager_propose_worker_scope_change(p_assignment_id uuid,p_new_scope jsonb,p_added_items jsonb,p_additional_fee numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.worker_work_assignments%rowtype; v_id uuid; v_cfg jsonb; v_needs_admin boolean:=false; v_needs_writer boolean;
begin
  select * into v from public.worker_work_assignments where id=p_assignment_id for update;
  if not found or not public.worker_compensation_is_manager(v.project_id) then raise exception 'Responsible Project Manager permission required.'; end if;
  if v.accepted_at is null or v.status in ('Cancelled','Voided','Reversed','Paid','Scheduled for Payout') then raise exception 'Only an accepted active assignment can receive a scope change.'; end if;
  if exists(select 1 from public.worker_assignment_scope_changes c where c.assignment_id=v.id and c.status in ('Pending Approval','Pending Writer Acceptance')) then raise exception 'Resolve the existing scope change first.'; end if;
  if jsonb_typeof(coalesce(p_new_scope,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_added_items,'[]'::jsonb))<>'array' then raise exception 'Scope change payload is invalid.'; end if;
  if coalesce(p_additional_fee,-1)<0 or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A non-negative additional fee and change reason are required.'; end if;
  v_cfg:=v.configuration_snapshot;
  v_needs_writer:=coalesce((v_cfg->>'scopeChangeAcceptanceRequired')::boolean,true);
  if not public.is_admin() and (
    coalesce((v_cfg->>'pmOverrideAllowed')::boolean,false) is false or
    (coalesce((v_cfg->>'customApprovalThreshold')::numeric,0)>0 and p_additional_fee>=coalesce((v_cfg->>'customApprovalThreshold')::numeric,0)) or
    (v.agreed_fee>0 and p_additional_fee*100/v.agreed_fee>coalesce((v_cfg->>'managerOverridePercent')::numeric,0))
  ) then v_needs_admin:=true; end if;
  insert into public.worker_assignment_scope_changes(assignment_id,from_scope_version,to_scope_version,old_scope_snapshot,new_scope_snapshot,added_items,additional_fee_suggested,additional_fee_agreed,status,writer_acceptance_required,reason,requested_by)
  values(v.id,v.scope_version,v.scope_version+1,v.scope_snapshot,p_new_scope,coalesce(p_added_items,'[]'::jsonb),p_additional_fee,p_additional_fee,case when v_needs_admin then 'Pending Approval' when v_needs_writer then 'Pending Writer Acceptance' else 'Approved' end,v_needs_writer,btrim(p_reason),(select auth.uid())) returning id into v_id;
  if v_needs_admin or v_needs_writer then
    update public.worker_work_assignments set status='On Hold',updated_by=(select auth.uid()),updated_at=now() where id=v.id;
  else
    perform set_config('profox.worker_compensation_internal','1',true);
    update public.worker_work_assignments set scope_snapshot=p_new_scope,deliverable_snapshot=deliverable_snapshot||coalesce(p_added_items,'[]'::jsonb),agreed_fee=agreed_fee+p_additional_fee,scope_version=scope_version+1,updated_by=(select auth.uid()),updated_at=now() where id=v.id;
  end if;
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
  if not p_approved then
    update public.worker_assignment_scope_changes set status='Rejected',approved_by=(select auth.uid()),approved_at=now() where id=c.id;
    update public.worker_work_assignments set status='Accepted',updated_by=(select auth.uid()),updated_at=now() where id=a.id;
  elsif c.writer_acceptance_required then
    update public.worker_assignment_scope_changes set status='Pending Writer Acceptance',approved_by=(select auth.uid()),approved_at=now() where id=c.id;
  else
    update public.worker_assignment_scope_changes set status='Approved',approved_by=(select auth.uid()),approved_at=now() where id=c.id;
    perform set_config('profox.worker_compensation_internal','1',true);
    update public.worker_work_assignments set status='Accepted',scope_snapshot=c.new_scope_snapshot,deliverable_snapshot=deliverable_snapshot||c.added_items,agreed_fee=agreed_fee+c.additional_fee_agreed,scope_version=c.to_scope_version,updated_by=(select auth.uid()),updated_at=now() where id=a.id;
  end if;
  insert into public.worker_compensation_events(assignment_id,event_type,reason,new_value,actor_id) values(a.id,case when p_approved then 'Scope Change Approved' else 'Scope Change Rejected' end,p_reason,jsonb_build_object('scopeChangeId',c.id,'writerAcceptanceRequired',c.writer_acceptance_required),(select auth.uid()));
end $$;

create or replace function public.writer_respond_worker_scope_change(p_change_id uuid,p_accepted boolean,p_message text default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.worker_assignment_scope_changes%rowtype; a public.worker_work_assignments%rowtype;
begin
  select sc.* into c from public.worker_assignment_scope_changes sc join public.worker_work_assignments wa on wa.id=sc.assignment_id where sc.id=p_change_id and wa.writer_user_id=(select auth.uid()) for update of sc;
  if not found or c.status<>'Pending Writer Acceptance' then raise exception 'Scope change is not waiting for your response.'; end if;
  select * into a from public.worker_work_assignments where id=c.assignment_id for update;
  if p_accepted then
    update public.worker_assignment_scope_changes set status='Approved',writer_accepted_at=now() where id=c.id;
    perform set_config('profox.worker_compensation_internal','1',true);
    update public.worker_work_assignments set status='Accepted',scope_snapshot=c.new_scope_snapshot,deliverable_snapshot=deliverable_snapshot||c.added_items,agreed_fee=agreed_fee+c.additional_fee_agreed,scope_version=c.to_scope_version,updated_by=(select auth.uid()),updated_at=now() where id=a.id;
  else
    if length(btrim(coalesce(p_message,'')))<3 then raise exception 'Explain why the scope change is not accepted.'; end if;
    update public.worker_assignment_scope_changes set status='Rejected' where id=c.id;
    update public.worker_work_assignments set status='Accepted',updated_by=(select auth.uid()),updated_at=now() where id=a.id;
  end if;
  insert into public.worker_compensation_events(assignment_id,event_type,reason,new_value,actor_id) values(a.id,case when p_accepted then 'Writer Accepted Scope Change' else 'Writer Rejected Scope Change' end,p_message,jsonb_build_object('scopeChangeId',c.id,'accepted',p_accepted),(select auth.uid()));
end $$;

create or replace function public.manager_cancel_worker_assignment(p_assignment_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.worker_work_assignments%rowtype;
begin
  select * into v from public.worker_work_assignments where id=p_assignment_id for update;
  if not found or not public.worker_compensation_is_manager(v.project_id) then raise exception 'Responsible Project Manager permission required.'; end if;
  if v.status in ('Earned','Scheduled for Payout','Paid','Reversed','Voided') then raise exception 'Financially recognized assignments require Finance reversal controls.'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Cancellation reason is required.'; end if;
  update public.worker_work_assignments set status='Cancelled',payout_status='Voided',cancelled_at=now(),cancelled_by=(select auth.uid()),cancellation_reason=btrim(p_reason),updated_by=(select auth.uid()),updated_at=now() where id=v.id;
  insert into public.worker_compensation_events(assignment_id,event_type,reason,old_value,new_value,actor_id) values(v.id,'Assignment Cancelled',p_reason,jsonb_build_object('status',v.status),jsonb_build_object('status','Cancelled'),(select auth.uid()));
end $$;

create or replace function public.admin_set_worker_earning_hold(p_earning_id uuid,p_hold boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare e public.worker_earnings%rowtype;
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  select * into e from public.worker_earnings where id=p_earning_id for update;
  if not found or e.status not in ('On Hold','Payable') then raise exception 'Only unpaid, unscheduled earnings can be held or released.'; end if;
  if p_hold and length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Hold reason is required.'; end if;
  update public.worker_earnings set status=case when p_hold then 'On Hold' else 'Payable' end,hold_reason=case when p_hold then btrim(p_reason) else null end,eligible_at=case when p_hold then eligible_at else least(eligible_at,now()) end,updated_at=now() where id=e.id;
  update public.worker_work_assignments set payout_status=case when p_hold then 'On Hold' else 'Payable' end,updated_at=now() where id=e.assignment_id;
  insert into public.worker_compensation_events(assignment_id,earning_id,event_type,reason,new_value,actor_id) values(e.assignment_id,e.id,case when p_hold then 'Earning Hold Placed' else 'Earning Hold Released' end,p_reason,jsonb_build_object('status',case when p_hold then 'On Hold' else 'Payable' end),(select auth.uid()));
end $$;

create or replace function public.writer_respond_work_assignment(p_assignment_id uuid,p_action text,p_message text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.worker_work_assignments%rowtype;
begin
  select * into v from public.worker_work_assignments where id=p_assignment_id and writer_user_id=(select auth.uid()) for update;
  if not found then raise exception 'Assignment not found.'; end if;
  if p_action='Accept' then
    if v.status not in ('Offered','Clarification Requested') then raise exception 'This assignment cannot be accepted in its current state.'; end if;
    update public.worker_work_assignments set status='Accepted',accepted_at=coalesce(accepted_at,now()),accepted_by=(select auth.uid()),updated_by=(select auth.uid()),updated_at=now() where id=v.id;
    insert into public.worker_compensation_events(assignment_id,event_type,reason,old_value,new_value,actor_id) values(v.id,'Writer Accepted',p_message,jsonb_build_object('status',v.status),jsonb_build_object('status','Accepted','commercialSnapshotLocked',true),(select auth.uid()));
  elsif p_action='Request Clarification' then
    if v.status<>'Offered' or length(btrim(coalesce(p_message,'')))<3 then raise exception 'Provide a clarification question for an offered assignment.'; end if;
    update public.worker_work_assignments set status='Clarification Requested',updated_by=(select auth.uid()),updated_at=now() where id=v.id;
    insert into public.worker_compensation_events(assignment_id,event_type,reason,old_value,new_value,actor_id) values(v.id,'Clarification Requested',p_message,jsonb_build_object('status',v.status),jsonb_build_object('status','Clarification Requested'),(select auth.uid()));
  else raise exception 'Unsupported assignment response.'; end if;
end $$;

create or replace function public.manager_answer_work_assignment(p_assignment_id uuid,p_message text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.worker_work_assignments%rowtype;
begin
  select * into v from public.worker_work_assignments where id=p_assignment_id for update;
  if not found or not public.worker_compensation_is_manager(v.project_id) then raise exception 'Responsible Project Manager permission required.'; end if;
  if v.status<>'Clarification Requested' or length(btrim(coalesce(p_message,'')))<3 then raise exception 'A clarification response is required.'; end if;
  update public.worker_work_assignments set status='Offered',updated_by=(select auth.uid()),updated_at=now() where id=v.id;
  insert into public.worker_compensation_events(assignment_id,event_type,reason,old_value,new_value,actor_id) values(v.id,'Clarification Answered',p_message,jsonb_build_object('status','Clarification Requested'),jsonb_build_object('status','Offered'),(select auth.uid()));
  perform public.service_queue_staff_operational_notification(v.writer_user_id,'worker-assignment-clarified:'||v.id::text||':'||extract(epoch from now())::bigint,'content_assignment_clarified','Content Work','Assignment clarification answered','Your Project Manager answered the assignment clarification.','/admin/app/projects?tab=myWork',jsonb_build_object('assignmentId',v.id),now());
end $$;

create or replace function public.evaluate_worker_assignment_earning(p_assignment_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.worker_work_assignments%rowtype; v_earning uuid; v_ok boolean; v_evidence jsonb; v_hold integer:=0;
begin
  select * into v from public.worker_work_assignments where id=p_assignment_id for update;
  if not found or v.status in ('Cancelled','Voided','Reversed','Paid','Scheduled for Payout','Earned') then return null; end if;
  select bool_and(case
    when v.earning_trigger_snapshot='Internal Editorial Approval' or v.earning_trigger_snapshot='Independent Editorial Approval' then exists(select 1 from public.content_reviews r where r.deliverable_id=i.content_deliverable_id and r.review_type='2i Editorial Review' and r.decision='Passed' and coalesce(r.total_score,0)>=v.quality_threshold_snapshot) and d.critical_defect_count=0 and d.major_defect_count=0
    when v.earning_trigger_snapshot='SEO / Conversion Approval' then exists(select 1 from public.content_reviews r where r.deliverable_id=i.content_deliverable_id and r.review_type='SEO / Conversion Review' and r.decision='Passed' and coalesce(r.total_score,0)>=v.quality_threshold_snapshot)
    when v.earning_trigger_snapshot='Client Approval' then d.lifecycle_stage in ('Client Approved','Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained')
    when v.earning_trigger_snapshot='Ready for Implementation' then d.lifecycle_stage in ('Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained')
    when v.earning_trigger_snapshot='Final Content Approval' then d.lifecycle_stage in ('Approved for Publication','Published','Measured / Maintained')
    else false end),
    jsonb_agg(jsonb_build_object('deliverableId',d.id,'stage',d.lifecycle_stage,'qualityScore',d.quality_score,'qualityStatus',d.quality_status,'criticalDefects',d.critical_defect_count,'majorDefects',d.major_defect_count))
  into v_ok,v_evidence from public.worker_assignment_items i join public.content_deliverables d on d.id=i.content_deliverable_id where i.assignment_id=v.id;
  if coalesce(v_ok,false) is false then return null; end if;
  v_hold:=greatest(0,coalesce((v.configuration_snapshot->>'payoutHoldDays')::integer,0));
  insert into public.worker_earnings(assignment_id,writer_user_id,project_id,scope_version,dedupe_key,amount,currency,status,quality_evidence,earned_at,eligible_at)
  values(v.id,v.writer_user_id,v.project_id,v.scope_version,'worker_assignment_earning:'||v.id::text||':'||v.scope_version::text,v.agreed_fee,v.currency,case when v_hold>0 then 'On Hold' else 'Payable' end,coalesce(v_evidence,'[]'::jsonb),now(),now()+make_interval(days=>v_hold))
  on conflict(assignment_id,scope_version) do nothing returning id into v_earning;
  if v_earning is not null then
    update public.worker_work_assignments set status='Earned',approved_at=coalesce(approved_at,now()),earned_at=now(),earning_amount=agreed_fee,payout_status=case when v_hold>0 then 'On Hold' else 'Payable' end,updated_at=now() where id=v.id;
    insert into public.worker_compensation_events(assignment_id,earning_id,event_type,new_value,source,actor_id) values(v.id,v_earning,'Earning Created',jsonb_build_object('amount',v.agreed_fee,'currency',v.currency,'scopeVersion',v.scope_version,'qualityEvidence',v_evidence),'PF-SOP-07 Quality Gate',(select auth.uid()));
    perform public.service_queue_staff_operational_notification(v.writer_user_id,'worker-earning-created:'||v_earning::text,'content_earning_payable','Content Earnings','Project earning approved',v.currency||' '||v.agreed_fee::text||' is now '||case when v_hold>0 then 'on the configured payout hold' else 'ready for payout' end||'.','/admin/app/projects?tab=myWork',jsonb_build_object('assignmentId',v.id,'earningId',v_earning),now());
  else select e.id into v_earning from public.worker_earnings e where e.assignment_id=v.id and e.scope_version=v.scope_version; end if;
  return v_earning;
end $$;

create or replace function public.trigger_evaluate_worker_assignment_earning()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if tg_table_name='content_deliverables' then for r in select i.assignment_id from public.worker_assignment_items i where i.content_deliverable_id=new.id loop perform public.evaluate_worker_assignment_earning(r.assignment_id); end loop;
  else for r in select i.assignment_id from public.worker_assignment_items i where i.content_deliverable_id=new.deliverable_id loop perform public.evaluate_worker_assignment_earning(r.assignment_id); end loop; end if;
  return new;
end $$;

drop trigger if exists trg_worker_earning_from_content_state on public.content_deliverables;
create trigger trg_worker_earning_from_content_state after update of lifecycle_stage,quality_score,quality_status,critical_defect_count,major_defect_count on public.content_deliverables for each row execute function public.trigger_evaluate_worker_assignment_earning();
drop trigger if exists trg_worker_earning_from_content_review on public.content_reviews;
create trigger trg_worker_earning_from_content_review after insert on public.content_reviews for each row execute function public.trigger_evaluate_worker_assignment_earning();

create or replace function public.release_due_worker_earning_holds()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  update public.worker_earnings set status='Payable',hold_reason=null,updated_at=now() where status='On Hold' and eligible_at<=now() and (hold_reason is null or hold_reason='Configured payout hold');
  get diagnostics v_count=row_count;
  update public.worker_work_assignments a set payout_status='Payable',updated_at=now() where exists(select 1 from public.worker_earnings e where e.assignment_id=a.id and e.status='Payable') and a.payout_status='On Hold';
  return v_count;
end $$;

create or replace function public.admin_create_worker_payout_batch(p_earning_ids uuid[],p_scheduled_for date,p_notes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_currency text; v_total numeric; v_count integer; v_workers integer; r record; v_payout uuid; v_min numeric;
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  perform public.release_due_worker_earning_holds();
  if coalesce(array_length(p_earning_ids,1),0)=0 then raise exception 'Select at least one payable earning.'; end if;
  if exists(select 1 from public.worker_earnings e where e.id=any(p_earning_ids) and (e.status<>'Payable' or e.eligible_at>now())) then raise exception 'Every selected earning must be payable and outside its hold period.'; end if;
  if (select count(distinct currency) from public.worker_earnings where id=any(p_earning_ids))<>1 then raise exception 'A payout batch must contain one currency.'; end if;
  select min(currency),sum(amount),count(*),count(distinct writer_user_id) into v_currency,v_total,v_count,v_workers from public.worker_earnings where id=any(p_earning_ids);
  v_min:=greatest(0,coalesce((public.worker_compensation_config()->>'minimumPayout')::numeric,0));
  if exists(select 1 from public.worker_earnings where id=any(p_earning_ids) group by writer_user_id having sum(amount)<v_min) then raise exception 'A selected writer is below the configured minimum payout.'; end if;
  insert into public.worker_payout_batches(scheduled_for,currency,total_amount,earning_count,worker_count,notes,created_by) values(p_scheduled_for,v_currency,v_total,v_count,v_workers,p_notes,(select auth.uid())) returning id into v_id;
  for r in select writer_user_id,currency,sum(amount) amount from public.worker_earnings where id=any(p_earning_ids) group by writer_user_id,currency loop
    insert into public.worker_payouts(payout_batch_id,writer_user_id,currency,amount) values(v_id,r.writer_user_id,r.currency,r.amount) returning id into v_payout;
    insert into public.worker_payout_items(payout_id,earning_id,amount_snapshot) select v_payout,e.id,e.amount from public.worker_earnings e where e.id=any(p_earning_ids) and e.writer_user_id=r.writer_user_id;
  end loop;
  update public.worker_earnings set status='Scheduled',updated_at=now() where id=any(p_earning_ids);
  update public.worker_work_assignments a set status='Scheduled for Payout',payout_status='Scheduled',updated_at=now() where exists(select 1 from public.worker_earnings e where e.assignment_id=a.id and e.id=any(p_earning_ids));
  return v_id;
end $$;

create or replace function public.admin_mark_worker_payout_paid(p_payout_id uuid,p_transaction_reference text,p_payment_method text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.worker_payouts%rowtype; v_remaining integer;
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  if length(btrim(coalesce(p_transaction_reference,'')))<3 then raise exception 'A payment transaction reference is required.'; end if;
  select * into v from public.worker_payouts where id=p_payout_id for update;
  if not found or v.status not in ('Scheduled','Processing') then raise exception 'This payout cannot be marked paid.'; end if;
  update public.worker_payouts set status='Paid',transaction_reference=btrim(p_transaction_reference),payment_method=coalesce(nullif(btrim(p_payment_method),''),payment_method),paid_at=now(),paid_by=(select auth.uid()),updated_at=now() where id=v.id;
  update public.worker_earnings e set status='Paid',updated_at=now() where exists(select 1 from public.worker_payout_items i where i.payout_id=v.id and i.earning_id=e.id);
  update public.worker_work_assignments a set status='Paid',payout_status='Paid',updated_at=now() where exists(select 1 from public.worker_earnings e join public.worker_payout_items i on i.earning_id=e.id where i.payout_id=v.id and e.assignment_id=a.id);
  select count(*) into v_remaining from public.worker_payouts p where p.payout_batch_id=v.payout_batch_id and p.status<>'Paid';
  update public.worker_payout_batches set status=case when v_remaining=0 then 'Paid' else 'Partially Paid' end,completed_at=case when v_remaining=0 then now() else null end,updated_at=now() where id=v.payout_batch_id;
  insert into public.worker_compensation_events(payout_id,event_type,new_value,actor_id) values(v.id,'Payout Paid',jsonb_build_object('transactionReference',btrim(p_transaction_reference),'amount',v.amount,'currency',v.currency),(select auth.uid()));
  perform public.service_queue_staff_operational_notification(v.writer_user_id,'worker-payout-paid:'||v.id::text,'content_payout_paid','Content Earnings','Payout completed',v.currency||' '||v.amount::text||' was paid. Transaction reference: '||btrim(p_transaction_reference),'/admin/app/projects?tab=myWork',jsonb_build_object('payoutId',v.id,'batchId',v.payout_batch_id),now());
end $$;

create or replace function public.get_my_worker_command_center()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_cfg jsonb:=public.worker_compensation_config(); v_wip integer; v_active integer;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select greatest(1,coalesce((sc.config_value->>'wipLimit')::integer,2)) into v_wip from public.system_configuration sc where sc.config_key='content_delivery_sop_v1';
  select count(*) into v_active from public.worker_work_assignments a where a.writer_user_id=v_uid and a.status in ('Accepted','In Progress','Changes Required');
  return jsonb_build_object(
    'config',v_cfg,'workload',jsonb_build_object('active',v_active,'limit',coalesce(v_wip,2)),
    'summary',jsonb_build_object(
      'activeValue',coalesce((select sum(agreed_fee) from public.worker_work_assignments where writer_user_id=v_uid and status in ('Accepted','In Progress','Changes Required')),0),
      'waitingApproval',coalesce((select sum(agreed_fee) from public.worker_work_assignments where writer_user_id=v_uid and status in ('In Review','Approved')),0),
      'payable',coalesce((select sum(amount) from public.worker_earnings where writer_user_id=v_uid and status='Payable'),0),
      'paidThisMonth',coalesce((select sum(amount) from public.worker_earnings where writer_user_id=v_uid and status='Paid' and updated_at>=date_trunc('month',now())),0),
      'needsAttention',coalesce((select count(*) from public.worker_work_assignments where writer_user_id=v_uid and (status in ('Offered','Clarification Requested','Changes Required','On Hold','Disputed') or due_date_snapshot<current_date and status not in ('Paid','Cancelled','Earned','Scheduled for Payout'))),0)
    ),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'projectId',a.project_id,'projectName',p.project_name,'projectNumber',p.project_number,'clientName',c.company_name,'package',p.package_snapshot,'status',a.status,'compensationModel',a.compensation_model,'agreedFee',a.agreed_fee,'currency',a.currency,'scope',a.scope_snapshot,'deliverables',a.deliverable_snapshot,'dueDate',a.due_date_snapshot,'includedRevisions',a.included_revisions_snapshot,'qualityThreshold',a.quality_threshold_snapshot,'approvalGate',a.approval_gate_snapshot,'acceptedAt',a.accepted_at,'earnedAt',a.earned_at,'payoutStatus',a.payout_status,'items',(select coalesce(jsonb_agg(jsonb_build_object('taskId',i.project_task_id,'deliverableId',i.content_deliverable_id,'contentType',i.content_type,'quantity',i.quantity,'stage',d.lifecycle_stage,'qualityScore',d.quality_score,'qualityStatus',d.quality_status,'blockedReason',d.blocked_reason)),'[]'::jsonb) from public.worker_assignment_items i left join public.content_deliverables d on d.id=i.content_deliverable_id where i.assignment_id=a.id)) order by case when a.status='Changes Required' then 1 when a.due_date_snapshot<current_date then 2 when a.status='Offered' then 3 else 4 end,a.due_date_snapshot) from public.worker_work_assignments a join public.projects p on p.id=a.project_id left join public.clients c on c.id=p.client_id where a.writer_user_id=v_uid),'[]'::jsonb),
    'earnings',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'assignmentId',e.assignment_id,'projectName',p.project_name,'amount',e.amount,'currency',e.currency,'status',e.status,'earnedAt',e.earned_at,'eligibleAt',e.eligible_at,'qualityEvidence',e.quality_evidence,'payout',(select jsonb_build_object('batchNumber',b.batch_number,'transactionReference',wp.transaction_reference,'paidAt',wp.paid_at) from public.worker_payout_items pi join public.worker_payouts wp on wp.id=pi.payout_id join public.worker_payout_batches b on b.id=wp.payout_batch_id where pi.earning_id=e.id limit 1)) order by e.earned_at desc) from public.worker_earnings e join public.projects p on p.id=e.project_id where e.writer_user_id=v_uid),'[]'::jsonb),
    'performance',jsonb_build_object(
      'projectsCompleted',coalesce((select count(*) from public.worker_work_assignments where writer_user_id=v_uid and status in ('Earned','Scheduled for Payout','Paid')),0),
      'averageQuality',coalesce((select round(avg(d.quality_score),1) from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=v_uid and d.quality_score is not null),0),
      'onTimeRate',coalesce((select round(100.0*count(*) filter(where approved_at::date<=due_date_snapshot)/nullif(count(*),0),1) from public.worker_work_assignments where writer_user_id=v_uid and approved_at is not null),0),
      'firstPassRate',coalesce((select round(100.0*count(*) filter(where coalesce(d.internal_revision_count,0)=0)/nullif(count(*),0),1) from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=v_uid and a.approved_at is not null),0),
      'averageRevisionRounds',coalesce((select round(avg(d.internal_revision_count+d.revision_round),1) from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=v_uid and a.approved_at is not null),0)
    )
  );
end $$;

create or replace function public.get_worker_compensation_management_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.worker_compensation_is_manager() and not public.worker_compensation_is_finance() then raise exception 'Management permission required.'; end if;
  perform public.release_due_worker_earning_holds();
  return jsonb_build_object(
    'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'projectNumber',p.project_number,'projectName',p.project_name,'package',p.package_snapshot,'currency',p.currency,'targetDate',p.target_date,'scope',p.scope_summary) order by p.created_at desc) from public.projects p where p.status='Active' and (public.is_admin() or p.project_manager_id=(select auth.uid()) or public.worker_compensation_is_finance())),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'projectId',a.project_id,'projectName',p.project_name,'writerId',a.writer_user_id,'writerName',u.full_name,'status',a.status,'agreedFee',a.agreed_fee,'suggestedAmount',a.suggested_amount,'currency',a.currency,'dueDate',a.due_date_snapshot,'payoutStatus',a.payout_status,'overrideStatus',a.override_status,'overrideReason',a.override_reason) order by a.created_at desc) from public.worker_work_assignments a join public.projects p on p.id=a.project_id join public.user_profiles u on u.id=a.writer_user_id where public.is_admin() or p.project_manager_id=(select auth.uid()) or public.worker_compensation_is_finance()),'[]'::jsonb),
    'payableEarnings',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'assignmentId',e.assignment_id,'writerId',e.writer_user_id,'writerName',u.full_name,'projectName',p.project_name,'amount',e.amount,'currency',e.currency,'status',e.status,'earnedAt',e.earned_at,'eligibleAt',e.eligible_at,'holdReason',e.hold_reason) order by e.eligible_at) from public.worker_earnings e join public.user_profiles u on u.id=e.writer_user_id join public.projects p on p.id=e.project_id where e.status in ('On Hold','Payable')),'[]'::jsonb),
    'payouts',coalesce((select jsonb_agg(jsonb_build_object('id',wp.id,'batchId',b.id,'batchNumber',b.batch_number,'writerId',wp.writer_user_id,'writerName',u.full_name,'amount',wp.amount,'currency',wp.currency,'status',wp.status,'scheduledFor',b.scheduled_for,'transactionReference',wp.transaction_reference,'paidAt',wp.paid_at) order by b.created_at desc) from public.worker_payouts wp join public.worker_payout_batches b on b.id=wp.payout_batch_id join public.user_profiles u on u.id=wp.writer_user_id),'[]'::jsonb)
  );
end $$;

create or replace function public.protect_worker_assignment_snapshot()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.accepted_at is not null and coalesce(current_setting('profox.worker_compensation_internal',true),'')<>'1' and (
    new.writer_user_id is distinct from old.writer_user_id or new.project_id is distinct from old.project_id or new.compensation_model is distinct from old.compensation_model or new.agreed_fee is distinct from old.agreed_fee or new.currency is distinct from old.currency or new.scope_snapshot is distinct from old.scope_snapshot or new.deliverable_snapshot is distinct from old.deliverable_snapshot or new.due_date_snapshot is distinct from old.due_date_snapshot or new.included_revisions_snapshot is distinct from old.included_revisions_snapshot or new.quality_threshold_snapshot is distinct from old.quality_threshold_snapshot or new.approval_gate_snapshot is distinct from old.approval_gate_snapshot or new.earning_trigger_snapshot is distinct from old.earning_trigger_snapshot or new.configuration_snapshot is distinct from old.configuration_snapshot
  ) then raise exception 'Accepted commercial assignment snapshots are immutable. Use the controlled scope-change workflow.'; end if;
  new.updated_at:=now(); return new;
end $$;
drop trigger if exists trg_protect_worker_assignment_snapshot on public.worker_work_assignments;
create trigger trg_protect_worker_assignment_snapshot before update on public.worker_work_assignments for each row execute function public.protect_worker_assignment_snapshot();

create or replace function public.enforce_content_assignment_acceptance()
returns trigger language plpgsql set search_path='' as $$
begin
  if (select auth.uid()) is not null and not public.content_assignment_writer_can_work(new.deliverable_id) then raise exception 'Accept the project compensation assignment before starting content work.'; end if;
  return new;
end $$;
drop trigger if exists trg_enforce_content_assignment_acceptance on public.content_versions;
create trigger trg_enforce_content_assignment_acceptance before insert on public.content_versions for each row execute function public.enforce_content_assignment_acceptance();

alter table public.worker_compensation_rate_cards enable row level security;
alter table public.worker_performance_tiers enable row level security;
alter table public.worker_work_assignments enable row level security;
alter table public.worker_assignment_items enable row level security;
alter table public.worker_assignment_scope_changes enable row level security;
alter table public.worker_earnings enable row level security;
alter table public.worker_payout_batches enable row level security;
alter table public.worker_payouts enable row level security;
alter table public.worker_payout_items enable row level security;
alter table public.worker_compensation_events enable row level security;

revoke all on table public.worker_compensation_rate_cards,public.worker_performance_tiers,public.worker_work_assignments,public.worker_assignment_items,public.worker_assignment_scope_changes,public.worker_earnings,public.worker_payout_batches,public.worker_payouts,public.worker_payout_items,public.worker_compensation_events from anon,authenticated;
grant select on table public.worker_compensation_rate_cards,public.worker_performance_tiers,public.worker_work_assignments,public.worker_assignment_items,public.worker_assignment_scope_changes,public.worker_earnings,public.worker_payout_batches,public.worker_payouts,public.worker_payout_items,public.worker_compensation_events to authenticated;

create policy worker_rate_card_management_read on public.worker_compensation_rate_cards for select to authenticated using (public.worker_compensation_is_manager() or public.worker_compensation_is_finance());
create policy worker_tier_management_read on public.worker_performance_tiers for select to authenticated using (public.worker_compensation_is_manager() or public.worker_compensation_is_finance());
create policy worker_assignment_authorized_read on public.worker_work_assignments for select to authenticated using (writer_user_id=(select auth.uid()) or public.worker_compensation_is_manager(project_id) or public.worker_compensation_is_finance());
create policy worker_assignment_item_authorized_read on public.worker_assignment_items for select to authenticated using (public.worker_assignment_can_read(assignment_id));
create policy worker_scope_change_authorized_read on public.worker_assignment_scope_changes for select to authenticated using (public.worker_assignment_can_read(assignment_id));
create policy worker_earning_authorized_read on public.worker_earnings for select to authenticated using (writer_user_id=(select auth.uid()) or public.worker_compensation_is_manager(project_id) or public.worker_compensation_is_finance());
create policy worker_batch_finance_read on public.worker_payout_batches for select to authenticated using (public.worker_compensation_is_finance());
create policy worker_payout_authorized_read on public.worker_payouts for select to authenticated using (writer_user_id=(select auth.uid()) or public.worker_compensation_is_finance());
create policy worker_payout_item_authorized_read on public.worker_payout_items for select to authenticated using (exists(select 1 from public.worker_payouts p where p.id=payout_id and (p.writer_user_id=(select auth.uid()) or public.worker_compensation_is_finance())));
create policy worker_comp_event_authorized_read on public.worker_compensation_events for select to authenticated using ((assignment_id is not null and public.worker_assignment_can_read(assignment_id)) or (payout_id is not null and exists(select 1 from public.worker_payouts p where p.id=payout_id and (p.writer_user_id=(select auth.uid()) or public.worker_compensation_is_finance()))));

revoke all on function public.worker_compensation_config() from public,anon;
revoke all on function public.worker_compensation_is_manager(uuid) from public,anon;
revoke all on function public.worker_compensation_is_finance() from public,anon;
revoke all on function public.worker_assignment_can_read(uuid) from public,anon;
revoke all on function public.content_writer_assignment_eligible(uuid) from public,anon;
revoke all on function public.content_assignment_writer_can_work(uuid) from public,anon;
revoke all on function public.admin_save_worker_compensation_config(jsonb) from public,anon;
revoke all on function public.admin_upsert_worker_rate_card(jsonb) from public,anon;
revoke all on function public.get_content_compensation_admin_snapshot() from public,anon;
revoke all on function public.get_content_assignment_context(uuid) from public,anon;
revoke all on function public.create_content_work_assignment(jsonb) from public,anon;
revoke all on function public.admin_approve_worker_assignment(uuid,boolean,text) from public,anon;
revoke all on function public.manager_propose_worker_scope_change(uuid,jsonb,jsonb,numeric,text) from public,anon;
revoke all on function public.admin_review_worker_scope_change(uuid,boolean,text) from public,anon;
revoke all on function public.writer_respond_worker_scope_change(uuid,boolean,text) from public,anon;
revoke all on function public.manager_cancel_worker_assignment(uuid,text) from public,anon;
revoke all on function public.admin_set_worker_earning_hold(uuid,boolean,text) from public,anon;
revoke all on function public.writer_respond_work_assignment(uuid,text,text) from public,anon;
revoke all on function public.manager_answer_work_assignment(uuid,text) from public,anon;
revoke all on function public.evaluate_worker_assignment_earning(uuid) from public,anon,authenticated;
revoke all on function public.trigger_evaluate_worker_assignment_earning() from public,anon,authenticated;
revoke all on function public.release_due_worker_earning_holds() from public,anon,authenticated;
revoke all on function public.admin_create_worker_payout_batch(uuid[],date,text) from public,anon;
revoke all on function public.admin_mark_worker_payout_paid(uuid,text,text) from public,anon;
revoke all on function public.get_my_worker_command_center() from public,anon;
revoke all on function public.get_worker_compensation_management_snapshot() from public,anon;
revoke all on function public.protect_worker_assignment_snapshot() from public,anon,authenticated;
revoke all on function public.enforce_content_assignment_acceptance() from public,anon,authenticated;

grant execute on function public.worker_compensation_config(),public.worker_compensation_is_manager(uuid),public.worker_compensation_is_finance(),public.worker_assignment_can_read(uuid),public.content_writer_assignment_eligible(uuid),public.content_assignment_writer_can_work(uuid),public.admin_save_worker_compensation_config(jsonb),public.admin_upsert_worker_rate_card(jsonb),public.get_content_compensation_admin_snapshot(),public.get_content_assignment_context(uuid),public.create_content_work_assignment(jsonb),public.admin_approve_worker_assignment(uuid,boolean,text),public.manager_propose_worker_scope_change(uuid,jsonb,jsonb,numeric,text),public.admin_review_worker_scope_change(uuid,boolean,text),public.writer_respond_worker_scope_change(uuid,boolean,text),public.manager_cancel_worker_assignment(uuid,text),public.admin_set_worker_earning_hold(uuid,boolean,text),public.writer_respond_work_assignment(uuid,text,text),public.manager_answer_work_assignment(uuid,text),public.admin_create_worker_payout_batch(uuid[],date,text),public.admin_mark_worker_payout_paid(uuid,text,text),public.get_my_worker_command_center(),public.get_worker_compensation_management_snapshot() to authenticated;
