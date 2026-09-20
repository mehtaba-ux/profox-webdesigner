-- PROFOX SALES SOP PART 13
-- Sales-to-Delivery handoff acceptance / return / resubmission.
-- Reuses the existing Project, Project Tasks, CRM, Quotation, Payment, Onboarding,
-- Validation, Promise and Scope-Condition architecture. The only new persistence
-- is append-oriented lifecycle/review evidence; commercial/delivery truth remains canonical.

do $part13_preflight$
declare
  v_policy jsonb;
begin
  select config_value into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';

  if v_policy is null
     or coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false) is distinct from true
     or coalesce((v_policy->>'policyVersion')::int,0) <> 2
     or coalesce((v_policy->>'snapshotSchemaVersion')::int,0) <> 2 then
    raise exception 'Part 13 requires the active Part 10B quotation-send gate under policy/schema version 2.';
  end if;

  if to_regprocedure('public.project_get_sales_handoff_brief(uuid)') is null
     or to_regprocedure('public.submit_sales_project_handover(uuid,text)') is null
     or to_regprocedure('public.ensure_project_delivery_stage_tasks(uuid,text)') is null
     or to_regprocedure('public.protect_project_stage_workflow()') is null
     or to_regprocedure('public.protect_project_task_integrity()') is null
     or to_regprocedure('public.service_queue_staff_operational_notification(uuid,text,text,text,text,text,text,jsonb,timestamp with time zone)') is null then
    raise exception 'Part 13 canonical Sales Handover dependencies are missing.';
  end if;

  if to_regclass('public.project_sales_handover_attempts') is not null then
    raise exception 'Part 13 handoff lifecycle table already exists unexpectedly.';
  end if;
end;
$part13_preflight$;

create table public.project_sales_handover_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('SUBMITTED','RESUBMITTED','RETURNED_TO_SALES','ACCEPTED')),
  submitted_by uuid not null references public.user_profiles(id),
  submitted_at timestamptz not null default now(),
  seller_notes_snapshot text not null default '' check (char_length(seller_notes_snapshot) <= 10000),
  source_refs jsonb not null default '{}'::jsonb check (jsonb_typeof(source_refs)='object'),
  source_digest text not null check (char_length(source_digest)=32),
  reviewed_by uuid references public.user_profiles(id),
  reviewed_at timestamptz,
  decision text check (decision in ('RETURNED_TO_SALES','ACCEPTED')),
  return_reason_codes text[] not null default '{}'::text[],
  return_notes text,
  missing_items jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_items)='array'),
  resubmitted_from_attempt_id uuid references public.project_sales_handover_attempts(id),
  created_at timestamptz not null default now(),
  constraint project_sales_handover_attempt_unique unique(project_id,attempt_number),
  constraint project_sales_handover_decision_integrity check (
    (status in ('SUBMITTED','RESUBMITTED') and reviewed_by is null and reviewed_at is null and decision is null and cardinality(return_reason_codes)=0 and return_notes is null)
    or
    (status='RETURNED_TO_SALES' and reviewed_by is not null and reviewed_at is not null and decision='RETURNED_TO_SALES' and cardinality(return_reason_codes)>0 and nullif(btrim(coalesce(return_notes,'')),'') is not null)
    or
    (status='ACCEPTED' and reviewed_by is not null and reviewed_at is not null and decision='ACCEPTED' and cardinality(return_reason_codes)=0 and return_notes is null)
  )
);

create unique index project_sales_handover_one_pending_attempt
  on public.project_sales_handover_attempts(project_id)
  where status in ('SUBMITTED','RESUBMITTED');

create index project_sales_handover_attempts_project_history
  on public.project_sales_handover_attempts(project_id,attempt_number desc);

alter table public.project_sales_handover_attempts enable row level security;

revoke all on table public.project_sales_handover_attempts from public,anon,authenticated;
grant select on table public.project_sales_handover_attempts to authenticated,service_role;
grant insert,update,delete on table public.project_sales_handover_attempts to service_role;

create policy project_sales_handover_attempts_select_authorized_staff
on public.project_sales_handover_attempts
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.projects p
    join public.crm_opportunities o on o.id=p.source_opportunity_id
    where p.id=project_sales_handover_attempts.project_id
      and (
        o.salesperson_id=auth.uid()
        or p.project_manager_id=auth.uid()
      )
  )
);

create or replace function public.protect_project_sales_handover_attempt()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_rpc boolean:=coalesce(current_setting('profox.sales_handover_lifecycle_rpc',true),'')='1';
begin
  if tg_op='DELETE' then
    if auth.role()<>'service_role' then
      raise exception 'Sales handoff review history is immutable and cannot be deleted.';
    end if;
    return old;
  end if;

  if tg_op='INSERT' then
    if not v_rpc and auth.role()<>'service_role' then
      raise exception 'Sales handoff attempts must be created through the protected submission workflow.';
    end if;
    return new;
  end if;

  if not v_rpc and auth.role()<>'service_role' then
    raise exception 'Sales handoff review evidence must be changed through the protected review workflow.';
  end if;

  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.attempt_number is distinct from old.attempt_number
     or new.submitted_by is distinct from old.submitted_by
     or new.submitted_at is distinct from old.submitted_at
     or new.seller_notes_snapshot is distinct from old.seller_notes_snapshot
     or new.source_refs is distinct from old.source_refs
     or new.source_digest is distinct from old.source_digest
     or new.resubmitted_from_attempt_id is distinct from old.resubmitted_from_attempt_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Submitted Sales handoff version evidence is immutable.';
  end if;

  if old.status not in ('SUBMITTED','RESUBMITTED') then
    raise exception 'A reviewed Sales handoff attempt is immutable.';
  end if;

  if new.status not in ('RETURNED_TO_SALES','ACCEPTED') then
    raise exception 'A submitted Sales handoff may only be Accepted or Returned to Sales.';
  end if;

  return new;
end;
$part13$;

create trigger trg_protect_project_sales_handover_attempt
before insert or update or delete on public.project_sales_handover_attempts
for each row execute function public.protect_project_sales_handover_attempt();

revoke all on function public.protect_project_sales_handover_attempt() from public,anon,authenticated;
grant execute on function public.protect_project_sales_handover_attempt() to service_role;

