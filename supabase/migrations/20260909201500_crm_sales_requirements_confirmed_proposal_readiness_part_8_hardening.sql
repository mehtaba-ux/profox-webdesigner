-- CRM Sales SOP Part 8 — final policy/evaluator hardening.
-- Replaces the same canonical policy key and evaluator only. No business table is added.

insert into public.system_configuration(config_key, config_value)
values (
  'crm_sales_gate_policy_v1',
  jsonb_build_object(
    'policyKey','crm_sales_gate_policy_v1',
    'policyVersion',1,
    'evaluatorVersion',2,
    'supportedGates',jsonb_build_array('REQUIREMENTS_CONFIRMED','PROPOSAL_READINESS'),
    'certaintyStates',jsonb_build_array('CLIENT_CONFIRMED','SELLER_OBSERVATION','SELLER_HYPOTHESIS','AWAITING_CLIENT','NEEDS_SPECIALIST_VALIDATION','NOT_APPLICABLE'),
    'requirementClasses',jsonb_build_array('CORE','RECOMMENDED','CONDITIONAL','COMPLEX'),
    'blockingCoreCategories',jsonb_build_array('BUSINESS','PROBLEM','DESIRED_OUTCOME','AUDIENCE_CUSTOMER','PROJECT_SCOPE','COMMERCIAL','DECISION_BUYING_PROCESS','RISKS_DEPENDENCIES'),
    'warningCoreCategories',jsonb_build_array('CONTENT','BRAND','SEO','TECHNICAL'),
    'observationalRequirementKeys',jsonb_build_array('current_situation','existing_digital_state','domain_status','hosting_status','cms_platform'),
    'complexDecisionRequirementKeys',jsonb_build_array('economic_buyer','decision_criteria','decision_process','procurement_process','stakeholder_map','internal_champion'),
    'complexPackageCodes',jsonb_build_array('PF-WEB-SCALE','PF-CUSTOM'),
    'packageFitBehavior',jsonb_build_object('FIT','PASS','POSSIBLE_FIT','WARNING','REVIEW_REQUIRED','RESOLVE_REVIEWS','MISMATCH','BLOCKED'),
    'validationSeverityBehavior',jsonb_build_object('RED','BLOCKED','AMBER','BLOCKED','GREEN','WARNING'),
    'validationTypes',jsonb_build_array('TECHNICAL','COMMERCIAL','TIMELINE','COMPLIANCE_RISK','SCOPE'),
    'proposalDimensions',jsonb_build_array(
      'BUSINESS_CONTEXT','PROBLEM','IMPACT','DESIRED_OUTCOME','AUDIENCE','SCOPE','PACKAGE_FIT','TECHNICAL_VALIDATION','COMMERCIAL_VALIDATION','TIMELINE_VALIDATION','COMPLIANCE_RISK_VALIDATION','DECISION_PROCESS','REQUIREMENTS_COMPLETENESS','MEETING_DISCOVERY_EVIDENCE','NEXT_ACTION','ASSUMPTIONS','EXCLUSIONS','DEPENDENCIES'
    ),
    'futureProposalDimensions',jsonb_build_array('PROMISE_COVERAGE','FINAL_SCOPE_RECONCILIATION','QUOTATION_SNAPSHOT_COVERAGE'),
    'nextAction',jsonb_build_object('requiredForOpenOpportunity',true,'genericSubjects',jsonb_build_array('tbd','follow up','follow-up','wait','waiting')),
    'gates',jsonb_build_object(
      'REQUIREMENTS_CONFIRMED',jsonb_build_object('statusValues',jsonb_build_array('PASS','WARNING','BLOCKED')),
      'PROPOSAL_READINESS',jsonb_build_object('statusValues',jsonb_build_array('READY','WARNING','BLOCKED'),'coverageState','FUTURE_DIMENSIONS_PENDING')
    )
  )
)
on conflict (config_key) do update
set config_value=excluded.config_value, updated_at=now();

