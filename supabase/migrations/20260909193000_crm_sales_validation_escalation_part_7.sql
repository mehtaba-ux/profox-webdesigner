-- CRM Sales SOP Part 7 — Sales Validation, Escalation & Specialist Review
--
-- One canonical Sales validation domain. Existing quotation approval remains authoritative
-- for quotation-specific price/discount/payment/terms decisions.
--
-- No Requirements Confirmed gate, Proposal Readiness, quotation-send gate, payment/Won,
-- Promise Register, scope-condition engine, or Sales-to-Delivery handoff behavior is changed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.system_configuration
    WHERE config_key = 'crm_sales_validation_policy_v1'
  ) THEN
    RAISE EXCEPTION 'Sales validation policy collision: crm_sales_validation_policy_v1 already exists.';
  END IF;

  INSERT INTO public.system_configuration(config_key, config_value, description)
  VALUES (
    'crm_sales_validation_policy_v1',
    jsonb_build_object(
      'policyKey', 'crm_sales_validation_policy_v1',
      'policyVersion', 1,
      'validationTypes', jsonb_build_object(
        'TECHNICAL', jsonb_build_object(
          'active', true,
          'defaultSeverity', 'AMBER',
          'teamKey', 'TECHNICAL_REVIEW',
          'eligibleRoles', jsonb_build_array('developer','admin'),
          'eligibleDepartments', jsonb_build_array('Development','General'),
          'requirementCategories', jsonb_build_array('TECHNICAL','CUSTOM_APPLICATION','INTEGRATIONS','BOOKING','ECOMMERCE','ANALYTICS'),
          'selfReviewAllowed', false
        ),
        'COMMERCIAL', jsonb_build_object(
          'active', true,
          'defaultSeverity', 'AMBER',
          'teamKey', 'COMMERCIAL_REVIEW',
          'eligibleRoles', jsonb_build_array('admin'),
          'eligibleDepartments', jsonb_build_array('General'),
          'requirementCategories', jsonb_build_array('COMMERCIAL'),
          'selfReviewAllowed', false
        ),
        'TIMELINE', jsonb_build_object(
          'active', true,
          'defaultSeverity', 'AMBER',
          'teamKey', 'TIMELINE_REVIEW',
          'eligibleRoles', jsonb_build_array('admin'),
          'eligibleDepartments', jsonb_build_array('General'),
          'requirementCategories', jsonb_build_array(),
          'selfReviewAllowed', false
        ),
        'COMPLIANCE_RISK', jsonb_build_object(
          'active', true,
          'defaultSeverity', 'RED',
          'teamKey', 'COMPLIANCE_RISK_REVIEW',
          'eligibleRoles', jsonb_build_array('admin'),
          'eligibleDepartments', jsonb_build_array('General'),
          'requirementCategories', jsonb_build_array('RISKS_DEPENDENCIES'),
          'selfReviewAllowed', false
        ),
        'SCOPE', jsonb_build_object(
          'active', true,
          'defaultSeverity', 'AMBER',
          'teamKey', 'SCOPE_REVIEW',
          'eligibleRoles', jsonb_build_array('developer','admin'),
          'eligibleDepartments', jsonb_build_array('Development','General'),
          'requirementCategories', jsonb_build_array('PROJECT_SCOPE','CONTENT','BRAND','BUSINESS','PROBLEM','DESIRED_OUTCOME','AUDIENCE_CUSTOMER','DECISION_BUYING_PROCESS'),
          'selfReviewAllowed', false
        )
      )
    ),
    'Part 7 versioned routing/severity policy for pre-proposal Sales validation. Contains role/department/team policy only; no person-specific reviewer IDs.'
  );
END
$$;