create or replace function public.project_build_sales_handoff_source_refs(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_project public.projects%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_quote public.quotations%rowtype;
  v_payment public.payments%rowtype;
  v_onboarding public.client_onboardings%rowtype;
  v_requirements jsonb:='[]'::jsonb;
  v_validations jsonb:='[]'::jsonb;
  v_promises jsonb:='[]'::jsonb;
  v_conditions jsonb:='[]'::jsonb;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;

  select * into v_opp from public.crm_opportunities where id=v_project.source_opportunity_id;
  select * into v_quote from public.quotations where id=v_project.quotation_id;
  select * into v_payment
  from public.payments
  where opportunity_id=v_project.source_opportunity_id
    and status='Verified'
    and payment_type in ('Advance','Advance Payment','Full Payment')
  order by coalesce(verified_at,paid_at,updated_at) desc,id desc
  limit 1;
  select * into v_onboarding
  from public.client_onboardings
  where project_id=v_project.id
  order by created_at desc,id desc
  limit 1;

  if v_opp.lead_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'updatedAt',r.updated_at,
      'recordState',r.record_state,
      'certainty',r.information_certainty,
      'fingerprint',md5(concat_ws('|',r.requirement_key,r.category,r.title,coalesce(r.content,''),coalesce(r.structured_value::text,''),r.information_certainty,r.record_state,coalesce(r.proposal_reconciliation_status,'')))
    ) order by r.id),'[]'::jsonb)
    into v_requirements
    from public.crm_requirements r
    where r.lead_id=v_opp.lead_id
      and r.record_state='ACTIVE';

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',v.id,
      'updatedAt',v.updated_at,
      'status',v.status,
      'decidedAt',v.decided_at,
      'sourceChangedAt',v.source_changed_at,
      'sourceAcknowledgedAt',v.source_acknowledged_at,
      'fingerprint',md5(concat_ws('|',v.validation_type,v.severity,v.subject,v.status,coalesce(v.decision_summary,''),coalesce(v.approved_constraints,''),coalesce(v.rejection_rework_reason,''),coalesce(v.source_fingerprint,'')))
    ) order by v.id),'[]'::jsonb)
    into v_validations
    from public.crm_sales_validations v
    where v.lead_id=v_opp.lead_id
      and (v.opportunity_id is null or v.opportunity_id=v_opp.id)
      and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=v.id);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,
      'updatedAt',p.updated_at,
      'state',p.record_state,
      'promisedAt',p.promised_at,
      'alignment',p.validation_alignment_status,
      'fingerprint',md5(concat_ws('|',p.promise_type,p.promise_text,p.record_state,p.validation_alignment_status,coalesce(p.linked_requirement_id::text,''),coalesce(p.linked_validation_id::text,'')))
    ) order by p.id),'[]'::jsonb)
    into v_promises
    from public.crm_sales_promises p
    where p.lead_id=v_opp.lead_id
      and (p.opportunity_id is null or p.opportunity_id=v_opp.id)
      and p.record_state='ACTIVE'
      and not exists(select 1 from public.crm_sales_promises child where child.supersedes_promise_id=p.id);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,
      'updatedAt',c.updated_at,
      'state',c.state,
      'type',c.condition_type,
      'alignment',c.validation_alignment_status,
      'fingerprint',md5(concat_ws('|',c.condition_type,c.title,c.condition_text,c.state,c.validation_alignment_status,coalesce(c.source_requirement_id::text,''),coalesce(c.source_validation_id::text,'')))
    ) order by c.id),'[]'::jsonb)
    into v_conditions
    from public.crm_sales_scope_conditions c
    where c.lead_id=v_opp.lead_id
      and (c.opportunity_id is null or c.opportunity_id=v_opp.id)
      and c.state in ('ACTIVE','STALE')
      and not exists(select 1 from public.crm_sales_scope_conditions child where child.supersedes_condition_id=c.id);
  end if;

  return jsonb_build_object(
    'project',jsonb_build_object(
      'id',v_project.id,
      'stage',v_project.stage,
      'status',v_project.status,
      'sellerNotesFingerprint',md5(coalesce(v_project.sales_handover_notes,''))
    ),
    'opportunity',jsonb_build_object(
      'id',v_opp.id,
      'stage',v_opp.stage,
      'status',v_opp.status,
      'salespersonId',v_opp.salesperson_id
    ),
    'quotation',jsonb_build_object(
      'id',v_quote.id,
      'revision',v_quote.revision_number,
      'acceptedAt',v_quote.accepted_at,
      'salesScopeSnapshotAt',v_quote.sales_scope_snapshot_at,
      'salesScopeSnapshotSchemaVersion',v_quote.sales_scope_snapshot_schema_version,
      'fingerprint',md5(concat_ws('|',v_quote.id::text,coalesce(v_quote.revision_number::text,''),coalesce(v_quote.accepted_at::text,''),coalesce(v_quote.sales_scope_snapshot::text,'')))
    ),
    'payment',case when v_payment.id is null then null else jsonb_build_object(
      'id',v_payment.id,
      'verifiedAt',v_payment.verified_at,
      'status',v_payment.status,
      'paymentType',v_payment.payment_type,
      'fingerprint',md5(concat_ws('|',v_payment.id::text,v_payment.status,v_payment.payment_type,coalesce(v_payment.amount_paid::text,''),coalesce(v_payment.verified_at::text,'')))
    ) end,
    'onboarding',case when v_onboarding.id is null then null else jsonb_build_object(
      'id',v_onboarding.id,
      'status',v_onboarding.status,
      'completedAt',v_onboarding.completed_at,
      'fingerprint',md5(concat_ws('|',v_onboarding.id::text,v_onboarding.status,coalesce(v_onboarding.completed_at::text,''),coalesce(v_onboarding.responses::text,'')))
    ) end,
    'requirements',v_requirements,
    'validations',v_validations,
    'promises',v_promises,
    'scopeConditions',v_conditions
  );
end;
$part13$;

revoke all on function public.project_build_sales_handoff_source_refs(uuid) from public,anon,authenticated;
grant execute on function public.project_build_sales_handoff_source_refs(uuid) to service_role;

