-- CRM Sales SOP Part 8 — Requirements Confirmed Gate + Proposal Readiness Foundation
-- Reuses Parts 1–7. Adds no business tables and does not change quotation-send authority.

insert into public.system_configuration(config_key, config_value)
values (
  'crm_sales_gate_policy_v1',
  jsonb_build_object(
    'policyKey','crm_sales_gate_policy_v1',
    'policyVersion',1,
    'evaluatorVersion',1,
    'supportedGates',jsonb_build_array('REQUIREMENTS_CONFIRMED','PROPOSAL_READINESS'),
    'certaintyStates',jsonb_build_array('CLIENT_CONFIRMED','SELLER_OBSERVATION','SELLER_HYPOTHESIS','AWAITING_CLIENT','NEEDS_SPECIALIST_VALIDATION','NOT_APPLICABLE'),
    'observationalRequirementKeys',jsonb_build_array('current_situation','existing_digital_state','domain_status','hosting_status','cms_platform'),
    'complexDecisionRequirementKeys',jsonb_build_array('economic_buyer','decision_criteria','decision_process','procurement_process','stakeholder_map','internal_champion'),
    'complexPackageCodes',jsonb_build_array('PF-WEB-SCALE','PF-CUSTOM'),
    'packageFitBehavior',jsonb_build_object('FIT','PASS','POSSIBLE_FIT','WARNING','REVIEW_REQUIRED','RESOLVE_REVIEWS','MISMATCH','BLOCKED'),
    'validationSeverityBehavior',jsonb_build_object('RED','BLOCKED','AMBER','BLOCKED','GREEN','WARNING'),
    'futureProposalDimensions',jsonb_build_array('PROMISE_COVERAGE','FINAL_SCOPE_RECONCILIATION','QUOTATION_SNAPSHOT_COVERAGE'),
    'nextAction',jsonb_build_object('requiredForOpenOpportunity',true,'genericSubjects',jsonb_build_array('tbd','follow up','follow-up','wait','waiting')),
    'gates',jsonb_build_object(
      'REQUIREMENTS_CONFIRMED',jsonb_build_object('statusValues',jsonb_build_array('PASS','WARNING','BLOCKED'),'coreRequirementClass','CORE','recommendedRequirementBehavior','WARNING'),
      'PROPOSAL_READINESS',jsonb_build_object('statusValues',jsonb_build_array('READY','WARNING','BLOCKED'),'coreRequirementClass','CORE','recommendedRequirementBehavior','WARNING','coverageState','FUTURE_DIMENSIONS_PENDING')
    )
  )
)
on conflict (config_key) do update set config_value=excluded.config_value, updated_at=now();

