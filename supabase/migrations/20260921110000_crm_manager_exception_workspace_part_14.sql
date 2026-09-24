-- PROFOX SALES SOP PART 14
-- Manager Exception Workspace — derived, read-only Sales exception triage.
-- No exception business table is created. Resolution remains source-derived.

do $part14_preflight$
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
    raise exception 'Part 14 requires the active Part 10B quotation Send gate under policy/schema version 2.';
  end if;

  if to_regprocedure('public.crm_get_pipeline_command_center()') is null
     or to_regprocedure('public.crm_get_sales_work_queue(text,text,integer)') is null
     or to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)') is null
     or to_regprocedure('public.crm_get_sales_validation_queue()') is null
     or to_regprocedure('public.get_quotation_approval_requests(text,text,integer,integer)') is null
     or to_regprocedure('public.quotation_approval_reviewer_authorized(uuid,uuid)') is null
     or to_regprocedure('public.crm_get_quotation_sales_reconciliation(uuid)') is null
     or to_regprocedure('public.project_get_sales_handoff_brief(uuid)') is null then
    raise exception 'Part 14 canonical Sales exception dependencies are missing.';
  end if;

  if to_regclass('public.project_sales_handover_attempts') is null
     or to_regclass('public.crm_sales_validations') is null
     or to_regclass('public.crm_sales_promises') is null
     or to_regclass('public.quotation_sales_coverage') is null
     or to_regclass('public.sales_meetings') is null
     or to_regclass('public.crm_activities') is null then
    raise exception 'Part 14 canonical source tables are missing.';
  end if;

  if to_regclass('public.crm_manager_exceptions') is not null
     or to_regclass('public.sales_exception_records') is not null
     or to_regclass('public.manager_approval_items') is not null
     or to_regclass('public.exception_statuses') is not null
     or to_regclass('public.manager_tasks_v2') is not null then
    raise exception 'Part 14 refuses to coexist with a duplicate exception business truth table.';
  end if;
end;
$part14_preflight$;