create or replace function public.project_get_sales_handoff_readiness(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_uid uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_quote public.quotations%rowtype;
  v_salesperson uuid;
  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_dependencies jsonb:='[]'::jsonb;
  v_status text;
  v_structured_requirement_count integer:=0;
  v_confirmed_requirement_count integer:=0;
  v_invalid_validation_count integer:=0;
  v_pending_promise_count integer:=0;
  v_conflict_condition_count integer:=0;
  v_stale_condition_count integer:=0;
  v_payment_count integer:=0;
  v_onboarding_count integer:=0;
  v_reconciliation_status text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  select * into v_opp from public.crm_opportunities where id=v_project.source_opportunity_id;
  v_salesperson:=v_opp.salesperson_id;

  if not public.is_admin()
     and v_uid is distinct from v_salesperson
     and v_uid is distinct from v_project.project_manager_id then
    raise exception 'Project handoff access denied.';
  end if;

  if v_project.status<>'Active' then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PROJECT_NOT_ACTIVE','message','The Project must be Active for Sales handoff.','sourceType','PROJECT','actionUrl','/admin/app/projects?tab=projects'
    ));
  end if;
  if v_project.stage<>'Sales Handover' then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PROJECT_NOT_SALES_HANDOVER','message','The Project must be in Sales Handover before submission or review.','sourceType','PROJECT','actionUrl','/admin/app/projects?tab=projects'
    ));
  end if;
  if v_opp.id is null or (v_opp.stage<>'Won' and v_opp.status<>'Won') then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','OPPORTUNITY_NOT_WON','message','A Won Opportunity is required for Delivery handoff.','sourceType','OPPORTUNITY','actionUrl','/admin/app/crm?tab=pipeline'
    ));
  end if;
  if v_project.client_id is null or not exists(select 1 from public.clients c where c.id=v_project.client_id) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','CLIENT_NOT_LINKED','message','The canonical Client must be linked before Delivery handoff.','sourceType','CLIENT','actionUrl','/admin/app/sales?tab=clients'
    ));
  end if;
  if v_salesperson is null or not exists(
    select 1 from public.user_profiles u
    where u.id=v_salesperson and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  ) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','SOURCE_SELLER_UNRESOLVED','message','The source Seller must resolve to an active Sales user.','sourceType','OPPORTUNITY','actionUrl','/admin/app/crm?tab=pipeline'
    ));
  end if;

  select * into v_quote from public.quotations where id=v_project.quotation_id;
  if v_quote.id is null or v_quote.status<>'Accepted' or v_quote.accepted_at is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','ACCEPTED_QUOTATION_REQUIRED','message','An accepted quotation snapshot is required before Delivery handoff.','sourceType','QUOTATION','actionUrl','/admin/app/sales?tab=quotations'
    ));
  end if;

  select count(*)::int into v_payment_count
  from public.payments p
  where p.opportunity_id=v_project.source_opportunity_id
    and p.status='Verified'
    and p.payment_type in ('Advance','Advance Payment','Full Payment');
  if v_payment_count=0 then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','VERIFIED_PAYMENT_REQUIRED','message','A qualifying verified Advance or Full Payment is required before Delivery handoff.','sourceType','PAYMENT','actionUrl','/admin/app/sales?tab=payments'
    ));
  end if;

  select count(*)::int into v_onboarding_count
  from public.client_onboardings o
  where o.project_id=v_project.id
    and o.status='Completed'
    and o.completed_at is not null;
  if v_onboarding_count=0 then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','ONBOARDING_INCOMPLETE','message','Client onboarding must be completed before the final Sales handoff can be submitted.','sourceType','ONBOARDING','actionUrl','/admin/app/crm?tab=leads&lead='||coalesce(v_opp.lead_id::text,'')
    ));
  end if;

  if v_opp.lead_id is not null then
    select
      count(*) filter (
        where r.record_state='ACTIVE'
          and r.information_certainty<>'NOT_APPLICABLE'
          and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
      )::int,
      count(*) filter (
        where r.record_state='ACTIVE'
          and r.information_certainty='CLIENT_CONFIRMED'
          and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
      )::int
    into v_structured_requirement_count,v_confirmed_requirement_count
    from public.crm_requirements r
    where r.lead_id=v_opp.lead_id;

    if v_structured_requirement_count=0 or v_confirmed_requirement_count=0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','STRUCTURED_REQUIREMENTS_MISSING','message','Confirmed structured Sales Requirements are required; a legacy requirements_summary alone is not authoritative.','sourceType','REQUIREMENT','actionUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
      ));
    end if;

    select count(*)::int into v_invalid_validation_count
    from public.crm_sales_validations v
    where v.lead_id=v_opp.lead_id
      and (v.opportunity_id is null or v.opportunity_id=v_opp.id)
      and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=v.id)
      and (
        v.status in ('REJECTED','STALE')
        or (v.status in ('PENDING','IN_REVIEW','NEEDS_INFORMATION') and v.severity in ('AMBER','RED'))
        or (v.source_changed_at is not null and (v.source_acknowledged_at is null or v.source_acknowledged_at<v.source_changed_at))
      );
    if v_invalid_validation_count>0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','REQUIRED_VALIDATION_UNRESOLVED','message','A current required Sales Validation is stale, rejected, or unresolved. Resolve the canonical Validation before handoff.','sourceType','VALIDATION','count',v_invalid_validation_count,'actionUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
      ));
    end if;

    if exists(
      select 1 from public.crm_sales_validations v
      where v.lead_id=v_opp.lead_id
        and (v.opportunity_id is null or v.opportunity_id=v_opp.id)
        and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=v.id)
        and v.status in ('PENDING','IN_REVIEW','NEEDS_INFORMATION')
        and v.severity='GREEN'
    ) then
      v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
        'code','NON_BLOCKING_VALIDATION_OPEN','message','A non-blocking GREEN validation remains open and is visible to Delivery.','sourceType','VALIDATION','actionUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
      ));
    end if;

    select count(*)::int into v_pending_promise_count
    from public.crm_sales_promises p
    where p.lead_id=v_opp.lead_id
      and (p.opportunity_id is null or p.opportunity_id=v_opp.id)
      and p.record_state='ACTIVE'
      and not exists(select 1 from public.crm_sales_promises child where child.supersedes_promise_id=p.id)
      and p.validation_alignment_status in ('PENDING','CONFLICT');
    if v_pending_promise_count>0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','PROMISE_ALIGNMENT_UNRESOLVED','message','A material active Sales Promise is pending validation or conflicts with approved scope. Resolve it at the canonical Promise/quotation source.','sourceType','PROMISE','count',v_pending_promise_count,'actionUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
      ));
    end if;

    select
      count(*) filter (where c.state='STALE')::int,
      count(*) filter (where c.state='ACTIVE' and c.validation_alignment_status='CONFLICT')::int
    into v_stale_condition_count,v_conflict_condition_count
    from public.crm_sales_scope_conditions c
    where c.lead_id=v_opp.lead_id
      and (c.opportunity_id is null or c.opportunity_id=v_opp.id)
      and c.state in ('ACTIVE','STALE')
      and not exists(select 1 from public.crm_sales_scope_conditions child where child.supersedes_condition_id=c.id);

    if v_stale_condition_count>0 or v_conflict_condition_count>0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','SCOPE_CONDITION_UNRESOLVED','message','A Scope Condition is stale or conflicts with current approved scope. Resolve the canonical condition before handoff.','sourceType','SCOPE_CONDITION','count',v_stale_condition_count+v_conflict_condition_count,'actionUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
      ));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceType','SCOPE_CONDITION',
      'sourceId',c.id,
      'type',c.condition_type,
      'label',c.title,
      'detail',c.condition_text,
      'actionUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
    ) order by c.activated_at,c.id),'[]'::jsonb)
    into v_dependencies
    from public.crm_sales_scope_conditions c
    where c.lead_id=v_opp.lead_id
      and (c.opportunity_id is null or c.opportunity_id=v_opp.id)
      and c.state='ACTIVE'
      and c.condition_type in ('DEPENDENCY','CLIENT_RESPONSIBILITY')
      and not exists(select 1 from public.crm_sales_scope_conditions child where child.supersedes_condition_id=c.id);
  end if;

  if v_quote.id is not null and v_quote.sales_scope_snapshot is not null then
    v_reconciliation_status:=coalesce(v_quote.sales_scope_snapshot->>'finalReconciliationStatus','');
    if jsonb_array_length(coalesce(v_quote.sales_scope_snapshot->'blockers','[]'::jsonb))>0
       or v_reconciliation_status not in ('READY','PASS') then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','QUOTATION_RECONCILIATION_CONFLICT','message','The accepted quotation Sales-scope snapshot contains unresolved reconciliation blockers.','sourceType','QUOTATION','actionUrl','/admin/app/sales?tab=quotations'
      ));
    end if;
  elsif v_quote.id is not null then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
      'code','LEGACY_QUOTATION_WITHOUT_PART10B_SNAPSHOT','message','This accepted quotation predates the immutable Part 10B Sales-scope snapshot. Delivery will use the accepted quotation item snapshots plus current canonical Sales evidence.','sourceType','QUOTATION','actionUrl','/admin/app/sales?tab=quotations'
    ));
  end if;

  if v_project.project_manager_id is null then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
      'code','PROJECT_MANAGER_NOT_ASSIGNED','message','Project Manager is not assigned. Sales may submit when otherwise ready, but Delivery cannot Accept and Content cannot begin until assignment.','sourceType','PROJECT','actionUrl','/admin/app/projects?tab=projects'
    ));
  end if;

  if jsonb_array_length(v_blockers)>0 then v_status:='BLOCKED';
  elsif jsonb_array_length(v_warnings)>0 then v_status:='WARNING';
  else v_status:='READY';
  end if;

  return jsonb_build_object(
    'projectId',v_project.id,
    'status',v_status,
    'blockers',v_blockers,
    'warnings',v_warnings,
    'outstandingDeliveryDependencies',v_dependencies,
    'checks',jsonb_build_object(
      'opportunityWon',v_opp.id is not null and (v_opp.stage='Won' or v_opp.status='Won'),
      'acceptedQuotation',v_quote.id is not null and v_quote.status='Accepted' and v_quote.accepted_at is not null,
      'qualifyingVerifiedPayment',v_payment_count>0,
      'projectSalesHandover',v_project.status='Active' and v_project.stage='Sales Handover',
      'clientLinked',v_project.client_id is not null,
      'sourceSellerResolvable',v_salesperson is not null,
      'projectManagerAssigned',v_project.project_manager_id is not null,
      'onboardingComplete',v_onboarding_count>0,
      'structuredRequirements',v_structured_requirement_count,
      'confirmedRequirements',v_confirmed_requirement_count
    )
  );
end;
$part13$;

revoke all on function public.project_get_sales_handoff_readiness(uuid) from public,anon;
grant execute on function public.project_get_sales_handoff_readiness(uuid) to authenticated,service_role;

