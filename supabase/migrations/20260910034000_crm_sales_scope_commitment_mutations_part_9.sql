-- Part 9 trusted mutations. All actors/timestamps are server controlled.

CREATE OR REPLACE FUNCTION public.crm_save_sales_scope_condition_draft(
  p_condition_id uuid,
  p_lead_id uuid,
  p_opportunity_id uuid,
  p_condition_type text,
  p_title text,
  p_condition_text text,
  p_source_requirement_id uuid DEFAULT NULL,
  p_source_validation_id uuid DEFAULT NULL,
  p_source_meeting_id uuid DEFAULT NULL,
  p_source_type text DEFAULT 'MANUAL',
  p_source_record_id text DEFAULT NULL,
  p_source_summary text DEFAULT NULL,
  p_validation_alignment_status text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.crm_sales_scope_conditions%ROWTYPE;
  v_old_requirement uuid;
  v_type text := upper(btrim(coalesce(p_condition_type,'')));
  v_source_type text := upper(btrim(coalesce(p_source_type,'MANUAL')));
  v_alignment text;
  v_title text := btrim(coalesce(p_title,''));
  v_text text := btrim(coalesce(p_condition_text,''));
  v_dedupe text;
  v_id uuid;
BEGIN
  PERFORM public.crm_sales_scope_commitment_assert_context(p_lead_id,p_opportunity_id,p_source_requirement_id,p_source_validation_id,p_source_meeting_id);
  IF v_type NOT IN ('ASSUMPTION','EXCLUSION','DEPENDENCY','CLIENT_RESPONSIBILITY','SCOPE_BOUNDARY') THEN RAISE EXCEPTION 'Unsupported Scope Condition type.'; END IF;
  IF v_source_type NOT IN ('MANUAL','REQUIREMENT','VALIDATION','MEETING') THEN RAISE EXCEPTION 'Unsupported Scope Condition source type.'; END IF;
  IF char_length(v_title) NOT BETWEEN 3 AND 240 OR char_length(v_text) NOT BETWEEN 6 AND 6000 THEN RAISE EXCEPTION 'Scope Condition title/text is incomplete or too long.'; END IF;
  IF v_source_type='REQUIREMENT' AND p_source_requirement_id IS NULL THEN RAISE EXCEPTION 'Requirement source is required.'; END IF;
  IF v_source_type='VALIDATION' AND p_source_validation_id IS NULL THEN RAISE EXCEPTION 'Validation source is required.'; END IF;
  IF v_source_type='MEETING' AND p_source_meeting_id IS NULL THEN RAISE EXCEPTION 'Meeting source is required.'; END IF;
  v_alignment := CASE WHEN p_source_validation_id IS NULL THEN 'NOT_REQUIRED' ELSE upper(btrim(coalesce(p_validation_alignment_status,'PENDING'))) END;
  IF v_alignment NOT IN ('NOT_REQUIRED','PENDING','WITHIN_CONSTRAINTS','CONFLICT') THEN RAISE EXCEPTION 'Unsupported validation-alignment state.'; END IF;
  v_dedupe := md5(p_lead_id::text||'|'||v_type||'|'||coalesce(p_source_requirement_id::text,'')||'|'||coalesce(p_source_validation_id::text,'')||'|'||coalesce(p_source_meeting_id::text,'')||'|'||lower(v_title)||'|'||lower(v_text));

  IF p_condition_id IS NULL THEN
    SELECT id INTO v_id FROM public.crm_sales_scope_conditions
    WHERE lead_id=p_lead_id AND dedupe_key=v_dedupe AND state IN ('DRAFT','ACTIVE','STALE')
    ORDER BY created_at DESC LIMIT 1;
    IF v_id IS NULL THEN
      BEGIN
        INSERT INTO public.crm_sales_scope_conditions(
          lead_id,opportunity_id,condition_type,title,condition_text,state,
          source_requirement_id,source_validation_id,source_meeting_id,source_type,source_record_id,source_summary,
          validation_alignment_status,created_by,updated_by,dedupe_key
        ) VALUES (
          p_lead_id,p_opportunity_id,v_type,v_title,v_text,'DRAFT',
          p_source_requirement_id,p_source_validation_id,p_source_meeting_id,v_source_type,nullif(btrim(coalesce(p_source_record_id,'')),''),nullif(btrim(coalesce(p_source_summary,'')),''),
          v_alignment,v_uid,v_uid,v_dedupe
        ) RETURNING id INTO v_id;
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_id FROM public.crm_sales_scope_conditions
        WHERE lead_id=p_lead_id AND dedupe_key=v_dedupe AND state IN ('DRAFT','ACTIVE','STALE')
        ORDER BY created_at DESC LIMIT 1;
      END;
      PERFORM public.crm_write_lead_event(p_lead_id,'scope_condition_created','Scope Condition created','A Scope Condition draft was created for proposal reconciliation.',jsonb_build_object('conditionId',v_id,'conditionType',v_type,'sourceRequirementId',p_source_requirement_id,'sourceValidationId',p_source_validation_id),v_uid,NULL,NULL,now(),'scope-condition-created:'||v_id::text);
    END IF;
  ELSE
    SELECT * INTO v_row FROM public.crm_sales_scope_conditions WHERE id=p_condition_id FOR UPDATE;
    IF NOT FOUND OR v_row.lead_id<>p_lead_id THEN RAISE EXCEPTION 'Scope Condition not found for this Lead.'; END IF;
    IF v_row.state<>'DRAFT' THEN RAISE EXCEPTION 'Only a Draft Scope Condition can be edited in place. Create a revision for active/history-safe changes.'; END IF;
    v_old_requirement := v_row.source_requirement_id;
    UPDATE public.crm_sales_scope_conditions SET
      opportunity_id=p_opportunity_id,condition_type=v_type,title=v_title,condition_text=v_text,
      source_requirement_id=p_source_requirement_id,source_validation_id=p_source_validation_id,source_meeting_id=p_source_meeting_id,
      source_type=v_source_type,source_record_id=nullif(btrim(coalesce(p_source_record_id,'')),''),source_summary=nullif(btrim(coalesce(p_source_summary,'')),''),
      validation_alignment_status=v_alignment,updated_by=v_uid,dedupe_key=v_dedupe
    WHERE id=p_condition_id;
    v_id:=p_condition_id;
    IF v_old_requirement IS NOT NULL AND v_old_requirement IS DISTINCT FROM p_source_requirement_id THEN
      UPDATE public.crm_requirements SET proposal_reconciliation_status=NULL,proposal_scope_condition_id=NULL,proposal_reconciliation_note=NULL,proposal_reconciled_by=NULL,proposal_reconciled_at=NULL
      WHERE id=v_old_requirement AND proposal_scope_condition_id=v_id;
    END IF;
  END IF;

  IF p_source_requirement_id IS NOT NULL THEN
    UPDATE public.crm_requirements SET proposal_reconciliation_status='RECONCILED',proposal_scope_condition_id=v_id,proposal_reconciliation_note='Reconciled to Scope Condition',proposal_reconciled_by=v_uid,proposal_reconciled_at=now()
    WHERE id=p_source_requirement_id AND lead_id=p_lead_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_reconcile_sales_scope_requirement(
  p_requirement_id uuid,
  p_action text,
  p_condition_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_req public.crm_requirements%ROWTYPE;
  v_condition public.crm_sales_scope_conditions%ROWTYPE;
  v_action text:=upper(btrim(coalesce(p_action,'')));
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
BEGIN
  SELECT * INTO v_req FROM public.crm_requirements WHERE id=p_requirement_id AND record_state='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Requirement not found.'; END IF;
  PERFORM public.crm_sales_scope_commitment_assert_context(v_req.lead_id,NULL,v_req.id,NULL,NULL);
  IF v_action='LINK_CONDITION' THEN
    IF p_condition_id IS NULL THEN RAISE EXCEPTION 'Scope Condition is required.'; END IF;
    SELECT * INTO v_condition FROM public.crm_sales_scope_conditions WHERE id=p_condition_id AND lead_id=v_req.lead_id AND state IN ('DRAFT','ACTIVE','STALE');
    IF NOT FOUND THEN RAISE EXCEPTION 'Current Scope Condition does not belong to this Lead.'; END IF;
    UPDATE public.crm_requirements SET proposal_reconciliation_status='RECONCILED',proposal_scope_condition_id=v_condition.id,proposal_reconciliation_note=coalesce(v_note,'Linked to existing Scope Condition'),proposal_reconciled_by=v_uid,proposal_reconciled_at=now() WHERE id=v_req.id;
  ELSIF v_action='NOT_MATERIAL' THEN
    IF v_note IS NULL OR char_length(v_note)<6 THEN RAISE EXCEPTION 'Explain why this Requirement is not material for the proposal.'; END IF;
    UPDATE public.crm_requirements SET proposal_reconciliation_status='NOT_MATERIAL',proposal_scope_condition_id=NULL,proposal_reconciliation_note=v_note,proposal_reconciled_by=v_uid,proposal_reconciled_at=now() WHERE id=v_req.id;
  ELSE
    RAISE EXCEPTION 'Unsupported Requirement reconciliation action.';
  END IF;
  PERFORM public.crm_write_lead_event(v_req.lead_id,'scope_requirement_reconciled','Requirement reconciled for proposal scope','Seller explicitly reconciled Requirement information into the Scope Conditions workflow.',jsonb_build_object('requirementId',v_req.id,'action',v_action,'conditionId',p_condition_id,'note',v_note),v_uid,NULL,NULL,now(),'scope-reconcile:'||v_req.id::text||':'||extract(epoch from now())::bigint::text);
  RETURN jsonb_build_object('requirementId',v_req.id,'status',CASE WHEN v_action='NOT_MATERIAL' THEN 'NOT_MATERIAL' ELSE 'RECONCILED' END,'conditionId',CASE WHEN v_action='LINK_CONDITION' THEN p_condition_id ELSE NULL END);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_revise_sales_scope_condition(
  p_condition_id uuid,
  p_title text,
  p_condition_text text,
  p_validation_alignment_status text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_old public.crm_sales_scope_conditions%ROWTYPE;
  v_id uuid;
  v_title text:=btrim(coalesce(p_title,''));
  v_text text:=btrim(coalesce(p_condition_text,''));
  v_alignment text;
  v_dedupe text;
BEGIN
  SELECT * INTO v_old FROM public.crm_sales_scope_conditions WHERE id=p_condition_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scope Condition not found.'; END IF;
  PERFORM public.crm_sales_scope_commitment_assert_context(v_old.lead_id,v_old.opportunity_id,v_old.source_requirement_id,v_old.source_validation_id,v_old.source_meeting_id);
  IF v_old.state NOT IN ('ACTIVE','STALE') THEN RAISE EXCEPTION 'Only an Active or Stale Scope Condition requires a history-safe revision.'; END IF;
  IF char_length(v_title) NOT BETWEEN 3 AND 240 OR char_length(v_text) NOT BETWEEN 6 AND 6000 THEN RAISE EXCEPTION 'Revision title/text is incomplete or too long.'; END IF;
  IF v_title=v_old.title AND v_text=v_old.condition_text THEN RAISE EXCEPTION 'Revision must materially change the Scope Condition wording.'; END IF;
  IF EXISTS(SELECT 1 FROM public.crm_sales_scope_conditions WHERE supersedes_condition_id=v_old.id AND state='DRAFT') THEN RAISE EXCEPTION 'A Draft revision already exists for this Scope Condition.'; END IF;
  v_alignment:=CASE WHEN v_old.source_validation_id IS NULL THEN 'NOT_REQUIRED' ELSE upper(btrim(coalesce(p_validation_alignment_status,'PENDING'))) END;
  IF v_alignment NOT IN ('NOT_REQUIRED','PENDING','WITHIN_CONSTRAINTS','CONFLICT') THEN RAISE EXCEPTION 'Unsupported validation-alignment state.'; END IF;
  v_dedupe:=md5(v_old.lead_id::text||'|'||v_old.id::text||'|'||v_old.condition_type||'|'||lower(v_title)||'|'||lower(v_text));
  INSERT INTO public.crm_sales_scope_conditions(
    lead_id,opportunity_id,condition_type,title,condition_text,state,source_requirement_id,source_validation_id,source_meeting_id,source_type,source_record_id,source_summary,validation_alignment_status,created_by,updated_by,supersedes_condition_id,dedupe_key
  ) VALUES (
    v_old.lead_id,v_old.opportunity_id,v_old.condition_type,v_title,v_text,'DRAFT',v_old.source_requirement_id,v_old.source_validation_id,v_old.source_meeting_id,v_old.source_type,v_old.source_record_id,v_old.source_summary,v_alignment,v_uid,v_uid,v_old.id,v_dedupe
  ) RETURNING id INTO v_id;
  PERFORM public.crm_write_lead_event(v_old.lead_id,'scope_condition_revision_created','Scope Condition revision created','A history-safe Draft revision was created; the current condition remains unchanged until the revision is activated.',jsonb_build_object('previousConditionId',v_old.id,'revisionConditionId',v_id),v_uid,NULL,NULL,now(),'scope-condition-revision-created:'||v_id::text);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_transition_sales_scope_condition(
  p_condition_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_row public.crm_sales_scope_conditions%ROWTYPE;
  v_parent public.crm_sales_scope_conditions%ROWTYPE;
  v_action text:=upper(btrim(coalesce(p_action,'')));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
BEGIN
  SELECT * INTO v_row FROM public.crm_sales_scope_conditions WHERE id=p_condition_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scope Condition not found.'; END IF;
  PERFORM public.crm_sales_scope_commitment_assert_context(v_row.lead_id,v_row.opportunity_id,v_row.source_requirement_id,v_row.source_validation_id,v_row.source_meeting_id);
  IF v_action='ACTIVATE' THEN
    IF v_row.state<>'DRAFT' THEN RAISE EXCEPTION 'Only a Draft Scope Condition can be activated.'; END IF;
    IF v_row.supersedes_condition_id IS NOT NULL THEN
      SELECT * INTO v_parent FROM public.crm_sales_scope_conditions WHERE id=v_row.supersedes_condition_id AND lead_id=v_row.lead_id FOR UPDATE;
      IF NOT FOUND OR v_parent.state NOT IN ('ACTIVE','STALE') THEN RAISE EXCEPTION 'Revision source is no longer current.'; END IF;
      UPDATE public.crm_sales_scope_conditions SET state='SUPERSEDED',updated_by=v_uid WHERE id=v_parent.id;
    END IF;
    UPDATE public.crm_sales_scope_conditions SET state='ACTIVE',activated_by=v_uid,activated_at=now(),updated_by=v_uid WHERE id=v_row.id;
    IF v_row.source_requirement_id IS NOT NULL THEN
      UPDATE public.crm_requirements SET proposal_reconciliation_status='RECONCILED',proposal_scope_condition_id=v_row.id,proposal_reconciliation_note='Active Scope Condition',proposal_reconciled_by=v_uid,proposal_reconciled_at=now() WHERE id=v_row.source_requirement_id AND lead_id=v_row.lead_id;
    END IF;
    PERFORM public.crm_write_lead_event(v_row.lead_id,CASE WHEN v_row.supersedes_condition_id IS NULL THEN 'scope_condition_activated' ELSE 'scope_condition_revised' END,CASE WHEN v_row.supersedes_condition_id IS NULL THEN 'Scope Condition activated' ELSE 'Scope Condition revised' END,'A Scope Condition is now an active proposal boundary. Historical wording remains preserved.',jsonb_build_object('conditionId',v_row.id,'supersedesConditionId',v_row.supersedes_condition_id,'conditionType',v_row.condition_type),v_uid,NULL,NULL,now(),'scope-condition-activate:'||v_row.id::text);
  ELSIF v_action='RESOLVE' THEN
    IF v_row.state NOT IN ('ACTIVE','STALE') THEN RAISE EXCEPTION 'Only an Active or Stale Scope Condition can be resolved.'; END IF;
    UPDATE public.crm_sales_scope_conditions SET state='RESOLVED',resolved_by=v_uid,resolved_at=now(),resolution_note=v_reason,updated_by=v_uid WHERE id=v_row.id;
    UPDATE public.crm_requirements SET proposal_reconciliation_status=NULL,proposal_scope_condition_id=NULL,proposal_reconciliation_note=NULL,proposal_reconciled_by=NULL,proposal_reconciled_at=NULL WHERE proposal_scope_condition_id=v_row.id;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'scope_condition_resolved','Scope Condition resolved','A Scope Condition was resolved without deleting its history.',jsonb_build_object('conditionId',v_row.id,'reason',v_reason),v_uid,NULL,NULL,now(),'scope-condition-resolved:'||v_row.id::text);
  ELSIF v_action='WITHDRAW' THEN
    IF v_row.state NOT IN ('DRAFT','ACTIVE','STALE') THEN RAISE EXCEPTION 'This Scope Condition is already historical.'; END IF;
    IF v_reason IS NULL OR char_length(v_reason)<6 THEN RAISE EXCEPTION 'A meaningful withdrawal reason is required.'; END IF;
    UPDATE public.crm_sales_scope_conditions SET state='WITHDRAWN',withdrawn_by=v_uid,withdrawn_at=now(),withdrawal_reason=v_reason,updated_by=v_uid WHERE id=v_row.id;
    UPDATE public.crm_requirements SET proposal_reconciliation_status=NULL,proposal_scope_condition_id=NULL,proposal_reconciliation_note=NULL,proposal_reconciled_by=NULL,proposal_reconciled_at=NULL WHERE proposal_scope_condition_id=v_row.id;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'scope_condition_withdrawn','Scope Condition withdrawn','A Scope Condition was intentionally withdrawn; historical wording and reason remain preserved.',jsonb_build_object('conditionId',v_row.id,'reason',v_reason),v_uid,NULL,NULL,now(),'scope-condition-withdrawn:'||v_row.id::text);
  ELSE
    RAISE EXCEPTION 'Unsupported Scope Condition action.';
  END IF;
  RETURN v_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_save_sales_promise_draft(
  p_promise_id uuid,
  p_lead_id uuid,
  p_opportunity_id uuid,
  p_promise_type text,
  p_promise_text text,
  p_internal_context text DEFAULT NULL,
  p_source_type text DEFAULT 'INTERNAL_DRAFT',
  p_source_record_id text DEFAULT NULL,
  p_source_meeting_id uuid DEFAULT NULL,
  p_source_summary text DEFAULT NULL,
  p_linked_requirement_id uuid DEFAULT NULL,
  p_linked_validation_id uuid DEFAULT NULL,
  p_validation_alignment_status text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_row public.crm_sales_promises%ROWTYPE;
  v_type text:=upper(btrim(coalesce(p_promise_type,'')));
  v_source text:=upper(btrim(coalesce(p_source_type,'INTERNAL_DRAFT')));
  v_text text:=btrim(coalesce(p_promise_text,''));
  v_alignment text;
  v_dedupe text;
  v_id uuid;
BEGIN
  PERFORM public.crm_sales_scope_commitment_assert_context(p_lead_id,p_opportunity_id,p_linked_requirement_id,p_linked_validation_id,p_source_meeting_id);
  IF v_type NOT IN ('SCOPE','TECHNICAL','TIMELINE','COMMERCIAL','SUPPORT','COMPLIANCE','PERFORMANCE_RESULT','OTHER') THEN RAISE EXCEPTION 'Unsupported Promise type.'; END IF;
  IF v_source NOT IN ('INTERNAL_DRAFT','MANUAL_CLIENT_COMMUNICATION','MEETING','REQUIREMENT','VALIDATION') THEN RAISE EXCEPTION 'Unsupported Promise source type.'; END IF;
  IF char_length(v_text) NOT BETWEEN 6 AND 6000 THEN RAISE EXCEPTION 'Promise wording is incomplete or too long.'; END IF;
  IF v_source='MEETING' AND p_source_meeting_id IS NULL THEN RAISE EXCEPTION 'Meeting source is required.'; END IF;
  IF v_source='REQUIREMENT' AND p_linked_requirement_id IS NULL THEN RAISE EXCEPTION 'Requirement context is required.'; END IF;
  IF v_source='VALIDATION' AND p_linked_validation_id IS NULL THEN RAISE EXCEPTION 'Validation context is required.'; END IF;
  v_alignment:=CASE WHEN p_linked_validation_id IS NULL THEN 'NOT_REQUIRED' ELSE upper(btrim(coalesce(p_validation_alignment_status,'PENDING'))) END;
  IF v_alignment NOT IN ('NOT_REQUIRED','PENDING','WITHIN_CONSTRAINTS','CONFLICT') THEN RAISE EXCEPTION 'Unsupported validation-alignment state.'; END IF;
  v_dedupe:=md5(p_lead_id::text||'|'||v_type||'|'||coalesce(p_linked_requirement_id::text,'')||'|'||coalesce(p_linked_validation_id::text,'')||'|'||coalesce(p_source_meeting_id::text,'')||'|'||lower(v_text));

  IF p_promise_id IS NULL THEN
    SELECT id INTO v_id FROM public.crm_sales_promises WHERE lead_id=p_lead_id AND dedupe_key=v_dedupe AND record_state IN ('DRAFT','ACTIVE') ORDER BY recorded_at DESC LIMIT 1;
    IF v_id IS NULL THEN
      BEGIN
        INSERT INTO public.crm_sales_promises(
          lead_id,opportunity_id,promise_type,promise_text,internal_context,record_state,source_type,source_record_id,source_meeting_id,source_summary,linked_requirement_id,linked_validation_id,validation_alignment_status,recorded_by,updated_by,policy_key,policy_version,dedupe_key
        ) VALUES (
          p_lead_id,p_opportunity_id,v_type,v_text,nullif(btrim(coalesce(p_internal_context,'')),''),'DRAFT',v_source,nullif(btrim(coalesce(p_source_record_id,'')),''),p_source_meeting_id,nullif(btrim(coalesce(p_source_summary,'')),''),p_linked_requirement_id,p_linked_validation_id,v_alignment,v_uid,v_uid,'crm_sales_scope_promise_policy_v1',1,v_dedupe
        ) RETURNING id INTO v_id;
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_id FROM public.crm_sales_promises WHERE lead_id=p_lead_id AND dedupe_key=v_dedupe AND record_state IN ('DRAFT','ACTIVE') ORDER BY recorded_at DESC LIMIT 1;
      END;
    END IF;
  ELSE
    SELECT * INTO v_row FROM public.crm_sales_promises WHERE id=p_promise_id FOR UPDATE;
    IF NOT FOUND OR v_row.lead_id<>p_lead_id THEN RAISE EXCEPTION 'Promise draft not found for this Lead.'; END IF;
    IF v_row.record_state<>'DRAFT' THEN RAISE EXCEPTION 'Only a Draft Promise can be edited in place. Create a revision for an active commitment.'; END IF;
    UPDATE public.crm_sales_promises SET opportunity_id=p_opportunity_id,promise_type=v_type,promise_text=v_text,internal_context=nullif(btrim(coalesce(p_internal_context,'')),''),source_type=v_source,source_record_id=nullif(btrim(coalesce(p_source_record_id,'')),''),source_meeting_id=p_source_meeting_id,source_summary=nullif(btrim(coalesce(p_source_summary,'')),''),linked_requirement_id=p_linked_requirement_id,linked_validation_id=p_linked_validation_id,validation_alignment_status=v_alignment,updated_by=v_uid,dedupe_key=v_dedupe WHERE id=v_row.id;
    v_id:=v_row.id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_revise_sales_promise(
  p_promise_id uuid,
  p_promise_text text,
  p_internal_context text DEFAULT NULL,
  p_source_type text DEFAULT 'INTERNAL_DRAFT',
  p_source_record_id text DEFAULT NULL,
  p_source_meeting_id uuid DEFAULT NULL,
  p_source_summary text DEFAULT NULL,
  p_linked_requirement_id uuid DEFAULT NULL,
  p_linked_validation_id uuid DEFAULT NULL,
  p_validation_alignment_status text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_old public.crm_sales_promises%ROWTYPE;
  v_source text:=upper(btrim(coalesce(p_source_type,'INTERNAL_DRAFT')));
  v_text text:=btrim(coalesce(p_promise_text,''));
  v_alignment text;
  v_dedupe text;
  v_id uuid;
BEGIN
  SELECT * INTO v_old FROM public.crm_sales_promises WHERE id=p_promise_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promise not found.'; END IF;
  PERFORM public.crm_sales_scope_commitment_assert_context(v_old.lead_id,v_old.opportunity_id,p_linked_requirement_id,p_linked_validation_id,p_source_meeting_id);
  IF v_old.record_state<>'ACTIVE' THEN RAISE EXCEPTION 'Only an Active Promise requires a history-safe revision.'; END IF;
  IF char_length(v_text) NOT BETWEEN 6 AND 6000 OR v_text=v_old.promise_text THEN RAISE EXCEPTION 'Revision must contain meaningful changed Promise wording.'; END IF;
  IF v_source NOT IN ('INTERNAL_DRAFT','MANUAL_CLIENT_COMMUNICATION','MEETING','REQUIREMENT','VALIDATION') THEN RAISE EXCEPTION 'Unsupported Promise source type.'; END IF;
  IF v_source='MEETING' AND p_source_meeting_id IS NULL THEN RAISE EXCEPTION 'Meeting source is required.'; END IF;
  IF v_source='REQUIREMENT' AND p_linked_requirement_id IS NULL THEN RAISE EXCEPTION 'Requirement context is required.'; END IF;
  IF v_source='VALIDATION' AND p_linked_validation_id IS NULL THEN RAISE EXCEPTION 'Validation context is required.'; END IF;
  IF EXISTS(SELECT 1 FROM public.crm_sales_promises WHERE supersedes_promise_id=v_old.id AND record_state='DRAFT') THEN RAISE EXCEPTION 'A Draft revision already exists for this Promise.'; END IF;
  v_alignment:=CASE WHEN p_linked_validation_id IS NULL THEN 'NOT_REQUIRED' ELSE upper(btrim(coalesce(p_validation_alignment_status,'PENDING'))) END;
  IF v_alignment NOT IN ('NOT_REQUIRED','PENDING','WITHIN_CONSTRAINTS','CONFLICT') THEN RAISE EXCEPTION 'Unsupported validation-alignment state.'; END IF;
  v_dedupe:=md5(v_old.lead_id::text||'|'||v_old.id::text||'|'||v_old.promise_type||'|'||lower(v_text));
  INSERT INTO public.crm_sales_promises(
    lead_id,opportunity_id,promise_type,promise_text,internal_context,record_state,source_type,source_record_id,source_meeting_id,source_summary,linked_requirement_id,linked_validation_id,validation_alignment_status,recorded_by,updated_by,supersedes_promise_id,policy_key,policy_version,dedupe_key
  ) VALUES (
    v_old.lead_id,v_old.opportunity_id,v_old.promise_type,v_text,nullif(btrim(coalesce(p_internal_context,'')),''),'DRAFT',v_source,nullif(btrim(coalesce(p_source_record_id,'')),''),p_source_meeting_id,nullif(btrim(coalesce(p_source_summary,'')),''),p_linked_requirement_id,p_linked_validation_id,v_alignment,v_uid,v_uid,v_old.id,'crm_sales_scope_promise_policy_v1',1,v_dedupe
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_transition_sales_promise(
  p_promise_id uuid,
  p_action text,
  p_client_communicated boolean DEFAULT false,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_row public.crm_sales_promises%ROWTYPE;
  v_parent public.crm_sales_promises%ROWTYPE;
  v_action text:=upper(btrim(coalesce(p_action,'')));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
BEGIN
  SELECT * INTO v_row FROM public.crm_sales_promises WHERE id=p_promise_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promise not found.'; END IF;
  PERFORM public.crm_sales_scope_commitment_assert_context(v_row.lead_id,v_row.opportunity_id,v_row.linked_requirement_id,v_row.linked_validation_id,v_row.source_meeting_id);
  IF v_action='ACTIVATE' THEN
    IF v_row.record_state<>'DRAFT' THEN RAISE EXCEPTION 'Only a Draft Promise can be recorded as an active commitment.'; END IF;
    IF NOT coalesce(p_client_communicated,false) THEN RAISE EXCEPTION 'Confirm that ProFox actually communicated this commitment to the client.'; END IF;
    IF v_row.source_type='INTERNAL_DRAFT' THEN RAISE EXCEPTION 'An internal draft is not proof of client communication. Record the actual communication source first.'; END IF;
    IF v_row.source_type='MEETING' AND NOT EXISTS(SELECT 1 FROM public.sales_meetings m WHERE m.id=v_row.source_meeting_id AND m.status='Completed') THEN RAISE EXCEPTION 'A Meeting source must be a completed Sales meeting.'; END IF;
    IF v_row.source_type IN ('MANUAL_CLIENT_COMMUNICATION','REQUIREMENT','VALIDATION') AND (v_row.source_summary IS NULL OR char_length(btrim(v_row.source_summary))<6) THEN RAISE EXCEPTION 'Describe where/when the commitment was communicated to the client.'; END IF;
    IF v_row.supersedes_promise_id IS NOT NULL THEN
      SELECT * INTO v_parent FROM public.crm_sales_promises WHERE id=v_row.supersedes_promise_id AND lead_id=v_row.lead_id FOR UPDATE;
      IF NOT FOUND OR v_parent.record_state<>'ACTIVE' THEN RAISE EXCEPTION 'Promise revision source is no longer active.'; END IF;
      UPDATE public.crm_sales_promises SET record_state='SUPERSEDED',updated_by=v_uid WHERE id=v_parent.id;
    END IF;
    UPDATE public.crm_sales_promises SET record_state='ACTIVE',promised_by=v_uid,promised_at=now(),updated_by=v_uid WHERE id=v_row.id;
    PERFORM public.crm_write_lead_event(v_row.lead_id,CASE WHEN v_row.supersedes_promise_id IS NULL THEN 'promise_recorded' ELSE 'promise_revised' END,CASE WHEN v_row.supersedes_promise_id IS NULL THEN 'Promise recorded' ELSE 'Promise revised' END,'A material commitment actually communicated by ProFox was recorded. Approval/validation integrity is evaluated separately and is not hidden.',jsonb_build_object('promiseId',v_row.id,'promiseType',v_row.promise_type,'supersedesPromiseId',v_row.supersedes_promise_id,'linkedValidationId',v_row.linked_validation_id),v_uid,NULL,NULL,now(),'promise-activate:'||v_row.id::text);
  ELSIF v_action='WITHDRAW' THEN
    IF v_row.record_state NOT IN ('DRAFT','ACTIVE') THEN RAISE EXCEPTION 'This Promise is already historical.'; END IF;
    IF v_reason IS NULL OR char_length(v_reason)<6 THEN RAISE EXCEPTION 'A meaningful Promise withdrawal reason is required.'; END IF;
    UPDATE public.crm_sales_promises SET record_state='WITHDRAWN',withdrawn_by=v_uid,withdrawn_at=now(),withdrawal_reason=v_reason,updated_by=v_uid WHERE id=v_row.id;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'promise_withdrawn','Promise withdrawn','The Promise record was withdrawn without deleting the historical commitment or audit trail. Withdrawal does not claim the client accepted removal of the obligation.',jsonb_build_object('promiseId',v_row.id,'wasActive',v_row.record_state='ACTIVE','reason',v_reason),v_uid,NULL,NULL,now(),'promise-withdrawn:'||v_row.id::text);
  ELSE
    RAISE EXCEPTION 'Unsupported Promise action.';
  END IF;
  RETURN v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_save_sales_scope_condition_draft(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_reconcile_sales_scope_requirement(uuid,text,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_revise_sales_scope_condition(uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_transition_sales_scope_condition(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_save_sales_promise_draft(uuid,uuid,uuid,text,text,text,text,text,uuid,text,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_revise_sales_promise(uuid,text,text,text,text,uuid,text,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_transition_sales_promise(uuid,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_save_sales_scope_condition_draft(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_reconcile_sales_scope_requirement(uuid,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_revise_sales_scope_condition(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_transition_sales_scope_condition(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_save_sales_promise_draft(uuid,uuid,uuid,text,text,text,text,text,uuid,text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_revise_sales_promise(uuid,text,text,text,text,uuid,text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_transition_sales_promise(uuid,text,boolean,text) TO authenticated;