create or replace function public.crm_get_manager_exception_workspace(
  p_filter text default 'all',
  p_search text default '',
  p_owner_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $part14$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_status text;
  v_filter text:=lower(btrim(coalesce(p_filter,'all')));
  v_search text:=lower(btrim(coalesce(p_search,'')));
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_pipeline jsonb;
  v_work_queue jsonb;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select role,status into v_role,v_status
  from public.user_profiles
  where id=v_uid;

  if v_status is distinct from 'active' or v_role is distinct from 'admin' then
    raise exception 'Manager Exception Workspace access denied.';
  end if;

  if v_filter not in (
    'all','blocking','overdue','proposal_readiness','validations',
    'quotation_approvals','meeting_closeout','decision_process',
    'next_action','stage_sla','returned_handoffs','promise_coverage','overrides'
  ) then
    raise exception 'Unsupported Manager Exception filter.';
  end if;

  -- Reuse existing Part 11 / Pipeline read models rather than legacy next_follow_up_at.
  v_pipeline:=public.crm_get_pipeline_command_center();
  v_work_queue:=public.crm_get_sales_work_queue('team','all',500);

  with
  pipeline_rows as (
    select
      nullif(item->>'id','')::uuid opportunity_id,
      nullif(item->>'leadId','')::uuid lead_id,
      nullif(item->>'salespersonId','')::uuid seller_id,
      coalesce(nullif(item->>'ownerName',''),'Unassigned') owner_name,
      coalesce(nullif(item->>'companyName',''),nullif(item->>'name',''),'Opportunity') company_name,
      item->>'stage' stage,
      item->>'status' status,
      nullif(item->>'stageEnteredAt','')::timestamptz stage_entered_at,
      coalesce(nullif(item->>'stageAgeHours','')::numeric,0) stage_age_hours,
      coalesce(nullif(item->>'stageSlaHours','')::numeric,0) stage_sla_hours,
      nullif(item#>>'{nextActivity,id}','')::uuid next_activity_id,
      nullif(item#>>'{nextActivity,dueAt}','')::timestamptz next_activity_due_at,
      item#>>'{nextActivity,subject}' next_activity_subject
    from jsonb_array_elements(coalesce(v_pipeline->'opportunities','[]'::jsonb)) item
    where item->>'status'='Open'
  ),
  work_queue_rows as (
    select
      nullif(item->>'opportunityId','')::uuid opportunity_id,
      nullif(item->>'leadId','')::uuid lead_id,
      nullif(item->>'ownerId','')::uuid owner_id,
      item->>'queueKind' queue_kind,
      nullif(item->>'activityId','')::uuid activity_id,
      nullif(item->>'dueAt','')::timestamptz due_at,
      item->>'recommendedAction' recommended_action
    from jsonb_array_elements(coalesce(v_work_queue->'items','[]'::jsonb)) item
  ),
  assessed_opportunities as (
    select
      o.id opportunity_id,o.lead_id,o.salesperson_id seller_id,
      coalesce(nullif(up.full_name,''),up.email,'Unassigned') owner_name,
      coalesce(nullif(o.company_name,''),nullif(o.name,''),'Opportunity') company_name,
      o.stage,o.status,o.stage_entered_at,o.updated_at,
      public.crm_get_sales_gate_assessment(o.id,'PROPOSAL_READINESS') assessment
    from public.crm_opportunities o
    left join public.user_profiles up on up.id=o.salesperson_id
    where o.archived_at is null
      and o.status='Open'
      and o.stage in ('Meeting Scheduled','Requirements Confirmed','Quotation Sent','Negotiation / Decision Pending')
  ),
  proposal_exceptions as (
    select
      'proposal-readiness:'||a.opportunity_id::text exception_key,
      'PROPOSAL_READINESS_BLOCKED' exception_type,
      'PROPOSAL_READINESS' category,
      'SALES_GATE' source_system,
      'opportunity' source_entity_type,
      a.opportunity_id source_entity_id,
      a.lead_id,a.opportunity_id,null::uuid project_id,null::uuid quotation_id,
      a.seller_id,a.seller_id owner_id,a.owner_name,
      'Proposal readiness blocked — '||a.company_name title,
      coalesce(a.assessment#>>'{blockers,0,message}','Canonical Proposal Readiness reports a hard blocker.') reason,
      coalesce(a.assessment->>'status','BLOCKED') source_status,
      'BLOCKED' source_severity,
      true blocking,false overdue,
      a.stage_entered_at opened_at,null::timestamptz due_at,a.updated_at source_updated_at,
      'Resolve the exact Proposal Readiness blockers at their canonical Sales source.' recommended_action,
      'Open Proposal Readiness' action_label,
      '/admin/app/crm?tab=crm_leads&lead='||a.lead_id::text action_url,
      jsonb_build_object(
        'stage',a.stage,
        'blockerCount',jsonb_array_length(coalesce(a.assessment->'blockers','[]'::jsonb)),
        'blockerCodes',(select coalesce(jsonb_agg(b->>'code'),'[]'::jsonb) from jsonb_array_elements(coalesce(a.assessment->'blockers','[]'::jsonb)) b)
      ) metadata,
      15 sort_rank
    from assessed_opportunities a
    where a.stage in ('Meeting Scheduled','Requirements Confirmed')
      and a.assessment->>'status'='BLOCKED'
  ),
  validation_exceptions as (
    select
      'sales-validation:'||v.id::text exception_key,
      case when v.status='STALE' then 'SALES_VALIDATION_STALE' else 'SALES_VALIDATION_PENDING' end exception_type,
      'VALIDATIONS' category,
      'SALES_VALIDATION' source_system,
      'validation' source_entity_type,
      v.id source_entity_id,
      v.lead_id,v.opportunity_id,null::uuid project_id,null::uuid quotation_id,
      coalesce(o.salesperson_id,l.salesperson_id,v.requested_by) seller_id,
      case
        when v.status in ('NEEDS_INFORMATION','REJECTED','STALE') then coalesce(o.salesperson_id,l.salesperson_id,v.requested_by)
        else coalesce(v.assigned_reviewer_id,o.salesperson_id,l.salesperson_id,v.requested_by)
      end owner_id,
      case
        when v.status in ('NEEDS_INFORMATION','REJECTED','STALE')
          then coalesce(nullif(seller.full_name,''),seller.email,'Sales')
        else coalesce(nullif(reviewer.full_name,''),reviewer.email,nullif(seller.full_name,''),seller.email,'Reviewer')
      end owner_name,
      replace(v.validation_type,'_',' ')||' validation — '||v.subject title,
      case
        when v.status='STALE' then 'The canonical Validation is stale because its source changed after review.'
        when v.status='NEEDS_INFORMATION' then coalesce(nullif(v.information_requested,''),'The reviewer needs more authoritative Sales information.')
        when v.status='REJECTED' then coalesce(nullif(v.rejection_rework_reason,''),'The Validation was rejected and requires source rework.')
        else 'The canonical Sales Validation still requires reviewer action.'
      end reason,
      v.status source_status,v.severity source_severity,
      (v.severity in ('AMBER','RED') or v.status in ('REJECTED','STALE')) blocking,
      false overdue,
      v.requested_at opened_at,null::timestamptz due_at,v.updated_at source_updated_at,
      case
        when v.status in ('NEEDS_INFORMATION','REJECTED','STALE') then 'Correct the source evidence or resubmit through the existing Sales Validation workflow.'
        else 'Review this item in the existing Sales Validation workflow.'
      end recommended_action,
      'Open Validation' action_label,
      '/admin/app/crm?tab=crm_leads&lead='||v.lead_id::text action_url,
      jsonb_build_object(
        'validationType',v.validation_type,
        'reviewerTeam',v.reviewer_team,
        'assignedReviewerId',v.assigned_reviewer_id,
        'sourceChangedAt',v.source_changed_at
      ) metadata,
      case when v.severity='RED' then 10 when v.severity='AMBER' then 20 else 40 end sort_rank
    from public.crm_sales_validations v
    join public.crm_leads l on l.id=v.lead_id
    left join public.crm_opportunities o on o.id=v.opportunity_id
    left join public.user_profiles seller on seller.id=coalesce(o.salesperson_id,l.salesperson_id,v.requested_by)
    left join public.user_profiles reviewer on reviewer.id=v.assigned_reviewer_id
    where v.status in ('PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE')
      and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=v.id)
      and public.crm_sales_validation_reviewer_eligible(v.validation_type,v.reviewer_team,v_uid)
      and (v.assigned_reviewer_id is null or v.assigned_reviewer_id=v_uid or public.is_admin())
  ),
  quotation_approval_exceptions as (
    select
      'quotation-approval:'||q.id::text exception_key,
      case when q.approval_decision='changes_requested' then 'QUOTATION_CHANGES_REQUESTED' else 'QUOTATION_APPROVAL_PENDING' end exception_type,
      'QUOTATION_APPROVALS' category,
      'QUOTATION_APPROVAL' source_system,
      'quotation' source_entity_type,
      q.id source_entity_id,
      o.lead_id,q.opportunity_id,null::uuid project_id,q.id quotation_id,
      q.salesperson_id seller_id,q.salesperson_id owner_id,
      coalesce(nullif(seller.full_name,''),seller.email,'Sales') owner_name,
      case when q.approval_decision='changes_requested'
        then 'Quotation changes requested — '||q.quotation_number
        else 'Quotation approval pending — '||q.quotation_number end title,
      case when q.approval_decision='changes_requested'
        then coalesce(nullif(q.approval_decision_note,''),nullif(q.change_request_note,''),'The canonical reviewer requested quotation changes.')
        else coalesce(nullif(q.approval_reason,''),'This quotation requires canonical commercial approval before it can proceed.') end reason,
      coalesce(q.approval_decision,q.status) source_status,
      null::text source_severity,
      true blocking,false overdue,
      coalesce(q.approval_requested_at,q.updated_at) opened_at,null::timestamptz due_at,q.updated_at source_updated_at,
      case when q.approval_decision='changes_requested'
        then 'Open the canonical Quotation workflow and make the requested correction.'
        else 'Review this quotation through the existing Quotation Approval Center.' end recommended_action,
      'Open Quotation Approval' action_label,
      '/admin/quotation-approvals/'||q.id::text action_url,
      jsonb_build_object(
        'quotationNumber',q.quotation_number,
        'revisionNumber',q.revision_number,
        'approvalRequired',q.approval_required
      ) metadata,
      20 sort_rank
    from public.quotations q
    left join public.crm_opportunities o on o.id=q.opportunity_id
    left join public.user_profiles seller on seller.id=q.salesperson_id
    where q.approval_requested_at is not null
      and (
        (q.status='Ready for Approval' and q.approval_decision='pending')
        or q.approval_decision='changes_requested'
      )
      and public.quotation_approval_reviewer_authorized(q.id,v_uid)
  ),
  meeting_closeout_exceptions as (
    select
      'meeting-closeout:'||m.id::text exception_key,
      'MEETING_CLOSEOUT_MISSING' exception_type,
      'MEETING_CLOSEOUT' category,
      'SALES_MEETING' source_system,
      'meeting' source_entity_type,
      m.id source_entity_id,
      m.lead_id,m.opportunity_id,null::uuid project_id,null::uuid quotation_id,
      m.salesperson_id seller_id,m.salesperson_id owner_id,
      coalesce(nullif(seller.full_name,''),seller.email,'Sales') owner_name,
      'Meeting close-out incomplete — '||coalesce(nullif(m.title,''),'Sales meeting') title,
      array_to_string(array_remove(array[
        case when nullif(btrim(coalesce(m.outcome,'')),'') is null then 'Outcome is missing' end,
        case when coalesce(o.status,'Open')='Open' and nullif(btrim(coalesce(m.next_step,'')),'') is null then 'Next Step is missing' end,
        case when coalesce(o.status,'Open')='Open' and m.follow_up_at is null then 'Follow-Up timing is missing' end
      ],null),'; ') reason,
      m.status source_status,null::text source_severity,
      true blocking,false overdue,
      coalesce(m.completed_at,m.updated_at) opened_at,null::timestamptz due_at,m.updated_at source_updated_at,
      'Finish the required close-out fields in the existing Meeting Management workspace.' recommended_action,
      'Open Meeting' action_label,
      '/admin/meeting-manage/'||m.id::text action_url,
      jsonb_build_object('meetingType',m.meeting_type,'opportunityStatus',o.status) metadata,
      25 sort_rank
    from public.sales_meetings m
    left join public.crm_opportunities o on o.id=m.opportunity_id
    left join public.user_profiles seller on seller.id=m.salesperson_id
    where m.status='Completed'
      and (m.lead_id is not null or m.opportunity_id is not null)
      and (
        nullif(btrim(coalesce(m.outcome,'')),'') is null
        or (coalesce(o.status,'Open')='Open' and nullif(btrim(coalesce(m.next_step,'')),'') is null)
        or (coalesce(o.status,'Open')='Open' and m.follow_up_at is null)
      )
  ),
  decision_process_exceptions as (
    select
      'decision-authority:'||a.opportunity_id::text exception_key,
      'DECISION_AUTHORITY_MISSING' exception_type,
      'DECISION_PROCESS' category,
      'PROPOSAL_READINESS' source_system,
      'opportunity' source_entity_type,
      a.opportunity_id source_entity_id,
      a.lead_id,a.opportunity_id,null::uuid project_id,null::uuid quotation_id,
      a.seller_id,a.seller_id owner_id,a.owner_name,
      'Decision process unresolved — '||a.company_name title,
      'The canonical Sales readiness evaluator reports the Decision Process dimension as BLOCKED for the current deal stage.' reason,
      'BLOCKED' source_status,'BLOCKED' source_severity,
      true blocking,false overdue,
      a.stage_entered_at opened_at,null::timestamptz due_at,a.updated_at source_updated_at,
      'Resolve decision-maker / approval-process evidence in structured Requirements and Discovery.' recommended_action,
      'Open Decision Requirements' action_label,
      '/admin/app/crm?tab=crm_leads&lead='||a.lead_id::text action_url,
      jsonb_build_object(
        'stage',a.stage,
        'dimension','DECISION_PROCESS',
        'blockerCodes',(
          select coalesce(jsonb_agg(b->>'code'),'[]'::jsonb)
          from jsonb_array_elements(coalesce(a.assessment->'blockers','[]'::jsonb)) b
          where b->>'category'='DECISION_BUYING_PROCESS'
        )
      ) metadata,
      15 sort_rank
    from assessed_opportunities a
    where a.stage in ('Requirements Confirmed','Quotation Sent','Negotiation / Decision Pending')
      and exists(
        select 1
        from jsonb_array_elements(coalesce(a.assessment->'dimensions','[]'::jsonb)) d
        where d->>'key'='DECISION_PROCESS' and d->>'status'='BLOCKED'
      )
  ),
  next_action_missing_exceptions as (
    select
      'next-action-missing:'||p.opportunity_id::text exception_key,
      'NEXT_ACTION_MISSING' exception_type,
      'NEXT_ACTION' category,
      'CRM_ACTIVITIES' source_system,
      'opportunity' source_entity_type,
      p.opportunity_id source_entity_id,
      p.lead_id,p.opportunity_id,null::uuid project_id,null::uuid quotation_id,
      p.seller_id,p.seller_id owner_id,p.owner_name,
      'No next action — '||p.company_name title,
      'This open opportunity has no canonical opportunity-linked Scheduled CRM activity.' reason,
      'MISSING' source_status,null::text source_severity,
      true blocking,false overdue,
      p.stage_entered_at opened_at,null::timestamptz due_at,p.stage_entered_at source_updated_at,
      'Schedule the real next committed opportunity action in Activities & Follow-Up.' recommended_action,
      'Open Activities' action_label,
      '/admin/app/crm?tab=activities' action_url,
      jsonb_build_object('stage',p.stage) metadata,
      20 sort_rank
    from pipeline_rows p
    where p.next_activity_id is null
      and exists(
        select 1 from work_queue_rows w
        where w.opportunity_id=p.opportunity_id
          and w.queue_kind='missing_next_action'
      )
  ),
  next_action_overdue_exceptions as (
    select
      'next-action-overdue:'||p.next_activity_id::text exception_key,
      'NEXT_ACTION_OVERDUE' exception_type,
      'NEXT_ACTION' category,
      'CRM_ACTIVITIES' source_system,
      'activity' source_entity_type,
      p.next_activity_id source_entity_id,
      p.lead_id,p.opportunity_id,null::uuid project_id,null::uuid quotation_id,
      p.seller_id,p.seller_id owner_id,p.owner_name,
      'Next action overdue — '||p.company_name title,
      coalesce(nullif(p.next_activity_subject,''),'The next committed opportunity action is overdue.') reason,
      'SCHEDULED_OVERDUE' source_status,null::text source_severity,
      true blocking,true overdue,
      p.stage_entered_at opened_at,p.next_activity_due_at due_at,p.next_activity_due_at source_updated_at,
      'Complete or reschedule this exact canonical opportunity-linked activity with a real outcome.' recommended_action,
      'Open Overdue Activity' action_label,
      '/admin/app/crm?tab=activities&focusActivityId='||p.next_activity_id::text action_url,
      jsonb_build_object('stage',p.stage,'activityId',p.next_activity_id) metadata,
      10 sort_rank
    from pipeline_rows p
    where p.next_activity_id is not null
      and p.next_activity_due_at<now()
  ),
  stage_sla_exceptions as (
    select
      'stage-sla:'||p.opportunity_id::text exception_key,
      'STAGE_SLA_EXCEEDED' exception_type,
      'STAGE_SLA' category,
      'PIPELINE_COMMAND_CENTER' source_system,
      'opportunity' source_entity_type,
      p.opportunity_id source_entity_id,
      p.lead_id,p.opportunity_id,null::uuid project_id,null::uuid quotation_id,
      p.seller_id,p.seller_id owner_id,p.owner_name,
      'Stage SLA exceeded — '||p.company_name title,
      p.stage||' has exceeded its configured '||trim(to_char(p.stage_sla_hours,'FM999999990.##'))||'-hour SLA.' reason,
      p.stage source_status,null::text source_severity,
      true blocking,true overdue,
      p.stage_entered_at opened_at,
      case when p.stage_entered_at is not null then p.stage_entered_at + ((p.stage_sla_hours::text)||' hours')::interval else null end due_at,
      p.stage_entered_at source_updated_at,
      'Review the opportunity in the canonical Pipeline and address the blocking Sales work.' recommended_action,
      'Open Opportunity' action_label,
      '/admin/app/crm?tab=pipeline' action_url,
      jsonb_build_object('stage',p.stage,'stageAgeHours',p.stage_age_hours,'stageSlaHours',p.stage_sla_hours) metadata,
      20 sort_rank
    from pipeline_rows p
    where p.stage_sla_hours>0
      and p.stage_age_hours>p.stage_sla_hours
  ),
  current_handoff as (
    select distinct on (a.project_id)
      a.*,p.project_number,p.project_name,p.source_opportunity_id,
      o.lead_id,o.salesperson_id,
      coalesce(nullif(seller.full_name,''),seller.email,'Sales') seller_name,
      coalesce(nullif(reviewer.full_name,''),reviewer.email,'Delivery reviewer') reviewer_name
    from public.project_sales_handover_attempts a
    join public.projects p on p.id=a.project_id
    left join public.crm_opportunities o on o.id=p.source_opportunity_id
    left join public.user_profiles seller on seller.id=o.salesperson_id
    left join public.user_profiles reviewer on reviewer.id=a.reviewed_by
    order by a.project_id,a.attempt_number desc
  ),
  returned_handoff_exceptions as (
    select
      'handoff-returned:'||h.id::text exception_key,
      'HANDOFF_RETURNED_TO_SALES' exception_type,
      'RETURNED_HANDOFFS' category,
      'PART13_HANDOFF' source_system,
      'handoff_attempt' source_entity_type,
      h.id source_entity_id,
      h.lead_id,h.source_opportunity_id opportunity_id,h.project_id,null::uuid quotation_id,
      h.salesperson_id seller_id,h.salesperson_id owner_id,h.seller_name owner_name,
      'Sales handoff returned — '||coalesce(nullif(h.project_name,''),h.project_number,'Project') title,
      coalesce(nullif(h.return_notes,''),'Delivery returned this handoff to Sales for correction.') reason,
      h.status source_status,null::text source_severity,
      true blocking,false overdue,
      h.reviewed_at opened_at,null::timestamptz due_at,h.reviewed_at source_updated_at,
      'Correct the canonical Sales source issues and resubmit through the Part 13 handoff workflow.' recommended_action,
      'Open Sales Handoff' action_label,
      '/admin/project-handover/'||h.project_id::text action_url,
      jsonb_build_object(
        'attemptNumber',h.attempt_number,
        'returnReasonCodes',to_jsonb(h.return_reason_codes),
        'missingItems',(
          select coalesce(jsonb_agg(jsonb_build_object('label',x->>'label','sourceType',x->>'sourceType','actionUrl',x->>'actionUrl')),'[]'::jsonb)
          from jsonb_array_elements(coalesce(h.missing_items,'[]'::jsonb)) x
        ),
        'reviewerName',h.reviewer_name
      ) metadata,
      15 sort_rank
    from current_handoff h
    where h.status='RETURNED_TO_SALES'
  ),
  latest_quotations as (
    select distinct on (q.opportunity_id)
      q.*
    from public.quotations q
    where q.opportunity_id is not null
      and q.superseded_by_id is null
    order by q.opportunity_id,q.created_at desc,q.id
  ),
  promise_coverage_exceptions as (
    select
      'promise-coverage:'||q.id::text||':'||p.id::text exception_key,
      'PROMISE_QUOTE_COVERAGE_BLOCKED' exception_type,
      'PROMISE_COVERAGE' category,
      'PART10_RECONCILIATION' source_system,
      'sales_promise' source_entity_type,
      p.id source_entity_id,
      p.lead_id,p.opportunity_id,null::uuid project_id,q.id quotation_id,
      o.salesperson_id seller_id,o.salesperson_id owner_id,
      coalesce(nullif(seller.full_name,''),seller.email,'Sales') owner_name,
      'Promise not represented in quote — '||q.quotation_number title,
      case
        when cov.id is null then 'This active client-facing Sales Promise has no current quotation coverage mapping.'
        else 'Current quotation coverage is '||cov.coverage_status||' for this active Sales Promise.'
      end reason,
      coalesce(cov.coverage_status,'UNMAPPED') source_status,null::text source_severity,
      true blocking,false overdue,
      p.promised_at opened_at,null::timestamptz due_at,greatest(p.updated_at,coalesce(cov.updated_at,p.updated_at),q.updated_at) source_updated_at,
      'Resolve the Promise through the canonical Promise Register / Quotation Sales Reconciliation workflow.' recommended_action,
      'Open Quotation Reconciliation' action_label,
      '/admin/quotations/'||q.id::text action_url,
      jsonb_build_object('promiseType',p.promise_type,'quotationNumber',q.quotation_number,'coverageStatus',coalesce(cov.coverage_status,'UNMAPPED')) metadata,
      15 sort_rank
    from public.crm_sales_promises p
    join public.crm_opportunities o on o.id=p.opportunity_id
    join latest_quotations q on q.opportunity_id=p.opportunity_id
    left join public.user_profiles seller on seller.id=o.salesperson_id
    left join lateral (
      select c.*
      from public.quotation_sales_coverage c
      where c.quotation_id=q.id
        and c.promise_id=p.id
        and c.is_current
      order by c.updated_at desc,c.id
      limit 1
    ) cov on true
    where p.record_state='ACTIVE'
      and p.source_type<>'INTERNAL_DRAFT'
      and not exists(select 1 from public.crm_sales_promises child where child.supersedes_promise_id=p.id)
      and (cov.id is null or cov.coverage_status in ('UNMAPPED','PARTIAL','CONFLICT','STALE'))
  ),
  override_events as (
    select q.salesperson_id seller_id,q.opportunity_id,'QUOTATION_DURATION_OVERRIDE' override_type,q.duration_override_at occurred_at,q.id source_id
    from public.quotations q
    where q.duration_override_at is not null and q.salesperson_id is not null
    union all
    select q.salesperson_id,q.opportunity_id,'REVENUE_DISTRIBUTION_OVERRIDE',q.revenue_distribution_override_at,q.id
    from public.quotations q
    where q.revenue_distribution_override_at is not null and q.salesperson_id is not null
    union all
    select l.salesperson_id,l.converted_opportunity_id,'CRM_AUDITED_OVERRIDE',e.occurred_at,e.id
    from public.crm_lead_events e
    join public.crm_leads l on l.id=e.lead_id
    where lower(coalesce(e.event_type,'')) like '%override%'
      and l.salesperson_id is not null
  ),
  repeated_override_exceptions as (
    select
      'repeated-sop-override:'||x.seller_id::text exception_key,
      'REPEATED_SOP_OVERRIDE' exception_type,
      'OVERRIDES' category,
      'AUDIT_EVIDENCE' source_system,
      'seller' source_entity_type,
      x.seller_id source_entity_id,
      null::uuid lead_id,null::uuid opportunity_id,null::uuid project_id,null::uuid quotation_id,
      x.seller_id seller_id,x.seller_id owner_id,
      coalesce(nullif(up.full_name,''),up.email,'Sales') owner_name,
      'Repeated audited SOP overrides — '||coalesce(nullif(up.full_name,''),up.email,'Sales') title,
      x.event_count::text||' real audited override events are recorded for this Seller.' reason,
      'AUDITED' source_status,null::text source_severity,
      false blocking,false overdue,
      x.first_at opened_at,null::timestamptz due_at,x.latest_at source_updated_at,
      'Review the underlying audited override history. Use only the existing source workflows for any future exception decision.' recommended_action,
      'Open Quotations' action_label,
      '/admin/app/sales?tab=quotations' action_url,
      jsonb_build_object('eventCount',x.event_count,'overrideTypes',x.override_types) metadata,
      30 sort_rank
    from (
      select seller_id,count(*)::int event_count,min(occurred_at) first_at,max(occurred_at) latest_at,
             jsonb_agg(distinct override_type) override_types
      from override_events
      group by seller_id
      having count(*)>=2
    ) x
    left join public.user_profiles up on up.id=x.seller_id
  ),
  all_items as (
    select * from proposal_exceptions
    union all select * from validation_exceptions
    union all select * from quotation_approval_exceptions
    union all select * from meeting_closeout_exceptions
    union all select * from decision_process_exceptions
    union all select * from next_action_missing_exceptions
    union all select * from next_action_overdue_exceptions
    union all select * from stage_sla_exceptions
    union all select * from returned_handoff_exceptions
    union all select * from promise_coverage_exceptions
    union all select * from repeated_override_exceptions
  ),
  deduped as (
    select *
    from (
      select a.*,row_number() over(partition by a.exception_key order by a.sort_rank,a.source_updated_at desc nulls last) rn
      from all_items a
    ) x
    where rn=1
  ),
  scoped as (
    select *
    from deduped d
    where (p_owner_id is null or d.owner_id=p_owner_id)
      and (
        v_search=''
        or lower(concat_ws(' ',d.exception_key,d.exception_type,d.title,d.reason,d.owner_name,d.source_status,coalesce(d.source_severity,''))) like '%'||v_search||'%'
      )
      and (
        v_filter='all'
        or (v_filter='blocking' and d.blocking)
        or (v_filter='overdue' and d.overdue)
        or (v_filter='proposal_readiness' and d.category='PROPOSAL_READINESS')
        or (v_filter='validations' and d.category='VALIDATIONS')
        or (v_filter='quotation_approvals' and d.category='QUOTATION_APPROVALS')
        or (v_filter='meeting_closeout' and d.category='MEETING_CLOSEOUT')
        or (v_filter='decision_process' and d.category='DECISION_PROCESS')
        or (v_filter='next_action' and d.category='NEXT_ACTION')
        or (v_filter='stage_sla' and d.category='STAGE_SLA')
        or (v_filter='returned_handoffs' and d.category='RETURNED_HANDOFFS')
        or (v_filter='promise_coverage' and d.category='PROMISE_COVERAGE')
        or (v_filter='overrides' and d.category='OVERRIDES')
      )
  ),
  counted as (
    select count(*) over() total_count,s.*
    from scoped s
  ),
  paged as (
    select *
    from counted
    order by sort_rank asc,overdue desc,opened_at asc nulls last,exception_key
    limit v_limit offset v_offset
  ),
  counts as (
    select jsonb_build_object(
      'total',count(*),
      'blocking',count(*) filter(where blocking),
      'overdue',count(*) filter(where overdue),
      'pendingReview',count(*) filter(where category in ('VALIDATIONS','QUOTATION_APPROVALS')),
      'commercial',count(*) filter(where category='QUOTATION_APPROVALS' or (category='VALIDATIONS' and metadata->>'validationType'='COMMERCIAL')),
      'technical',count(*) filter(where category='VALIDATIONS' and metadata->>'validationType'='TECHNICAL'),
      'timeline',count(*) filter(where category='VALIDATIONS' and metadata->>'validationType'='TIMELINE'),
      'meetingCloseOut',count(*) filter(where category='MEETING_CLOSEOUT'),
      'nextAction',count(*) filter(where category='NEXT_ACTION'),
      'stageSla',count(*) filter(where category='STAGE_SLA'),
      'returnedHandoff',count(*) filter(where category='RETURNED_HANDOFFS'),
      'promiseCoverage',count(*) filter(where category='PROMISE_COVERAGE'),
      'proposalReadiness',count(*) filter(where category='PROPOSAL_READINESS'),
      'decisionProcess',count(*) filter(where category='DECISION_PROCESS'),
      'repeatedOverride',count(*) filter(where category='OVERRIDES')
    ) value
    from scoped
  ),
  owners as (
    select coalesce(jsonb_agg(jsonb_build_object('id',owner_id,'name',owner_name,'count',item_count) order by owner_name),'[]'::jsonb) value
    from (
      select owner_id,max(owner_name) owner_name,count(*)::int item_count
      from scoped
      where owner_id is not null
      group by owner_id
    ) x
  )
  select jsonb_build_object(
    'generatedAt',now(),
    'scope','team',
    'authority','ADMIN_ONLY',
    'resolutionPolicy','SOURCE_DERIVED',
    'filter',v_filter,
    'search',coalesce(p_search,''),
    'ownerId',p_owner_id,
    'counts',(select value from counts),
    'owners',(select value from owners),
    'total',coalesce((select max(total_count) from counted),0),
    'offset',v_offset,
    'limit',v_limit,
    'hasMore',v_offset+v_limit<coalesce((select max(total_count) from counted),0),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'exceptionKey',p.exception_key,
        'exceptionType',p.exception_type,
        'category',p.category,
        'sourceSystem',p.source_system,
        'sourceEntityType',p.source_entity_type,
        'sourceEntityId',p.source_entity_id,
        'leadId',p.lead_id,
        'opportunityId',p.opportunity_id,
        'projectId',p.project_id,
        'quotationId',p.quotation_id,
        'sellerId',p.seller_id,
        'ownerId',p.owner_id,
        'ownerName',p.owner_name,
        'title',p.title,
        'reason',p.reason,
        'sourceStatus',p.source_status,
        'sourceSeverity',p.source_severity,
        'blocking',p.blocking,
        'overdue',p.overdue,
        'workspacePriority',case when p.sort_rank<=10 then 'CRITICAL' when p.sort_rank<=20 then 'HIGH' else 'NORMAL' end,
        'openedAt',p.opened_at,
        'ageHours',case when p.opened_at is null then null else round((extract(epoch from (now()-p.opened_at))/3600.0)::numeric,1) end,
        'dueAt',p.due_at,
        'sourceUpdatedAt',p.source_updated_at,
        'recommendedAction',p.recommended_action,
        'actionLabel',p.action_label,
        'actionUrl',p.action_url,
        'metadata',p.metadata
      ) order by p.sort_rank asc,p.overdue desc,p.opened_at asc nulls last,p.exception_key)
      from paged p
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$part14$;

revoke all on function public.crm_get_manager_exception_workspace(text,text,uuid,integer,integer) from public,anon;
grant execute on function public.crm_get_manager_exception_workspace(text,text,uuid,integer,integer) to authenticated,service_role;

do $part14_postconditions$
declare
  v_policy jsonb;
begin
  select config_value into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';

  if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false) is distinct from true
     or coalesce((v_policy->>'policyVersion')::int,0)<>2
     or coalesce((v_policy->>'snapshotSchemaVersion')::int,0)<>2 then
    raise exception 'Part 14 changed protected Part 10B policy state.';
  end if;

  if to_regprocedure('public.crm_get_manager_exception_workspace(text,text,uuid,integer,integer)') is null then
    raise exception 'Part 14 Manager Exception Workspace RPC is missing.';
  end if;

  if to_regclass('public.crm_manager_exceptions') is not null
     or to_regclass('public.sales_exception_records') is not null
     or to_regclass('public.manager_approval_items') is not null
     or to_regclass('public.exception_statuses') is not null
     or to_regclass('public.manager_tasks_v2') is not null then
    raise exception 'Part 14 created a prohibited duplicate exception truth table.';
  end if;
end;
$part14_postconditions$;