CREATE TABLE public.crm_sales_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE RESTRICT,
  opportunity_id uuid NULL REFERENCES public.crm_opportunities(id) ON DELETE RESTRICT,
  requirement_id uuid NULL REFERENCES public.crm_requirements(id) ON DELETE RESTRICT,
  meeting_id uuid NULL REFERENCES public.sales_meetings(id) ON DELETE RESTRICT,
  product_id uuid NULL REFERENCES public.sales_products(id) ON DELETE RESTRICT,
  package_fit_policy_key text NULL,
  package_fit_policy_version integer NULL,
  validation_type text NOT NULL CHECK (validation_type IN ('TECHNICAL','COMMERCIAL','TIMELINE','COMPLIANCE_RISK','SCOPE')),
  severity text NOT NULL CHECK (severity IN ('GREEN','AMBER','RED')),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 6 AND 240),
  request_context text NOT NULL DEFAULT '' CHECK (char_length(request_context) <= 4000),
  source_type text NOT NULL CHECK (source_type IN ('REQUIREMENT','PACKAGE_FIT','MEETING','MANUAL')),
  source_key text NOT NULL CHECK (char_length(btrim(source_key)) BETWEEN 1 AND 240),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_snapshot) = 'object'),
  source_fingerprint text NOT NULL DEFAULT '',
  source_changed_at timestamptz NULL,
  source_acknowledged_at timestamptz NULL,
  source_acknowledged_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION','APPROVED','REJECTED','CANCELLED','STALE')),
  reviewer_team text NOT NULL CHECK (char_length(btrim(reviewer_team)) BETWEEN 1 AND 120),
  requested_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  assigned_reviewer_id uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  started_at timestamptz NULL,
  information_requested text NULL CHECK (information_requested IS NULL OR char_length(information_requested) <= 4000),
  resubmission_note text NULL CHECK (resubmission_note IS NULL OR char_length(resubmission_note) <= 2000),
  decision_summary text NULL CHECK (decision_summary IS NULL OR char_length(decision_summary) <= 4000),
  approved_constraints text NULL CHECK (approved_constraints IS NULL OR char_length(approved_constraints) <= 4000),
  rejection_rework_reason text NULL CHECK (rejection_rework_reason IS NULL OR char_length(rejection_rework_reason) <= 4000),
  decided_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  decided_at timestamptz NULL,
  cancelled_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 2000),
  supersedes_validation_id uuid NULL REFERENCES public.crm_sales_validations(id) ON DELETE RESTRICT,
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) <= 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_sales_validation_decision_integrity CHECK (
    (status NOT IN ('APPROVED','REJECTED') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
  ),
  CONSTRAINT crm_sales_validation_cancel_integrity CHECK (
    (status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))
  )
);

COMMENT ON TABLE public.crm_sales_validations IS
  'Canonical internal Part 7 Sales validation/escalation records for technical, commercial, timeline, compliance/risk and scope review. Not quotation approval and not customer-visible.';

CREATE UNIQUE INDEX crm_sales_validations_active_dedupe_uidx
  ON public.crm_sales_validations(dedupe_key)
  WHERE status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION');
CREATE INDEX crm_sales_validations_lead_requested_idx
  ON public.crm_sales_validations(lead_id, requested_at DESC);
CREATE INDEX crm_sales_validations_opportunity_idx
  ON public.crm_sales_validations(opportunity_id)
  WHERE opportunity_id IS NOT NULL;
CREATE INDEX crm_sales_validations_requirement_idx
  ON public.crm_sales_validations(requirement_id, status)
  WHERE requirement_id IS NOT NULL;
CREATE INDEX crm_sales_validations_queue_idx
  ON public.crm_sales_validations(status, severity, reviewer_team, requested_at);
CREATE INDEX crm_sales_validations_reviewer_idx
  ON public.crm_sales_validations(assigned_reviewer_id, status, requested_at)
  WHERE assigned_reviewer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_sales_validations_touch_updated_at
BEFORE UPDATE ON public.crm_sales_validations
FOR EACH ROW EXECUTE FUNCTION public.crm_sales_validation_touch_updated_at();

CREATE OR REPLACE FUNCTION public.crm_sales_validation_prevent_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Sales validation history is immutable; use a status transition instead of delete.';
END;
$$;

CREATE TRIGGER trg_crm_sales_validations_no_delete
BEFORE DELETE ON public.crm_sales_validations
FOR EACH ROW EXECUTE FUNCTION public.crm_sales_validation_prevent_delete();

