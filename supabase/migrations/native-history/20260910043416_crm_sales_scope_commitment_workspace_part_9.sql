-- Part 9 read-only integrity assessment and one efficient authorized workspace.
-- No quotation writes; no customer-facing data; no second Proposal Readiness engine.

UPDATE public.system_configuration
SET config_value = jsonb_set(
      jsonb_set(
        config_value,
        '{promiseValidationMap}',
        jsonb_build_object(
          'TECHNICAL','TECHNICAL',
          'TIMELINE','TIMELINE',
          'COMMERCIAL','COMMERCIAL',
          'COMPLIANCE','COMPLIANCE_RISK',
          'PERFORMANCE_RESULT','COMPLIANCE_RISK'
        ),
        true
      ),
      '{reconciliationCustomCategories}',
      jsonb_build_array('INTEGRATIONS','CUSTOM_APPLICATION','RISKS_DEPENDENCIES'),
      true
    ),
    updated_at = now()
WHERE config_key='crm_sales_scope_promise_policy_v1';

CREATE OR REPLACE FUNCTION public.crm_get_sales_scope_commitment_assessment(
  p_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_opp public.crm_opportunities%ROWTYPE;
  v_policy jsonb;
  v_required_validation_map jsonb;
  v_reconciliation_keys jsonb;
  v_reconciliation_categories jsonb;
  v_condition_blockers jsonb := '[]'::jsonb;
  v_condition_warnings jsonb := '[]'::jsonb;
  v_promise_blockers jsonb := '[]'::jsonb;
  v_promise_warnings jsonb := '[]'::jsonb;
  v_source_trace jsonb := '[]'::jsonb;
  v_unreconciled jsonb := '[]'::jsonb;
  v_conditions_active integer := 0;
  v_conditions_draft integer := 0;
  v_conditions_stale integer := 0;
  v_conditions_resolved integer := 0;
  v_conditions_superseded integer := 0;
  v_conditions_withdrawn integer := 0;
  v_promises_active integer := 0;
  v_promises_draft integer := 0;
  v_promises_superseded integer := 0;
  v_promises_withdrawn integer := 0;
  v_promises_unapproved integer := 0;
  v_promises_validation_required integer := 0;
  v_promises_validation_conflict integer := 0;
  v_scope_status text := 'READY';
  v_promise_status text := 'NO_ACTIVE_PROMISES';
  v_condition public.crm_sales_scope_conditions%ROWTYPE;
  v_promise public.crm_sales_promises%ROWTYPE;
  v_validation public.crm_sales_validations%ROWTYPE;
  v_current_validation public.crm_sales_validations%ROWTYPE;
  v_required_validation_type text;
  v_validation_current boolean;
  v_has_constraints boolean;
  v_integrity text;
  v_future jsonb := jsonb_build_array(
    jsonb_build_object('key','PROMISE_COVERAGE','status','NOT_YET_EVALUATED','coverageState','FUTURE_QUOTATION_RECONCILIATION'),
    jsonb_build_object('key','FINAL_SCOPE_RECONCILIATION','status','NOT_YET_EVALUATED','coverageState','FUTURE_QUOTATION_RECONCILIATION'),
    jsonb_build_object('key','QUOTATION_SNAPSHOT_COVERAGE','status','NOT_YET_EVALUATED','coverageState','FUTURE_QUOTATION_RECONCILIATION')
  );
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required for Scope & Commitments.'; END IF;
  IF p_opportunity_id IS NULL THEN RAISE EXCEPTION 'Opportunity is required for Scope & Commitments.'; END IF;

  SELECT * INTO v_opp
  FROM public.crm_opportunities
  WHERE id=p_opportunity_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity not found.'; END IF;
  IF v_opp.lead_id IS NULL OR NOT public.crm_can_access_lead(v_opp.lead_id) THEN
    RAISE EXCEPTION 'Authorized CRM opportunity access is required.';
  END IF;

  SELECT config_value INTO v_policy
  FROM public.system_configuration
  WHERE config_key='crm_sales_scope_promise_policy_v1';
  IF v_policy IS NULL OR v_policy->>'policyKey' IS DISTINCT FROM 'crm_sales_scope_promise_policy_v1' OR (v_policy->>'policyVersion')::integer<>1 THEN
    RAISE EXCEPTION 'Scope & Commitment policy is unavailable or unsupported.';
  END IF;
  v_required_validation_map := coalesce(v_policy->'promiseValidationMap','{}'::jsonb);
  v_reconciliation_keys := coalesce(v_policy->'reconciliationRequirementKeys','[]'::jsonb);
  v_reconciliation_categories := coalesce(v_policy->'reconciliationCustomCategories','[]'::jsonb);

  SELECT count(*) FILTER (WHERE state='ACTIVE'),
         count(*) FILTER (WHERE state='DRAFT'),
         count(*) FILTER (WHERE state='STALE'),
         count(*) FILTER (WHERE state='RESOLVED'),
         count(*) FILTER (WHERE state='SUPERSEDED'),
         count(*) FILTER (WHERE state='WITHDRAWN')
  INTO v_conditions_active,v_conditions_draft,v_conditions_stale,v_conditions_resolved,v_conditions_superseded,v_conditions_withdrawn
  FROM public.crm_sales_scope_conditions
  WHERE lead_id=v_opp.lead_id AND (opportunity_id IS NULL OR opportunity_id=v_opp.id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'requirementId',r.id,'requirementKey',r.requirement_key,'title',r.title,'category',r.category,
    'certainty',r.information_certainty,'currentValue',coalesce(nullif(btrim(r.content),''),r.structured_value::text),
    'reconciliationStatus',r.proposal_reconciliation_status,'scopeConditionId',r.proposal_scope_condition_id
  ) ORDER BY r.updated_at DESC),'[]'::jsonb)
  INTO v_unreconciled
  FROM public.crm_requirements r
  WHERE r.lead_id=v_opp.lead_id
    AND r.record_state='ACTIVE'
    AND r.information_certainty<>'NOT_APPLICABLE'
    AND (nullif(btrim(coalesce(r.content,'')),'') IS NOT NULL OR r.structured_value IS NOT NULL)
    AND (
      v_reconciliation_keys ? r.requirement_key
      OR (r.is_custom AND v_reconciliation_categories ? r.category)
    )
    AND r.proposal_reconciliation_status IS NULL;

  IF jsonb_array_length(v_unreconciled)>0 THEN
    v_scope_status := 'NEEDS_RECONCILIATION';
    v_condition_blockers := v_condition_blockers || jsonb_build_array(jsonb_build_object(
      'code','SCOPE_SOURCE_RECONCILIATION_REQUIRED',
      'message','Material Requirement information has not been explicitly reconciled into a Scope Condition or marked Not Material for Proposal.',
      'sourceType','REQUIREMENT','hardBlocker',true,
      'action',jsonb_build_object('actionKey','OPEN_SCOPE_CONDITIONS','label','Open Scope Conditions','target','scope-conditions')
    ));
  END IF;

  IF v_conditions_draft>0 THEN
    v_condition_warnings := v_condition_warnings || jsonb_build_array(jsonb_build_object(
      'code','SCOPE_CONDITION_DRAFTS','message',v_conditions_draft||' Scope Condition draft(s) are still being reconciled.',
      'sourceType','SCOPE_CONDITION','action',jsonb_build_object('actionKey','OPEN_SCOPE_CONDITIONS','label','Review Scope Conditions','target','scope-conditions')
    ));
    IF v_scope_status='READY' THEN v_scope_status:='NEEDS_RECONCILIATION'; END IF;
  END IF;

  IF v_conditions_stale>0 THEN
    v_scope_status := 'BLOCKED';
    v_condition_blockers := v_condition_blockers || jsonb_build_array(jsonb_build_object(
      'code','SCOPE_CONDITION_STALE','message',v_conditions_stale||' active proposal boundary/boundaries became stale because source information changed.',
      'sourceType','SCOPE_CONDITION','hardBlocker',true,
      'action',jsonb_build_object('actionKey','OPEN_SCOPE_CONDITIONS','label','Review stale Scope Conditions','target','scope-conditions')
    ));
  END IF;

  FOR v_condition IN
    SELECT * FROM public.crm_sales_scope_conditions c
    WHERE c.lead_id=v_opp.lead_id AND (c.opportunity_id IS NULL OR c.opportunity_id=v_opp.id)
      AND c.state IN ('ACTIVE','STALE')
    ORDER BY c.updated_at DESC,c.id DESC
  LOOP
    v_source_trace := v_source_trace || jsonb_build_array(jsonb_build_object(
      'recordType','SCOPE_CONDITION','recordId',v_condition.id,'sourceType',v_condition.source_type,
      'sourceRequirementId',v_condition.source_requirement_id,'sourceValidationId',v_condition.source_validation_id,
      'sourceMeetingId',v_condition.source_meeting_id,'sourceSummary',v_condition.source_summary
    ));

    IF v_condition.source_validation_id IS NOT NULL THEN
      SELECT * INTO v_validation FROM public.crm_sales_validations WHERE id=v_condition.source_validation_id;
      v_validation_current := found AND v_validation.status='APPROVED'
        AND NOT EXISTS(SELECT 1 FROM public.crm_sales_validations child WHERE child.supersedes_validation_id=v_validation.id);
      IF NOT v_validation_current THEN
        v_scope_status:='BLOCKED';
        v_condition_blockers := v_condition_blockers || jsonb_build_array(jsonb_build_object(
          'code','SCOPE_CONDITION_VALIDATION_REVIEW_REQUIRED','message','Scope Condition “'||v_condition.title||'” relies on a validation that is no longer a current approval.',
          'sourceType','VALIDATION','conditionId',v_condition.id,'validationId',v_condition.source_validation_id,'hardBlocker',true,
          'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open Sales Validation','target','validation')
        ));
      ELSE
        v_has_constraints := nullif(btrim(coalesce(v_validation.approved_constraints,'')),'') IS NOT NULL;
        IF v_condition.validation_alignment_status='CONFLICT' OR (v_has_constraints AND v_condition.validation_alignment_status<>'WITHIN_CONSTRAINTS') THEN
          v_scope_status:='BLOCKED';
          v_condition_blockers := v_condition_blockers || jsonb_build_array(jsonb_build_object(
            'code','SCOPE_CONDITION_VALIDATION_CONFLICT','message','Scope Condition “'||v_condition.title||'” must be explicitly reconciled with the current approved specialist constraints.',
            'sourceType','VALIDATION','conditionId',v_condition.id,'validationId',v_validation.id,'approvedConstraints',v_validation.approved_constraints,'hardBlocker',true,
            'action',jsonb_build_object('actionKey','OPEN_SCOPE_CONDITIONS','label','Reconcile Scope Condition','target','scope-conditions')
          ));
        END IF;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*) FILTER (WHERE record_state='ACTIVE'),
         count(*) FILTER (WHERE record_state='DRAFT'),
         count(*) FILTER (WHERE record_state='SUPERSEDED'),
         count(*) FILTER (WHERE record_state='WITHDRAWN')
  INTO v_promises_active,v_promises_draft,v_promises_superseded,v_promises_withdrawn
  FROM public.crm_sales_promises
  WHERE lead_id=v_opp.lead_id AND (opportunity_id IS NULL OR opportunity_id=v_opp.id);

  IF v_promises_active>0 THEN v_promise_status:='READY'; END IF;
  IF v_promises_draft>0 THEN
    v_promise_warnings := v_promise_warnings || jsonb_build_array(jsonb_build_object(
      'code','PROMISE_DRAFTS','message',v_promises_draft||' Promise draft(s) are internal preparation only and do not count as client commitments.',
      'sourceType','PROMISE','action',jsonb_build_object('actionKey','OPEN_PROMISE_REGISTER','label','Open Promise Register','target','promise-register')
    ));
  END IF;

  FOR v_promise IN
    SELECT * FROM public.crm_sales_promises p
    WHERE p.lead_id=v_opp.lead_id AND (p.opportunity_id IS NULL OR p.opportunity_id=v_opp.id)
      AND p.record_state='ACTIVE'
    ORDER BY p.promised_at DESC,p.id DESC
  LOOP
    v_integrity := 'CURRENT';
    v_required_validation_type := nullif(v_required_validation_map->>v_promise.promise_type,'');
    v_source_trace := v_source_trace || jsonb_build_array(jsonb_build_object(
      'recordType','PROMISE','recordId',v_promise.id,'sourceType',v_promise.source_type,'sourceRecordId',v_promise.source_record_id,
      'sourceMeetingId',v_promise.source_meeting_id,'sourceSummary',v_promise.source_summary,'linkedRequirementId',v_promise.linked_requirement_id,
      'linkedValidationId',v_promise.linked_validation_id,'promisedBy',v_promise.promised_by,'promisedAt',v_promise.promised_at
    ));

    IF v_promise.source_type='INTERNAL_DRAFT'
       OR (v_promise.source_type='MEETING' AND (v_promise.source_meeting_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.sales_meetings m WHERE m.id=v_promise.source_meeting_id AND m.status='Completed')))
       OR (v_promise.source_type<>'MEETING' AND nullif(btrim(coalesce(v_promise.source_summary,'')),'') IS NULL) THEN
      v_integrity:='UNAPPROVED_COMMITMENT';
      v_promise_status:='BLOCKED';
      v_promises_unapproved:=v_promises_unapproved+1;
      v_promise_blockers := v_promise_blockers || jsonb_build_array(jsonb_build_object(
        'code','PROMISE_SOURCE_REQUIRED','message','Active Promise has insufficient source/evidence: “'||left(v_promise.promise_text,160)||'”.',
        'sourceType','PROMISE','promiseId',v_promise.id,'hardBlocker',true,
        'action',jsonb_build_object('actionKey','OPEN_PROMISE_REGISTER','label','Review Promise source','target','promise-register')
      ));
    END IF;

    IF v_promise.linked_validation_id IS NOT NULL THEN
      SELECT * INTO v_validation FROM public.crm_sales_validations WHERE id=v_promise.linked_validation_id;
      v_validation_current := found
        AND v_validation.validation_type=coalesce(v_required_validation_type,v_validation.validation_type)
        AND NOT EXISTS(SELECT 1 FROM public.crm_sales_validations child WHERE child.supersedes_validation_id=v_validation.id);
      IF NOT v_validation_current OR v_validation.status IN ('STALE','REJECTED','CANCELLED') THEN
        v_integrity:=CASE WHEN found AND v_validation.status='REJECTED' THEN 'CONFLICT' ELSE 'VALIDATION_STALE' END;
        v_promise_status:='BLOCKED';
        v_promises_validation_conflict:=v_promises_validation_conflict+1;
        v_promise_blockers := v_promise_blockers || jsonb_build_array(jsonb_build_object(
          'code','PROMISE_VALIDATION_STALE_OR_CONFLICT','message','Active Promise requires a current specialist decision; its linked validation is stale, rejected, cancelled, superseded, or mismatched.',
          'sourceType','VALIDATION','promiseId',v_promise.id,'validationId',v_promise.linked_validation_id,'hardBlocker',true,
          'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open Sales Validation','target','validation')
        ));
      ELSIF v_validation.status<>'APPROVED' THEN
        v_integrity:='VALIDATION_REQUIRED';
        v_promise_status:='REVIEW_REQUIRED';
        v_promises_validation_required:=v_promises_validation_required+1;
        v_promise_blockers := v_promise_blockers || jsonb_build_array(jsonb_build_object(
          'code','PROMISE_VALIDATION_REQUIRED','message','Active Promise is real but its linked '||replace(v_validation.validation_type,'_',' ')||' review is '||replace(v_validation.status,'_',' ')||'.',
          'sourceType','VALIDATION','promiseId',v_promise.id,'validationId',v_validation.id,'hardBlocker',true,
          'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open Sales Validation','target','validation')
        ));
      ELSE
        v_has_constraints := nullif(btrim(coalesce(v_validation.approved_constraints,'')),'') IS NOT NULL;
        IF v_promise.validation_alignment_status='CONFLICT' OR (v_has_constraints AND v_promise.validation_alignment_status<>'WITHIN_CONSTRAINTS') THEN
          v_integrity:='CONFLICT';
          v_promise_status:='BLOCKED';
          v_promises_validation_conflict:=v_promises_validation_conflict+1;
          v_promise_blockers := v_promise_blockers || jsonb_build_array(jsonb_build_object(
            'code','PROMISE_APPROVED_CONSTRAINT_CONFLICT','message','Active Promise must be explicitly reconciled with approved specialist constraints before proposal preparation is safe.',
            'sourceType','VALIDATION','promiseId',v_promise.id,'validationId',v_validation.id,'approvedConstraints',v_validation.approved_constraints,'hardBlocker',true,
            'action',jsonb_build_object('actionKey','OPEN_PROMISE_REGISTER','label','Reconcile Promise wording','target','promise-register')
          ));
        END IF;
      END IF;
    ELSIF v_required_validation_type IS NOT NULL THEN
      v_integrity:='UNAPPROVED_COMMITMENT';
      v_promise_status:='REVIEW_REQUIRED';
      v_promises_unapproved:=v_promises_unapproved+1;
      v_promises_validation_required:=v_promises_validation_required+1;
      v_promise_blockers := v_promise_blockers || jsonb_build_array(jsonb_build_object(
        'code','PROMISE_UNAPPROVED_COMMITMENT','message','UNAPPROVED COMMITMENT: this active '||replace(v_promise.promise_type,'_',' ')||' Promise was communicated but has no linked current '||replace(v_required_validation_type,'_',' ')||' validation.',
        'sourceType','PROMISE','promiseId',v_promise.id,'requiredValidationType',v_required_validation_type,'hardBlocker',true,
        'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Request / Open Validation','target','validation')
      ));
    END IF;

    IF v_promise.promise_type='COMMERCIAL' THEN
      v_promise_warnings := v_promise_warnings || jsonb_build_array(jsonb_build_object(
        'code','PROMISE_QUOTATION_APPROVAL_BOUNDARY','message','Quotation-specific pricing, discount, payment-term, and other commercial approval may still be required even when pre-proposal Commercial validation is approved.',
        'sourceType','QUOTATION_BOUNDARY','promiseId',v_promise.id
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_condition_blockers)>0 AND v_scope_status<>'BLOCKED' THEN v_scope_status:='NEEDS_RECONCILIATION'; END IF;
  IF jsonb_array_length(v_promise_blockers)>0 AND v_promise_status='READY' THEN v_promise_status:='BLOCKED'; END IF;

  RETURN jsonb_build_object(
    'opportunityId',v_opp.id,'leadId',v_opp.lead_id,'policyKey','crm_sales_scope_promise_policy_v1','policyVersion',1,'evaluatedAt',statement_timestamp(),
    'scopeConditions',jsonb_build_object(
      'status',v_scope_status,'activeCount',v_conditions_active,'draftCount',v_conditions_draft,'staleCount',v_conditions_stale,
      'resolvedCount',v_conditions_resolved,'supersededCount',v_conditions_superseded,'withdrawnCount',v_conditions_withdrawn,
      'unreconciledRequirements',v_unreconciled,'blockers',v_condition_blockers,'warnings',v_condition_warnings
    ),
    'promises',jsonb_build_object(
      'status',v_promise_status,'activeCount',v_promises_active,'draftCount',v_promises_draft,'supersededCount',v_promises_superseded,'withdrawnCount',v_promises_withdrawn,
      'unapprovedCount',v_promises_unapproved,'validationRequiredCount',v_promises_validation_required,'validationConflictCount',v_promises_validation_conflict,
      'blockers',v_promise_blockers,'warnings',v_promise_warnings
    ),
    'blockers',v_condition_blockers||v_promise_blockers,
    'warnings',v_condition_warnings||v_promise_warnings,
    'sourceTraceability',v_source_trace,
    'futureQuoteCoverage',v_future,
    'finalQuotationSendGateActive',false,
    'writesQuotation',false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_get_sales_scope_commitment_workspace(
  p_lead_id uuid,
  p_opportunity_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_opp_id uuid:=p_opportunity_id;
  v_assessment jsonb;
  v_conditions jsonb;
  v_promises jsonb;
  v_requirements jsonb;
  v_validations jsonb;
  v_meetings jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required for Scope & Commitments.'; END IF;
  IF p_lead_id IS NULL OR NOT public.crm_can_access_lead(p_lead_id) THEN RAISE EXCEPTION 'Authorized CRM Lead access is required.'; END IF;
  IF v_opp_id IS NULL THEN
    SELECT id INTO v_opp_id FROM public.crm_opportunities WHERE lead_id=p_lead_id AND archived_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.crm_opportunities WHERE id=v_opp_id AND lead_id=p_lead_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Opportunity does not belong to this Lead.'; END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'leadId',c.lead_id,'opportunityId',c.opportunity_id,'conditionType',c.condition_type,'title',c.title,'conditionText',c.condition_text,'state',c.state,
    'sourceRequirementId',c.source_requirement_id,'sourceValidationId',c.source_validation_id,'sourceMeetingId',c.source_meeting_id,'sourceType',c.source_type,'sourceRecordId',c.source_record_id,'sourceSummary',c.source_summary,
    'validationAlignmentStatus',c.validation_alignment_status,'createdBy',c.created_by,'createdByName',cu.full_name,'createdAt',c.created_at,'updatedBy',c.updated_by,'updatedAt',c.updated_at,
    'activatedAt',c.activated_at,'supersedesConditionId',c.supersedes_condition_id,'resolvedAt',c.resolved_at,'resolutionNote',c.resolution_note,'withdrawnAt',c.withdrawn_at,'withdrawalReason',c.withdrawal_reason,
    'sourceRequirementTitle',r.title,'sourceRequirementKey',r.requirement_key,'sourceRequirementCertainty',r.information_certainty,
    'sourceValidationType',sv.validation_type,'sourceValidationStatus',sv.status,'approvedConstraints',sv.approved_constraints,
    'sourceMeetingTitle',m.title,'sourceMeetingStartAt',m.start_at
  ) ORDER BY CASE c.state WHEN 'STALE' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'DRAFT' THEN 2 ELSE 3 END,c.updated_at DESC),'[]'::jsonb)
  INTO v_conditions
  FROM public.crm_sales_scope_conditions c
  LEFT JOIN public.user_profiles cu ON cu.id=c.created_by
  LEFT JOIN public.crm_requirements r ON r.id=c.source_requirement_id
  LEFT JOIN public.crm_sales_validations sv ON sv.id=c.source_validation_id
  LEFT JOIN public.sales_meetings m ON m.id=c.source_meeting_id
  WHERE c.lead_id=p_lead_id AND (v_opp_id IS NULL OR c.opportunity_id IS NULL OR c.opportunity_id=v_opp_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'leadId',p.lead_id,'opportunityId',p.opportunity_id,'promiseType',p.promise_type,'promiseText',p.promise_text,'internalContext',p.internal_context,'recordState',p.record_state,
    'sourceType',p.source_type,'sourceRecordId',p.source_record_id,'sourceMeetingId',p.source_meeting_id,'sourceSummary',p.source_summary,'linkedRequirementId',p.linked_requirement_id,'linkedValidationId',p.linked_validation_id,
    'validationAlignmentStatus',p.validation_alignment_status,'promisedBy',p.promised_by,'promisedByName',pu.full_name,'promisedAt',p.promised_at,'recordedBy',p.recorded_by,'recordedByName',ru.full_name,'recordedAt',p.recorded_at,
    'updatedAt',p.updated_at,'supersedesPromiseId',p.supersedes_promise_id,'withdrawnAt',p.withdrawn_at,'withdrawalReason',p.withdrawal_reason,
    'linkedRequirementTitle',r.title,'linkedRequirementKey',r.requirement_key,'linkedRequirementCertainty',r.information_certainty,
    'linkedValidationType',sv.validation_type,'linkedValidationStatus',sv.status,'approvedConstraints',sv.approved_constraints,
    'sourceMeetingTitle',m.title,'sourceMeetingStartAt',m.start_at,'futureQuoteCoverage','NOT_YET_EVALUATED'
  ) ORDER BY CASE p.record_state WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,p.promised_at DESC NULLS LAST,p.updated_at DESC),'[]'::jsonb)
  INTO v_promises
  FROM public.crm_sales_promises p
  LEFT JOIN public.user_profiles pu ON pu.id=p.promised_by
  LEFT JOIN public.user_profiles ru ON ru.id=p.recorded_by
  LEFT JOIN public.crm_requirements r ON r.id=p.linked_requirement_id
  LEFT JOIN public.crm_sales_validations sv ON sv.id=p.linked_validation_id
  LEFT JOIN public.sales_meetings m ON m.id=p.source_meeting_id
  WHERE p.lead_id=p_lead_id AND (v_opp_id IS NULL OR p.opportunity_id IS NULL OR p.opportunity_id=v_opp_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'requirementKey',r.requirement_key,'title',r.title,'category',r.category,'content',r.content,'structuredValue',r.structured_value,'isCustom',r.is_custom,
    'informationCertainty',r.information_certainty,'recordState',r.record_state,'sourceType',r.source_type,'updatedAt',r.updated_at,
    'proposalReconciliationStatus',r.proposal_reconciliation_status,'proposalScopeConditionId',r.proposal_scope_condition_id,'proposalReconciliationNote',r.proposal_reconciliation_note,'proposalReconciledAt',r.proposal_reconciled_at
  ) ORDER BY r.updated_at DESC),'[]'::jsonb)
  INTO v_requirements
  FROM public.crm_requirements r
  WHERE r.lead_id=p_lead_id AND r.record_state='ACTIVE'
    AND (r.requirement_key IN ('assumptions','exclusions','client_dependencies') OR (r.is_custom AND r.category IN ('INTEGRATIONS','CUSTOM_APPLICATION','RISKS_DEPENDENCIES')));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',sv.id,'validationType',sv.validation_type,'severity',sv.severity,'status',sv.status,'subject',sv.subject,'requirementId',sv.requirement_id,'meetingId',sv.meeting_id,
    'approvedConstraints',sv.approved_constraints,'decisionSummary',sv.decision_summary,'updatedAt',sv.updated_at,'supersedesValidationId',sv.supersedes_validation_id
  ) ORDER BY sv.updated_at DESC),'[]'::jsonb)
  INTO v_validations
  FROM public.crm_sales_validations sv
  WHERE sv.lead_id=p_lead_id AND (v_opp_id IS NULL OR sv.opportunity_id IS NULL OR sv.opportunity_id=v_opp_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'status',m.status,'startAt',m.start_at,'completedAt',m.completed_at) ORDER BY m.start_at DESC),'[]'::jsonb)
  INTO v_meetings
  FROM public.sales_meetings m
  LEFT JOIN public.crm_opportunities mo ON mo.id=m.opportunity_id
  WHERE m.lead_id=p_lead_id OR mo.lead_id=p_lead_id;

  IF v_opp_id IS NOT NULL THEN v_assessment:=public.crm_get_sales_scope_commitment_assessment(v_opp_id); ELSE v_assessment:=NULL; END IF;

  RETURN jsonb_build_object(
    'leadId',p_lead_id,'opportunityId',v_opp_id,
    'conditions',v_conditions,'promises',v_promises,'sourceRequirements',v_requirements,'validations',v_validations,'meetings',v_meetings,
    'assessment',v_assessment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_get_sales_scope_commitment_assessment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_get_sales_scope_commitment_workspace(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_get_sales_scope_commitment_assessment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_get_sales_scope_commitment_workspace(uuid,uuid) TO authenticated;
