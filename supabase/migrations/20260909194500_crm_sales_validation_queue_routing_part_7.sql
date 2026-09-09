-- CRM Sales SOP Part 7 — reviewer notification routing hardening
-- The Sales Validation queue is embedded in the existing My Work operational surface.
-- Keep seller notifications on CRM Leads; route every reviewer/team notification to My Work.

CREATE OR REPLACE FUNCTION public.crm_sales_validation_notify_reviewers(
  p_validation_id uuid,
  p_validation_type text,
  p_reviewer_team text,
  p_requested_by uuid,
  p_event_key text,
  p_title text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT u.id
    FROM public.user_profiles u
    WHERE u.status = 'active'
      AND u.id IS DISTINCT FROM p_requested_by
      AND public.crm_sales_validation_reviewer_eligible(p_validation_type,p_reviewer_team,u.id)
  LOOP
    PERFORM public.enqueue_in_app_notification(
      v_user.id,
      'Sales Validation',
      left(p_title,240),
      left(p_message,2000),
      '/admin?tab=myWork',
      'sales-validation:' || p_validation_id::text || ':' || p_event_key || ':' || v_user.id::text
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_transition_sales_validation(
  p_validation_id uuid,
  p_action text,
  p_information_request text DEFAULT NULL,
  p_resubmission_note text DEFAULT NULL,
  p_decision_summary text DEFAULT NULL,
  p_approved_constraints text DEFAULT NULL,
  p_rejection_reason text DEFAULT NULL,
  p_cancel_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := upper(trim(COALESCE(p_action,'')));
  v_row public.crm_sales_validations%ROWTYPE;
  v_state jsonb;
  v_is_reviewer boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  SELECT * INTO v_row FROM public.crm_sales_validations WHERE id=p_validation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales validation was not found.'; END IF;

  v_is_reviewer := public.crm_sales_validation_reviewer_eligible(v_row.validation_type,v_row.reviewer_team,v_uid);

  IF v_action IN ('START','NEEDS_INFORMATION','APPROVE','REJECT') THEN
    IF NOT v_is_reviewer THEN RAISE EXCEPTION 'You are not eligible to review this validation.'; END IF;
    IF v_row.requested_by=v_uid THEN RAISE EXCEPTION 'A requester cannot review or approve their own validation.'; END IF;
    IF v_row.assigned_reviewer_id IS NOT NULL AND v_row.assigned_reviewer_id<>v_uid THEN
      RAISE EXCEPTION 'This validation is already assigned to another reviewer.';
    END IF;
  END IF;

  IF v_action='START' THEN
    IF v_row.status NOT IN ('PENDING','IN_REVIEW') THEN RAISE EXCEPTION 'This validation cannot be started from its current status.'; END IF;
    v_state := public.crm_sales_validation_source_state(v_row.lead_id,v_row.requirement_id,v_row.product_id,v_row.package_fit_policy_key,v_row.package_fit_policy_version);
    UPDATE public.crm_sales_validations SET
      status='IN_REVIEW', assigned_reviewer_id=v_uid, started_at=COALESCE(started_at,now()),
      source_snapshot=COALESCE(v_state->'snapshot','{}'::jsonb), source_fingerprint=COALESCE(v_state->>'fingerprint',''),
      source_acknowledged_at=now(), source_acknowledged_by=v_uid
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_started','Sales validation review started',v_row.validation_type||' review started.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','IN_REVIEW','reviewerId',v_uid),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':started:'||COALESCE(v_row.started_at::text,now()::text));

  ELSIF v_action='NEEDS_INFORMATION' THEN
    IF v_row.status<>'IN_REVIEW' THEN RAISE EXCEPTION 'Information can be requested only from an in-review validation.'; END IF;
    IF char_length(btrim(COALESCE(p_information_request,'')))<10 THEN RAISE EXCEPTION 'State the exact information needed before review can continue.'; END IF;
    UPDATE public.crm_sales_validations SET status='NEEDS_INFORMATION',assigned_reviewer_id=v_uid,information_requested=left(btrim(p_information_request),4000)
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_information_requested','Sales validation needs information',v_row.validation_type||' review needs additional information.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','NEEDS_INFORMATION','reviewerId',v_uid),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':needs-information:'||v_row.updated_at::text);
    PERFORM public.crm_sales_validation_notify_seller(v_row.id,v_row.requested_by,'needs-information:'||v_row.updated_at::text,'Sales validation needs information','A specialist needs clarification before the '||lower(replace(v_row.validation_type,'_',' '))||' review can continue.');

  ELSIF v_action='RESUBMIT' THEN
    IF v_row.status<>'NEEDS_INFORMATION' THEN RAISE EXCEPTION 'Only a validation needing information can be resubmitted.'; END IF;
    IF NOT (public.crm_can_access_lead(v_row.lead_id) OR public.is_admin()) THEN RAISE EXCEPTION 'Authorized CRM Lead access is required to resubmit.'; END IF;
    v_state := public.crm_sales_validation_source_state(v_row.lead_id,v_row.requirement_id,v_row.product_id,v_row.package_fit_policy_key,v_row.package_fit_policy_version);
    UPDATE public.crm_sales_validations SET
      status='PENDING',resubmission_note=NULLIF(left(btrim(COALESCE(p_resubmission_note,'')),2000),''),
      information_requested=NULL,source_snapshot=COALESCE(v_state->'snapshot','{}'::jsonb),source_fingerprint=COALESCE(v_state->>'fingerprint',''),
      source_changed_at=NULL,source_acknowledged_at=NULL,source_acknowledged_by=NULL
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_resubmitted','Sales validation resubmitted',v_row.validation_type||' review resubmitted after clarification.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','PENDING'),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':resubmitted:'||v_row.updated_at::text);
    IF v_row.assigned_reviewer_id IS NOT NULL THEN
      PERFORM public.enqueue_in_app_notification(v_row.assigned_reviewer_id,'Sales Validation','Sales validation resubmitted','Updated canonical CRM information is ready for review.','/admin?tab=myWork','sales-validation:'||v_row.id::text||':resubmitted:'||v_row.updated_at::text||':'||v_row.assigned_reviewer_id::text);
    ELSE
      PERFORM public.crm_sales_validation_notify_reviewers(v_row.id,v_row.validation_type,v_row.reviewer_team,v_row.requested_by,'resubmitted:'||v_row.updated_at::text,'Sales validation resubmitted','Updated canonical CRM information is ready in the Sales Validation queue.');
    END IF;

  ELSIF v_action='APPROVE' THEN
    IF v_row.status<>'IN_REVIEW' THEN RAISE EXCEPTION 'Only an in-review validation can be approved.'; END IF;
    IF char_length(btrim(COALESCE(p_decision_summary,'')))<10 THEN RAISE EXCEPTION 'A meaningful approval decision summary is required.'; END IF;
    IF v_row.source_changed_at IS NOT NULL AND (v_row.source_acknowledged_at IS NULL OR v_row.source_acknowledged_at<v_row.source_changed_at) THEN
      RAISE EXCEPTION 'The source changed during review. Refresh/Start Review again to acknowledge current CRM information before deciding.';
    END IF;
    UPDATE public.crm_sales_validations SET status='APPROVED',assigned_reviewer_id=v_uid,decision_summary=left(btrim(p_decision_summary),4000),approved_constraints=NULLIF(left(btrim(COALESCE(p_approved_constraints,'')),4000),''),rejection_rework_reason=NULL,decided_by=v_uid,decided_at=now()
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_approved','Sales validation approved',v_row.validation_type||' review approved within recorded constraints.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','APPROVED','reviewerId',v_uid),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':approved');
    PERFORM public.crm_sales_validation_notify_seller(v_row.id,v_row.requested_by,'approved','Sales validation approved','The '||lower(replace(v_row.validation_type,'_',' '))||' review was approved. Review any recorded constraints before making a client commitment.');

  ELSIF v_action='REJECT' THEN
    IF v_row.status<>'IN_REVIEW' THEN RAISE EXCEPTION 'Only an in-review validation can be rejected.'; END IF;
    IF char_length(btrim(COALESCE(p_rejection_reason,'')))<10 THEN RAISE EXCEPTION 'A meaningful rejection/rework reason is required.'; END IF;
    IF v_row.source_changed_at IS NOT NULL AND (v_row.source_acknowledged_at IS NULL OR v_row.source_acknowledged_at<v_row.source_changed_at) THEN
      RAISE EXCEPTION 'The source changed during review. Refresh/Start Review again to acknowledge current CRM information before deciding.';
    END IF;
    UPDATE public.crm_sales_validations SET status='REJECTED',assigned_reviewer_id=v_uid,decision_summary=NULLIF(left(btrim(COALESCE(p_decision_summary,'')),4000),''),approved_constraints=NULL,rejection_rework_reason=left(btrim(p_rejection_reason),4000),decided_by=v_uid,decided_at=now()
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_rejected','Sales validation rejected',v_row.validation_type||' review rejected; scope/rework is required.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','REJECTED','reviewerId',v_uid),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':rejected');
    PERFORM public.crm_sales_validation_notify_seller(v_row.id,v_row.requested_by,'rejected','Sales validation rejected','The '||lower(replace(v_row.validation_type,'_',' '))||' review was rejected. Resolve the recorded rework reason before relying on the requested approach.');

  ELSIF v_action='CANCEL' THEN
    IF v_row.status NOT IN ('PENDING','NEEDS_INFORMATION','IN_REVIEW') THEN RAISE EXCEPTION 'This validation can no longer be cancelled.'; END IF;
    IF NOT public.is_admin() AND (v_row.requested_by<>v_uid OR v_row.status='IN_REVIEW') THEN
      RAISE EXCEPTION 'Only the requesting Seller may cancel a non-started review; Admin may cancel an active review.';
    END IF;
    IF char_length(btrim(COALESCE(p_cancel_reason,'')))<6 THEN RAISE EXCEPTION 'A cancellation reason is required.'; END IF;
    UPDATE public.crm_sales_validations SET status='CANCELLED',cancelled_by=v_uid,cancelled_at=now(),cancel_reason=left(btrim(p_cancel_reason),2000)
    WHERE id=v_row.id RETURNING * INTO v_row;
    PERFORM public.crm_write_lead_event(v_row.lead_id,'sales_validation_cancelled','Sales validation cancelled',v_row.validation_type||' review cancelled.',jsonb_build_object('validationId',v_row.id,'validationType',v_row.validation_type,'severity',v_row.severity,'status','CANCELLED'),v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':cancelled');

  ELSE
    RAISE EXCEPTION 'Unsupported Sales validation action.';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_requirement_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v record;
BEGIN
  IF NOT (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.structured_value IS DISTINCT FROM OLD.structured_value OR
    NEW.information_certainty IS DISTINCT FROM OLD.information_certainty OR
    NEW.record_state IS DISTINCT FROM OLD.record_state OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.category IS DISTINCT FROM OLD.category
  ) THEN RETURN NEW; END IF;

  FOR v IN
    SELECT id,lead_id,validation_type,severity,status,requested_by,assigned_reviewer_id
    FROM public.crm_sales_validations
    WHERE requirement_id=NEW.id AND status IN ('APPROVED','REJECTED')
    FOR UPDATE
  LOOP
    UPDATE public.crm_sales_validations SET status='STALE',source_changed_at=now() WHERE id=v.id;
    PERFORM public.crm_write_lead_event(
      v.lead_id,'sales_validation_stale','Sales validation became stale',
      v.validation_type||' decision is stale because its source Requirement materially changed.',
      jsonb_build_object('validationId',v.id,'validationType',v.validation_type,'severity',v.severity,'status','STALE','requirementId',NEW.id),
      NULL,NULL,NULL,now(),'sales-validation:'||v.id::text||':stale'
    );
    PERFORM public.crm_sales_validation_notify_seller(
      v.id,v.requested_by,'stale','Sales validation is stale',
      'The source Requirement changed after specialist decision. The previous decision remains historical and a fresh review is required before relying on it.'
    );
  END LOOP;

  UPDATE public.crm_sales_validations
  SET source_changed_at=now()
  WHERE requirement_id=NEW.id AND status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION');

  FOR v IN
    SELECT id,assigned_reviewer_id
    FROM public.crm_sales_validations
    WHERE requirement_id=NEW.id AND status='IN_REVIEW' AND assigned_reviewer_id IS NOT NULL
  LOOP
    PERFORM public.enqueue_in_app_notification(
      v.assigned_reviewer_id,
      'Sales Validation',
      'Sales validation source changed',
      'A Requirement changed during review. Refresh the current source before deciding.',
      '/admin?tab=myWork',
      'sales-validation:'||v.id::text||':source-changed:'||NEW.updated_at::text||':'||v.assigned_reviewer_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_requirement_changed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text) TO authenticated;