create or replace function public.crm_get_sales_gate_assessment(
  p_opportunity_id uuid,
  p_gate_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_opp public.crm_opportunities%rowtype;
  v_policy jsonb;
  v_policy_version integer;
  v_evaluator_version integer;
  v_gate_key text := upper(btrim(coalesce(p_gate_key,'')));
  v_defs jsonb := '[]'::jsonb;
  v_package jsonb := '{}'::jsonb;
  v_package_status text := 'REVIEW_REQUIRED';
  v_recommended_code text;
  v_complex boolean := false;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_dimensions jsonb := '[]'::jsonb;
  v_constraints jsonb := '[]'::jsonb;
  v_resolved_validations jsonb := '[]'::jsonb;
  v_future jsonb := '[]'::jsonb;
  v_def jsonb;
  v_req public.crm_requirements%rowtype;
  v_val public.crm_sales_validations%rowtype;
  v_signal jsonb;
  v_requirement_class text;
  v_key text;
  v_title text;
  v_category text;
  v_conditions jsonb;
  v_applicable boolean;
  v_req_found boolean;
  v_val_found boolean;
  v_meaningful boolean;
  v_issue_status text;
  v_unresolved_behavior text;
  v_required_count integer := 0;
  v_resolved_count integer := 0;
  v_score integer := 0;
  v_pass_dimension_count integer := 0;
  v_status text;
  v_has_evidence boolean := false;
  v_has_next_action boolean := false;
  v_next_action jsonb := null;
  v_unresolved_package_reviews integer := 0;
  v_validation_behavior text;
  v_message text;
  v_action jsonb;
  v_observational_keys jsonb;
  v_complex_keys jsonb;
  v_blocking_core_categories jsonb;
  v_warning_core_categories jsonb;
  v_generic_subjects jsonb;
  v_future_key text;
  v_business_status text := 'PASS';
  v_problem_status text := 'PASS';
  v_impact_status text := 'PASS';
  v_outcome_status text := 'PASS';
  v_audience_status text := 'PASS';
  v_scope_status text := 'PASS';
  v_package_dimension_status text := 'PASS';
  v_technical_validation_status text := 'PASS';
  v_commercial_validation_status text := 'PASS';
  v_timeline_validation_status text := 'PASS';
  v_compliance_validation_status text := 'PASS';
  v_decision_status text := 'PASS';
  v_requirements_status text := 'PASS';
  v_evidence_status text := 'PASS';
  v_next_action_status text := 'PASS';
  v_assumptions_status text := 'PASS';
  v_exclusions_status text := 'PASS';
  v_dependencies_status text := 'PASS';
  v_current_commercial_approved boolean := false;
  v_current_timeline_approved boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication is required for Sales readiness.';
  end if;
  if p_opportunity_id is null then
    raise exception 'Opportunity is required for Sales readiness.';
  end if;

  select * into v_opp
  from public.crm_opportunities
  where id=p_opportunity_id and archived_at is null;
  if not found then raise exception 'Opportunity not found.'; end if;
  if v_opp.lead_id is null or not public.crm_can_access_lead(v_opp.lead_id) then
    raise exception 'Authorized CRM opportunity access is required.';
  end if;

  select config_value into v_policy
  from public.system_configuration
  where config_key='crm_sales_gate_policy_v1';
  if v_policy is null or v_policy->>'policyKey' is distinct from 'crm_sales_gate_policy_v1' then
    raise exception 'Sales readiness policy is unavailable.';
  end if;
  v_policy_version := nullif(v_policy->>'policyVersion','')::integer;
  v_evaluator_version := nullif(v_policy->>'evaluatorVersion','')::integer;
  if v_policy_version is distinct from 1 or v_evaluator_version is distinct from 2 then
    raise exception 'Sales readiness policy version is unsupported.';
  end if;
  if jsonb_typeof(v_policy->'supportedGates') is distinct from 'array'
     or jsonb_array_length(v_policy->'supportedGates')<>2
     or not (v_policy->'supportedGates' ?& array['REQUIREMENTS_CONFIRMED','PROPOSAL_READINESS']) then
    raise exception 'Sales readiness gate policy is malformed.';
  end if;
  if v_gate_key not in ('REQUIREMENTS_CONFIRMED','PROPOSAL_READINESS') then
    raise exception 'Unsupported Sales readiness gate.';
  end if;
  if jsonb_typeof(v_policy->'certaintyStates') is distinct from 'array'
     or jsonb_array_length(v_policy->'certaintyStates')<>6
     or not (v_policy->'certaintyStates' ?& array['CLIENT_CONFIRMED','SELLER_OBSERVATION','SELLER_HYPOTHESIS','AWAITING_CLIENT','NEEDS_SPECIALIST_VALIDATION','NOT_APPLICABLE']) then
    raise exception 'Sales readiness certainty policy is malformed.';
  end if;
  if jsonb_typeof(v_policy->'requirementClasses') is distinct from 'array'
     or jsonb_array_length(v_policy->'requirementClasses')<>4
     or not (v_policy->'requirementClasses' ?& array['CORE','RECOMMENDED','CONDITIONAL','COMPLEX']) then
    raise exception 'Sales readiness Requirement-class policy is malformed.';
  end if;
  if jsonb_typeof(v_policy->'proposalDimensions') is distinct from 'array'
     or jsonb_array_length(v_policy->'proposalDimensions')<>18 then
    raise exception 'Sales readiness proposal-dimension policy is malformed.';
  end if;
  if jsonb_typeof(v_policy->'futureProposalDimensions') is distinct from 'array'
     or jsonb_array_length(v_policy->'futureProposalDimensions')<>3
     or not (v_policy->'futureProposalDimensions' ?& array['PROMISE_COVERAGE','FINAL_SCOPE_RECONCILIATION','QUOTATION_SNAPSHOT_COVERAGE']) then
    raise exception 'Sales readiness future-dimension policy is malformed.';
  end if;
  if coalesce(v_policy#>>'{packageFitBehavior,FIT}','')<>'PASS'
     or coalesce(v_policy#>>'{packageFitBehavior,POSSIBLE_FIT}','')<>'WARNING'
     or coalesce(v_policy#>>'{packageFitBehavior,REVIEW_REQUIRED}','')<>'RESOLVE_REVIEWS'
     or coalesce(v_policy#>>'{packageFitBehavior,MISMATCH}','')<>'BLOCKED' then
    raise exception 'Sales readiness Package Fit policy is malformed.';
  end if;
  if coalesce(v_policy#>>'{validationSeverityBehavior,RED}','')<>'BLOCKED'
     or coalesce(v_policy#>>'{validationSeverityBehavior,AMBER}','')<>'BLOCKED'
     or coalesce(v_policy#>>'{validationSeverityBehavior,GREEN}','')<>'WARNING' then
    raise exception 'Sales readiness validation-severity policy is malformed.';
  end if;

  v_observational_keys := coalesce(v_policy->'observationalRequirementKeys','[]'::jsonb);
  v_complex_keys := coalesce(v_policy->'complexDecisionRequirementKeys','[]'::jsonb);
  v_blocking_core_categories := coalesce(v_policy->'blockingCoreCategories','[]'::jsonb);
  v_warning_core_categories := coalesce(v_policy->'warningCoreCategories','[]'::jsonb);
  v_generic_subjects := coalesce(v_policy#>'{nextAction,genericSubjects}','[]'::jsonb);
  if jsonb_typeof(v_observational_keys)<>'array'
     or jsonb_typeof(v_complex_keys)<>'array'
     or jsonb_typeof(v_blocking_core_categories)<>'array'
     or jsonb_typeof(v_warning_core_categories)<>'array'
     or jsonb_typeof(v_generic_subjects)<>'array' then
    raise exception 'Sales readiness policy arrays are malformed.';
  end if;

  select coalesce(config_value->'definitions','[]'::jsonb) into v_defs
  from public.system_configuration
  where config_key='crm_requirement_definitions_v1';
  if jsonb_typeof(v_defs) is distinct from 'array' or jsonb_array_length(v_defs)=0 then
    raise exception 'Canonical Requirement Definitions are unavailable.';
  end if;
  if exists(
    select 1 from jsonb_array_elements_text(v_observational_keys) k(value)
    where not exists(select 1 from jsonb_array_elements(v_defs) d where d->>'requirementKey'=k.value and coalesce((d->>'active')::boolean,true))
  ) or exists(
    select 1 from jsonb_array_elements_text(v_complex_keys) k(value)
    where not exists(select 1 from jsonb_array_elements(v_defs) d where d->>'requirementKey'=k.value and coalesce((d->>'active')::boolean,true))
  ) then
    raise exception 'Sales readiness policy references an unknown Requirement key.';
  end if;

  -- Part 6 remains the only Package Fit classifier.
  v_package := public.crm_get_package_fit_assessment(v_opp.lead_id, v_opp.id);
  v_package_status := coalesce(v_package->>'status','REVIEW_REQUIRED');
  if v_package_status not in ('FIT','POSSIBLE_FIT','REVIEW_REQUIRED','MISMATCH') then
    raise exception 'Package Fit returned an unsupported status.';
  end if;
  v_recommended_code := v_package#>>'{recommendedProduct,code}';

  v_complex := coalesce(v_policy->'complexPackageCodes','[]'::jsonb) ? coalesce(v_recommended_code,'');
  if not v_complex then
    select exists(
      select 1
      from public.crm_requirements r
      where r.lead_id=v_opp.lead_id
        and r.record_state='ACTIVE'
        and r.information_certainty<>'NOT_APPLICABLE'
        and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
        and (v_complex_keys ? r.requirement_key)
    ) into v_complex;
  end if;
  if not v_complex then
    select exists(
      select 1
      from public.crm_requirements r
      join lateral jsonb_array_elements(v_defs) d on d->>'requirementKey'=r.requirement_key
      where r.lead_id=v_opp.lead_id
        and r.record_state='ACTIVE'
        and r.information_certainty<>'NOT_APPLICABLE'
        and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
        and d->>'requirementClass'='COMPLEX'
    ) into v_complex;
  end if;

  -- Evaluate canonical Requirement Definitions using definition class + applicability + gate policy.
  for v_def in select value from jsonb_array_elements(v_defs) loop
    if not coalesce((v_def->>'active')::boolean,true) then continue; end if;
    v_key := v_def->>'requirementKey';
    v_title := coalesce(v_def->>'title',v_key);
    v_category := coalesce(v_def->>'category','OTHER');
    v_requirement_class := coalesce(v_def->>'requirementClass','RECOMMENDED');
    if v_requirement_class not in ('CORE','RECOMMENDED','CONDITIONAL','COMPLEX') then
      raise exception 'Canonical Requirement Definition has an unsupported class: %',v_requirement_class;
    end if;
    v_conditions := case when jsonb_typeof(v_def#>'{applicability,conditions}')='array' then v_def#>'{applicability,conditions}' else '[]'::jsonb end;

    select * into v_req
    from public.crm_requirements r
    where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and not r.is_custom and r.requirement_key=v_key
    order by r.updated_at desc,r.id desc
    limit 1;
    v_req_found := found;
    v_meaningful := v_req_found and (nullif(btrim(coalesce(v_req.content,'')),'') is not null or v_req.structured_value is not null);

    v_applicable := true;
    if v_requirement_class='CONDITIONAL' and jsonb_array_length(v_conditions)=0 then
      -- Conditionless conditional definitions activate only when the current deal actually captured the area.
      v_applicable := v_req_found and v_req.information_certainty<>'NOT_APPLICABLE' and v_meaningful;
    elsif v_requirement_class='COMPLEX' and jsonb_array_length(v_conditions)=0 then
      v_applicable := v_complex;
    elsif jsonb_array_length(v_conditions)>0 then
      v_applicable := false;
      if v_conditions ? 'complex_decision' and v_complex then v_applicable := true; end if;
      if v_conditions ? 'custom_app' and (
        v_recommended_code='PF-CUSTOM' or exists(
          select 1 from public.crm_requirements r
          where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.category='CUSTOM_APPLICATION'
            and r.information_certainty<>'NOT_APPLICABLE'
            and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
        )
      ) then v_applicable := true; end if;
      if v_conditions ? 'ecommerce' and exists(
        select 1 from public.crm_requirements r
        where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='ecommerce_required'
          and r.information_certainty<>'NOT_APPLICABLE'
          and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
      ) then v_applicable := true; end if;
      if v_conditions ? 'booking' and exists(
        select 1 from public.crm_requirements r
        where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='booking_required'
          and r.information_certainty<>'NOT_APPLICABLE'
          and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
      ) then v_applicable := true; end if;
      if v_conditions ? 'integration' and exists(
        select 1 from public.crm_requirements r
        where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.category='INTEGRATIONS'
          and r.information_certainty<>'NOT_APPLICABLE'
          and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
      ) then v_applicable := true; end if;
    end if;
    if not v_applicable then continue; end if;

    -- Recommended definitions do not become mandatory merely because they exist in the global catalog.
    if v_requirement_class='RECOMMENDED' and not v_req_found then continue; end if;

    if v_requirement_class='CORE' then
      if v_blocking_core_categories ? v_category then v_unresolved_behavior:='BLOCKED';
      elsif v_warning_core_categories ? v_category then v_unresolved_behavior:='WARNING';
      else v_unresolved_behavior:='WARNING'; end if;
    elsif v_requirement_class in ('CONDITIONAL','COMPLEX') then
      v_unresolved_behavior:='BLOCKED';
    else
      v_unresolved_behavior:='WARNING';
    end if;

    if v_requirement_class in ('CORE','CONDITIONAL','COMPLEX') then v_required_count:=v_required_count+1; end if;
    v_issue_status := 'PASS';
    v_message := null;

    if not v_req_found or (not v_meaningful and coalesce(v_req.information_certainty,'')<>'NOT_APPLICABLE') then
      v_issue_status:=v_unresolved_behavior;
      v_message:=v_title||' is missing or has no meaningful current value.';
    elsif v_req.information_certainty='NOT_APPLICABLE' then
      v_issue_status:='PASS';
    elsif v_req.information_certainty='CLIENT_CONFIRMED' then
      v_issue_status:='PASS';
    elsif v_req.information_certainty='SELLER_OBSERVATION' and (v_observational_keys ? v_key) then
      v_issue_status:='WARNING';
      v_message:=v_title||' is a Seller observation; keep it separate from client-confirmed truth.';
    elsif v_req.information_certainty='NEEDS_SPECIALIST_VALIDATION' then
      select * into v_val
      from public.crm_sales_validations sv
      where sv.lead_id=v_opp.lead_id
        and sv.requirement_id=v_req.id
        and (sv.opportunity_id is null or sv.opportunity_id=v_opp.id)
        and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=sv.id)
      order by sv.updated_at desc,sv.id desc
      limit 1;
      v_val_found:=found;
      if v_val_found and v_val.status='APPROVED' then
        v_issue_status:='PASS';
        v_resolved_validations:=v_resolved_validations||jsonb_build_array(jsonb_build_object(
          'validationId',v_val.id,'validationType',v_val.validation_type,'requirementId',v_req.id,'requirementKey',v_key,'status','APPROVED','severity',v_val.severity
        ));
        if nullif(btrim(coalesce(v_val.approved_constraints,'')),'') is not null then
          v_constraints:=v_constraints||jsonb_build_array(jsonb_build_object(
            'validationId',v_val.id,'validationType',v_val.validation_type,'requirementId',v_req.id,'requirementKey',v_key,'constraints',v_val.approved_constraints
          ));
        end if;
      else
        v_issue_status:='BLOCKED';
        v_message:=v_title||' requires a current approved specialist review'||case when v_val_found then ' (current status: '||replace(v_val.status,'_',' ')||').' else '.' end;
      end if;
    elsif v_req.information_certainty='SELLER_HYPOTHESIS' then
      v_issue_status:=v_unresolved_behavior;
      v_message:=v_title||' is only a Seller hypothesis.';
    elsif v_req.information_certainty='AWAITING_CLIENT' then
      v_issue_status:=v_unresolved_behavior;
      v_message:=v_title||' is Awaiting Client.';
    elsif v_req.information_certainty='SELLER_OBSERVATION' then
      v_issue_status:=v_unresolved_behavior;
      v_message:=v_title||' is a Seller observation and this gate policy requires stronger confirmation.';
    else
      v_issue_status:=v_unresolved_behavior;
      v_message:=v_title||' is unresolved.';
    end if;

    if v_issue_status='PASS' and v_requirement_class in ('CORE','CONDITIONAL','COMPLEX') then v_resolved_count:=v_resolved_count+1; end if;
    if v_issue_status='BLOCKED' then v_requirements_status:='BLOCKED';
    elsif v_issue_status='WARNING' and v_requirements_status<>'BLOCKED' then v_requirements_status:='WARNING'; end if;

    -- Map current Requirement issues to human proposal-readiness dimensions without duplicating the Requirement truth.
    if v_category='BUSINESS' then
      if v_issue_status='BLOCKED' then v_business_status:='BLOCKED'; elsif v_issue_status='WARNING' and v_business_status<>'BLOCKED' then v_business_status:='WARNING'; end if;
    elsif v_category='PROBLEM' and v_key in ('business_impact','cost_of_inaction') then
      if v_issue_status='BLOCKED' then v_impact_status:='BLOCKED'; elsif v_issue_status='WARNING' and v_impact_status<>'BLOCKED' then v_impact_status:='WARNING'; end if;
    elsif v_category='PROBLEM' then
      if v_issue_status='BLOCKED' then v_problem_status:='BLOCKED'; elsif v_issue_status='WARNING' and v_problem_status<>'BLOCKED' then v_problem_status:='WARNING'; end if;
    elsif v_category='DESIRED_OUTCOME' then
      if v_issue_status='BLOCKED' then v_outcome_status:='BLOCKED'; elsif v_issue_status='WARNING' and v_outcome_status<>'BLOCKED' then v_outcome_status:='WARNING'; end if;
    elsif v_category='AUDIENCE_CUSTOMER' then
      if v_issue_status='BLOCKED' then v_audience_status:='BLOCKED'; elsif v_issue_status='WARNING' and v_audience_status<>'BLOCKED' then v_audience_status:='WARNING'; end if;
    elsif v_category='DECISION_BUYING_PROCESS' then
      if v_issue_status='BLOCKED' then v_decision_status:='BLOCKED'; elsif v_issue_status='WARNING' and v_decision_status<>'BLOCKED' then v_decision_status:='WARNING'; end if;
    elsif v_category in ('PROJECT_SCOPE','CONTENT','BRAND','SEO','ANALYTICS','TECHNICAL','INTEGRATIONS','ECOMMERCE','BOOKING','CUSTOM_APPLICATION','RISKS_DEPENDENCIES') then
      if v_issue_status='BLOCKED' then v_scope_status:='BLOCKED'; elsif v_issue_status='WARNING' and v_scope_status<>'BLOCKED' then v_scope_status:='WARNING'; end if;
    end if;

    if v_key='assumptions' then v_assumptions_status:=v_issue_status; end if;
    if v_key='exclusions' then v_exclusions_status:=v_issue_status; end if;
    if v_key='client_dependencies' then v_dependencies_status:=v_issue_status; end if;

    v_action:=jsonb_build_object('actionKey','OPEN_REQUIREMENTS','label','Open Requirements','target','requirements','requirementKey',v_key);
    if v_issue_status='BLOCKED' then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','REQUIREMENT_'||upper(v_key),'message',v_message,'sourceType','REQUIREMENT','requirementId',case when v_req_found then v_req.id else null end,
        'requirementKey',v_key,'category',v_category,'requirementClass',v_requirement_class,'hardBlocker',true,'action',v_action
      ));
    elsif v_issue_status='WARNING' then
      v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
        'code','REQUIREMENT_'||upper(v_key),'message',v_message,'sourceType','REQUIREMENT','requirementId',case when v_req_found then v_req.id else null end,
        'requirementKey',v_key,'category',v_category,'requirementClass',v_requirement_class,'action',v_action
      ));
    end if;
  end loop;

  -- Structured Requirements/Discovery/completed Meeting evidence is credible; opportunity prose alone is not.
  select exists(
    select 1 from public.crm_requirements r
    where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE'
      and (r.source_recorded_at is not null or r.source_type is not null)
      and (r.information_certainty='NOT_APPLICABLE' or nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
  ) or exists(
    select 1 from public.crm_discovery_responses dr
    where dr.lead_id=v_opp.lead_id and (nullif(btrim(coalesce(dr.answer_text,'')),'') is not null or dr.structured_value is not null)
  ) or exists(
    select 1 from public.sales_meetings m
    where (m.lead_id=v_opp.lead_id or m.opportunity_id=v_opp.id) and m.status='Completed'
  ) into v_has_evidence;
  if not v_has_evidence then
    v_evidence_status:='BLOCKED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','STRUCTURED_EVIDENCE_MISSING','message','Requirements need credible structured CRM, Discovery, or completed-meeting evidence; a legacy requirements_summary alone is not sufficient.',
      'sourceType','DISCOVERY','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_DISCOVERY','label','Open Probing & Discovery','target','discovery')
    ));
  end if;

  -- Part 6 Package Fit is interpreted by status. mismatchSignals describe lower candidate mismatches and are never promoted into independent blockers here.
  if v_package_status='MISMATCH' then
    v_package_dimension_status:='BLOCKED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PACKAGE_FIT_MISMATCH','message','Package Fit is MISMATCH. Resolve the current scope/package mismatch before confirming requirements.',
      'sourceType','PACKAGE_FIT','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_PACKAGE_FIT','label','Open Package Fit','target','package-fit')
    ));
  elsif v_package_status='POSSIBLE_FIT' then
    v_package_dimension_status:='WARNING';
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
      'code','PACKAGE_FIT_POSSIBLE','message','Package Fit is POSSIBLE FIT. Review the remaining uncertainty before proposal preparation.',
      'sourceType','PACKAGE_FIT','action',jsonb_build_object('actionKey','OPEN_PACKAGE_FIT','label','Open Package Fit','target','package-fit')
    ));
  elsif v_package_status='REVIEW_REQUIRED' then
    v_unresolved_package_reviews:=0;
    for v_signal in select value from jsonb_array_elements(coalesce(v_package->'validationSignals','[]'::jsonb)) loop
      if nullif(v_signal->>'requirementId','') is not null then
        select * into v_val
        from public.crm_sales_validations sv
        where sv.lead_id=v_opp.lead_id
          and sv.requirement_id=(v_signal->>'requirementId')::uuid
          and (sv.opportunity_id is null or sv.opportunity_id=v_opp.id)
          and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=sv.id)
        order by sv.updated_at desc,sv.id desc limit 1;
      else
        select * into v_val
        from public.crm_sales_validations sv
        where sv.lead_id=v_opp.lead_id
          and (sv.opportunity_id is null or sv.opportunity_id=v_opp.id)
          and sv.source_type='PACKAGE_FIT'
          and sv.source_key='package-fit:'||coalesce(v_signal->>'code','')
          and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=sv.id)
        order by sv.updated_at desc,sv.id desc limit 1;
      end if;
      v_val_found:=found;
      if not v_val_found or v_val.status<>'APPROVED' then
        v_unresolved_package_reviews:=v_unresolved_package_reviews+1;
      end if;
    end loop;
    if jsonb_array_length(coalesce(v_package->'validationSignals','[]'::jsonb))=0
       or jsonb_array_length(coalesce(v_package->'missingInformation','[]'::jsonb))>0
       or coalesce(v_package->>'configurationStatus','OK')<>'OK' then
      v_unresolved_package_reviews:=v_unresolved_package_reviews+1;
    end if;
    if v_unresolved_package_reviews>0 then
      v_package_dimension_status:='BLOCKED';
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','PACKAGE_FIT_REVIEW_REQUIRED','message','Package Fit still has unresolved review or information requirements.',
        'sourceType','PACKAGE_FIT','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')
      ));
    else
      v_package_dimension_status:='WARNING';
      v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
        'code','PACKAGE_FIT_REVIEW_RESOLVED','message','Package Fit remains REVIEW REQUIRED, but all current structured specialist-review signals are approved. Keep approved constraints visible.',
        'sourceType','PACKAGE_FIT','action',jsonb_build_object('actionKey','OPEN_PACKAGE_FIT','label','Open Package Fit','target','package-fit')
      ));
    end if;
  end if;

  -- Part 7 remains the only specialist-review authority. Evaluate only current, unsuperseded review records.
  for v_val in
    select distinct on (coalesce(requirement_id,id),validation_type) sv.*
    from public.crm_sales_validations sv
    where sv.lead_id=v_opp.lead_id
      and (sv.opportunity_id is null or sv.opportunity_id=v_opp.id)
      and not exists(select 1 from public.crm_sales_validations child where child.supersedes_validation_id=sv.id)
    order by coalesce(requirement_id,id),validation_type,updated_at desc,id desc
  loop
    if v_val.status='APPROVED' then
      v_resolved_validations:=v_resolved_validations||jsonb_build_array(jsonb_build_object(
        'validationId',v_val.id,'validationType',v_val.validation_type,'status','APPROVED','severity',v_val.severity,'requirementId',v_val.requirement_id
      ));
      if nullif(btrim(coalesce(v_val.approved_constraints,'')),'') is not null then
        v_constraints:=v_constraints||jsonb_build_array(jsonb_build_object(
          'validationId',v_val.id,'validationType',v_val.validation_type,'requirementId',v_val.requirement_id,'constraints',v_val.approved_constraints
        ));
      end if;
      if v_val.validation_type='COMMERCIAL' then v_current_commercial_approved:=true; end if;
      if v_val.validation_type='TIMELINE' then v_current_timeline_approved:=true; end if;
      continue;
    end if;

    if v_val.status in ('PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE') then
      v_validation_behavior:=coalesce(v_policy#>>array['validationSeverityBehavior',v_val.severity],case when v_val.severity='GREEN' then 'WARNING' else 'BLOCKED' end);
      if v_val.status in ('REJECTED','STALE') then v_validation_behavior:='BLOCKED'; end if;
      v_message:=initcap(lower(replace(v_val.validation_type,'_',' ')))||' review is '||replace(v_val.status,'_',' ')||'.';

      if v_val.validation_type='TECHNICAL' or v_val.validation_type='SCOPE' then
        if v_validation_behavior='BLOCKED' then v_technical_validation_status:='BLOCKED'; elsif v_technical_validation_status<>'BLOCKED' then v_technical_validation_status:='WARNING'; end if;
      elsif v_val.validation_type='COMMERCIAL' then
        if v_validation_behavior='BLOCKED' then v_commercial_validation_status:='BLOCKED'; elsif v_commercial_validation_status<>'BLOCKED' then v_commercial_validation_status:='WARNING'; end if;
      elsif v_val.validation_type='TIMELINE' then
        if v_validation_behavior='BLOCKED' then v_timeline_validation_status:='BLOCKED'; elsif v_timeline_validation_status<>'BLOCKED' then v_timeline_validation_status:='WARNING'; end if;
      elsif v_val.validation_type='COMPLIANCE_RISK' then
        if v_validation_behavior='BLOCKED' then v_compliance_validation_status:='BLOCKED'; elsif v_compliance_validation_status<>'BLOCKED' then v_compliance_validation_status:='WARNING'; end if;
      end if;

      if v_validation_behavior='BLOCKED' then
        v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
          'code','VALIDATION_'||v_val.validation_type||'_'||v_val.status,'message',v_message,'sourceType','VALIDATION','validationId',v_val.id,
          'validationType',v_val.validation_type,'severity',v_val.severity,'hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')
        ));
      else
        v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
          'code','VALIDATION_'||v_val.validation_type||'_'||v_val.status,'message',v_message,'sourceType','VALIDATION','validationId',v_val.id,
          'validationType',v_val.validation_type,'severity',v_val.severity,'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')
        ));
      end if;
    end if;
  end loop;

  -- Current catalog flags are read live. Manager approval remains downstream quotation authority even after a pre-proposal Commercial review.
  if coalesce((v_package->>'managerApprovalRequired')::boolean,false) then
    if v_commercial_validation_status='PASS' and not v_current_commercial_approved then v_commercial_validation_status:='WARNING'; end if;
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
      'code','DOWNSTREAM_MANAGER_APPROVAL_REQUIRED',
      'message',case when v_current_commercial_approved
        then 'Current pre-proposal Commercial validation is approved, but the current catalog product still requires downstream manager/quotation approval where applicable.'
        else 'The current catalog product requires downstream manager approval. A Part 7 Commercial review can resolve current Sales uncertainty; quotation-specific approval remains separate.' end,
      'sourceType','CATALOG','action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')
    ));
  end if;

  if coalesce((v_package->>'timelineAssessmentRequired')::boolean,false) and not v_current_timeline_approved then
    v_timeline_validation_status:='BLOCKED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','TIMELINE_ASSESSMENT_REQUIRED','message','Current catalog guidance requires a current approved Timeline review before timing is treated as resolved.',
      'sourceType','CATALOG','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')
    ));
  end if;

  -- Existing activity/meeting systems remain authoritative for the meaningful next action.
  select jsonb_build_object('sourceType','ACTIVITY','activityId',a.id,'action',a.subject,'ownerId',a.assigned_to,'dueAt',a.due_at) into v_next_action
  from public.crm_activities a
  where (a.opportunity_id=v_opp.id or (a.opportunity_id is null and a.lead_id=v_opp.lead_id))
    and a.status='Scheduled' and a.completed_at is null and a.assigned_to is not null and a.due_at is not null
    and nullif(btrim(coalesce(a.subject,'')),'') is not null and not (v_generic_subjects ? lower(btrim(a.subject)))
  order by a.due_at asc,a.created_at asc limit 1;
  v_has_next_action:=found;
  if not v_has_next_action then
    select jsonb_build_object('sourceType','SALES_MEETING','meetingId',m.id,'action',m.next_step,'ownerId',m.salesperson_id,'dueAt',m.follow_up_at) into v_next_action
    from public.sales_meetings m
    where (m.opportunity_id=v_opp.id or m.lead_id=v_opp.lead_id) and m.status='Completed'
      and m.salesperson_id is not null and m.follow_up_at is not null
      and nullif(btrim(coalesce(m.next_step,'')),'') is not null and not (v_generic_subjects ? lower(btrim(m.next_step)))
    order by m.completed_at desc nulls last,m.updated_at desc limit 1;
    v_has_next_action:=found;
  end if;
  if v_opp.status='Open' and not v_has_next_action then
    v_next_action_status:='BLOCKED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','NEXT_ACTION_MISSING','message','This open opportunity has no meaningful next action with an owner and due timing.',
      'sourceType','ACTIVITY','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_FOLLOW_UPS','label','Open Follow-Ups','target','follow-ups')
    ));
  end if;

  v_dimensions:=jsonb_build_array(
    jsonb_build_object('key','BUSINESS_CONTEXT','label','Business / Context','status',v_business_status),
    jsonb_build_object('key','PROBLEM','label','Problem','status',v_problem_status),
    jsonb_build_object('key','IMPACT','label','Impact','status',v_impact_status),
    jsonb_build_object('key','DESIRED_OUTCOME','label','Desired Outcome','status',v_outcome_status),
    jsonb_build_object('key','AUDIENCE','label','Audience','status',v_audience_status),
    jsonb_build_object('key','SCOPE','label','Scope','status',v_scope_status),
    jsonb_build_object('key','PACKAGE_FIT','label','Package Fit','status',v_package_dimension_status,'sourceStatus',v_package_status,'confidence',v_package->>'confidence'),
    jsonb_build_object('key','TECHNICAL_VALIDATION','label','Technical Validation','status',v_technical_validation_status),
    jsonb_build_object('key','COMMERCIAL_VALIDATION','label','Commercial Validation','status',v_commercial_validation_status),
    jsonb_build_object('key','TIMELINE_VALIDATION','label','Timeline Validation','status',v_timeline_validation_status),
    jsonb_build_object('key','COMPLIANCE_RISK_VALIDATION','label','Compliance/Risk Validation','status',v_compliance_validation_status),
    jsonb_build_object('key','DECISION_PROCESS','label','Decision Process','status',v_decision_status),
    jsonb_build_object('key','REQUIREMENTS_COMPLETENESS','label','Requirements Completeness','status',v_requirements_status,'resolved',v_resolved_count,'required',v_required_count),
    jsonb_build_object('key','MEETING_DISCOVERY_EVIDENCE','label','Meeting / Discovery Evidence','status',v_evidence_status),
    jsonb_build_object('key','NEXT_ACTION','label','Next Action','status',v_next_action_status,'current',v_next_action),
    jsonb_build_object('key','ASSUMPTIONS','label','Current Assumptions','status',v_assumptions_status),
    jsonb_build_object('key','EXCLUSIONS','label','Current Exclusions','status',v_exclusions_status),
    jsonb_build_object('key','DEPENDENCIES','label','Current Dependencies','status',v_dependencies_status)
  );

  select count(*) into v_pass_dimension_count
  from jsonb_array_elements(v_dimensions) d
  where d->>'status'='PASS';
  v_score:=least(100,greatest(0,round(100.0*v_pass_dimension_count/18.0)::integer));

  if v_gate_key='PROPOSAL_READINESS' then
    for v_future_key in select value from jsonb_array_elements_text(v_policy->'futureProposalDimensions') loop
      v_future:=v_future||jsonb_build_array(jsonb_build_object('key',v_future_key,'status','NOT_YET_EVALUATED','coverageState','FUTURE_WORKFLOW'));
    end loop;
    if jsonb_array_length(v_blockers)>0 then v_status:='BLOCKED';
    elsif jsonb_array_length(v_warnings)>0 then v_status:='WARNING';
    else v_status:='READY'; end if;
  else
    if jsonb_array_length(v_blockers)>0 then v_status:='BLOCKED';
    elsif jsonb_array_length(v_warnings)>0 then v_status:='WARNING';
    else v_status:='PASS'; end if;
  end if;

  return jsonb_build_object(
    'opportunityId',v_opp.id,'leadId',v_opp.lead_id,'gateKey',v_gate_key,
    'policyKey','crm_sales_gate_policy_v1','policyVersion',v_policy_version,'evaluatorVersion',v_evaluator_version,'evaluatedAt',statement_timestamp(),
    'status',v_status,'score',v_score,
    'coverageState',case when v_gate_key='PROPOSAL_READINESS' then 'FUTURE_DIMENSIONS_PENDING' else 'CURRENT_DIMENSIONS_COMPLETE' end,
    'dimensions',v_dimensions,'blockers',v_blockers,'warnings',v_warnings,
    'resolvedValidations',v_resolved_validations,'approvedConstraints',v_constraints,
    'futureDimensions',v_future,'nextAction',v_next_action,
    'packageFit',jsonb_build_object(
      'status',v_package_status,'confidence',v_package->>'confidence','recommendedProduct',v_package->'recommendedProduct',
      'managerApprovalRequired',v_package->'managerApprovalRequired','timelineAssessmentRequired',v_package->'timelineAssessmentRequired'
    ),
    'legacyRequirementsSummaryPresent',nullif(btrim(coalesce(v_opp.requirements_summary,'')),'') is not null,
    'legacyRequirementsSummaryAuthoritative',false,
    'finalQuotationSendGateActive',false
  );
end;
$function$;

revoke all on function public.crm_get_sales_gate_assessment(uuid,text) from public, anon;
grant execute on function public.crm_get_sales_gate_assessment(uuid,text) to authenticated;