CREATE OR REPLACE FUNCTION public.crm_sales_validation_policy_entry(p_validation_type text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT sc.config_value->'validationTypes'->upper(trim(p_validation_type))
  FROM public.system_configuration sc
  WHERE sc.config_key = 'crm_sales_validation_policy_v1';
$$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_reviewer_eligible(
  p_validation_type text,
  p_reviewer_team text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH policy AS (
    SELECT public.crm_sales_validation_policy_entry(p_validation_type) AS entry
  )
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.user_profiles u, policy p
    WHERE u.id = p_user_id
      AND u.status = 'active'
      AND COALESCE((p.entry->>'active')::boolean,false)
      AND p.entry->>'teamKey' = p_reviewer_team
      AND COALESCE(p.entry->'eligibleRoles','[]'::jsonb) ? u.role
      AND (
        jsonb_array_length(COALESCE(p.entry->'eligibleDepartments','[]'::jsonb)) = 0
        OR COALESCE(p.entry->'eligibleDepartments','[]'::jsonb) ? COALESCE(u.department,'')
      )
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_source_state(
  p_lead_id uuid,
  p_requirement_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_package_fit_policy_key text DEFAULT NULL,
  p_package_fit_policy_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requirement public.crm_requirements%ROWTYPE;
  v_product public.sales_products%ROWTYPE;
  v_snapshot jsonb := '{}'::jsonb;
  v_material text := COALESCE(p_lead_id::text,'');
BEGIN
  IF p_requirement_id IS NOT NULL THEN
    SELECT * INTO v_requirement
    FROM public.crm_requirements r
    WHERE r.id = p_requirement_id AND r.lead_id = p_lead_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Requirement does not belong to this Lead.';
    END IF;
    v_snapshot := v_snapshot || jsonb_build_object(
      'requirementId',v_requirement.id,
      'requirementKey',v_requirement.requirement_key,
      'requirementTitle',v_requirement.title,
      'informationCertainty',v_requirement.information_certainty,
      'recordState',v_requirement.record_state,
      'requirementUpdatedAt',v_requirement.updated_at
    );
    v_material := v_material || '|' || COALESCE(v_requirement.requirement_key,'') || '|' || COALESCE(v_requirement.title,'') || '|' ||
      COALESCE(v_requirement.category,'') || '|' || COALESCE(v_requirement.content,'') || '|' || COALESCE(v_requirement.structured_value::text,'') || '|' ||
      COALESCE(v_requirement.information_certainty,'') || '|' || COALESCE(v_requirement.record_state,'');
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT * INTO v_product
    FROM public.sales_products sp
    WHERE sp.id = p_product_id AND sp.active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product reference is missing or inactive.';
    END IF;
    v_snapshot := v_snapshot || jsonb_build_object(
      'productId',v_product.id,
      'productCode',v_product.code,
      'productUpdatedAt',v_product.updated_at,
      'managerApprovalRequired',COALESCE(v_product.manager_approval_required,false),
      'timelineImpact',v_product.timeline_impact
    );
    v_material := v_material || '|' || v_product.id::text || '|' || COALESCE(v_product.code,'') || '|' || COALESCE(v_product.updated_at::text,'');
  END IF;

  IF p_package_fit_policy_key IS NOT NULL THEN
    v_snapshot := v_snapshot || jsonb_build_object(
      'packageFitPolicyKey',p_package_fit_policy_key,
      'packageFitPolicyVersion',p_package_fit_policy_version
    );
    v_material := v_material || '|' || COALESCE(p_package_fit_policy_key,'') || '|' || COALESCE(p_package_fit_policy_version::text,'');
  END IF;

  RETURN jsonb_build_object('snapshot',v_snapshot,'fingerprint',md5(v_material));
END;
$$;

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
      '/admin?tab=sales_validations',
      'sales-validation:' || p_validation_id::text || ':' || p_event_key || ':' || v_user.id::text
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_notify_seller(
  p_validation_id uuid,
  p_user_id uuid,
  p_event_key text,
  p_title text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  PERFORM public.enqueue_in_app_notification(
    p_user_id,
    'Sales Validation',
    left(p_title,240),
    left(p_message,2000),
    '/admin?tab=crm_leads',
    'sales-validation:' || p_validation_id::text || ':' || p_event_key || ':' || p_user_id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_request_sales_validation(
  p_lead_id uuid,
  p_opportunity_id uuid DEFAULT NULL,
  p_requirement_id uuid DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_validation_type text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_request_context text DEFAULT NULL,
  p_source_type text DEFAULT 'MANUAL',
  p_source_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text := upper(trim(COALESCE(p_validation_type,'')));
  v_source_type text := upper(trim(COALESCE(p_source_type,'MANUAL')));
  v_subject text := btrim(COALESCE(p_subject,''));
  v_context text := btrim(COALESCE(p_request_context,''));
  v_source_key text := btrim(COALESCE(p_source_key,''));
  v_policy jsonb;
  v_entry jsonb;
  v_severity text;
  v_team text;
  v_requirement public.crm_requirements%ROWTYPE;
  v_meeting_lead uuid;
  v_current_policy jsonb;
  v_policy_key text;
  v_policy_version integer;
  v_source_state jsonb;
  v_dedupe text;
  v_existing public.crm_sales_validations%ROWTYPE;
  v_row public.crm_sales_validations%ROWTYPE;
  v_supersedes uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  IF p_lead_id IS NULL OR NOT public.crm_can_access_lead(p_lead_id) THEN
    RAISE EXCEPTION 'Authorized CRM Lead access is required.';
  END IF;

  IF p_opportunity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_opportunities o WHERE o.id=p_opportunity_id AND o.lead_id=p_lead_id
  ) THEN
    RAISE EXCEPTION 'Opportunity does not belong to this Lead.';
  END IF;

  IF p_requirement_id IS NOT NULL THEN
    SELECT * INTO v_requirement
    FROM public.crm_requirements r
    WHERE r.id=p_requirement_id AND r.lead_id=p_lead_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Requirement does not belong to this Lead.'; END IF;
  END IF;

  IF p_meeting_id IS NOT NULL THEN
    SELECT COALESCE(sm.lead_id,o.lead_id)
      INTO v_meeting_lead
    FROM public.sales_meetings sm
    LEFT JOIN public.crm_opportunities o ON o.id=sm.opportunity_id
    WHERE sm.id=p_meeting_id;
    IF v_meeting_lead IS DISTINCT FROM p_lead_id THEN
      RAISE EXCEPTION 'Meeting does not belong to this Lead lifecycle.';
    END IF;
  END IF;

  IF p_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales_products sp WHERE sp.id=p_product_id AND sp.active
  ) THEN
    RAISE EXCEPTION 'Product reference is missing or inactive.';
  END IF;

  IF v_source_type NOT IN ('REQUIREMENT','PACKAGE_FIT','MEETING','MANUAL') THEN
    RAISE EXCEPTION 'Unsupported Sales validation source type.';
  END IF;
  IF v_source_type='REQUIREMENT' AND p_requirement_id IS NULL THEN
    RAISE EXCEPTION 'Requirement source requires a Requirement reference.';
  END IF;
  IF v_source_type='MEETING' AND p_meeting_id IS NULL THEN
    RAISE EXCEPTION 'Meeting source requires a Meeting reference.';
  END IF;

  SELECT sc.config_value INTO v_policy
  FROM public.system_configuration sc
  WHERE sc.config_key='crm_sales_validation_policy_v1';
  IF v_policy IS NULL OR (v_policy->>'policyVersion')::integer <> 1 THEN
    RAISE EXCEPTION 'Sales validation routing policy is unavailable.';
  END IF;

  IF v_type='' AND p_requirement_id IS NOT NULL THEN
    SELECT e.key INTO v_type
    FROM jsonb_each(v_policy->'validationTypes') e
    WHERE COALESCE((e.value->>'active')::boolean,false)
      AND COALESCE(e.value->'requirementCategories','[]'::jsonb) ? v_requirement.category
    ORDER BY CASE e.key WHEN 'TECHNICAL' THEN 1 WHEN 'COMPLIANCE_RISK' THEN 2 WHEN 'COMMERCIAL' THEN 3 WHEN 'SCOPE' THEN 4 ELSE 5 END
    LIMIT 1;
  END IF;
  IF v_type='' THEN RAISE EXCEPTION 'A supported validation type is required.'; END IF;

  v_entry := v_policy->'validationTypes'->v_type;
  IF v_entry IS NULL OR NOT COALESCE((v_entry->>'active')::boolean,false) THEN
    RAISE EXCEPTION 'Unsupported or inactive Sales validation type.';
  END IF;
  v_severity := v_entry->>'defaultSeverity';
  v_team := v_entry->>'teamKey';
  IF v_severity NOT IN ('GREEN','AMBER','RED') OR btrim(COALESCE(v_team,''))='' THEN
    RAISE EXCEPTION 'Sales validation routing policy is malformed.';
  END IF;

  IF char_length(v_subject) < 6 THEN RAISE EXCEPTION 'A clear review subject is required.'; END IF;
  IF char_length(v_context) < 8 THEN RAISE EXCEPTION 'Explain what needs review and why it matters.'; END IF;

  IF v_source_type='PACKAGE_FIT' THEN
    SELECT sc.config_value INTO v_current_policy
    FROM public.system_configuration sc
    WHERE sc.config_key='crm_package_fit_policy_v1';
    v_policy_key := 'crm_package_fit_policy_v1';
    v_policy_version := NULLIF(v_current_policy->>'policyVersion','')::integer;
  END IF;

  IF v_source_key='' THEN
    v_source_key := CASE
      WHEN p_requirement_id IS NOT NULL THEN 'requirement:'||p_requirement_id::text
      WHEN p_meeting_id IS NOT NULL THEN 'meeting:'||p_meeting_id::text
      WHEN p_product_id IS NOT NULL THEN 'product:'||p_product_id::text
      ELSE 'manual:'||left(md5(lower(v_subject)),24)
    END;
  END IF;

  v_source_state := public.crm_sales_validation_source_state(
    p_lead_id,p_requirement_id,p_product_id,v_policy_key,v_policy_version
  );
  v_dedupe := md5(concat_ws('|',p_lead_id::text,v_type,COALESCE(p_requirement_id::text,''),v_source_type,v_source_key));

  SELECT * INTO v_existing
  FROM public.crm_sales_validations v
  WHERE v.dedupe_key=v_dedupe
    AND v.status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION')
  ORDER BY v.requested_at DESC
  LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_existing); END IF;

  SELECT v.id INTO v_supersedes
  FROM public.crm_sales_validations v
  WHERE v.dedupe_key=v_dedupe AND v.status='STALE'
  ORDER BY v.updated_at DESC LIMIT 1;

  BEGIN
    INSERT INTO public.crm_sales_validations(
      lead_id,opportunity_id,requirement_id,meeting_id,product_id,
      package_fit_policy_key,package_fit_policy_version,validation_type,severity,
      subject,request_context,source_type,source_key,source_snapshot,source_fingerprint,
      reviewer_team,requested_by,supersedes_validation_id,dedupe_key
    ) VALUES (
      p_lead_id,p_opportunity_id,p_requirement_id,p_meeting_id,p_product_id,
      v_policy_key,v_policy_version,v_type,v_severity,
      left(v_subject,240),left(v_context,4000),v_source_type,left(v_source_key,240),
      COALESCE(v_source_state->'snapshot','{}'::jsonb),COALESCE(v_source_state->>'fingerprint',''),
      v_team,v_uid,v_supersedes,v_dedupe
    ) RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_row
    FROM public.crm_sales_validations v
    WHERE v.dedupe_key=v_dedupe AND v.status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION')
    ORDER BY v.requested_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE; END IF;
    RETURN to_jsonb(v_row);
  END;

  PERFORM public.crm_write_lead_event(
    p_lead_id,'sales_validation_requested','Sales validation requested',
    v_type || ' review requested.',
    jsonb_build_object('validationId',v_row.id,'validationType',v_type,'severity',v_severity,'status','PENDING','requirementId',p_requirement_id,'policyVersion',1),
    v_uid,NULL,NULL,now(),'sales-validation:'||v_row.id::text||':requested'
  );
  PERFORM public.crm_sales_validation_notify_reviewers(
    v_row.id,v_type,v_team,v_uid,'requested',
    v_type || ' Sales validation requested',
    'A ' || lower(replace(v_type,'_',' ')) || ' review is waiting in the Sales Validation queue.'
  );
  RETURN to_jsonb(v_row);
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
      PERFORM public.enqueue_in_app_notification(v_row.assigned_reviewer_id,'Sales Validation','Sales validation resubmitted','Updated canonical CRM information is ready for review.','/admin?tab=sales_validations','sales-validation:'||v_row.id::text||':resubmitted:'||v_row.updated_at::text||':'||v_row.assigned_reviewer_id::text);
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

CREATE OR REPLACE FUNCTION public.crm_get_sales_validation_workspace(
  p_lead_id uuid,
  p_opportunity_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_validations jsonb;
  v_requirements jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  IF p_lead_id IS NULL OR NOT public.crm_can_access_lead(p_lead_id) THEN RAISE EXCEPTION 'Authorized CRM Lead access is required.'; END IF;
  IF p_opportunity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_opportunities o WHERE o.id=p_opportunity_id AND o.lead_id=p_lead_id) THEN
    RAISE EXCEPTION 'Opportunity does not belong to this Lead.';
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'requestedAt')::timestamptz DESC),'[]'::jsonb)
  INTO v_validations
  FROM (
    SELECT jsonb_build_object(
      'id',v.id,'leadId',v.lead_id,'opportunityId',v.opportunity_id,'requirementId',v.requirement_id,'meetingId',v.meeting_id,'productId',v.product_id,
      'packageFitPolicyKey',v.package_fit_policy_key,'packageFitPolicyVersion',v.package_fit_policy_version,
      'validationType',v.validation_type,'severity',v.severity,'subject',v.subject,'requestContext',v.request_context,
      'sourceType',v.source_type,'sourceKey',v.source_key,'sourceSnapshot',v.source_snapshot,'sourceChangedAt',v.source_changed_at,
      'status',v.status,'reviewerTeam',v.reviewer_team,'requestedBy',v.requested_by,'requestedByName',COALESCE(req.full_name,req.email,'Seller'),
      'requestedAt',v.requested_at,'assignedReviewerId',v.assigned_reviewer_id,'assignedReviewerName',COALESCE(rev.full_name,rev.email),
      'startedAt',v.started_at,'informationRequested',v.information_requested,'resubmissionNote',v.resubmission_note,
      'decisionSummary',v.decision_summary,'approvedConstraints',v.approved_constraints,'rejectionReworkReason',v.rejection_rework_reason,
      'decidedBy',v.decided_by,'decidedAt',v.decided_at,'cancelledAt',v.cancelled_at,'cancelReason',v.cancel_reason,
      'supersedesValidationId',v.supersedes_validation_id,'createdAt',v.created_at,'updatedAt',v.updated_at,
      'requirementTitle',r.title,'requirementKey',r.requirement_key,'requirementCertainty',r.information_certainty
    ) AS item
    FROM public.crm_sales_validations v
    LEFT JOIN public.user_profiles req ON req.id=v.requested_by
    LEFT JOIN public.user_profiles rev ON rev.id=v.assigned_reviewer_id
    LEFT JOIN public.crm_requirements r ON r.id=v.requirement_id
    WHERE v.lead_id=p_lead_id AND (p_opportunity_id IS NULL OR v.opportunity_id IS NULL OR v.opportunity_id=p_opportunity_id)
  ) x;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'title'),'[]'::jsonb)
  INTO v_requirements
  FROM (
    SELECT jsonb_build_object(
      'id',r.id,'requirementKey',r.requirement_key,'title',r.title,'category',r.category,'informationCertainty',r.information_certainty,'updatedAt',r.updated_at,
      'latestValidationId',lv.id,'latestValidationType',lv.validation_type,'latestValidationSeverity',lv.severity,'latestValidationStatus',lv.status,
      'latestApprovedConstraints',lv.approved_constraints,'latestInformationRequested',lv.information_requested,'reviewerTeam',lv.reviewer_team
    ) AS item
    FROM public.crm_requirements r
    LEFT JOIN LATERAL (
      SELECT v.* FROM public.crm_sales_validations v
      WHERE v.requirement_id=r.id
      ORDER BY CASE WHEN v.status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION') THEN 0 ELSE 1 END, v.updated_at DESC
      LIMIT 1
    ) lv ON true
    WHERE r.lead_id=p_lead_id AND r.record_state='ACTIVE' AND r.information_certainty='NEEDS_SPECIALIST_VALIDATION'
  ) y;

  RETURN jsonb_build_object(
    'leadId',p_lead_id,'opportunityId',p_opportunity_id,'validations',v_validations,'requirementsNeedingValidation',v_requirements,
    'summary',jsonb_build_object(
      'requiredReviews',jsonb_array_length(v_requirements),
      'pending',(SELECT COUNT(*) FROM public.crm_sales_validations v WHERE v.lead_id=p_lead_id AND v.status IN ('PENDING','IN_REVIEW')),
      'needsInformation',(SELECT COUNT(*) FROM public.crm_sales_validations v WHERE v.lead_id=p_lead_id AND v.status='NEEDS_INFORMATION'),
      'approved',(SELECT COUNT(*) FROM public.crm_sales_validations v WHERE v.lead_id=p_lead_id AND v.status='APPROVED'),
      'criticalUnresolved',(SELECT COUNT(*) FROM public.crm_sales_validations v WHERE v.lead_id=p_lead_id AND v.severity='RED' AND v.status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION','STALE','REJECTED'))
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_get_sales_validation_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid:=auth.uid(); v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  SELECT COALESCE(jsonb_agg(item ORDER BY priority_rank,requested_at),'[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      CASE v.severity WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END AS priority_rank,
      v.requested_at,
      jsonb_build_object(
        'id',v.id,'validationType',v.validation_type,'severity',v.severity,'status',v.status,'subject',v.subject,
        'leadId',v.lead_id,'leadTitle',l.title,'companyName',l.company_name,'opportunityId',v.opportunity_id,'opportunityName',o.name,
        'requirementId',v.requirement_id,'requirementTitle',r.title,'requirementKey',r.requirement_key,
        'sourceType',v.source_type,'sourceKey',v.source_key,'reviewerTeam',v.reviewer_team,
        'requestedBy',v.requested_by,'requestedByName',COALESCE(req.full_name,req.email,'Seller'),'requestedAt',v.requested_at,
        'assignedReviewerId',v.assigned_reviewer_id,'assignedReviewerName',COALESCE(rev.full_name,rev.email),
        'sourceChangedAt',v.source_changed_at,'updatedAt',v.updated_at
      ) AS item
    FROM public.crm_sales_validations v
    JOIN public.crm_leads l ON l.id=v.lead_id
    LEFT JOIN public.crm_opportunities o ON o.id=v.opportunity_id
    LEFT JOIN public.crm_requirements r ON r.id=v.requirement_id
    LEFT JOIN public.user_profiles req ON req.id=v.requested_by
    LEFT JOIN public.user_profiles rev ON rev.id=v.assigned_reviewer_id
    WHERE public.crm_sales_validation_reviewer_eligible(v.validation_type,v.reviewer_team,v_uid)
      AND (v.assigned_reviewer_id IS NULL OR v.assigned_reviewer_id=v_uid OR public.is_admin())
  ) q;
  RETURN jsonb_build_object('items',v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_get_sales_validation_detail(p_validation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid:=auth.uid(); v public.crm_sales_validations%ROWTYPE; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  SELECT * INTO v FROM public.crm_sales_validations WHERE id=p_validation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales validation was not found.'; END IF;
  IF NOT (public.crm_sales_validation_reviewer_eligible(v.validation_type,v.reviewer_team,v_uid) AND (v.assigned_reviewer_id IS NULL OR v.assigned_reviewer_id=v_uid OR public.is_admin())) THEN
    RAISE EXCEPTION 'You are not authorized for this Sales validation.';
  END IF;

  SELECT jsonb_build_object(
    'validation',jsonb_build_object(
      'id',v.id,'leadId',v.lead_id,'opportunityId',v.opportunity_id,'requirementId',v.requirement_id,'meetingId',v.meeting_id,'productId',v.product_id,
      'validationType',v.validation_type,'severity',v.severity,'status',v.status,'subject',v.subject,'requestContext',v.request_context,
      'sourceType',v.source_type,'sourceKey',v.source_key,'sourceSnapshot',v.source_snapshot,'sourceChangedAt',v.source_changed_at,'sourceAcknowledgedAt',v.source_acknowledged_at,
      'reviewerTeam',v.reviewer_team,'requestedBy',v.requested_by,'requestedAt',v.requested_at,'assignedReviewerId',v.assigned_reviewer_id,'startedAt',v.started_at,
      'informationRequested',v.information_requested,'resubmissionNote',v.resubmission_note,'decisionSummary',v.decision_summary,
      'approvedConstraints',v.approved_constraints,'rejectionReworkReason',v.rejection_rework_reason,'decidedBy',v.decided_by,'decidedAt',v.decided_at,
      'cancelledAt',v.cancelled_at,'cancelReason',v.cancel_reason,'supersedesValidationId',v.supersedes_validation_id,'updatedAt',v.updated_at
    ),
    'lead',jsonb_build_object('id',l.id,'title',l.title,'companyName',l.company_name),
    'opportunity',CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id',o.id,'name',o.name,'stage',o.stage) END,
    'requirement',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'requirementKey',r.requirement_key,'title',r.title,'category',r.category,'content',r.content,'structuredValue',r.structured_value,'informationCertainty',r.information_certainty,'recordState',r.record_state,'updatedAt',r.updated_at) END,
    'product',CASE WHEN sp.id IS NULL THEN NULL ELSE jsonb_build_object('id',sp.id,'code',sp.code,'name',sp.name,'productType',sp.product_type,'technology',sp.technology,'scope',sp.scope,'managerApprovalRequired',sp.manager_approval_required,'timelineImpact',sp.timeline_impact,'updatedAt',sp.updated_at) END,
    'requester',jsonb_build_object('id',req.id,'name',COALESCE(req.full_name,req.email,'Seller')),
    'assignedReviewer',CASE WHEN rev.id IS NULL THEN NULL ELSE jsonb_build_object('id',rev.id,'name',COALESCE(rev.full_name,rev.email),'role',rev.role,'department',rev.department) END
  ) INTO v_result
  FROM public.crm_leads l
  LEFT JOIN public.crm_opportunities o ON o.id=v.opportunity_id
  LEFT JOIN public.crm_requirements r ON r.id=v.requirement_id
  LEFT JOIN public.sales_products sp ON sp.id=v.product_id
  LEFT JOIN public.user_profiles req ON req.id=v.requested_by
  LEFT JOIN public.user_profiles rev ON rev.id=v.assigned_reviewer_id
  WHERE l.id=v.lead_id;
  RETURN v_result;
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
    PERFORM public.crm_write_lead_event(v.lead_id,'sales_validation_stale','Sales validation became stale',v.validation_type||' decision is stale because its source Requirement materially changed.',jsonb_build_object('validationId',v.id,'validationType',v.validation_type,'severity',v.severity,'status','STALE','requirementId',NEW.id),NULL,NULL,NULL,now(),'sales-validation:'||v.id::text||':stale');
    PERFORM public.crm_sales_validation_notify_seller(v.id,v.requested_by,'stale','Sales validation is stale','The source Requirement changed after specialist decision. The previous decision remains historical and a fresh review is required before relying on it.');
  END LOOP;

  UPDATE public.crm_sales_validations
  SET source_changed_at=now()
  WHERE requirement_id=NEW.id AND status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION');

  FOR v IN
    SELECT id,assigned_reviewer_id
    FROM public.crm_sales_validations
    WHERE requirement_id=NEW.id AND status='IN_REVIEW' AND assigned_reviewer_id IS NOT NULL
  LOOP
    PERFORM public.enqueue_in_app_notification(v.assigned_reviewer_id,'Sales Validation','Sales validation source changed','A Requirement changed during review. Refresh the current source before deciding.','/admin?tab=sales_validations','sales-validation:'||v.id::text||':source-changed:'||NEW.updated_at::text||':'||v.assigned_reviewer_id::text);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_requirement_sales_validation_stale
AFTER UPDATE ON public.crm_requirements
FOR EACH ROW EXECUTE FUNCTION public.crm_sales_validation_requirement_changed();

ALTER TABLE public.crm_sales_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_sales_validations_select_authorized
ON public.crm_sales_validations
FOR SELECT TO authenticated
USING (
  public.crm_can_access_lead(lead_id)
  OR public.is_admin()
  OR assigned_reviewer_id=auth.uid()
  OR public.crm_sales_validation_reviewer_eligible(validation_type,reviewer_team,auth.uid())
);

REVOKE ALL ON TABLE public.crm_sales_validations FROM PUBLIC;
REVOKE ALL ON TABLE public.crm_sales_validations FROM anon;
REVOKE ALL ON TABLE public.crm_sales_validations FROM authenticated;
GRANT SELECT ON TABLE public.crm_sales_validations TO authenticated;

REVOKE ALL ON FUNCTION public.crm_sales_validation_policy_entry(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_reviewer_eligible(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_sales_validation_reviewer_eligible(text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_prevent_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_requirement_changed() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_get_sales_validation_workspace(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_get_sales_validation_workspace(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_get_sales_validation_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_get_sales_validation_queue() TO authenticated;
REVOKE ALL ON FUNCTION public.crm_get_sales_validation_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_get_sales_validation_detail(uuid) TO authenticated;

COMMENT ON FUNCTION public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) IS
  'Part 7 trusted request action. Verifies Lead/source lineage, derives severity/team from policy, prevents duplicate active review, stamps requester server-side and writes canonical audit/notifications.';
COMMENT ON FUNCTION public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text) IS
  'Part 7 server-authoritative review lifecycle action for Start, Needs Information, Resubmit, Approve, Reject and Cancel. No quotation/Pipeline/payment/handoff side effects.';
COMMENT ON FUNCTION public.crm_get_sales_validation_queue() IS
  'Least-privilege Part 7 reviewer queue; returns only validations the current active reviewer is policy-eligible to review.';