create or replace function public.project_get_sales_handoff_brief(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_uid uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_lead public.crm_leads%rowtype;
  v_client public.clients%rowtype;
  v_quote public.quotations%rowtype;
  v_onboarding public.client_onboardings%rowtype;
  v_payment public.payments%rowtype;
  v_salesperson uuid;
  v_seller_name text:='';
  v_pm_name text:='';
  v_readiness jsonb:='{}'::jsonb;
  v_requirements jsonb:='[]'::jsonb;
  v_quote_items jsonb:='[]'::jsonb;
  v_validations jsonb:='[]'::jsonb;
  v_promises jsonb:='[]'::jsonb;
  v_conditions jsonb:='[]'::jsonb;
  v_history jsonb:='[]'::jsonb;
  v_business_context jsonb:='{}'::jsonb;
  v_timeline jsonb:='{}'::jsonb;
  v_safe_onboarding jsonb:='{}'::jsonb;
  v_current public.project_sales_handover_attempts%rowtype;
  v_latest_attempt integer:=0;
  v_source_refs jsonb;
  v_source_digest text;
  v_source_drift boolean:=false;
  v_is_source_seller boolean:=false;
  v_is_reviewer boolean:=false;
  v_seller_task_status text;
  v_pm_task_status text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  select * into v_opp from public.crm_opportunities where id=v_project.source_opportunity_id;
  if v_opp.id is not null then select * into v_lead from public.crm_leads where id=v_opp.lead_id; end if;
  if v_project.client_id is not null then select * into v_client from public.clients where id=v_project.client_id; end if;
  v_salesperson:=v_opp.salesperson_id;

  if not public.is_admin()
     and v_uid is distinct from v_salesperson
     and v_uid is distinct from v_project.project_manager_id then
    raise exception 'Project handoff access denied.';
  end if;

  v_is_source_seller:=v_uid=v_salesperson and exists(
    select 1 from public.user_profiles u where u.id=v_uid and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  );
  v_is_reviewer:=v_project.project_manager_id is not null and (v_uid=v_project.project_manager_id or public.is_admin());

  select * into v_quote from public.quotations where id=v_project.quotation_id;
  select * into v_onboarding from public.client_onboardings where project_id=v_project.id order by created_at desc,id desc limit 1;
  select * into v_payment
  from public.payments
  where opportunity_id=v_project.source_opportunity_id
    and status='Verified'
    and payment_type in ('Advance','Advance Payment','Full Payment')
  order by coalesce(verified_at,paid_at,updated_at) desc,id desc
  limit 1;

  select full_name into v_seller_name from public.user_profiles where id=v_salesperson;
  select full_name into v_pm_name from public.user_profiles where id=v_project.project_manager_id;

  select status into v_seller_task_status
  from public.project_tasks
  where project_id=v_project.id and workflow_key='sales_handover_submission'
  order by created_at desc limit 1;
  select status into v_pm_task_status
  from public.project_tasks
  where project_id=v_project.id and workflow_key='sales_handover_review'
  order by created_at desc limit 1;

  select * into v_current
  from public.project_sales_handover_attempts
  where project_id=v_project.id
  order by attempt_number desc
  limit 1;
  if found then v_latest_attempt:=v_current.attempt_number; end if;

  v_source_refs:=public.project_build_sales_handoff_source_refs(v_project.id);
  v_source_digest:=md5(v_source_refs::text);
  if v_current.id is not null then
    v_source_drift:=v_current.source_digest<>v_source_digest;
  end if;

  v_readiness:=public.project_get_sales_handoff_readiness(v_project.id);

  if v_opp.lead_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'key',r.requirement_key,
      'category',r.category,
      'title',r.title,
      'description',r.content,
      'structuredValue',r.structured_value,
      'certainty',r.information_certainty,
      'recordState',r.record_state,
      'sourceType',r.source_type,
      'sourceRecordedAt',r.source_recorded_at,
      'proposalReconciliationStatus',r.proposal_reconciliation_status,
      'updatedAt',r.updated_at,
      'sourceUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
    ) order by r.category,r.title,r.id),'[]'::jsonb)
    into v_requirements
    from public.crm_requirements r
    where r.lead_id=v_opp.lead_id
      and r.record_state='ACTIVE'
      and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null or r.information_certainty='NOT_APPLICABLE');

    select jsonb_strip_nulls(jsonb_build_object(
      'whyClientBought',(select r.content from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='business_objective' order by r.updated_at desc limit 1),
      'originalProblem',(select r.content from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='primary_problem' order by r.updated_at desc limit 1),
      'businessImpact',(select r.content from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='business_impact' order by r.updated_at desc limit 1),
      'desiredOutcome',(select r.content from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='desired_outcome' order by r.updated_at desc limit 1),
      'targetAudience',(select r.content from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='target_customer' order by r.updated_at desc limit 1)
    )) into v_business_context;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',v.id,
      'type',v.validation_type,
      'severity',v.severity,
      'subject',v.subject,
      'status',v.status,
      'decision',v.decision_summary,
      'approvedConstraints',v.approved_constraints,
      'reworkReason',v.rejection_rework_reason,
      'reviewerTeam',v.reviewer_team,
      'decidedAt',v.decided_at,
      'stale',v.status='STALE' or (v.source_changed_at is not null and (v.source_acknowledged_at is null or v.source_acknowledged_at<v.source_changed_at)),
      'sourceUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
    ) order by v.validation_type,v.updated_at desc,v.id),'[]'::jsonb)
    into v_validations
    from public.crm_sales_validations v
    where v.lead_id=v_opp.lead_id
      and (v.opportunity_id is null or v.opportunity_id=v_opp.id)
      and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=v.id);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,
      'type',p.promise_type,
      'promise',p.promise_text,
      'validationState',p.validation_alignment_status,
      'sourceType',p.source_type,
      'sourceSummary',p.source_summary,
      'linkedRequirementId',p.linked_requirement_id,
      'linkedValidationId',p.linked_validation_id,
      'promisedAt',p.promised_at,
      'sourceUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
    ) order by p.promised_at,p.id),'[]'::jsonb)
    into v_promises
    from public.crm_sales_promises p
    where p.lead_id=v_opp.lead_id
      and (p.opportunity_id is null or p.opportunity_id=v_opp.id)
      and p.record_state='ACTIVE'
      and not exists(select 1 from public.crm_sales_promises child where child.supersedes_promise_id=p.id);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,
      'type',c.condition_type,
      'title',c.title,
      'condition',c.condition_text,
      'state',c.state,
      'validationState',c.validation_alignment_status,
      'sourceType',c.source_type,
      'sourceSummary',c.source_summary,
      'sourceRequirementId',c.source_requirement_id,
      'sourceValidationId',c.source_validation_id,
      'sourceUrl','/admin/app/crm?tab=leads&lead='||v_opp.lead_id::text
    ) order by c.condition_type,c.activated_at,c.id),'[]'::jsonb)
    into v_conditions
    from public.crm_sales_scope_conditions c
    where c.lead_id=v_opp.lead_id
      and (c.opportunity_id is null or c.opportunity_id=v_opp.id)
      and c.state in ('ACTIVE','STALE')
      and not exists(select 1 from public.crm_sales_scope_conditions child where child.supersedes_condition_id=c.id);
  end if;

  if v_quote.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,
      'productCode',i.product_code_snapshot,
      'productName',i.product_name_snapshot,
      'description',i.description_snapshot,
      'quantity',i.quantity,
      'unitPrice',i.unit_price,
      'lineTotal',i.line_total,
      'itemType',i.item_type,
      'lineType',i.line_type,
      'optionalForClient',i.optional_for_client,
      'durationMin',i.duration_min_snapshot,
      'durationMax',i.duration_max_snapshot,
      'durationUnit',i.duration_unit_snapshot,
      'timelineImpact',i.timeline_impact_snapshot,
      'durationNote',i.duration_note_snapshot,
      'clientExpectations',i.client_expectations_snapshot,
      'configurationSnapshot',i.configuration_snapshot
    ) order by i.sort_order,i.id),'[]'::jsonb)
    into v_quote_items
    from public.quotation_items i
    where i.quotation_id=v_quote.id;

    v_timeline:=jsonb_build_object(
      'quotationDuration',v_quote.duration_snapshot_text,
      'timelineValidations',(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(v_validations) x where x->>'type'='TIMELINE'),
      'timelinePromises',(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(v_promises) x where x->>'type'='TIMELINE'),
      'dependencies',(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(v_conditions) x where x->>'type' in ('DEPENDENCY','CLIENT_RESPONSIBILITY'))
    );
  end if;

  if v_onboarding.id is not null and jsonb_typeof(v_onboarding.responses)='object' then
    v_safe_onboarding:=jsonb_strip_nulls(jsonb_build_object(
      'companyName',v_onboarding.responses->>'companyName',
      'country',v_onboarding.responses->>'country',
      'decisionMaker',v_onboarding.responses->>'decisionMaker',
      'communicationPreference',v_onboarding.responses->>'communicationPreference',
      'timezone',v_onboarding.responses->>'timezone',
      'generalDeliveryNotes',v_onboarding.responses->>'generalDeliveryNotes',
      'projectGoals',v_onboarding.responses->>'projectGoals',
      'targetAudience',v_onboarding.responses->>'targetAudience',
      'primaryOffer',v_onboarding.responses->>'primaryOffer',
      'competitors',v_onboarding.responses->>'competitors',
      'userRoles',v_onboarding.responses->>'userRoles',
      'workflowRequirements',v_onboarding.responses->>'workflowRequirements',
      'featurePriorities',v_onboarding.responses->>'featurePriorities',
      'portalRequirements',v_onboarding.responses->>'portalRequirements',
      'adminReporting',v_onboarding.responses->>'adminReporting',
      'authPermissions',v_onboarding.responses->>'authPermissions',
      'dataRequirements',v_onboarding.responses->>'dataRequirements',
      'integrationRequirements',v_onboarding.responses->>'integrationRequirements',
      'paymentGatewayRequirements',v_onboarding.responses->>'paymentGatewayRequirements',
      'automationRequirements',v_onboarding.responses->>'automationRequirements',
      'designPreferences',v_onboarding.responses->>'designPreferences',
      'acceptanceCriteria',v_onboarding.responses->>'acceptanceCriteria',
      'trainingHandover',v_onboarding.responses->>'trainingHandover',
      'stakeholderList',v_onboarding.responses->>'stakeholderList'
    ));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'attemptNumber',a.attempt_number,
    'status',a.status,
    'submittedBy',a.submitted_by,
    'submittedByName',coalesce(submitter.full_name,''),
    'submittedAt',a.submitted_at,
    'reviewedBy',a.reviewed_by,
    'reviewedByName',coalesce(reviewer.full_name,''),
    'reviewedAt',a.reviewed_at,
    'decision',a.decision,
    'returnReasonCodes',a.return_reason_codes,
    'returnNotes',a.return_notes,
    'missingItems',a.missing_items,
    'sourceRefs',a.source_refs,
    'sourceDigest',a.source_digest,
    'resubmittedFromAttemptId',a.resubmitted_from_attempt_id
  ) order by a.attempt_number),'[]'::jsonb)
  into v_history
  from public.project_sales_handover_attempts a
  left join public.user_profiles submitter on submitter.id=a.submitted_by
  left join public.user_profiles reviewer on reviewer.id=a.reviewed_by
  where a.project_id=v_project.id;

  return jsonb_build_object(
    'projectId',v_project.id,
    'projectNumber',v_project.project_number,
    'projectName',v_project.project_name,
    'projectStage',v_project.stage,
    'projectStatus',v_project.status,
    'packageSnapshot',v_project.package_snapshot,
    'customer',jsonb_build_object(
      'clientId',v_client.id,
      'companyName',coalesce(nullif(v_client.company_name,''),nullif(v_lead.company_name,''),nullif(v_lead.contact_name,''),'Customer'),
      'primaryContact',coalesce(nullif(v_client.primary_contact_name,''),nullif(v_lead.contact_name,'')),
      'email',coalesce(nullif(v_client.email,''),nullif(v_lead.email,'')),
      'phone',coalesce(nullif(v_client.phone,''),nullif(v_lead.phone,'')),
      'country',coalesce(nullif(v_client.country,''),nullif(v_lead.country,'')),
      'industry',coalesce(nullif(v_client.industry,''),nullif(v_lead.industry,''))
    ),
    'sourceOpportunity',jsonb_build_object(
      'id',v_opp.id,'stage',v_opp.stage,'status',v_opp.status,'leadId',v_opp.lead_id
    ),
    'seller',jsonb_build_object('id',v_salesperson,'name',coalesce(v_seller_name,'')),
    'projectManager',jsonb_build_object('id',v_project.project_manager_id,'name',coalesce(v_pm_name,'')),
    'businessContext',v_business_context,
    'requirements',v_requirements,
    'requirementsCaptured',jsonb_array_length(v_requirements)>0,
    'salesRequirements',coalesce(v_opp.requirements_summary,v_project.requirements_summary,''),
    'legacyRequirementsSummaryAuthoritative',false,
    'scopeSummary',coalesce(nullif(v_quote.scope_summary,''),nullif(v_project.scope_summary,''),''),
    'exclusions',coalesce(nullif(v_quote.exclusions,''),nullif(v_project.exclusions,''),''),
    'quotation',jsonb_build_object(
      'id',v_quote.id,
      'number',v_quote.quotation_number,
      'status',v_quote.status,
      'revisionNumber',v_quote.revision_number,
      'total',v_quote.total,
      'currency',v_quote.currency,
      'acceptedAt',v_quote.accepted_at,
      'scopeSummary',v_quote.scope_summary,
      'exclusions',v_quote.exclusions,
      'clientResponsibilities',v_quote.client_responsibilities,
      'deliveryAssumptions',v_quote.delivery_assumptions,
      'handoverSupport',v_quote.handover_support,
      'paymentTerms',v_quote.payment_terms,
      'durationSnapshotText',v_quote.duration_snapshot_text,
      'salesScopeSnapshotPresent',v_quote.sales_scope_snapshot is not null,
      'salesScopeSnapshotAt',v_quote.sales_scope_snapshot_at,
      'salesScopeSnapshotSchemaVersion',v_quote.sales_scope_snapshot_schema_version,
      'salesScopeSnapshot',v_quote.sales_scope_snapshot,
      'items',v_quote_items,
      'url','/admin/app/sales?tab=quotations'
    ),
    'payment',jsonb_build_object(
      'verified',v_payment.id is not null,
      'id',v_payment.id,
      'reference',v_payment.payment_reference,
      'type',v_payment.payment_type,
      'amountPaid',v_payment.amount_paid,
      'currency',v_payment.currency,
      'verifiedAt',v_payment.verified_at,
      'url','/admin/app/sales?tab=payments'
    ),
    'onboarding',jsonb_build_object(
      'id',v_onboarding.id,
      'status',v_onboarding.status,
      'completed',v_onboarding.status='Completed' and v_onboarding.completed_at is not null,
      'completedAt',v_onboarding.completed_at,
      'questionCount',case when jsonb_typeof(v_onboarding.field_schema)='array' then jsonb_array_length(v_onboarding.field_schema) else 0 end,
      'responseCount',case when jsonb_typeof(v_onboarding.responses)='object' then (select count(*) from jsonb_object_keys(v_onboarding.responses)) else 0 end,
      'deliveryFacts',v_safe_onboarding,
      'url','/admin/app/crm?tab=leads&lead='||coalesce(v_opp.lead_id::text,'')
    ),
    'discovery',v_safe_onboarding,
    'validations',v_validations,
    'promises',v_promises,
    'scopeConditions',v_conditions,
    'timeline',v_timeline,
    'outstandingDeliveryDependencies',coalesce(v_readiness->'outstandingDeliveryDependencies','[]'::jsonb),
    'readiness',v_readiness,
    'sellerNotes',coalesce(v_project.sales_handover_notes,''),
    'sellerHandoffDone',coalesce(v_seller_task_status='Done',false),
    'pmReviewStatus',coalesce(v_pm_task_status,'Not Started'),
    'lifecycleStatus',case
      when v_current.id is null then 'NOT_SUBMITTED'
      when v_current.status='SUBMITTED' then 'SUBMITTED'
      when v_current.status='RESUBMITTED' then 'RESUBMITTED'
      when v_current.status='RETURNED_TO_SALES' then 'RETURNED_TO_SALES'
      when v_current.status='ACCEPTED' then 'ACCEPTED'
      else 'NOT_SUBMITTED' end,
    'currentAttempt',case when v_current.id is null then null else jsonb_build_object(
      'id',v_current.id,
      'attemptNumber',v_current.attempt_number,
      'status',v_current.status,
      'submittedBy',v_current.submitted_by,
      'submittedAt',v_current.submitted_at,
      'reviewedBy',v_current.reviewed_by,
      'reviewedAt',v_current.reviewed_at,
      'decision',v_current.decision,
      'returnReasonCodes',v_current.return_reason_codes,
      'returnNotes',v_current.return_notes,
      'missingItems',v_current.missing_items,
      'sourceDigest',v_current.source_digest,
      'sourceDrift',v_source_drift
    ) end,
    'history',v_history,
    'sourceDrift',v_source_drift,
    'firstPassAccepted',exists(
      select 1 from public.project_sales_handover_attempts a
      where a.project_id=v_project.id and a.attempt_number=1 and a.status='ACCEPTED'
    ),
    'canSubmit',v_is_source_seller
      and v_project.status='Active'
      and v_project.stage='Sales Handover'
      and coalesce(v_readiness->>'status','BLOCKED')<>'BLOCKED'
      and (
        v_current.id is null
        or v_current.status='RETURNED_TO_SALES'
        or (v_current.status='ACCEPTED' and v_source_drift)
      ),
    'canAccept',v_is_reviewer
      and v_project.project_manager_id is not null
      and v_current.status in ('SUBMITTED','RESUBMITTED')
      and not v_source_drift,
    'canReturn',v_is_reviewer
      and v_project.project_manager_id is not null
      and v_current.status in ('SUBMITTED','RESUBMITTED'),
    'readyToSend',v_is_source_seller
      and coalesce(v_readiness->>'status','BLOCKED')<>'BLOCKED'
      and (
        v_current.id is null
        or v_current.status='RETURNED_TO_SALES'
        or (v_current.status='ACCEPTED' and v_source_drift)
      ),
    'blockedReason',case when coalesce(v_readiness->>'status','BLOCKED')='BLOCKED' then coalesce(v_readiness#>>'{blockers,0,message}','Sales handoff readiness is blocked.') else null end,
    'sourceLinks',jsonb_build_object(
      'requirements','/admin/app/crm?tab=leads&lead='||coalesce(v_opp.lead_id::text,''),
      'quotation','/admin/app/sales?tab=quotations',
      'payment','/admin/app/sales?tab=payments',
      'onboarding','/admin/app/crm?tab=leads&lead='||coalesce(v_opp.lead_id::text,''),
      'project','/admin/app/projects?tab=projects'
    )
  );
end;
$part13$;

revoke all on function public.project_get_sales_handoff_brief(uuid) from public,anon;
grant execute on function public.project_get_sales_handoff_brief(uuid) to authenticated,service_role;

create or replace function public.submit_sales_project_handover(p_project_id uuid,p_notes text)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_uid uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_latest public.project_sales_handover_attempts%rowtype;
  v_notes text:=btrim(coalesce(p_notes,''));
  v_readiness jsonb;
  v_refs jsonb;
  v_digest text;
  v_attempt integer:=1;
  v_status text:='SUBMITTED';
  v_new_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if length(v_notes)>10000 then raise exception 'Final Seller notes are too long.'; end if;

  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  if v_project.status<>'Active' or v_project.stage<>'Sales Handover' then
    raise exception 'The Sales handoff is closed or the Project is no longer in Sales Handover.';
  end if;

  select * into v_opp from public.crm_opportunities where id=v_project.source_opportunity_id;
  if v_opp.salesperson_id is null or v_opp.salesperson_id<>v_uid or not exists(
    select 1 from public.user_profiles u where u.id=v_uid and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  ) then
    raise exception 'Only the source Seller may submit or resubmit this Sales handoff.';
  end if;

  v_readiness:=public.project_get_sales_handoff_readiness(v_project.id);
  if coalesce(v_readiness->>'status','BLOCKED')='BLOCKED' then
    raise exception 'Sales handoff is BLOCKED: %',coalesce(v_readiness#>>'{blockers,0,message}','resolve the required canonical Sales/Delivery evidence.');
  end if;

  if v_notes='' then
    v_notes:='No additional Sales commitments beyond the canonical confirmed requirements, accepted quotation, verified payment and completed client onboarding.';
  end if;

  update public.projects
  set sales_handover_notes=v_notes,updated_at=now()
  where id=v_project.id;

  v_refs:=public.project_build_sales_handoff_source_refs(v_project.id);
  v_digest:=md5(v_refs::text);

  select * into v_latest
  from public.project_sales_handover_attempts
  where project_id=v_project.id
  order by attempt_number desc
  limit 1
  for update;

  if v_latest.id is not null and v_latest.status in ('SUBMITTED','RESUBMITTED') then
    if v_latest.source_digest=v_digest and v_latest.seller_notes_snapshot=v_notes then
      return jsonb_build_object(
        'projectId',v_project.id,'attemptId',v_latest.id,'attemptNumber',v_latest.attempt_number,
        'status',v_latest.status,'submittedBy',v_latest.submitted_by,'submittedAt',v_latest.submitted_at,
        'idempotent',true,'projectManagerAssigned',v_project.project_manager_id is not null
      );
    end if;
    raise exception 'A current handoff submission is already waiting for Delivery review.';
  end if;

  if v_latest.id is not null and v_latest.status='ACCEPTED' and v_latest.source_digest=v_digest then
    raise exception 'The current Sales handoff has already been accepted. No material source change requires resubmission.';
  end if;

  if v_latest.id is not null then
    v_attempt:=v_latest.attempt_number+1;
    v_status:='RESUBMITTED';
  end if;

  perform set_config('profox.sales_handover_lifecycle_rpc','1',true);
  insert into public.project_sales_handover_attempts(
    project_id,attempt_number,status,submitted_by,submitted_at,seller_notes_snapshot,
    source_refs,source_digest,resubmitted_from_attempt_id
  ) values (
    v_project.id,v_attempt,v_status,v_uid,now(),v_notes,
    v_refs,v_digest,case when v_latest.id is not null then v_latest.id else null end
  )
  returning id into v_new_id;

  perform set_config('profox.sales_handover_submission_rpc','1',true);
  update public.project_tasks
  set status='Done',
      completed_at=coalesce(completed_at,now()),
      notes=concat_ws(E'\n',nullif(notes,''),case when v_attempt=1 then 'Sales handoff submitted through the protected Part 13 workflow.' else 'Sales handoff corrected and resubmitted through the protected Part 13 workflow.' end),
      updated_at=now()
  where project_id=v_project.id
    and workflow_key='sales_handover_submission'
    and assigned_to=v_uid;

  perform set_config('profox.sales_handover_review_rpc','1',true);
  update public.project_tasks
  set status='To Do',
      completed_at=null,
      assigned_to=case when v_project.project_manager_id is not null then v_project.project_manager_id else assigned_to end,
      notes=concat_ws(E'\n',nullif(notes,''),'Delivery review required for handoff attempt #'||v_attempt::text||'.'),
      updated_at=now()
  where project_id=v_project.id
    and workflow_key='sales_handover_review';

  if v_project.project_manager_id is not null then
    perform public.service_queue_staff_operational_notification(
      v_project.project_manager_id,
      'project-sales-handover-review:'||v_project.id::text||':attempt:'||v_attempt::text,
      'project_handover_ready',
      'Sales Handoff',
      case when v_attempt=1 then 'Sales handoff ready — ' else 'Sales handoff resubmitted — ' end||v_project.project_name,
      'Review authoritative Sales, quotation, payment, onboarding and validation evidence. Accept or Return to Sales with actionable reasons.',
      '/admin/project-handover/'||v_project.id::text,
      jsonb_build_object('projectId',v_project.id,'attemptNumber',v_attempt,'salespersonId',v_uid,'actionUrl','/admin/project-handover/'||v_project.id::text),
      now()
    );
  else
    perform public.service_queue_active_admins_operational_notification(
      'project-sales-handover-needs-pm:'||v_project.id::text||':attempt:'||v_attempt::text,
      'project_handover_needs_pm',
      'Sales Handoff',
      'Assign Project Manager — '||v_project.project_name,
      'Sales submitted handoff attempt #'||v_attempt::text||'. Assign an active Project Manager before Delivery can Accept or Content can begin.',
      '/admin/app/projects?tab=projects',
      jsonb_build_object('projectId',v_project.id,'attemptNumber',v_attempt,'salespersonId',v_uid,'actionUrl','/admin/app/projects?tab=projects'),
      now()
    );
  end if;

  return jsonb_build_object(
    'projectId',v_project.id,
    'attemptId',v_new_id,
    'attemptNumber',v_attempt,
    'status',v_status,
    'submittedBy',v_uid,
    'submittedAt',now(),
    'idempotent',false,
    'readinessStatus',v_readiness->>'status',
    'projectManagerAssigned',v_project.project_manager_id is not null,
    'nextProductionStage','Content'
  );
end;
$part13$;

revoke all on function public.submit_sales_project_handover(uuid,text) from public,anon;
grant execute on function public.submit_sales_project_handover(uuid,text) to authenticated,service_role;

create or replace function public.accept_sales_project_handover(p_project_id uuid,p_expected_attempt integer)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_uid uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_attempt public.project_sales_handover_attempts%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_readiness jsonb;
  v_refs jsonb;
  v_digest text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_expected_attempt is null or p_expected_attempt<1 then raise exception 'Current handoff attempt is required.'; end if;

  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  if v_project.status<>'Active' or v_project.stage<>'Sales Handover' then
    raise exception 'Delivery review is only available while the active Project is in Sales Handover.';
  end if;
  if v_project.project_manager_id is null then
    raise exception 'Assign an active Project Manager before Delivery can accept the Sales handoff.';
  end if;
  if v_uid<>v_project.project_manager_id and not public.is_admin() then
    raise exception 'Only the assigned Project Manager or Administrator may accept this handoff.';
  end if;

  select * into v_attempt
  from public.project_sales_handover_attempts
  where project_id=v_project.id
  order by attempt_number desc
  limit 1
  for update;
  if v_attempt.id is null then raise exception 'No submitted Sales handoff is available for review.'; end if;
  if v_attempt.attempt_number<>p_expected_attempt then
    raise exception 'This handoff version is stale. Reload the current submission before reviewing it.';
  end if;
  if v_attempt.status='ACCEPTED' then
    return jsonb_build_object('projectId',v_project.id,'attemptNumber',v_attempt.attempt_number,'status','ACCEPTED','acceptedAt',v_attempt.reviewed_at,'acceptedBy',v_attempt.reviewed_by,'idempotent',true);
  end if;
  if v_attempt.status not in ('SUBMITTED','RESUBMITTED') then
    raise exception 'Only the current Submitted or Resubmitted handoff may be accepted.';
  end if;

  v_readiness:=public.project_get_sales_handoff_readiness(v_project.id);
  if coalesce(v_readiness->>'status','BLOCKED')='BLOCKED' then
    raise exception 'Delivery cannot accept a BLOCKED handoff: %',coalesce(v_readiness#>>'{blockers,0,message}','resolve current blockers.');
  end if;

  v_refs:=public.project_build_sales_handoff_source_refs(v_project.id);
  v_digest:=md5(v_refs::text);
  if v_digest<>v_attempt.source_digest then
    raise exception 'Canonical Sales handoff sources changed after submission. Sales must review and resubmit the current handoff.';
  end if;

  perform set_config('profox.sales_handover_lifecycle_rpc','1',true);
  update public.project_sales_handover_attempts
  set status='ACCEPTED',
      reviewed_by=v_uid,
      reviewed_at=now(),
      decision='ACCEPTED',
      return_reason_codes='{}'::text[],
      return_notes=null,
      missing_items='[]'::jsonb
  where id=v_attempt.id;

  perform set_config('profox.sales_handover_review_rpc','1',true);
  update public.project_tasks
  set status='Done',
      completed_at=coalesce(completed_at,now()),
      notes=concat_ws(E'\n',nullif(notes,''),'Delivery accepted handoff attempt #'||v_attempt.attempt_number::text||' through the protected Part 13 workflow.'),
      updated_at=now()
  where project_id=v_project.id
    and workflow_key='sales_handover_review';

  select * into v_opp from public.crm_opportunities where id=v_project.source_opportunity_id;
  if v_opp.salesperson_id is not null then
    perform public.service_queue_staff_operational_notification(
      v_opp.salesperson_id,
      'project-sales-handover-accepted:'||v_project.id::text||':attempt:'||v_attempt.attempt_number::text,
      'project_handover_accepted',
      'Sales Handoff',
      'Delivery accepted — '||v_project.project_name,
      'Project Management accepted Sales handoff attempt #'||v_attempt.attempt_number::text||'. The Project may move to Content when all existing stage requirements are satisfied.',
      '/admin/project-handover/'||v_project.id::text,
      jsonb_build_object('projectId',v_project.id,'attemptNumber',v_attempt.attempt_number,'reviewedBy',v_uid,'actionUrl','/admin/project-handover/'||v_project.id::text),
      now()
    );
  end if;

  return jsonb_build_object(
    'projectId',v_project.id,
    'attemptNumber',v_attempt.attempt_number,
    'status','ACCEPTED',
    'acceptedBy',v_uid,
    'acceptedAt',now(),
    'idempotent',false,
    'contentGateSatisfied',true
  );
end;
$part13$;

revoke all on function public.accept_sales_project_handover(uuid,integer) from public,anon;
grant execute on function public.accept_sales_project_handover(uuid,integer) to authenticated,service_role;

create or replace function public.return_sales_project_handover(
  p_project_id uuid,
  p_expected_attempt integer,
  p_reason_codes text[],
  p_missing_items jsonb,
  p_review_notes text
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_uid uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_attempt public.project_sales_handover_attempts%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_reason text;
  v_allowed text[]:=array[
    'MISSING_REQUIREMENT','UNCLEAR_REQUIREMENT','SCOPE_CONFLICT','PROMISE_NOT_COVERED',
    'VALIDATION_MISSING','TIMELINE_CONFLICT','CLIENT_DEPENDENCY_MISSING',
    'ONBOARDING_INFORMATION_INCOMPLETE','COMMERCIAL_CLARIFICATION','OTHER'
  ];
  v_reasons text[]:='{}'::text[];
  v_notes text:=btrim(coalesce(p_review_notes,''));
  v_missing jsonb:=coalesce(p_missing_items,'[]'::jsonb);
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_expected_attempt is null or p_expected_attempt<1 then raise exception 'Current handoff attempt is required.'; end if;

  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  if v_project.status<>'Active' or v_project.stage<>'Sales Handover' then
    raise exception 'A Sales handoff can only be returned while the active Project remains in Sales Handover.';
  end if;
  if v_project.project_manager_id is null then
    raise exception 'Assign an active Project Manager before Delivery review.';
  end if;
  if v_uid<>v_project.project_manager_id and not public.is_admin() then
    raise exception 'Only the assigned Project Manager or Administrator may return this handoff.';
  end if;

  if coalesce(array_length(p_reason_codes,1),0)=0 then
    raise exception 'Return to Sales requires at least one structured reason.';
  end if;
  foreach v_reason in array p_reason_codes loop
    v_reason:=upper(btrim(coalesce(v_reason,'')));
    if v_reason='' or not (v_reason=any(v_allowed)) then
      raise exception 'Unsupported Sales handoff return reason: %',coalesce(v_reason,'');
    end if;
    if not (v_reason=any(v_reasons)) then v_reasons:=array_append(v_reasons,v_reason); end if;
  end loop;

  if char_length(v_notes)<10 or char_length(v_notes)>4000 then
    raise exception 'Return notes must give an actionable explanation between 10 and 4000 characters.';
  end if;
  if 'OTHER'=any(v_reasons) and char_length(v_notes)<20 then
    raise exception 'OTHER requires a specific explanatory note of at least 20 characters.';
  end if;
  if jsonb_typeof(v_missing)<>'array' or jsonb_array_length(v_missing)=0 or jsonb_array_length(v_missing)>50 then
    raise exception 'Return to Sales requires 1 to 50 structured missing/action items.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(v_missing) item
    where jsonb_typeof(item)<>'object'
       or nullif(btrim(coalesce(item->>'label','')),'') is null
       or char_length(item->>'label')>500
  ) then
    raise exception 'Every missing/action item must be an object with a concise label.';
  end if;

  select * into v_attempt
  from public.project_sales_handover_attempts
  where project_id=v_project.id
  order by attempt_number desc
  limit 1
  for update;
  if v_attempt.id is null then raise exception 'No submitted Sales handoff is available for review.'; end if;
  if v_attempt.attempt_number<>p_expected_attempt then
    raise exception 'This handoff version is stale. Reload the current submission before reviewing it.';
  end if;
  if v_attempt.status not in ('SUBMITTED','RESUBMITTED') then
    raise exception 'Only the current Submitted or Resubmitted handoff may be returned to Sales.';
  end if;

  perform set_config('profox.sales_handover_lifecycle_rpc','1',true);
  update public.project_sales_handover_attempts
  set status='RETURNED_TO_SALES',
      reviewed_by=v_uid,
      reviewed_at=now(),
      decision='RETURNED_TO_SALES',
      return_reason_codes=v_reasons,
      return_notes=v_notes,
      missing_items=v_missing
  where id=v_attempt.id;

  perform set_config('profox.sales_handover_review_rpc','1',true);
  update public.project_tasks
  set status='To Do',
      completed_at=null,
      notes=concat_ws(E'\n',nullif(notes,''),'Delivery returned handoff attempt #'||v_attempt.attempt_number::text||' to Sales: '||array_to_string(v_reasons,', ')||'.'),
      updated_at=now()
  where project_id=v_project.id
    and workflow_key='sales_handover_review';

  perform set_config('profox.sales_handover_submission_rpc','1',true);
  update public.project_tasks
  set status='To Do',
      completed_at=null,
      notes=concat_ws(E'\n',nullif(notes,''),'Sales owns the returned handoff until corrected and resubmitted. Attempt #'||v_attempt.attempt_number::text||'.'),
      updated_at=now()
  where project_id=v_project.id
    and workflow_key='sales_handover_submission';

  select * into v_opp from public.crm_opportunities where id=v_project.source_opportunity_id;
  if v_opp.salesperson_id is not null then
    perform public.service_queue_staff_operational_notification(
      v_opp.salesperson_id,
      'project-sales-handover-returned:'||v_project.id::text||':attempt:'||v_attempt.attempt_number::text,
      'project_handover_returned',
      'Sales Handoff',
      'Returned to Sales — '||v_project.project_name,
      'Project Management returned handoff attempt #'||v_attempt.attempt_number::text||'. Resolve the canonical source issues, then resubmit for Delivery review.',
      '/admin/project-handover/'||v_project.id::text,
      jsonb_build_object(
        'projectId',v_project.id,'attemptNumber',v_attempt.attempt_number,'reviewedBy',v_uid,
        'reasonCodes',to_jsonb(v_reasons),'missingItems',v_missing,'actionUrl','/admin/project-handover/'||v_project.id::text
      ),
      now()
    );
  end if;

  return jsonb_build_object(
    'projectId',v_project.id,
    'attemptNumber',v_attempt.attempt_number,
    'status','RETURNED_TO_SALES',
    'reviewedBy',v_uid,
    'reviewedAt',now(),
    'reasonCodes',to_jsonb(v_reasons),
    'missingItems',v_missing,
    'salesOwnershipRestored',true
  );
end;
$part13$;

revoke all on function public.return_sales_project_handover(uuid,integer,text[],jsonb,text) from public,anon;
grant execute on function public.return_sales_project_handover(uuid,integer,text[],jsonb,text) to authenticated,service_role;

create or replace function public.protect_project_task_integrity()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_pm uuid;
  v_role text;
  v_can_manage boolean:=false;
  v_submission_rpc boolean:=coalesce(current_setting('profox.sales_handover_submission_rpc',true),'')='1';
  v_review_rpc boolean:=coalesce(current_setting('profox.sales_handover_review_rpc',true),'')='1';
begin
  if new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by then
    raise exception 'A project task cannot be moved to another project or assigned a different creator.';
  end if;

  select project_manager_id into v_pm from public.projects where id=old.project_id;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  v_can_manage:=auth.role()='service_role' or public.is_admin() or v_role='site_manager' or v_pm=auth.uid();

  if old.workflow_key is not null and (
    new.workflow_key is distinct from old.workflow_key
    or new.workflow_stage is distinct from old.workflow_stage
    or new.required_for_stage is distinct from old.required_for_stage
  ) and auth.role()<>'service_role' then
    raise exception 'Canonical workflow identity and stage requirements are immutable after task creation.';
  end if;

  if old.workflow_key='sales_handover_submission'
     and new.status is distinct from old.status
     and auth.role()<>'service_role'
     and not v_submission_rpc
     and not v_review_rpc then
    raise exception 'Sales handoff submission task status is controlled by the protected Part 13 submission/review workflow.';
  end if;

  if old.workflow_key='sales_handover_review'
     and new.status is distinct from old.status
     and auth.role()<>'service_role'
     and not v_review_rpc then
    raise exception 'Sales handoff review task status is controlled by Accept / Return to Sales.';
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
$part13$;

revoke all on function public.protect_project_task_integrity() from public,anon,authenticated;
grant execute on function public.protect_project_task_integrity() to service_role;

create or replace function public.protect_project_stage_workflow()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_expected text;
  v_incomplete integer:=0;
  v_client_decision boolean:=coalesce(current_setting('profox.project_client_decision_rpc',true),'')='1';
  v_content_handoff boolean:=coalesce(current_setting('profox.content_handoff_rpc',true),'')='1';
  v_latest public.project_sales_handover_attempts%rowtype;
  v_current_refs jsonb;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if old.status<>'Active' then raise exception 'Only an active project may change delivery stage.'; end if;

  if v_content_handoff then
    if old.stage<>'Content' or new.stage<>'UI/UX Design' then
      raise exception 'Invalid protected Content handoff transition.';
    end if;
    select count(*) into v_incomplete
    from public.project_tasks t
    where t.project_id=old.id and t.workflow_stage='Content' and t.required_for_stage is true and t.status<>'Done';
    if v_incomplete>0 then
      raise exception 'Complete all required Content workflow tasks before advancing the project. Remaining: %.',v_incomplete;
    end if;
    return new;
  end if;

  if v_client_decision then
    if old.stage='Client Design Approval' and new.stage in ('Development','UI/UX Design') then return new; end if;
    if old.stage='Client Review' and new.stage='Final Revisions' then return new; end if;
    raise exception 'Invalid client-controlled project transition.';
  end if;

  if not public.is_admin() and old.project_manager_id is distinct from auth.uid() then
    raise exception 'Only the assigned Project Manager or Administrator may advance the project.';
  end if;
  if old.stage in ('Client Design Approval','Client Review') then
    raise exception 'This stage requires a recorded client decision before delivery can continue.';
  end if;

  if old.stage='Sales Handover' then
    if new.stage<>'Content' then
      raise exception 'After Sales Handover, production starts with Content.';
    end if;
    if old.project_manager_id is null then
      raise exception 'Assign an active Project Manager before completing the Sales handoff.';
    end if;
    if not exists(
      select 1 from public.client_onboardings o
      where o.project_id=old.id and o.status='Completed' and o.completed_at is not null
    ) then
      raise exception 'Client onboarding must be completed before Content begins.';
    end if;

    select * into v_latest
    from public.project_sales_handover_attempts a
    where a.project_id=old.id
    order by a.attempt_number desc
    limit 1;
    if v_latest.id is null or v_latest.status<>'ACCEPTED' then
      raise exception 'Delivery must accept the Sales handoff before Content can begin.';
    end if;

    v_current_refs:=public.project_build_sales_handoff_source_refs(old.id);
    if md5(v_current_refs::text)<>v_latest.source_digest then
      raise exception 'Canonical Sales handoff evidence changed after Delivery acceptance. Sales must resubmit the changed handoff for review before Content can begin.';
    end if;
  elsif old.stage in ('Client Onboarding','Requirements') then
    if not public.is_admin() or new.stage<>'Sales Handover' then
      raise exception 'Client Onboarding and Requirements are pre-production milestones. Normalize this legacy project to Sales Handover before delivery.';
    end if;
  else
    v_expected:=case old.stage
      when 'Content' then 'UI/UX Design'
      when 'UI/UX Design' then 'Client Design Approval'
      when 'Development' then 'QA'
      when 'QA' then 'Client Review'
      when 'Final Revisions' then 'Launch'
      when 'Launch' then 'Handover'
      when 'Handover' then 'Completed'
      else null
    end;
    if v_expected is null or new.stage<>v_expected then
      raise exception 'Project stages must follow the approved delivery sequence. Expected next stage: %.',coalesce(v_expected,'none');
    end if;
  end if;

  select count(*) into v_incomplete
  from public.project_tasks t
  where t.project_id=old.id
    and t.workflow_stage=old.stage
    and t.required_for_stage is true
    and t.status<>'Done';
  if v_incomplete>0 then
    raise exception 'Complete all required % workflow tasks before advancing the project. Remaining: %.',old.stage,v_incomplete;
  end if;

  if new.stage='Completed' then
    new.status:='Completed';
    new.completed_at:=coalesce(new.completed_at,now());
  end if;
  return new;
end;
$part13$;

revoke all on function public.protect_project_stage_workflow() from public,anon,authenticated;
grant execute on function public.protect_project_stage_workflow() to service_role;

do $part13_postconditions$
declare
  v_policy jsonb;
  v_project_count integer;
  v_handoff_count integer;
  v_attempt_count integer;
begin
  select config_value into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';

  if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false) is distinct from true
     or coalesce((v_policy->>'policyVersion')::int,0)<>2
     or coalesce((v_policy->>'snapshotSchemaVersion')::int,0)<>2 then
    raise exception 'Part 13 changed protected Part 10B policy state.';
  end if;

  select count(*)::int,count(*) filter(where stage='Sales Handover')::int
  into v_project_count,v_handoff_count
  from public.projects;

  select count(*)::int into v_attempt_count from public.project_sales_handover_attempts;
  if v_attempt_count<>0 then
    raise exception 'Part 13 migration must not fabricate Sales handoff lifecycle rows for existing production projects.';
  end if;

  if to_regprocedure('public.accept_sales_project_handover(uuid,integer)') is null
     or to_regprocedure('public.return_sales_project_handover(uuid,integer,text[],jsonb,text)') is null
     or to_regprocedure('public.project_get_sales_handoff_readiness(uuid)') is null then
    raise exception 'Part 13 protected handoff functions are missing after migration.';
  end if;
end;
$part13_postconditions$;
