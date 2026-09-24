-- Part 10B foundation: immutable send-time Sales snapshot + universal quotation Send invariant.
-- IMPORTANT: this migration intentionally keeps finalQuotationSendGateActive=false.
-- Production activation is a separate, explicit step after authenticated production UI verification.

alter table public.quotations
  add column if not exists sales_scope_snapshot jsonb,
  add column if not exists sales_scope_snapshot_at timestamptz,
  add column if not exists sales_scope_snapshot_schema_version integer;

comment on column public.quotations.sales_scope_snapshot is
  'Internal immutable Part 10B Sales reconciliation evidence captured atomically on the successful transition to Sent. Not a customer presentation payload.';
comment on column public.quotations.sales_scope_snapshot_at is
  'Server-controlled timestamp when the immutable Part 10B Sales scope snapshot was captured.';
comment on column public.quotations.sales_scope_snapshot_schema_version is
  'Server-controlled schema version for sales_scope_snapshot.';

-- Evolve the existing Part 10A policy in place. Do not create a second active policy.
update public.system_configuration
set config_value = jsonb_set(
  jsonb_set(
    jsonb_set(coalesce(config_value,'{}'::jsonb), '{policyVersion}', '2'::jsonb, true),
    '{snapshotSchemaVersion}', '2'::jsonb, true
  ),
  '{finalQuotationSendGateActive}', 'false'::jsonb, true
)
where config_key='crm_quotation_sales_reconciliation_policy_v1';

do $part10b_policy_guard$
begin
  if not exists (
    select 1
    from public.system_configuration
    where config_key='crm_quotation_sales_reconciliation_policy_v1'
      and config_value->>'policyKey'='crm_quotation_sales_reconciliation_policy_v1'
      and coalesce((config_value->>'policyVersion')::integer,0)=2
      and coalesce((config_value->>'finalQuotationSendGateActive')::boolean,true)=false
  ) then
    raise exception 'Part 10B foundation requires the canonical reconciliation policy at version 2 with activation still false.';
  end if;
end;
$part10b_policy_guard$;

