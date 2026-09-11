create index if not exists quotation_sales_coverage_scope_condition_idx
  on public.quotation_sales_coverage(scope_condition_id)
  where scope_condition_id is not null;
create index if not exists quotation_sales_coverage_promise_idx
  on public.quotation_sales_coverage(promise_id)
  where promise_id is not null;
create index if not exists quotation_sales_coverage_reviewed_by_idx
  on public.quotation_sales_coverage(reviewed_by);
create index if not exists quotation_sales_coverage_supersedes_idx
  on public.quotation_sales_coverage(supersedes_coverage_id)
  where supersedes_coverage_id is not null;

create or replace function public.crm_parse_timeline_promise_days(p_text text)
returns jsonb
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_match text[];
  v_min integer;
  v_max integer;
begin
  v_match:=regexp_match(
    lower(coalesce(p_text,'')),
    '([0-9]{1,4})[[:space:]]*(?:(?:-|–|—|to)[[:space:]]*([0-9]{1,4}))?[[:space:]]*(?:business[[:space:]]+)?days?'
  );
  if v_match is null then
    return jsonb_build_object(
      'parsed',false,
      'status','NOT_EVALUATED',
      'reason','Timeline Promise does not contain an explicit day count or range.'
    );
  end if;
  v_min:=nullif(v_match[1],'')::integer;
  v_max:=coalesce(nullif(v_match[2],'')::integer,v_min);
  if v_min is null or v_max is null or v_min<=0 or v_max<v_min then
    return jsonb_build_object(
      'parsed',false,
      'status','NOT_EVALUATED',
      'reason','Timeline Promise contains an invalid day range.'
    );
  end if;
  return jsonb_build_object(
    'parsed',true,
    'minDays',v_min,
    'maxDays',v_max,
    'unit','business_days'
  );
end;
$function$;

revoke all on function public.crm_parse_timeline_promise_days(text) from public, anon, authenticated;