create or replace function public.crm_get_sales_gate_assessment(
  p_opportunity_id uuid,
  p_gate_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_opp public.crm_opportunities%rowtype;
  v_policy jsonb;
  v_policy_version integer;
  v_evaluator_version integer;
  v_gate_key text := upper(btrim(coalesce(p_gate_key,'')));
  v_defs jsonb := '[]'::jsonb;
  v_package jsonb;
  v_package_status text;
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
  v_requirement_class text;
  v_key text;
  v_title text;
  v_category text;
  v_conditions jsonb;
  v_applicable boolean;
  v_meaningful boolean;
  v_dimension_status text;
  v_required_count integer := 0;
  v_resolved_count integer := 0;
  v_score integer := 0;
  v_status text;
  v_has_evidence boolean := false;
  v_has_next_action boolean := false;
  v_next_action jsonb := null;
  v_unresolved_package_reviews integer := 0;
  v_signal jsonb;
  v_validation_type text;
  v_validation_behavior text;
  v_message text;
  v_action jsonb;
  v_observational_keys jsonb;
  v_complex_keys jsonb;
  v_generic_subjects jsonb;
  v_future_key text;
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

  select config_value into v_policy from public.system_configuration where config_key='crm_sales_gate_policy_v1';
  if v_policy is null or v_policy->>'policyKey' is distinct from 'crm_sales_gate_policy_v1' then
    raise exception 'Sales readiness policy is unavailable.';
  end if;
  v_policy_version := nullif(v_policy->>'policyVersion','')::integer;
  v_evaluator_version := nullif(v_policy->>'evaluatorVersion','')::integer;
  if v_policy_version is distinct from 1 or v_evaluator_version is distinct from 1 then
    raise exception 'Sales readiness policy version is unsupported.';
  end if;
  if not (coalesce(v_policy->'supportedGates','[]'::jsonb) ? v_gate_key) then
    raise exception 'Unsupported Sales readiness gate.';
  end if;
  if v_gate_key not in ('REQUIREMENTS_CONFIRMED','PROPOSAL_READINESS') then
    raise exception 'Unsupported Sales readiness gate.';
  end if;

  v_observational_keys := coalesce(v_policy->'observationalRequirementKeys','[]'::jsonb);
  v_complex_keys := coalesce(v_policy->'complexDecisionRequirementKeys','[]'::jsonb);
  v_generic_subjects := coalesce(v_policy#>'{nextAction,genericSubjects}','[]'::jsonb);

  select coalesce(config_value->'definitions','[]'::jsonb) into v_defs
  from public.system_configuration where config_key='crm_requirement_definitions_v1';
  if jsonb_typeof(v_defs) is distinct from 'array' or jsonb_array_length(v_defs)=0 then
    raise exception 'Canonical Requirement Definitions are unavailable.';
  end if;

  -- Reuse Part 6 exactly; current catalog remains inside the Part 6 evaluator.
  v_package := public.crm_get_package_fit_assessment(v_opp.lead_id, v_opp.id);
  v_package_status := coalesce(v_package->>'status','REVIEW_REQUIRED');
  v_recommended_code := v_package#>>'{recommendedProduct,code}';

  v_complex := coalesce(v_policy->'complexPackageCodes','[]'::jsonb) ? coalesce(v_recommended_code,'');
  if not v_complex then
    select exists(
      select 1 from public.crm_requirements r
      join lateral jsonb_array_elements(v_defs) d on d->>'requirementKey'=r.requirement_key
      where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.information_certainty<>'NOT_APPLICABLE'
        and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)
        and d->>'requirementClass'='COMPLEX'
    ) into v_complex;
  end if;

  -- Canonical Requirement Definition applicability. Conditional/complex groups only activate when their real condition is present.
  for v_def in select value from jsonb_array_elements(v_defs) loop
    if not coalesce((v_def->>'active')::boolean,true) then continue; end if;
    v_key := v_def->>'requirementKey';
    v_title := coalesce(v_def->>'title',v_key);
    v_category := coalesce(v_def->>'category','OTHER');
    v_requirement_class := coalesce(v_def->>'requirementClass','RECOMMENDED');
    v_conditions := case when jsonb_typeof(v_def#>'{applicability,conditions}')='array' then v_def#>'{applicability,conditions}' else '[]'::jsonb end;
    v_applicable := true;

    if jsonb_array_length(v_conditions)>0 then
      v_applicable := false;
      if v_conditions ? 'complex_decision' and v_complex then v_applicable := true; end if;
      if v_conditions ? 'custom_app' and (
        v_recommended_code='PF-CUSTOM' or exists(select 1 from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.category='CUSTOM_APPLICATION' and r.information_certainty<>'NOT_APPLICABLE' and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null))
      ) then v_applicable := true; end if;
      if v_conditions ? 'ecommerce' and exists(select 1 from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='ecommerce_required' and r.information_certainty<>'NOT_APPLICABLE' and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)) then v_applicable := true; end if;
      if v_conditions ? 'booking' and exists(select 1 from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='booking_required' and r.information_certainty<>'NOT_APPLICABLE' and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)) then v_applicable := true; end if;
      if v_conditions ? 'integration' and exists(select 1 from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.category='INTEGRATIONS' and r.information_certainty<>'NOT_APPLICABLE' and (nullif(btrim(coalesce(r.content,'')),'') is not null or r.structured_value is not null)) then v_applicable := true; end if;
    end if;
    if not v_applicable then continue; end if;

    if v_requirement_class not in ('CORE','COMPLEX','RECOMMENDED') then continue; end if;
    if v_requirement_class='COMPLEX' and not v_complex then continue; end if;

    select * into v_req from public.crm_requirements r
    where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and not r.is_custom and r.requirement_key=v_key
    order by r.updated_at desc,r.id desc limit 1;
    v_meaningful := found and (nullif(btrim(coalesce(v_req.content,'')),'') is not null or v_req.structured_value is not null);
    v_dimension_status := 'PASS';

    if v_requirement_class in ('CORE','COMPLEX') then v_required_count := v_required_count+1; end if;

    if not found or (not v_meaningful and coalesce(v_req.information_certainty,'')<>'NOT_APPLICABLE') then
      v_dimension_status := case when v_requirement_class='RECOMMENDED' then 'WARNING' else 'BLOCKED' end;
      v_message := v_title || ' is missing.';
    elsif v_req.information_certainty='NOT_APPLICABLE' then
      v_dimension_status := 'PASS';
    elsif v_req.information_certainty='CLIENT_CONFIRMED' then
      v_dimension_status := 'PASS';
    elsif v_req.information_certainty='SELLER_OBSERVATION' and (v_observational_keys ? v_key) then
      v_dimension_status := 'WARNING';
      v_message := v_title || ' is a Seller observation; confirm it with the client when practical.';
    elsif v_req.information_certainty='NEEDS_SPECIALIST_VALIDATION' then
      select * into v_val from public.crm_sales_validations v
      where v.lead_id=v_opp.lead_id and v.requirement_id=v_req.id
      order by v.updated_at desc,v.id desc limit 1;
      if found and v_val.status='APPROVED' then
        v_dimension_status := 'PASS';
        v_resolved_validations := v_resolved_validations || jsonb_build_array(jsonb_build_object('validationId',v_val.id,'validationType',v_val.validation_type,'requirementId',v_req.id,'requirementKey',v_key,'status','APPROVED'));
        if nullif(btrim(coalesce(v_val.approved_constraints,'')),'') is not null then
          v_constraints := v_constraints || jsonb_build_array(jsonb_build_object('validationId',v_val.id,'validationType',v_val.validation_type,'requirementKey',v_key,'constraints',v_val.approved_constraints));
        end if;
      else
        v_dimension_status := 'BLOCKED';
        v_message := v_title || ' requires a current approved specialist review' || case when found then ' (current status: '||v_val.status||').' else '.' end;
      end if;
    elsif v_req.information_certainty='SELLER_HYPOTHESIS' then
      v_dimension_status := case when v_requirement_class='RECOMMENDED' then 'WARNING' else 'BLOCKED' end;
      v_message := v_title || ' is only a Seller hypothesis.';
    elsif v_req.information_certainty='AWAITING_CLIENT' then
      v_dimension_status := case when v_requirement_class='RECOMMENDED' then 'WARNING' else 'BLOCKED' end;
      v_message := v_title || ' is Awaiting Client.';
    else
      v_dimension_status := case when v_requirement_class='RECOMMENDED' then 'WARNING' else 'BLOCKED' end;
      v_message := v_title || ' is unresolved.';
    end if;

    if v_dimension_status='PASS' and v_requirement_class in ('CORE','COMPLEX') then v_resolved_count:=v_resolved_count+1; end if;
    v_action := jsonb_build_object('actionKey','OPEN_REQUIREMENTS','label','Open Requirements','target','requirements','requirementKey',v_key);
    if v_dimension_status='BLOCKED' then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','REQUIREMENT_'||upper(v_key),'message',v_message,'sourceType','REQUIREMENT','requirementId',case when found then v_req.id else null end,'requirementKey',v_key,'category',v_category,'hardBlocker',true,'action',v_action));
    elsif v_dimension_status='WARNING' then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code','REQUIREMENT_'||upper(v_key),'message',v_message,'sourceType','REQUIREMENT','requirementId',case when found then v_req.id else null end,'requirementKey',v_key,'category',v_category,'action',v_action));
    end if;
  end loop;

  -- Credible evidence is structured CRM evidence, not legacy opportunity prose alone.
  select exists(
    select 1 from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and (r.source_recorded_at is not null or r.source_type is not null)
  ) or exists(
    select 1 from public.crm_discovery_responses dr where dr.lead_id=v_opp.lead_id and (nullif(btrim(coalesce(dr.answer_text,'')),'') is not null or dr.structured_value is not null)
  ) or exists(
    select 1 from public.sales_meetings m where (m.lead_id=v_opp.lead_id or m.opportunity_id=v_opp.id) and m.status='Completed'
  ) into v_has_evidence;
  if not v_has_evidence then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','STRUCTURED_EVIDENCE_MISSING','message','Requirements need credible structured CRM, Discovery, or completed-meeting evidence; a legacy summary alone is not sufficient.','sourceType','DISCOVERY','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_DISCOVERY','label','Open Probing & Discovery','target','discovery')));
  end if;

  -- Part 6 Package Fit is reused as-is; Part 8 only interprets its result for this lifecycle gate.
  if v_package_status='MISMATCH' then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PACKAGE_FIT_MISMATCH','message','Package Fit is MISMATCH. Resolve the scope/package mismatch before confirming requirements.','sourceType','PACKAGE_FIT','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_PACKAGE_FIT','label','Open Package Fit','target','package-fit')));
  elsif v_package_status='POSSIBLE_FIT' then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','PACKAGE_FIT_POSSIBLE','message','Package Fit is POSSIBLE FIT. Review the remaining uncertainty before proposal preparation.','sourceType','PACKAGE_FIT','action',jsonb_build_object('actionKey','OPEN_PACKAGE_FIT','label','Open Package Fit','target','package-fit')));
  elsif v_package_status='REVIEW_REQUIRED' then
    v_unresolved_package_reviews:=0;
    for v_signal in select value from jsonb_array_elements(coalesce(v_package->'validationSignals','[]'::jsonb)) loop
      if nullif(v_signal->>'requirementId','') is null then
        v_unresolved_package_reviews:=v_unresolved_package_reviews+1;
      else
        select count(*) into v_unresolved_package_reviews
        from (
          select 1
          from public.crm_sales_validations sv
          where sv.requirement_id=(v_signal->>'requirementId')::uuid and sv.lead_id=v_opp.lead_id and sv.status='APPROVED'
          order by sv.updated_at desc limit 1
        ) approved
        where not exists(
          select 1 from public.crm_sales_validations latest
          where latest.requirement_id=(v_signal->>'requirementId')::uuid and latest.lead_id=v_opp.lead_id
            and latest.updated_at>(select max(a.updated_at) from public.crm_sales_validations a where a.requirement_id=(v_signal->>'requirementId')::uuid and a.status='APPROVED')
        );
        if v_unresolved_package_reviews=0 then v_unresolved_package_reviews:=1; else v_unresolved_package_reviews:=0; end if;
      end if;
    end loop;
    if jsonb_array_length(coalesce(v_package->'validationSignals','[]'::jsonb))=0 then v_unresolved_package_reviews:=1; end if;
    if v_unresolved_package_reviews>0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PACKAGE_FIT_REVIEW_REQUIRED','message','Package Fit requires review and at least one current review signal is unresolved.','sourceType','PACKAGE_FIT','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')));
    else
      v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','PACKAGE_FIT_REVIEW_RESOLVED','message','Package Fit remains Review Required, but its current specialist-review signals are approved. Keep approved constraints visible.','sourceType','PACKAGE_FIT','action',jsonb_build_object('actionKey','OPEN_PACKAGE_FIT','label','Open Package Fit','target','package-fit')));
    end if;
  elsif v_package_status<>'FIT' then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PACKAGE_FIT_UNAVAILABLE','message','Package Fit is not in a safe current state.','sourceType','PACKAGE_FIT','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_PACKAGE_FIT','label','Open Package Fit','target','package-fit')));
  end if;

  -- Part 7 is the specialist-review authority. Unresolved RED/AMBER blocks; GREEN warns.
  for v_val in
    select distinct on (coalesce(requirement_id,id),validation_type) *
    from public.crm_sales_validations
    where lead_id=v_opp.lead_id and (opportunity_id is null or opportunity_id=v_opp.id)
    order by coalesce(requirement_id,id),validation_type,updated_at desc,id desc
  loop
    if v_val.status='APPROVED' then
      v_resolved_validations:=v_resolved_validations||jsonb_build_array(jsonb_build_object('validationId',v_val.id,'validationType',v_val.validation_type,'status',v_val.status,'severity',v_val.severity));
      if nullif(btrim(coalesce(v_val.approved_constraints,'')),'') is not null then
        v_constraints:=v_constraints||jsonb_build_array(jsonb_build_object('validationId',v_val.id,'validationType',v_val.validation_type,'constraints',v_val.approved_constraints));
      end if;
      continue;
    end if;
    if v_val.status in ('PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE') then
      v_validation_behavior:=coalesce(v_policy#>>array['validationSeverityBehavior',v_val.severity],case when v_val.severity='GREEN' then 'WARNING' else 'BLOCKED' end);
      v_message:=initcap(lower(replace(v_val.validation_type,'_',' ')))||' review is '||replace(v_val.status,'_',' ')||'.';
      if v_val.status in ('REJECTED','STALE') then v_validation_behavior:='BLOCKED'; end if;
      if v_validation_behavior='BLOCKED' then
        v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','VALIDATION_'||v_val.validation_type||'_'||v_val.status,'message',v_message,'sourceType','VALIDATION','validationId',v_val.id,'validationType',v_val.validation_type,'severity',v_val.severity,'hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')));
      else
        v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','VALIDATION_'||v_val.validation_type||'_'||v_val.status,'message',v_message,'sourceType','VALIDATION','validationId',v_val.id,'validationType',v_val.validation_type,'severity',v_val.severity,'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')));
      end if;
    end if;
  end loop;

  -- Product manager/timeline flags are current catalog facts, not copied into policy.
  if coalesce((v_package#>>'{recommendedProduct,managerApprovalRequired}')::boolean,false) then
    if not exists(select 1 from public.crm_sales_validations sv where sv.lead_id=v_opp.lead_id and (sv.opportunity_id is null or sv.opportunity_id=v_opp.id) and sv.validation_type='COMMERCIAL' and sv.status='APPROVED') then
      v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','DOWNSTREAM_MANAGER_APPROVAL_REQUIRED','message','The current likely product requires manager approval. Pre-proposal Commercial validation may resolve current Sales uncertainty; quotation-specific approval remains downstream.','sourceType','CATALOG','action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')));
    end if;
  end if;
  if coalesce(v_package#>>'{recommendedProduct,timelineImpact}','')='assessment_required' and not exists(select 1 from public.crm_sales_validations sv where sv.lead_id=v_opp.lead_id and (sv.opportunity_id is null or sv.opportunity_id=v_opp.id) and sv.validation_type='TIMELINE' and sv.status='APPROVED') then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','TIMELINE_ASSESSMENT_REQUIRED','message','Current catalog guidance requires a Timeline review before the timeline can be treated as resolved.','sourceType','CATALOG','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_VALIDATION','label','Open / Request Review','target','validation')));
  end if;

  -- Existing activity/meeting systems remain authoritative for next action.
  select jsonb_build_object('sourceType','ACTIVITY','activityId',a.id,'action',a.subject,'ownerId',a.assigned_to,'dueAt',a.due_at) into v_next_action
  from public.crm_activities a
  where (a.opportunity_id=v_opp.id or (a.opportunity_id is null and a.lead_id=v_opp.lead_id)) and a.status='Scheduled' and a.completed_at is null
    and a.assigned_to is not null and a.due_at is not null and nullif(btrim(coalesce(a.subject,'')),'') is not null
    and not (v_generic_subjects ? lower(btrim(a.subject)))
  order by a.due_at asc,a.created_at asc limit 1;
  v_has_next_action:=found;
  if not v_has_next_action then
    select jsonb_build_object('sourceType','SALES_MEETING','meetingId',m.id,'action',m.next_step,'ownerId',m.salesperson_id,'dueAt',m.follow_up_at) into v_next_action
    from public.sales_meetings m
    where (m.opportunity_id=v_opp.id or m.lead_id=v_opp.lead_id) and m.status='Completed' and m.salesperson_id is not null and m.follow_up_at is not null
      and nullif(btrim(coalesce(m.next_step,'')),'') is not null and lower(btrim(m.next_step)) not in ('tbd','follow up','follow-up','wait','waiting')
    order by m.completed_at desc nulls last,m.updated_at desc limit 1;
    v_has_next_action:=found;
  end if;
  if v_opp.status='Open' and not v_has_next_action then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','NEXT_ACTION_MISSING','message','This open opportunity has no meaningful next action with an owner and due timing.','sourceType','ACTIVITY','hardBlocker',true,'action',jsonb_build_object('actionKey','OPEN_FOLLOW_UPS','label','Open Follow-Ups','target','follow-ups')));
  end if;

  -- Dimension summary; requirement blockers remain individually traceable above.
  v_dimensions:=jsonb_build_array(
    jsonb_build_object('key','REQUIREMENTS_COMPLETENESS','label','Requirements completeness','status',case when jsonb_array_length(v_blockers)=0 then 'PASS' else 'BLOCKED' end,'resolved',v_resolved_count,'required',v_required_count),
    jsonb_build_object('key','PACKAGE_FIT','label','Package Fit','status',v_package_status,'confidence',v_package->>'confidence'),
    jsonb_build_object('key','SPECIALIST_VALIDATION','label','Specialist validation','status',case when exists(select 1 from public.crm_sales_validations sv where sv.lead_id=v_opp.lead_id and sv.status in ('PENDING','IN_REVIEW','NEEDS_INFORMATION','REJECTED','STALE') and sv.severity in ('AMBER','RED')) then 'BLOCKED' else 'PASS' end),
    jsonb_build_object('key','DISCOVERY_EVIDENCE','label','Meeting / Discovery evidence','status',case when v_has_evidence then 'PASS' else 'BLOCKED' end),
    jsonb_build_object('key','NEXT_ACTION','label','Next action','status',case when v_opp.status<>'Open' or v_has_next_action then 'PASS' else 'BLOCKED' end,'current',v_next_action),
    jsonb_build_object('key','ASSUMPTIONS','label','Current assumptions','status',case when exists(select 1 from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='assumptions') then 'CAPTURED' else 'MISSING' end),
    jsonb_build_object('key','EXCLUSIONS','label','Current exclusions','status',case when exists(select 1 from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='exclusions') then 'CAPTURED' else 'MISSING' end),
    jsonb_build_object('key','DEPENDENCIES','label','Current dependencies','status',case when exists(select 1 from public.crm_requirements r where r.lead_id=v_opp.lead_id and r.record_state='ACTIVE' and r.requirement_key='client_dependencies') then 'CAPTURED' else 'MISSING' end)
  );

  if v_required_count>0 then v_score:=round((100.0*v_resolved_count/v_required_count))::integer; else v_score:=0; end if;
  v_score:=least(100,greatest(0,v_score));

  if v_gate_key='PROPOSAL_READINESS' then
    for v_future_key in select value from jsonb_array_elements_text(coalesce(v_policy->'futureProposalDimensions','[]'::jsonb)) loop
      v_future:=v_future||jsonb_build_array(jsonb_build_object('key',v_future_key,'status','NOT_YET_EVALUATED','coverageState','FUTURE_WORKFLOW'));
    end loop;
    if jsonb_array_length(v_blockers)>0 then v_status:='BLOCKED';
    elsif jsonb_array_length(v_warnings)>0 or jsonb_array_length(v_future)>0 then v_status:='WARNING';
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
    'packageFit',jsonb_build_object('status',v_package_status,'confidence',v_package->>'confidence','recommendedProduct',v_package->'recommendedProduct','managerApprovalRequired',v_package->'managerApprovalRequired','timelineAssessmentRequired',v_package->'timelineAssessmentRequired'),
    'legacyRequirementsSummaryPresent',nullif(btrim(coalesce(v_opp.requirements_summary,'')),'') is not null,
    'finalQuotationSendGateActive',false
  );
end;
$function$;

revoke all on function public.crm_get_sales_gate_assessment(uuid,text) from public, anon;
grant execute on function public.crm_get_sales_gate_assessment(uuid,text) to authenticated;

-- Structured readiness is authoritative. Keep requirements_summary column for narrative/backward compatibility,
-- but remove the duplicate stage-entry field requirement while preserving every other stage property.
update public.system_configuration sc
set config_value = jsonb_set(
      jsonb_set(sc.config_value,'{version}',to_jsonb(greatest(coalesce((sc.config_value->>'version')::integer,1),1)+1),true),
      '{stages}',
      (
        select jsonb_agg(
          case when stage->>'name'='Requirements Confirmed'
            then jsonb_set(stage,'{requiredFields}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(stage->'requiredFields','[]'::jsonb)) value where trim(both '"' from value::text)<>'requirementsSummary'),'[]'::jsonb),true)
            else stage end
          order by (stage->>'order')::integer
        )
        from jsonb_array_elements(sc.config_value->'stages') stage
      ),true
    ),
    updated_at=now()
where sc.config_key='crm_pipeline_settings';

-- Extend the existing canonical transition authority; no v2 and no override flag.
create or replace function public.crm_transition_opportunity(p_opportunity_id uuid, p_target_stage text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_opp public.crm_opportunities%rowtype;
  v_config jsonb; v_current jsonb; v_target jsonb;
  v_current_order int; v_target_order int; v_field text; v_missing text[]:=array[]::text[];
  v_default_probability int; v_is_admin boolean:=public.is_admin();
  v_gate jsonb; v_blocker_messages text[]:=array[]::text[]; v_blocker jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_opp from public.crm_opportunities where id=p_opportunity_id for update;
  if not found or v_opp.archived_at is not null then raise exception 'Opportunity not found.'; end if;
  if not v_is_admin and (not public.has_active_role(array['sales']::text[]) or v_opp.salesperson_id is distinct from auth.uid()) then raise exception 'You do not have permission to move this opportunity.'; end if;
  if v_opp.status<>'Open' then raise exception 'Only open opportunities can move between pipeline stages.'; end if;

  select config_value into v_config from public.system_configuration where config_key='crm_pipeline_settings';
  select value into v_current from jsonb_array_elements(v_config->'stages') where value->>'name'=v_opp.stage limit 1;
  select value into v_target from jsonb_array_elements(v_config->'stages') where value->>'name'=p_target_stage limit 1;
  if v_current is null then raise exception 'Current pipeline stage is not configured.'; end if;
  if v_target is null or not coalesce((v_target->>'active')::boolean,false) then raise exception 'Target pipeline stage is not active.'; end if;
  if p_target_stage=v_opp.stage then return to_jsonb(v_opp); end if;

  v_current_order:=(v_current->>'order')::int; v_target_order:=(v_target->>'order')::int;
  if v_target_order>v_current_order then
    if not (coalesce((v_current->>'allowSkip')::boolean,false) or coalesce(v_current->'allowedNext','[]'::jsonb) ? p_target_stage) then raise exception 'Transition from % to % is not permitted.',v_opp.stage,p_target_stage; end if;
  else
    if not coalesce((v_current->>'allowBackward')::boolean,false) or not (coalesce(v_current->'allowedPrevious','[]'::jsonb) ? p_target_stage) then raise exception 'Backward transition from % to % is not permitted.',v_opp.stage,p_target_stage; end if;
  end if;
  if coalesce((v_target->>'approvalRequired')::boolean,false) and not v_is_admin then raise exception 'This stage requires Admin approval.'; end if;

  for v_field in select jsonb_array_elements_text(coalesce(v_target->'requiredFields','[]'::jsonb)) loop
    if (v_field='contactName' and nullif(btrim(coalesce(v_opp.contact_name,'')),'') is null)
       or (v_field='email' and nullif(btrim(coalesce(v_opp.email,'')),'') is null)
       or (v_field='phone' and nullif(btrim(coalesce(v_opp.phone,'')),'') is null)
       or (v_field='companyName' and nullif(btrim(coalesce(v_opp.company_name,'')),'') is null)
       or (v_field='country' and nullif(btrim(coalesce(v_opp.country,'')),'') is null)
       or (v_field='serviceInterest' and nullif(btrim(coalesce(v_opp.service_interest,'')),'') is null)
       or (v_field='requirementsSummary' and nullif(btrim(coalesce(v_opp.requirements_summary,'')),'') is null)
       or (v_field='nextFollowUpAt' and v_opp.next_follow_up_at is null)
       or (v_field='expectedValue' and coalesce(v_opp.expected_value,0)<=0) then v_missing:=array_append(v_missing,v_field); end if;
  end loop;
  if cardinality(v_missing)>0 then raise exception 'Missing required information: %',array_to_string(v_missing,', '); end if;

  if p_target_stage='Meeting Scheduled' and not exists(select 1 from public.sales_meetings m where m.opportunity_id=v_opp.id and m.status in ('Scheduled','Rescheduled')) then raise exception 'Schedule the sales meeting before moving this opportunity to Meeting Scheduled.'; end if;

  if p_target_stage='Requirements Confirmed' then
    -- Fresh evaluation at the exact transition point prevents stale frontend PASS / TOCTOU bypass.
    v_gate:=public.crm_get_sales_gate_assessment(v_opp.id,'REQUIREMENTS_CONFIRMED');
    if v_gate->>'status'='BLOCKED' then
      for v_blocker in select value from jsonb_array_elements(coalesce(v_gate->'blockers','[]'::jsonb)) limit 5 loop
        v_blocker_messages:=array_append(v_blocker_messages,coalesce(v_blocker->>'message','Unresolved readiness blocker'));
      end loop;
      raise exception 'Requirements Confirmed is blocked: %',array_to_string(v_blocker_messages,' | ');
    end if;
  end if;

  if p_target_stage='Quotation Sent' and not exists(select 1 from public.quotations q where q.opportunity_id=v_opp.id and q.sent_at is not null and q.status in ('Sent','Accepted','Rejected','Expired')) then raise exception 'An approved quotation must be sent before moving this opportunity to Quotation Sent.'; end if;
  if p_target_stage='Awaiting Advance Payment' and not exists(select 1 from public.quotations q where q.opportunity_id=v_opp.id and q.status='Accepted' and q.accepted_at is not null) then raise exception 'The customer must accept the quotation before the opportunity can await advance payment.'; end if;
  if p_target_stage='Won' then
    if not v_is_admin then raise exception 'Won is controlled by Admin payment verification.'; end if;
    if not exists(select 1 from public.payments p where p.opportunity_id=v_opp.id and p.status='Verified' and p.payment_type in ('Advance','Full Payment')) then raise exception 'A verified Advance or Full Payment is required before Won.'; end if;
  end if;

  v_default_probability:=least(greatest(coalesce((v_target->>'defaultProbability')::int,v_opp.probability,0),0),100);
  update public.crm_opportunities set stage=p_target_stage,probability=v_default_probability,status=case when p_target_stage='Won' then 'Won' else status end,won_at=case when p_target_stage='Won' then coalesce(won_at,now()) else won_at end,updated_at=now() where id=v_opp.id returning * into v_opp;
  return to_jsonb(v_opp);
end;
$function$;

revoke all on function public.crm_transition_opportunity(uuid,text) from public, anon;
grant execute on function public.crm_transition_opportunity(uuid,text) to authenticated;