-- Evolve the single canonical Part 10A evaluator in place. The source-preserving patch is
-- deliberately guarded so a future unexpected evaluator shape fails closed instead of
-- silently creating a second evaluator or dropping newer reconciliation behavior.
do $part10b_evaluator$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.crm_get_quotation_sales_reconciliation(uuid)'::regprocedure)
    into v_def;
  if v_def is null then
    raise exception 'Canonical quotation Sales reconciliation evaluator is missing.';
  end if;
  v_new:=v_def;

  if strpos(v_new,$needle$nullif(v_policy->>'policyVersion','')::int is distinct from 1$needle$)=0 then
    raise exception 'Unexpected reconciliation evaluator policy-version guard.';
  end if;
  v_new:=replace(
    v_new,
    $needle$nullif(v_policy->>'policyVersion','')::int is distinct from 1$needle$,
    $replacement$coalesce(nullif(v_policy->>'policyVersion','')::int,0) not in (1,2)$replacement$
  );

  if strpos(v_new,$needle$if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,true) then raise exception 'Part 10A policy must keep final quotation send enforcement inactive.'; end if;$needle$)=0 then
    raise exception 'Unexpected reconciliation evaluator Part 10A-only activation guard.';
  end if;
  v_new:=replace(
    v_new,
    $needle$if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,true) then raise exception 'Part 10A policy must keep final quotation send enforcement inactive.'; end if;$needle$,
    $replacement$-- Part 10B: the canonical evaluator supports both staged (false) and active (true) send-gate policy states.$replacement$
  );

  v_new:=replace(
    v_new,
    $needle$'policyVersion',1$needle$,
    $replacement$'policyVersion',coalesce(nullif(v_policy->>'policyVersion','')::int,1)$replacement$
  );
  v_new:=replace(
    v_new,
    $needle$'finalQuotationSendGateActive',false$needle$,
    $replacement$'finalQuotationSendGateActive',coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false)$replacement$
  );

  if strpos(v_new,$needle$v_legacy:=v_historical and v_current_coverage_count=0;$needle$)=0 then
    raise exception 'Unexpected reconciliation legacy-state expression.';
  end if;
  v_new:=replace(
    v_new,
    $needle$v_legacy:=v_historical and v_current_coverage_count=0;$needle$,
    $replacement$v_legacy:=v_historical and v_current_coverage_count=0 and v_q.sales_scope_snapshot is null;$replacement$
  );

  if strpos(v_new,$needle$v_snapshot_state:=case when v_legacy then 'LEGACY_NOT_CAPTURED' else 'NOT_FROZEN' end;$needle$)=0 then
    raise exception 'Unexpected reconciliation historical snapshot-state expression.';
  end if;
  v_new:=replace(
    v_new,
    $needle$v_snapshot_state:=case when v_legacy then 'LEGACY_NOT_CAPTURED' else 'NOT_FROZEN' end;$needle$,
    $replacement$v_snapshot_state:=case when v_q.sales_scope_snapshot is not null then 'SNAPSHOT_CAPTURED' when v_legacy then 'LEGACY_NOT_CAPTURED' else 'NOT_FROZEN' end;$replacement$
  );

  v_new:=replace(
    v_new,
    $needle$jsonb_build_object('key','PROMISE_COVERAGE','status',v_promise_status,'coverageState',case when v_historical then 'LEGACY_NOT_CAPTURED' when v_promise_count=0 then 'NO_MATERIAL_PROMISES_REGISTERED' when v_promise_status='PASS' then 'COVERED' else 'NEEDS_RECONCILIATION' end,'activeCount',v_promise_count,'coveredCount',v_promise_covered,'draftCount',jsonb_array_length(v_draft_promise_rows))$needle$,
    $replacement$jsonb_build_object('key','PROMISE_COVERAGE','status',case when v_historical and v_q.sales_scope_snapshot is not null then coalesce(v_q.sales_scope_snapshot#>>'{promiseCoverageResult,status}','PASS') else v_promise_status end,'coverageState',case when v_historical and v_q.sales_scope_snapshot is not null then coalesce(v_q.sales_scope_snapshot#>>'{promiseCoverageResult,coverageState}','COVERED') when v_historical then 'LEGACY_NOT_CAPTURED' when v_promise_count=0 then 'NO_MATERIAL_PROMISES_REGISTERED' when v_promise_status='PASS' then 'COVERED' else 'NEEDS_RECONCILIATION' end,'activeCount',v_promise_count,'coveredCount',v_promise_covered,'draftCount',jsonb_array_length(v_draft_promise_rows))$replacement$
  );
  v_new:=replace(
    v_new,
    $needle$jsonb_build_object('key','FINAL_SCOPE_RECONCILIATION','status',v_scope_status,'coverageState',case when v_historical then 'LEGACY_NOT_CAPTURED' when v_scope_status='PASS' then 'RECONCILED' else 'NEEDS_RECONCILIATION' end,'activeCount',v_condition_count,'coveredCount',v_condition_covered)$needle$,
    $replacement$jsonb_build_object('key','FINAL_SCOPE_RECONCILIATION','status',case when v_historical and v_q.sales_scope_snapshot is not null then coalesce(v_q.sales_scope_snapshot#>>'{finalScopeReconciliationResult,status}','PASS') else v_scope_status end,'coverageState',case when v_historical and v_q.sales_scope_snapshot is not null then coalesce(v_q.sales_scope_snapshot#>>'{finalScopeReconciliationResult,coverageState}','RECONCILED') when v_historical then 'LEGACY_NOT_CAPTURED' when v_scope_status='PASS' then 'RECONCILED' else 'NEEDS_RECONCILIATION' end,'activeCount',v_condition_count,'coveredCount',v_condition_covered)$replacement$
  );
  v_new:=replace(
    v_new,
    $needle$jsonb_build_object('key','QUOTATION_SNAPSHOT_COVERAGE','status',case when v_historical then 'WARNING' when v_ready_snapshot then 'PASS' else 'BLOCKED' end,'coverageState',v_snapshot_state)$needle$,
    $replacement$jsonb_build_object('key','QUOTATION_SNAPSHOT_COVERAGE','status',case when v_historical and v_q.sales_scope_snapshot is not null then 'PASS' when v_historical then 'WARNING' when v_ready_snapshot then 'PASS' else 'BLOCKED' end,'coverageState',v_snapshot_state)$replacement$
  );

  if strpos(v_new,$needle$'historicalQuotation',v_historical,'legacyCoverageNotCaptured',v_legacy,$needle$)=0 then
    raise exception 'Unexpected reconciliation historical metadata expression.';
  end if;
  v_new:=replace(
    v_new,
    $needle$'historicalQuotation',v_historical,'legacyCoverageNotCaptured',v_legacy,$needle$,
    $replacement$'historicalQuotation',v_historical,'legacyCoverageNotCaptured',v_legacy,
      'salesScopeSnapshot',case
        when v_q.sales_scope_snapshot is null then jsonb_build_object(
          'captured',false,
          'status',case when v_historical then 'LEGACY_NOT_CAPTURED' else v_snapshot_state end,
          'immutable',false
        )
        else jsonb_build_object(
          'captured',true,
          'status','SNAPSHOT_CAPTURED',
          'capturedAt',v_q.sales_scope_snapshot_at,
          'schemaVersion',v_q.sales_scope_snapshot_schema_version,
          'quotationRevision',v_q.revision_number,
          'immutable',true,
          'finalReconciliationStatus',v_q.sales_scope_snapshot->>'finalReconciliationStatus',
          'promiseCoverageStatus',v_q.sales_scope_snapshot#>>'{promiseCoverageResult,status}',
          'finalScopeReconciliationStatus',v_q.sales_scope_snapshot#>>'{finalScopeReconciliationResult,status}'
        )
      end,$replacement$
  );

  execute v_new;
end;
$part10b_evaluator$;

-- Coverage remediation must continue to work after the gate is activated.
do $part10b_coverage_review$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.crm_review_quotation_sales_coverage(uuid,text,uuid,text,text,text,uuid,text)'::regprocedure)
    into v_def;
  if v_def is null then raise exception 'Canonical quotation Sales coverage review function is missing.'; end if;
  v_new:=v_def;
  if strpos(v_new,$needle$nullif(v_policy->>'policyVersion','')::int is distinct from 1$needle$)=0 then
    raise exception 'Unexpected coverage-review policy-version guard.';
  end if;
  v_new:=replace(
    v_new,
    $needle$nullif(v_policy->>'policyVersion','')::int is distinct from 1$needle$,
    $replacement$coalesce(nullif(v_policy->>'policyVersion','')::int,0) not in (1,2)$replacement$
  );
  if strpos(v_new,$needle$if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,true) then raise exception 'Part 10A policy must keep final quotation send enforcement inactive.'; end if;$needle$)=0 then
    raise exception 'Unexpected coverage-review Part 10A-only activation guard.';
  end if;
  v_new:=replace(
    v_new,
    $needle$if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,true) then raise exception 'Part 10A policy must keep final quotation send enforcement inactive.'; end if;$needle$,
    $replacement$-- Part 10B keeps canonical coverage remediation available while the final gate is active.$replacement$
  );
  execute v_new;
end;
$part10b_coverage_review$;

create or replace function public.crm_build_quotation_sales_scope_snapshot(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_assessment jsonb;
  v_q public.quotations%rowtype;
  v_lead_id uuid;
  v_scope jsonb:='[]'::jsonb;
  v_promises jsonb:='[]'::jsonb;
  v_products jsonb:='[]'::jsonb;
  v_coverage_refs jsonb:='[]'::jsonb;
  v_validation_refs jsonb:='[]'::jsonb;
  v_promise_result jsonb:='{}'::jsonb;
  v_scope_result jsonb:='{}'::jsonb;
  v_snapshot_result jsonb:='{}'::jsonb;
begin
  v_assessment:=public.crm_get_quotation_sales_reconciliation(p_quotation_id);
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;

  -- An existing delivered snapshot is historical evidence. Reads never rebuild or rewrite it.
  if v_q.sales_scope_snapshot is not null then
    return v_q.sales_scope_snapshot || jsonb_build_object(
      'persisted',true,
      'capturedAt',v_q.sales_scope_snapshot_at,
      'snapshotSchemaVersion',v_q.sales_scope_snapshot_schema_version,
      'snapshotCoverageState','SNAPSHOT_CAPTURED'
    );
  end if;

  v_lead_id:=nullif(v_assessment->>'leadId','')::uuid;
  if v_lead_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,
      'versionSourceId',c.supersedes_condition_id,
      'state',c.state,
      'conditionType',c.condition_type,
      'title',c.title,
      'exactWording',c.condition_text,
      'sourceType',c.source_type,
      'sourceRequirementId',c.source_requirement_id,
      'sourceValidationId',c.source_validation_id,
      'sourceMeetingId',c.source_meeting_id,
      'sourceSummary',c.source_summary,
      'validationAlignmentStatus',c.validation_alignment_status,
      'activatedAt',c.activated_at
    ) order by c.activated_at,c.id),'[]'::jsonb)
    into v_scope
    from public.crm_sales_scope_conditions c
    where c.lead_id=v_lead_id
      and (c.opportunity_id is null or c.opportunity_id=v_q.opportunity_id)
      and c.state='ACTIVE';

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,
      'versionSourceId',p.supersedes_promise_id,
      'state',p.record_state,
      'promiseType',p.promise_type,
      'exactWording',p.promise_text,
      'promisedBy',p.promised_by,
      'promisedAt',p.promised_at,
      'sourceType',p.source_type,
      'sourceSummary',p.source_summary,
      'linkedRequirementId',p.linked_requirement_id,
      'linkedValidationId',p.linked_validation_id,
      'validationAlignmentStatus',p.validation_alignment_status
    ) order by p.promised_at,p.id),'[]'::jsonb)
    into v_promises
    from public.crm_sales_promises p
    where p.lead_id=v_lead_id
      and (p.opportunity_id is null or p.opportunity_id=v_q.opportunity_id)
      and p.record_state='ACTIVE';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'quotationItemId',qi.id,
    'salesProductId',qi.sales_product_id,
    'productCode',qi.product_code_snapshot,
    'productName',qi.product_name_snapshot,
    'catalogVersionSnapshot',qi.catalog_version_snapshot,
    'catalogSnapshotRef',case
      when coalesce(qi.catalog_snapshot,'{}'::jsonb)='{}'::jsonb then null
      else jsonb_strip_nulls(jsonb_build_object(
        'catalogVersion',qi.catalog_snapshot->'catalogVersion',
        'effectiveFrom',qi.catalog_snapshot->'effectiveFrom',
        'productCode',qi.catalog_snapshot->'productCode',
        'productName',qi.catalog_snapshot->'productName'
      ))
    end,
    'optionalForClient',qi.optional_for_client,
    'lineType',qi.line_type,
    'itemType',qi.item_type
  )) order by qi.sort_order,qi.id),'[]'::jsonb)
  into v_products
  from public.quotation_items qi
  where qi.quotation_id=p_quotation_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'coverageId',c.id,
    'sourceType',case when c.scope_condition_id is not null then 'SCOPE_CONDITION' else 'PROMISE' end,
    'sourceId',coalesce(c.scope_condition_id,c.promise_id),
    'coverageStatus',c.coverage_status,
    'targetType',c.target_type,
    'quotationFieldKey',c.quotation_field_key,
    'quotationItemId',c.quotation_item_id,
    'targetFingerprint',c.target_fingerprint,
    'targetExcerpt',c.target_excerpt,
    'reviewedBy',c.reviewed_by,
    'reviewedAt',c.reviewed_at
  ) order by c.reviewed_at,c.id),'[]'::jsonb)
  into v_coverage_refs
  from public.quotation_sales_coverage c
  where c.quotation_id=p_quotation_id and c.is_current;

  select coalesce(jsonb_agg(distinct row_data->'validation'),'[]'::jsonb)
  into v_validation_refs
  from jsonb_array_elements(
    coalesce(v_assessment->'scopeConditionCoverage','[]'::jsonb)
    || coalesce(v_assessment->'promiseCoverage','[]'::jsonb)
  ) row_data
  where row_data->'validation' is not null
    and row_data->'validation' <> 'null'::jsonb
    and nullif(row_data#>>'{validation,validationId}','') is not null;

  select value into v_promise_result
  from jsonb_array_elements(coalesce(v_assessment->'quotationDimensions','[]'::jsonb))
  where value->>'key'='PROMISE_COVERAGE'
  limit 1;
  select value into v_scope_result
  from jsonb_array_elements(coalesce(v_assessment->'quotationDimensions','[]'::jsonb))
  where value->>'key'='FINAL_SCOPE_RECONCILIATION'
  limit 1;
  select value into v_snapshot_result
  from jsonb_array_elements(coalesce(v_assessment->'quotationDimensions','[]'::jsonb))
  where value->>'key'='QUOTATION_SNAPSHOT_COVERAGE'
  limit 1;

  return jsonb_build_object(
    'snapshotSchemaVersion',2,
    'quotationId',v_q.id,
    'quotationRevision',v_q.revision_number,
    'quotationStatusAtEvaluation',v_q.status,
    'opportunityId',v_q.opportunity_id,
    'leadId',v_assessment->'leadId',
    'evaluationTimestamp',v_assessment->'evaluatedAt',
    'reconciliationPolicy',jsonb_build_object(
      'policyKey',v_assessment->>'policyKey',
      'policyVersion',v_assessment->'policyVersion'
    ),
    'proposalReadiness',jsonb_build_object(
      'status',v_assessment#>>'{proposalReadiness,status}',
      'policyKey',v_assessment#>>'{proposalReadiness,policyKey}',
      'policyVersion',v_assessment#>'{proposalReadiness,policyVersion}',
      'evaluatorVersion',v_assessment#>'{proposalReadiness,evaluatorVersion}'
    ),
    'packageFit',jsonb_build_object(
      'status',v_assessment#>>'{packageFit,status}',
      'policyKey',v_assessment#>>'{packageFit,policyKey}',
      'policyVersion',v_assessment#>'{packageFit,policyVersion}',
      'recommendedProduct',v_assessment#>'{packageFit,recommendedProduct}'
    ),
    'quotedProducts',v_products,
    'activeScopeConditions',v_scope,
    'activePromises',v_promises,
    'coverageMappings',v_coverage_refs,
    'currentApprovedSpecialistConstraints',coalesce(v_assessment->'approvedConstraints','[]'::jsonb),
    'relevantValidations',v_validation_refs,
    'promiseCoverageResult',coalesce(v_promise_result,'{}'::jsonb),
    'finalScopeReconciliationResult',coalesce(v_scope_result,'{}'::jsonb),
    'quotationSnapshotCoverageResult',coalesce(v_snapshot_result,'{}'::jsonb),
    'finalReconciliationStatus',v_assessment->>'status',
    'snapshotCoverageState',v_assessment->>'snapshotCoverageState',
    'readyForSnapshot',coalesce((v_assessment->>'readyForSnapshot')::boolean,false),
    'blockers',coalesce(v_assessment->'exactBlockers','[]'::jsonb),
    'warnings',coalesce(v_assessment->'warnings','[]'::jsonb),
    'persisted',false,
    'finalQuotationSendGateActive',coalesce((v_assessment->>'finalQuotationSendGateActive')::boolean,false)
  );
end;
$function$;

revoke all on function public.crm_build_quotation_sales_scope_snapshot(uuid) from public, anon;
grant execute on function public.crm_build_quotation_sales_scope_snapshot(uuid) to authenticated, service_role;

-- Extend the existing CPQ summary additively. Existing keys are preserved. When the
-- policy is staged (false), readyToSend remains exactly the existing CPQ result.
create or replace function public.get_quotation_cpq_summary(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_payload jsonb;
  v_distribution jsonb;
  v_salesperson_id uuid;
  v_currency text;
  v_mine jsonb:=jsonb_build_object('available',false,'scope','none');
  v_policy jsonb:='{}'::jsonb;
  v_gate_active boolean:=false;
  v_reconciliation jsonb;
  v_sales_ready boolean:=false;
  v_sales_blockers jsonb:='[]'::jsonb;
  v_sales_missing jsonb:='[]'::jsonb;
  v_existing_ready boolean:=false;
  v_snapshot_meta jsonb;
  v_snapshot_at timestamptz;
  v_snapshot_schema integer;
begin
  v_payload:=public.get_quotation_cpq_summary_sensitive_internal(p_quotation_id);

  select q.salesperson_id,q.currency,q.sales_scope_snapshot_at,q.sales_scope_snapshot_schema_version
    into v_salesperson_id,v_currency,v_snapshot_at,v_snapshot_schema
  from public.quotations q
  where q.id=p_quotation_id;

  select coalesce(config_value,'{}'::jsonb)
    into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';
  v_gate_active:=coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false);

  if public.is_admin() or v_salesperson_id=auth.uid() then
    begin
      v_reconciliation:=public.crm_get_quotation_sales_reconciliation(p_quotation_id);
    exception when others then
      v_reconciliation:=null;
    end;
  end if;

  if v_reconciliation is not null then
    v_sales_blockers:=coalesce(v_reconciliation->'exactBlockers','[]'::jsonb);
    v_sales_ready:=coalesce((v_reconciliation->>'readyForSnapshot')::boolean,false)
      and coalesce(v_reconciliation->>'status','BLOCKED') in ('READY','WARNING')
      and jsonb_array_length(v_sales_blockers)=0;
  elsif v_gate_active then
    v_sales_blockers:=jsonb_build_array(jsonb_build_object(
      'code','SALES_RECONCILIATION_UNAVAILABLE',
      'message','Final Sales reconciliation could not be evaluated for this quotation.',
      'sourceType','QUOTATION'
    ));
  end if;

  select coalesce(jsonb_agg(coalesce(item->>'message',item->>'code')),'[]'::jsonb)
    into v_sales_missing
  from jsonb_array_elements(v_sales_blockers) item;

  v_existing_ready:=coalesce((v_payload#>>'{readiness,readyToSend}')::boolean,false);
  if v_gate_active then
    v_payload:=jsonb_set(v_payload,'{readiness,readyToSend}',to_jsonb(v_existing_ready and v_sales_ready),true);
    v_payload:=jsonb_set(
      v_payload,
      '{readiness,missing}',
      coalesce(v_payload#>'{readiness,missing}','[]'::jsonb)||v_sales_missing,
      true
    );
  end if;
  v_payload:=jsonb_set(v_payload,'{readiness,finalSendGateActive}',to_jsonb(v_gate_active),true);
  v_payload:=jsonb_set(v_payload,'{readiness,salesReconciliationReady}',to_jsonb(v_sales_ready),true);
  v_payload:=jsonb_set(v_payload,'{readiness,finalSendBlockers}',v_sales_blockers,true);

  v_snapshot_meta:=case
    when v_snapshot_at is null then jsonb_build_object('captured',false,'status','NOT_CAPTURED')
    else jsonb_build_object(
      'captured',true,
      'status','SNAPSHOT_CAPTURED',
      'capturedAt',v_snapshot_at,
      'schemaVersion',v_snapshot_schema,
      'immutable',true
    )
  end;

  v_payload:=v_payload||jsonb_build_object(
    'salesReconciliation',v_reconciliation,
    'salesScopeSnapshot',v_snapshot_meta,
    'finalSendGateActive',v_gate_active,
    'finalSendBlockers',v_sales_blockers
  );

  if public.is_admin() then
    return v_payload||jsonb_build_object(
      'myRevenueAllocation',jsonb_build_object('available',false,'scope','admin_full')
    );
  end if;

  v_distribution:=v_payload->'revenueDistribution';
  if v_salesperson_id=auth.uid()
     and coalesce((v_distribution->>'success')::boolean,false) then
    v_mine:=jsonb_build_object(
      'available',true,
      'scope','seller_self',
      'label','Your Seller Margin',
      'currency',coalesce(v_distribution->>'currency',v_currency,'USD'),
      'amount',coalesce((v_distribution#>>'{seller,totalReservedAmount}')::numeric,0),
      'ratePercent',coalesce((v_distribution#>>'{seller,totalRatePercent}')::numeric,0)
    );
  end if;

  return (v_payload-'revenueDistribution')||jsonb_build_object(
    'revenueDistribution',null,
    'myRevenueAllocation',v_mine
  );
end;
$function$;

revoke all on function public.get_quotation_cpq_summary(uuid) from public, anon;
grant execute on function public.get_quotation_cpq_summary(uuid) to authenticated, service_role;

create or replace function public.crm_assert_quotation_send_ready(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_q public.quotations%rowtype;
  v_policy jsonb:='{}'::jsonb;
  v_gate_active boolean:=false;
  v_cpq jsonb;
  v_reconciliation jsonb;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication is required to send a quotation.'; end if;
  if p_quotation_id is null then raise exception 'Quotation is required.'; end if;

  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and v_q.salesperson_id is distinct from auth.uid() then
    raise exception 'Authorized quotation ownership is required.';
  end if;

  select coalesce(config_value,'{}'::jsonb) into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';
  v_gate_active:=coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false);
  if not v_gate_active then
    return jsonb_build_object('enforced',false,'ready',true,'reason','Final Sales send gate is staged but not active.');
  end if;

  if v_q.superseded_by_id is not null then raise exception 'Superseded quotation revisions cannot be sent.'; end if;
  if v_q.status<>'Approved' then raise exception 'Only an Approved quotation can be sent.'; end if;

  v_cpq:=public.get_quotation_cpq_summary(p_quotation_id);
  v_reconciliation:=v_cpq->'salesReconciliation';

  if not coalesce((v_cpq#>>'{readiness,readyToSend}')::boolean,false) then
    select string_agg(value,'; ')
      into v_reason
    from jsonb_array_elements_text(coalesce(v_cpq#>'{readiness,missing}','[]'::jsonb));
    raise exception 'Quotation cannot be sent: %',coalesce(nullif(v_reason,''),'final readiness checks failed.');
  end if;

  if v_reconciliation is null
     or not coalesce((v_reconciliation->>'readyForSnapshot')::boolean,false)
     or coalesce(v_reconciliation->>'status','BLOCKED') not in ('READY','WARNING')
     or jsonb_array_length(coalesce(v_reconciliation->'exactBlockers','[]'::jsonb))>0 then
    raise exception 'Quotation cannot be sent: final Sales reconciliation is not ready to snapshot.';
  end if;

  return jsonb_build_object(
    'enforced',true,
    'ready',true,
    'quotationId',p_quotation_id,
    'policyKey',v_policy->>'policyKey',
    'policyVersion',v_policy->'policyVersion',
    'reconciliationStatus',v_reconciliation->>'status',
    'warnings',coalesce(v_reconciliation->'warnings','[]'::jsonb)
  );
end;
$function$;

revoke all on function public.crm_assert_quotation_send_ready(uuid) from public, anon;
grant execute on function public.crm_assert_quotation_send_ready(uuid) to authenticated, service_role;

create or replace function public.crm_capture_quotation_sales_scope_snapshot(p_quotation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
declare
  v_policy jsonb:='{}'::jsonb;
  v_gate_active boolean:=false;
  v_assertion jsonb;
  v_snapshot jsonb;
  v_now timestamptz:=statement_timestamp();
  v_pre_state text;
begin
  select coalesce(config_value,'{}'::jsonb) into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';
  v_gate_active:=coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false);
  if not v_gate_active then return null; end if;

  v_assertion:=public.crm_assert_quotation_send_ready(p_quotation_id);
  v_snapshot:=public.crm_build_quotation_sales_scope_snapshot(p_quotation_id);
  if not coalesce((v_snapshot->>'readyForSnapshot')::boolean,false)
     or jsonb_array_length(coalesce(v_snapshot->'blockers','[]'::jsonb))>0 then
    raise exception 'Quotation cannot be sent: immutable Sales snapshot is not ready to freeze.';
  end if;

  v_pre_state:=coalesce(v_snapshot->>'snapshotCoverageState','READY_TO_SNAPSHOT');
  return v_snapshot||jsonb_build_object(
    'snapshotSchemaVersion',2,
    'sendTimeTimestamp',v_now,
    'capturedAt',v_now,
    'sendAuthorizedBy',auth.uid(),
    'quotationStatusAtAuthorization','Approved',
    'quotationStatusAfterTransition','Sent',
    'snapshotCoveragePreSendState',v_pre_state,
    'snapshotCoverageState','SNAPSHOT_CAPTURED',
    'quotationSnapshotCoverageResult',jsonb_build_object('key','QUOTATION_SNAPSHOT_COVERAGE','status','PASS','coverageState','SNAPSHOT_CAPTURED'),
    'sendTimeBlockers','[]'::jsonb,
    'sendTimeWarnings',coalesce(v_snapshot->'warnings','[]'::jsonb),
    'persisted',true,
    'finalQuotationSendGateActive',true,
    'sendAssertion',jsonb_build_object(
      'policyKey',v_assertion->>'policyKey',
      'policyVersion',v_assertion->'policyVersion',
      'reconciliationStatus',v_assertion->>'reconciliationStatus'
    )
  );
end;
$function$;

revoke all on function public.crm_capture_quotation_sales_scope_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.crm_capture_quotation_sales_scope_snapshot(uuid) to service_role;

-- One central transition trigger protects every legitimate UPDATE path into Sent before
-- Admin and quotation_atomic_rpc bypasses are considered.
create or replace function public.protect_quotation_transition()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_atomic text:=coalesce(current_setting('profox.quotation_atomic_rpc',true),'');
  v_view_tracking text:=coalesce(current_setting('profox.quotation_view_tracking_rpc',true),'');
  v_gateway text:=coalesce(current_setting('profox.gateway_settlement',true),'');
  v_gate_active boolean:=false;
  v_snapshot jsonb;
  v_snapshot_changed boolean:=false;
begin
  v_snapshot_changed:=new.sales_scope_snapshot is distinct from old.sales_scope_snapshot
    or new.sales_scope_snapshot_at is distinct from old.sales_scope_snapshot_at
    or new.sales_scope_snapshot_schema_version is distinct from old.sales_scope_snapshot_schema_version;

  -- Browser/Admin/ordinary RPC callers never author or rewrite snapshot authority.
  if v_snapshot_changed and not (old.status<>'Sent' and new.status='Sent') then
    raise exception 'Quotation Sales scope snapshot is server-controlled and immutable. Create a quotation revision for corrections.';
  end if;

  if old.status<>'Sent' and new.status='Sent' then
    select coalesce((config_value->>'finalQuotationSendGateActive')::boolean,false)
      into v_gate_active
    from public.system_configuration
    where config_key='crm_quotation_sales_reconciliation_policy_v1';

    if v_gate_active then
      -- Final Send may change only expected send metadata. Material quotation content must
      -- already be saved/reconciled/approved before the Sent transition.
      if (to_jsonb(new)-array[
          'status','email','send_cc','send_subject','send_message','sent_at','updated_at',
          'customer_identity_id','sales_scope_snapshot','sales_scope_snapshot_at','sales_scope_snapshot_schema_version'
        ]::text[])
         is distinct from
         (to_jsonb(old)-array[
          'status','email','send_cc','send_subject','send_message','sent_at','updated_at',
          'customer_identity_id','sales_scope_snapshot','sales_scope_snapshot_at','sales_scope_snapshot_schema_version'
        ]::text[]) then
        raise exception 'Material quotation content cannot be changed in the same statement that sends the quotation. Save, reconcile and approve first.';
      end if;

      v_snapshot:=public.crm_capture_quotation_sales_scope_snapshot(new.id);
      if v_snapshot is null then raise exception 'Final Sales send gate is active but no immutable snapshot was produced.'; end if;
      new.sales_scope_snapshot:=v_snapshot;
      new.sales_scope_snapshot_at:=statement_timestamp();
      new.sales_scope_snapshot_schema_version:=2;
    end if;
  end if;

  -- These established maintenance paths remain intact, but only after the universal
  -- Sent invariant and immutable snapshot protections above have executed.
  if v_view_tracking='1' or v_gateway='1' then return new; end if;
  if public.is_admin() then return new; end if;
  if v_atomic='1' then return new; end if;

  if old.status in ('Approved','Sent','Accepted','Rejected','Expired','Cancelled')
     and row(new.*) is distinct from row(old.*) then
    raise exception 'Locked quotation may only be changed through the approved quotation workflow.';
  end if;
  if new.status not in ('Draft','Ready for Approval') then
    raise exception 'Sales may only change quotation status through the approved quotation workflow.';
  end if;
  if new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.accepted_at is distinct from old.accepted_at
     or new.approval_required is distinct from old.approval_required
     or new.approval_route is distinct from old.approval_route
     or new.approval_reason is distinct from old.approval_reason
     or new.approval_checked_at is distinct from old.approval_checked_at
     or new.approval_requested_at is distinct from old.approval_requested_at
     or new.approval_requested_by is distinct from old.approval_requested_by
     or new.approval_reasons_snapshot is distinct from old.approval_reasons_snapshot
     or new.approval_decision is distinct from old.approval_decision
     or new.approval_decision_note is distinct from old.approval_decision_note
     or new.approval_decided_at is distinct from old.approval_decided_at
     or new.approval_decided_by is distinct from old.approval_decided_by then
    raise exception 'Quotation approval and acceptance fields are privileged.';
  end if;
  if pg_trigger_depth()=1
     and (new.subtotal is distinct from old.subtotal or new.total is distinct from old.total) then
    raise exception 'Quotation totals are calculated from line items and cannot be edited directly.';
  end if;
  return new;
end;
$function$;

revoke all on function public.protect_quotation_transition() from public, anon, authenticated;
grant execute on function public.protect_quotation_transition() to service_role;

-- Re-assert least-privilege execution after CREATE OR REPLACE operations.
revoke all on function public.crm_get_quotation_sales_reconciliation(uuid) from public, anon;
grant execute on function public.crm_get_quotation_sales_reconciliation(uuid) to authenticated, service_role;
revoke all on function public.crm_review_quotation_sales_coverage(uuid,text,uuid,text,text,text,uuid,text) from public, anon;
grant execute on function public.crm_review_quotation_sales_coverage(uuid,text,uuid,text,text,text,uuid,text) to authenticated, service_role;

-- Foundation migration intentionally ends with activation false.
-- A later explicit activation must first verify authenticated production resolution UI.
