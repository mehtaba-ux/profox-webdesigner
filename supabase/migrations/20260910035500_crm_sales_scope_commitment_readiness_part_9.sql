-- Part 9 additive Proposal Readiness integration.
-- Reuses the same Part 8 policy/evaluator. Requirements Confirmed remains focused on structured requirements.

DO $$
DECLARE
  v_policy jsonb;
BEGIN
  SELECT config_value INTO v_policy FROM public.system_configuration WHERE config_key='crm_sales_gate_policy_v1' FOR UPDATE;
  IF v_policy IS NULL OR (v_policy->>'policyVersion')::integer<>1 OR (v_policy->>'evaluatorVersion')::integer<>2 THEN
    RAISE EXCEPTION 'Part 9 requires the completed Part 8 readiness policy (policy 1 / evaluator 2).';
  END IF;
  IF jsonb_array_length(v_policy->'proposalDimensions')<>18 THEN
    RAISE EXCEPTION 'Part 9 expected the 18 current Part 8 Proposal Readiness dimensions.';
  END IF;
  IF NOT (v_policy->'futureProposalDimensions' ?& array['PROMISE_COVERAGE','FINAL_SCOPE_RECONCILIATION','QUOTATION_SNAPSHOT_COVERAGE']) THEN
    RAISE EXCEPTION 'Part 9 expected the three deferred Part 8 quotation-coverage dimensions.';
  END IF;

  UPDATE public.system_configuration
  SET config_value = jsonb_set(
        jsonb_set(
          config_value,
          '{evaluatorVersion}',
          '3'::jsonb,
          true
        ),
        '{proposalDimensions}',
        (config_value->'proposalDimensions') || jsonb_build_array('SCOPE_CONDITIONS_REGISTER','PROMISE_REGISTER_INTEGRITY'),
        true
      ),
      updated_at=now()
  WHERE config_key='crm_sales_gate_policy_v1';
END
$$;

-- Patch only the existing canonical evaluator body using known Part 8 markers.
-- The migration fails closed if the expected Part 8 function has drifted.
DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='crm_get_sales_gate_assessment'
    AND pg_get_function_identity_arguments(p.oid)='p_opportunity_id uuid, p_gate_key text';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Canonical Part 8 Sales gate evaluator not found.'; END IF;
  v_def:=pg_get_functiondef(v_oid);

  IF position('v_evaluator_version is distinct from 2' in lower(v_def))=0
     OR position('jsonb_array_length(v_policy->''proposalDimensions'')<>18' in v_def)=0
     OR position('100.0*v_pass_dimension_count/18.0' in v_def)=0
     OR position('''finalQuotationSendGateActive'',false' in v_def)=0 THEN
    RAISE EXCEPTION 'Part 8 evaluator drift detected; refusing unsafe Part 9 patch.';
  END IF;

  v_def:=replace(v_def,'v_evaluator_version is distinct from 2','v_evaluator_version is distinct from 3');
  v_def:=replace(v_def,'jsonb_array_length(v_policy->''proposalDimensions'')<>18','jsonb_array_length(v_policy->''proposalDimensions'')<>20');

  v_old := E'  select count(*) into v_pass_dimension_count\n  from jsonb_array_elements(v_dimensions) d\n  where d->>\'status\'=\'PASS\';\n  v_score:=least(100,greatest(0,round(100.0*v_pass_dimension_count/18.0)::integer));';
  v_new := E'  if v_gate_key=\'PROPOSAL_READINESS\' then\n    v_scope_commitment := public.crm_get_sales_scope_commitment_assessment(v_opp.id);\n    v_dimensions := v_dimensions || jsonb_build_array(\n      jsonb_build_object(\'key\',\'SCOPE_CONDITIONS_REGISTER\',\'label\',\'Scope Conditions Register\',\'status\',\n        case\n          when jsonb_array_length(coalesce(v_scope_commitment#>\'{scopeConditions,blockers}\',\'[]\'::jsonb))>0 then \'BLOCKED\'\n          when jsonb_array_length(coalesce(v_scope_commitment#>\'{scopeConditions,warnings}\',\'[]\'::jsonb))>0 then \'WARNING\'\n          else \'PASS\'\n        end,\n        \'sourceStatus\',v_scope_commitment#>>\'{scopeConditions,status}\'\n      ),\n      jsonb_build_object(\'key\',\'PROMISE_REGISTER_INTEGRITY\',\'label\',\'Promise Register Integrity\',\'status\',\n        case\n          when jsonb_array_length(coalesce(v_scope_commitment#>\'{promises,blockers}\',\'[]\'::jsonb))>0 then \'BLOCKED\'\n          when jsonb_array_length(coalesce(v_scope_commitment#>\'{promises,warnings}\',\'[]\'::jsonb))>0 then \'WARNING\'\n          else \'PASS\'\n        end,\n        \'sourceStatus\',v_scope_commitment#>>\'{promises,status}\'\n      )\n    );\n    v_blockers := v_blockers || coalesce(v_scope_commitment->\'blockers\',\'[]\'::jsonb);\n    v_warnings := v_warnings || coalesce(v_scope_commitment->\'warnings\',\'[]\'::jsonb);\n  end if;\n\n  select count(*) into v_pass_dimension_count\n  from jsonb_array_elements(v_dimensions) d\n  where d->>\'status\'=\'PASS\';\n  v_score:=least(100,greatest(0,round(100.0*v_pass_dimension_count/(case when v_gate_key=\'PROPOSAL_READINESS\' then 20.0 else 18.0 end))::integer));';

  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'Part 8 score marker drift detected; refusing unsafe Part 9 patch.'; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_old := E'  v_future_key text;';
  v_new := E'  v_future_key text;\n  v_scope_commitment jsonb := \'{}\'::jsonb;';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'Part 8 declaration marker drift detected; refusing unsafe Part 9 patch.'; END IF;
  v_def:=replace(v_def,v_old,v_new);

  v_def:=replace(v_def,'''finalQuotationSendGateActive'',false','''scopeCommitment'',case when v_gate_key=''PROPOSAL_READINESS'' then v_scope_commitment else null end,'||E'\n    '||'''finalQuotationSendGateActive'',false');
  EXECUTE v_def;
END
$$;

REVOKE ALL ON FUNCTION public.crm_get_sales_gate_assessment(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_get_sales_gate_assessment(uuid,text) TO authenticated;