create or replace function public.crm_get_quotation_sales_reconciliation(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_q public.quotations%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_condition public.crm_sales_scope_conditions%rowtype;
  v_promise public.crm_sales_promises%rowtype;
  v_cov public.quotation_sales_coverage%rowtype;
  v_primary public.quotation_items%rowtype;
  v_policy jsonb;
  v_proposal jsonb:='{}'::jsonb;
  v_scope_assessment jsonb:='{}'::jsonb;
  v_package jsonb:='{}'::jsonb;
  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_condition_rows jsonb:='[]'::jsonb;
  v_promise_rows jsonb:='[]'::jsonb;
  v_draft_promise_rows jsonb:='[]'::jsonb;
  v_field_targets jsonb:='[]'::jsonb;
  v_item_targets jsonb:='[]'::jsonb;
  v_evidence jsonb;
  v_validation_context jsonb;
  v_eligible jsonb;
  v_effective text;
  v_has_cov boolean;
  v_historical boolean:=false;
  v_legacy boolean:=false;
  v_current_coverage_count integer:=0;
  v_condition_count integer:=0;
  v_condition_covered integer:=0;
  v_promise_count integer:=0;
  v_promise_covered integer:=0;
  v_scope_status text:='PASS';
  v_promise_status text:='PASS';
  v_package_alignment_status text:='PASS';
  v_snapshot_state text:='NOT_FROZEN';
  v_ready_snapshot boolean:=false;
  v_overall_status text:='READY';
  v_recommended_code text;
  v_integrity_blocked boolean:=false;
  v_lead_id uuid;
  v_field text;
  v_promised_by_name text;
  v_timeline_context jsonb;
  v_timeline_conflict boolean:=false;
  v_commercial_approval jsonb;
  v_commercial_approval_required boolean:=false;
  v_commercial_approval_satisfied boolean:=true;
  v_commercial_approval_blocked boolean:=false;
  v_any_promise_dependency_blocked boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication is required for quotation Sales reconciliation.'; end if;
  if p_quotation_id is null then raise exception 'Quotation is required for Sales reconciliation.'; end if;

  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and v_q.salesperson_id is distinct from v_uid then raise exception 'Authorized quotation ownership is required.'; end if;

  select config_value into v_policy from public.system_configuration where config_key='crm_quotation_sales_reconciliation_policy_v1';
  if v_policy is null or v_policy->>'policyKey' is distinct from 'crm_quotation_sales_reconciliation_policy_v1' or nullif(v_policy->>'policyVersion','')::int is distinct from 1 then
    raise exception 'Quotation Sales reconciliation policy is unavailable or unsupported.';
  end if;
  if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,true) then raise exception 'Part 10A policy must keep final quotation send enforcement inactive.'; end if;

  v_historical:=coalesce(v_policy->'historicalStatuses','[]'::jsonb) ? coalesce(v_q.status,'');
  select count(*) into v_current_coverage_count from public.quotation_sales_coverage where quotation_id=p_quotation_id and is_current;
  v_legacy:=v_historical and v_current_coverage_count=0;

  foreach v_field in array array['scope_summary','exclusions','client_responsibilities','delivery_assumptions','handover_support','terms_and_conditions','payment_terms','duration_snapshot_text']::text[] loop
    v_evidence:=public.crm_quotation_sales_target_evidence(p_quotation_id,'QUOTATION_FIELD',v_field,null);
    v_field_targets:=v_field_targets||jsonb_build_array(v_evidence);
  end loop;
  select coalesce(jsonb_agg(public.crm_quotation_sales_target_evidence(p_quotation_id,'QUOTATION_ITEM',null,qi.id) order by qi.sort_order,qi.id),'[]'::jsonb)
  into v_item_targets
  from public.quotation_items qi
  where qi.quotation_id=p_quotation_id and coalesce(qi.line_type,'product') in ('product','custom') and not coalesce(qi.optional_for_client,false);

  if v_q.opportunity_id is null then
    if v_historical then
      v_warnings:=jsonb_build_array(jsonb_build_object('code','LEGACY_QUOTATION_CRM_LINK_NOT_CAPTURED','message','This historical quotation is not connected to a CRM opportunity, so Part 10A Sales reconciliation was not captured for it.','sourceType','QUOTATION'));
      v_overall_status:='LEGACY';
    else
      v_blockers:=jsonb_build_array(jsonb_build_object('code','QUOTATION_CRM_LINKAGE_REQUIRED','message','Connect this quotation to the canonical CRM opportunity before relying on Sales reconciliation.','sourceType','QUOTATION','futureSendBlocker',true));
      v_overall_status:='BLOCKED';
    end if;
    return jsonb_build_object(
      'quotationId',v_q.id,'opportunityId',null,'leadId',null,'quotationRevision',v_q.revision_number,'quotationStatus',v_q.status,
      'policyKey','crm_quotation_sales_reconciliation_policy_v1','policyVersion',1,'evaluatedAt',statement_timestamp(),
      'proposalReadiness',null,'packageFit',null,
      'scopeConditionCoverage','[]'::jsonb,'promiseCoverage','[]'::jsonb,'draftPromises','[]'::jsonb,'validationConflicts','[]'::jsonb,
      'staleCoverage','[]'::jsonb,'missingCoverage','[]'::jsonb,
      'quotedProductAlignment',jsonb_build_object('status','NOT_EVALUATED','reason','CRM opportunity link is required.'),
      'exactBlockers',v_blockers,'warnings',v_warnings,'status',v_overall_status,
      'readyForSnapshot',false,'snapshotCoverageState',case when v_historical then 'LEGACY_NOT_CAPTURED' else 'NOT_FROZEN' end,
      'quotationDimensions',jsonb_build_array(
        jsonb_build_object('key','PROMISE_COVERAGE','status',case when v_historical then 'WARNING' else 'BLOCKED' end,'coverageState',case when v_historical then 'LEGACY_NOT_CAPTURED' else 'NOT_EVALUATED' end,'activeCount',0,'coveredCount',0,'draftCount',0),
        jsonb_build_object('key','FINAL_SCOPE_RECONCILIATION','status',case when v_historical then 'WARNING' else 'BLOCKED' end,'coverageState',case when v_historical then 'LEGACY_NOT_CAPTURED' else 'NOT_EVALUATED' end),
        jsonb_build_object('key','QUOTATION_SNAPSHOT_COVERAGE','status',case when v_historical then 'WARNING' else 'BLOCKED' end,'coverageState',case when v_historical then 'LEGACY_NOT_CAPTURED' else 'NOT_FROZEN' end)
      ),
      'availableTargets',jsonb_build_object('fields',v_field_targets,'items',v_item_targets),
      'historicalQuotation',v_historical,'legacyCoverageNotCaptured',v_legacy,
      'finalQuotationSendGateActive',false,'writesQuotation',false,'writesCoverageOnRead',false
    );
  end if;

  select * into v_opp from public.crm_opportunities where id=v_q.opportunity_id and archived_at is null;
  if not found or v_opp.lead_id is null then raise exception 'Quotation opportunity is not connected to an active CRM Lead.'; end if;
  v_lead_id:=v_opp.lead_id;
  if not public.crm_can_access_lead(v_lead_id) then raise exception 'Authorized CRM Lead access is required.'; end if;

  v_proposal:=public.crm_get_sales_gate_assessment(v_q.opportunity_id,'PROPOSAL_READINESS');
  v_scope_assessment:=public.crm_get_sales_scope_commitment_assessment(v_q.opportunity_id);
  v_package:=public.crm_get_package_fit_assessment(v_lead_id,v_q.opportunity_id);

  if v_historical then
    v_overall_status:='HISTORICAL';
    if v_legacy then
      v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','LEGACY_COVERAGE_NOT_CAPTURED','message','This historical quotation predates Part 10A coverage capture. No coverage or Sales-scope snapshot was backfilled.','sourceType','QUOTATION'));
    end if;
  else
    v_blockers:=coalesce(v_proposal->'blockers','[]'::jsonb);
    v_warnings:=coalesce(v_proposal->'warnings','[]'::jsonb);
  end if;

  select qi.* into v_primary
  from public.quotation_items qi
  where qi.quotation_id=p_quotation_id
    and coalesce(qi.line_type,'product')='product'
    and not coalesce(qi.optional_for_client,false)
    and qi.sales_product_id is not null
    and lower(coalesce(qi.item_type,'')) in ('package','discovery','custom')
  order by qi.sort_order,qi.id
  limit 1;

  v_recommended_code:=v_package#>>'{recommendedProduct,code}';
  if coalesce(v_package->>'status','REVIEW_REQUIRED')='MISMATCH' then
    v_package_alignment_status:='BLOCKED';
    if not v_historical then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','QUOTED_PACKAGE_FIT_MISMATCH','message','Current Package Fit is MISMATCH. Review the quoted package against current Sales scope.','sourceType','PACKAGE_FIT','futureSendBlocker',true));
    end if;
  elsif v_recommended_code is not null then
    if v_primary.id is null then
      v_package_alignment_status:='BLOCKED';
      if not v_historical then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','QUOTED_PRIMARY_PACKAGE_MISSING','message','The quotation has no committed primary package/product to compare with current Package Fit.','sourceType','QUOTATION_ITEM','futureSendBlocker',true)); end if;
    elsif v_primary.product_code_snapshot is distinct from v_recommended_code then
      v_package_alignment_status:='BLOCKED';
      if not v_historical then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','QUOTED_PACKAGE_ALIGNMENT_MISMATCH','message','The quoted primary package differs from the current deterministic Package Fit recommendation. Review rather than replacing it automatically.','sourceType','PACKAGE_FIT','quotationItemId',v_primary.id,'futureSendBlocker',true)); end if;
    else
      v_package_alignment_status:='PASS';
    end if;
  elsif coalesce(v_package->>'status','REVIEW_REQUIRED') in ('POSSIBLE_FIT','REVIEW_REQUIRED') then
    v_package_alignment_status:='WARNING';
    if not v_historical then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','QUOTED_PACKAGE_ALIGNMENT_REVIEW','message','Package Fit is not deterministic enough to confirm quoted package alignment yet. Existing quotation items are unchanged.','sourceType','PACKAGE_FIT')); end if;
  end if;

  for v_condition in
    select * from public.crm_sales_scope_conditions c
    where c.lead_id=v_lead_id and (c.opportunity_id is null or c.opportunity_id=v_q.opportunity_id) and c.state='ACTIVE'
    order by c.activated_at nulls last,c.id
  loop
    v_condition_count:=v_condition_count+1;
    v_eligible:=coalesce(v_policy #> array['scopeConditionTargets',v_condition.condition_type],'[]'::jsonb);
    v_validation_context:=null;
    if v_condition.source_validation_id is not null then
      select jsonb_build_object('validationId',sv.id,'validationType',sv.validation_type,'status',sv.status,'approvedConstraints',sv.approved_constraints)
      into v_validation_context from public.crm_sales_validations sv where sv.id=v_condition.source_validation_id;
    end if;
    select * into v_cov from public.quotation_sales_coverage c
    where c.quotation_id=p_quotation_id and c.scope_condition_id=v_condition.id and c.is_current
    limit 1;
    v_has_cov:=found;
    if v_has_cov then
      v_evidence:=public.crm_quotation_sales_target_evidence(p_quotation_id,v_cov.target_type,v_cov.quotation_field_key,v_cov.quotation_item_id);
      if nullif(v_evidence->>'fingerprint','') is null or v_cov.target_fingerprint is distinct from v_evidence->>'fingerprint' then v_effective:='STALE'; else v_effective:=v_cov.coverage_status; end if;
    else
      v_evidence:=null;
      v_effective:=case when v_legacy then 'LEGACY_NOT_CAPTURED' else 'UNMAPPED' end;
    end if;
    if v_effective='COVERED' then v_condition_covered:=v_condition_covered+1; end if;
    if not v_historical and v_effective<>'COVERED' then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code',case when v_effective='STALE' then 'SCOPE_COVERAGE_STALE' when v_effective='CONFLICT' then 'SCOPE_COVERAGE_CONFLICT' else 'SCOPE_COVERAGE_REQUIRED' end,
        'message','Active '||replace(v_condition.condition_type,'_',' ')||' “'||v_condition.title||'” is not currently covered by a reviewed customer-visible quotation target.',
        'sourceType','SCOPE_CONDITION','conditionId',v_condition.id,'coverageStatus',v_effective,'futureSendBlocker',true
      ));
    end if;
    v_condition_rows:=v_condition_rows||jsonb_build_array(jsonb_build_object(
      'conditionId',v_condition.id,'conditionType',v_condition.condition_type,'title',v_condition.title,'conditionText',v_condition.condition_text,
      'sourceType',v_condition.source_type,'sourceRequirementId',v_condition.source_requirement_id,'sourceValidationId',v_condition.source_validation_id,'sourceMeetingId',v_condition.source_meeting_id,'sourceSummary',v_condition.source_summary,
      'validationAlignmentStatus',v_condition.validation_alignment_status,'validation',v_validation_context,
      'coverageId',case when v_has_cov then v_cov.id else null end,'storedCoverageStatus',case when v_has_cov then v_cov.coverage_status else null end,'coverageStatus',v_effective,
      'targetType',case when v_has_cov then v_cov.target_type else null end,'quotationFieldKey',case when v_has_cov then v_cov.quotation_field_key else null end,'quotationItemId',case when v_has_cov then v_cov.quotation_item_id else null end,
      'targetExcerpt',case when v_has_cov then v_evidence->>'excerpt' else null end,'reviewedBy',case when v_has_cov then v_cov.reviewed_by else null end,'reviewedAt',case when v_has_cov then v_cov.reviewed_at else null end,'coverageNote',case when v_has_cov then v_cov.coverage_note else null end,
      'eligibleTargets',v_eligible
    ));
  end loop;

  if jsonb_array_length(coalesce(v_scope_assessment#>'{scopeConditions,blockers}','[]'::jsonb))>0 or (not v_historical and v_condition_covered<v_condition_count) then v_scope_status:='BLOCKED';
  elsif jsonb_array_length(coalesce(v_scope_assessment#>'{scopeConditions,warnings}','[]'::jsonb))>0 then v_scope_status:='WARNING'; else v_scope_status:='PASS'; end if;
  if v_historical then v_scope_status:='WARNING'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'promiseId',p.id,
    'promiseType',p.promise_type,
    'promiseText',p.promise_text,
    'recordState',p.record_state,
    'displayStatus','INTERNAL_DRAFT_NOT_CLIENT_COMMITMENT',
    'sourceType',p.source_type,
    'sourceSummary',p.source_summary,
    'recordedBy',p.recorded_by,
    'recordedByName',up.full_name,
    'recordedAt',p.recorded_at,
    'updatedAt',p.updated_at
  ) order by p.updated_at desc,p.id),'[]'::jsonb)
  into v_draft_promise_rows
  from public.crm_sales_promises p
  left join public.user_profiles up on up.id=p.recorded_by
  where p.lead_id=v_lead_id
    and (p.opportunity_id is null or p.opportunity_id=v_q.opportunity_id)
    and p.record_state='DRAFT';

  for v_promise in
    select * from public.crm_sales_promises p
    where p.lead_id=v_lead_id and (p.opportunity_id is null or p.opportunity_id=v_q.opportunity_id) and p.record_state='ACTIVE'
    order by p.promised_at nulls last,p.id
  loop
    v_promise_count:=v_promise_count+1;
    v_eligible:=coalesce(v_policy #> array['promiseTargets',v_promise.promise_type],'[]'::jsonb);
    v_validation_context:=null;
    v_promised_by_name:=null;
    v_timeline_context:=null;
    v_timeline_conflict:=false;
    v_commercial_approval:=null;
    v_commercial_approval_required:=false;
    v_commercial_approval_satisfied:=true;
    v_commercial_approval_blocked:=false;

    select nullif(btrim(up.full_name),'') into v_promised_by_name
    from public.user_profiles up where up.id=v_promise.promised_by;

    if v_promise.linked_validation_id is not null then
      select jsonb_build_object('validationId',sv.id,'validationType',sv.validation_type,'status',sv.status,'approvedConstraints',sv.approved_constraints)
      into v_validation_context from public.crm_sales_validations sv where sv.id=v_promise.linked_validation_id;
    end if;
    select exists(
      select 1 from jsonb_array_elements(coalesce(v_scope_assessment#>'{promises,blockers}','[]'::jsonb)) b
      where b->>'promiseId'=v_promise.id::text
    ) into v_integrity_blocked;
    select * into v_cov from public.quotation_sales_coverage c
    where c.quotation_id=p_quotation_id and c.promise_id=v_promise.id and c.is_current
    limit 1;
    v_has_cov:=found;
    if v_has_cov then
      v_evidence:=public.crm_quotation_sales_target_evidence(p_quotation_id,v_cov.target_type,v_cov.quotation_field_key,v_cov.quotation_item_id);
      if nullif(v_evidence->>'fingerprint','') is null or v_cov.target_fingerprint is distinct from v_evidence->>'fingerprint' then v_effective:='STALE'; else v_effective:=v_cov.coverage_status; end if;
    else
      v_evidence:=null;
      v_effective:=case when v_legacy then 'LEGACY_NOT_CAPTURED' else 'UNMAPPED' end;
    end if;

    if v_promise.promise_type='TIMELINE' then
      v_timeline_context:=public.crm_parse_timeline_promise_days(v_promise.promise_text);
      if coalesce((v_timeline_context->>'parsed')::boolean,false)
         and v_q.estimated_duration_min is not null
         and v_q.estimated_duration_max is not null
         and not coalesce(v_q.duration_requires_assessment,false) then
        v_timeline_conflict:=((v_timeline_context->>'maxDays')::integer < v_q.estimated_duration_min)
          or ((v_timeline_context->>'minDays')::integer > v_q.estimated_duration_max);
        v_timeline_context:=v_timeline_context||jsonb_build_object(
          'quotationMinDays',v_q.estimated_duration_min,
          'quotationMaxDays',v_q.estimated_duration_max,
          'quotationUnit',v_q.duration_unit,
          'quotationText',v_q.duration_snapshot_text,
          'status',case when v_timeline_conflict then 'CONFLICT' else 'ALIGNED' end
        );
        if v_timeline_conflict then v_effective:='CONFLICT'; end if;
      else
        v_timeline_context:=coalesce(v_timeline_context,'{}'::jsonb)||jsonb_build_object(
          'quotationMinDays',v_q.estimated_duration_min,
          'quotationMaxDays',v_q.estimated_duration_max,
          'quotationUnit',v_q.duration_unit,
          'quotationText',v_q.duration_snapshot_text,
          'status','NOT_EVALUATED',
          'reason',case
            when coalesce(v_q.duration_requires_assessment,false) then 'Quotation timeline still requires assessment.'
            when v_q.estimated_duration_min is null or v_q.estimated_duration_max is null then 'Quotation does not yet have authoritative duration bounds.'
            else coalesce(v_timeline_context->>'reason','Timeline Promise does not contain an explicit day count or range.')
          end
        );
      end if;
    end if;

    if v_promise.promise_type='COMMERCIAL' then
      v_commercial_approval_required:=coalesce(v_q.approval_required,false) or public.quotation_requires_manager_approval(p_quotation_id);
      v_commercial_approval_satisfied:=not v_commercial_approval_required
        or lower(coalesce(v_q.approval_decision,''))='approved'
        or v_q.status='Approved';
      v_commercial_approval_blocked:=v_commercial_approval_required and not v_commercial_approval_satisfied;
      if v_commercial_approval_blocked then v_any_promise_dependency_blocked:=true; end if;
      v_commercial_approval:=jsonb_build_object(
        'required',v_commercial_approval_required,
        'satisfied',v_commercial_approval_satisfied,
        'status',case when v_commercial_approval_satisfied then case when v_commercial_approval_required then 'APPROVED' else 'NOT_REQUIRED' end else 'APPROVAL_REQUIRED' end,
        'quotationStatus',v_q.status,
        'approvalDecision',v_q.approval_decision,
        'approvalRequestedAt',v_q.approval_requested_at,
        'approvalDecidedAt',v_q.approval_decided_at,
        'reasons',to_jsonb(public.quotation_cpq_approval_reasons(p_quotation_id))
      );
    end if;

    if v_effective='COVERED' then v_promise_covered:=v_promise_covered+1; end if;
    if not v_historical and v_effective<>'COVERED' then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code',case
          when v_timeline_conflict then 'TIMELINE_PROMISE_QUOTATION_CONFLICT'
          when v_effective='STALE' then 'PROMISE_COVERAGE_STALE'
          when v_effective='CONFLICT' then 'PROMISE_COVERAGE_CONFLICT'
          else 'PROMISE_COVERAGE_REQUIRED'
        end,
        'message',case
          when v_timeline_conflict then 'Active Timeline Promise conflicts with this quotation’s authoritative delivery range. Review the Promise and quotation; neither value was changed automatically.'
          else 'Active '||replace(v_promise.promise_type,'_',' ')||' Promise is not currently covered by a reviewed customer-visible quotation target.'
        end,
        'sourceType','PROMISE','promiseId',v_promise.id,'coverageStatus',v_effective,'futureSendBlocker',true
      ));
    end if;
    if not v_historical and v_commercial_approval_blocked then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','COMMERCIAL_PROMISE_APPROVAL_REQUIRED',
        'message','Active Commercial Promise is represented in the quotation, but the existing quotation approval workflow still requires approval. No approval was created or bypassed by Sales reconciliation.',
        'sourceType','PROMISE','promiseId',v_promise.id,'futureSendBlocker',true
      ));
    end if;
    v_promise_rows:=v_promise_rows||jsonb_build_array(jsonb_build_object(
      'promiseId',v_promise.id,'promiseType',v_promise.promise_type,'promiseText',v_promise.promise_text,'recordState',v_promise.record_state,
      'promisedBy',v_promise.promised_by,'promisedByName',v_promised_by_name,'promisedAt',v_promise.promised_at,'sourceType',v_promise.source_type,'sourceSummary',v_promise.source_summary,
      'linkedRequirementId',v_promise.linked_requirement_id,'linkedValidationId',v_promise.linked_validation_id,'validationAlignmentStatus',v_promise.validation_alignment_status,'validation',v_validation_context,
      'promiseIntegrityStatus',case when v_integrity_blocked then 'BLOCKED' else 'PASS' end,
      'timelineComparison',v_timeline_context,'commercialApproval',v_commercial_approval,
      'coverageId',case when v_has_cov then v_cov.id else null end,'storedCoverageStatus',case when v_has_cov then v_cov.coverage_status else null end,'coverageStatus',v_effective,
      'targetType',case when v_has_cov then v_cov.target_type else null end,'quotationFieldKey',case when v_has_cov then v_cov.quotation_field_key else null end,'quotationItemId',case when v_has_cov then v_cov.quotation_item_id else null end,
      'targetExcerpt',case when v_has_cov then v_evidence->>'excerpt' else null end,'reviewedBy',case when v_has_cov then v_cov.reviewed_by else null end,'reviewedAt',case when v_has_cov then v_cov.reviewed_at else null end,'coverageNote',case when v_has_cov then v_cov.coverage_note else null end,
      'eligibleTargets',v_eligible,'futureSendBlockerStatus',case when v_integrity_blocked or v_effective<>'COVERED' or v_commercial_approval_blocked then 'BLOCKED' else 'PASS' end
    ));
  end loop;

  if v_promise_count=0 then v_promise_status:='PASS';
  elsif jsonb_array_length(coalesce(v_scope_assessment#>'{promises,blockers}','[]'::jsonb))>0
     or (not v_historical and v_promise_covered<v_promise_count)
     or (not v_historical and v_any_promise_dependency_blocked) then v_promise_status:='BLOCKED';
  elsif jsonb_array_length(coalesce(v_scope_assessment#>'{promises,warnings}','[]'::jsonb))>0 then v_promise_status:='WARNING'; else v_promise_status:='PASS'; end if;
  if v_historical then v_promise_status:='WARNING'; end if;

  if not v_historical and jsonb_array_length(v_blockers)=0 then
    v_ready_snapshot:=true;
    v_snapshot_state:='READY_TO_SNAPSHOT';
    v_overall_status:=case when jsonb_array_length(v_warnings)>0 then 'WARNING' else 'READY' end;
  elsif not v_historical then
    v_ready_snapshot:=false;
    v_snapshot_state:='NOT_FROZEN';
    v_overall_status:='BLOCKED';
  else
    v_ready_snapshot:=false;
    v_snapshot_state:=case when v_legacy then 'LEGACY_NOT_CAPTURED' else 'NOT_FROZEN' end;
  end if;

  return jsonb_build_object(
    'quotationId',v_q.id,'opportunityId',v_q.opportunity_id,'leadId',v_lead_id,'quotationRevision',v_q.revision_number,'quotationStatus',v_q.status,
    'policyKey','crm_quotation_sales_reconciliation_policy_v1','policyVersion',1,'evaluatedAt',statement_timestamp(),
    'proposalReadiness',v_proposal,'packageFit',v_package,
    'scopeConditionCoverage',v_condition_rows,'promiseCoverage',v_promise_rows,'draftPromises',v_draft_promise_rows,
    'validationConflicts',coalesce(v_scope_assessment->'blockers','[]'::jsonb),
    'staleCoverage',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select value x from jsonb_array_elements(v_condition_rows||v_promise_rows) where value->>'coverageStatus'='STALE') s),
    'missingCoverage',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select value x from jsonb_array_elements(v_condition_rows||v_promise_rows) where value->>'coverageStatus' in ('UNMAPPED','PARTIAL','CONFLICT')) s),
    'quotedProductAlignment',jsonb_build_object(
      'status',v_package_alignment_status,
      'quotedProduct',case when v_primary.id is null then null else jsonb_build_object('quotationItemId',v_primary.id,'salesProductId',v_primary.sales_product_id,'code',v_primary.product_code_snapshot,'name',v_primary.product_name_snapshot) end,
      'currentPackageFitStatus',v_package->>'status','recommendedProduct',v_package->'recommendedProduct'
    ),
    'approvedConstraints',coalesce(v_proposal->'approvedConstraints','[]'::jsonb),
    'exactBlockers',v_blockers,'warnings',v_warnings,'status',v_overall_status,
    'readyForSnapshot',v_ready_snapshot,'snapshotCoverageState',v_snapshot_state,
    'quotationDimensions',jsonb_build_array(
      jsonb_build_object('key','PROMISE_COVERAGE','status',v_promise_status,'coverageState',case when v_historical then 'LEGACY_NOT_CAPTURED' when v_promise_count=0 then 'NO_MATERIAL_PROMISES_REGISTERED' when v_promise_status='PASS' then 'COVERED' else 'NEEDS_RECONCILIATION' end,'activeCount',v_promise_count,'coveredCount',v_promise_covered,'draftCount',jsonb_array_length(v_draft_promise_rows)),
      jsonb_build_object('key','FINAL_SCOPE_RECONCILIATION','status',v_scope_status,'coverageState',case when v_historical then 'LEGACY_NOT_CAPTURED' when v_scope_status='PASS' then 'RECONCILED' else 'NEEDS_RECONCILIATION' end,'activeCount',v_condition_count,'coveredCount',v_condition_covered),
      jsonb_build_object('key','QUOTATION_SNAPSHOT_COVERAGE','status',case when v_historical then 'WARNING' when v_ready_snapshot then 'PASS' else 'BLOCKED' end,'coverageState',v_snapshot_state)
    ),
    'availableTargets',jsonb_build_object('fields',v_field_targets,'items',v_item_targets),
    'sourceAssessment',v_scope_assessment,
    'historicalQuotation',v_historical,'legacyCoverageNotCaptured',v_legacy,
    'finalQuotationSendGateActive',false,'writesQuotation',false,'writesCoverageOnRead',false
  );
end;
$function$;

revoke all on function public.crm_get_quotation_sales_reconciliation(uuid) from public, anon;
grant execute on function public.crm_get_quotation_sales_reconciliation(uuid) to authenticated;
