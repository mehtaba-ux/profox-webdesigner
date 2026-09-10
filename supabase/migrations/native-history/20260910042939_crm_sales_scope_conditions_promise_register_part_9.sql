-- CRM Sales SOP Part 9 — Scope Conditions + Promise Register
-- Canonical pre-quotation registers only. No quotation, payment, Won, or handoff mutation.

DO $$
BEGIN
  IF to_regclass('public.crm_sales_scope_conditions') IS NOT NULL THEN
    RAISE EXCEPTION 'Part 9 collision: crm_sales_scope_conditions already exists.';
  END IF;
  IF to_regclass('public.crm_sales_promises') IS NOT NULL THEN
    RAISE EXCEPTION 'Part 9 collision: crm_sales_promises already exists.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.system_configuration WHERE config_key='crm_sales_scope_promise_policy_v1') THEN
    RAISE EXCEPTION 'Part 9 collision: crm_sales_scope_promise_policy_v1 already exists.';
  END IF;
END
$$;

INSERT INTO public.system_configuration(config_key,config_value,description)
VALUES (
  'crm_sales_scope_promise_policy_v1',
  jsonb_build_object(
    'policyKey','crm_sales_scope_promise_policy_v1',
    'policyVersion',1,
    'conditionTypes',jsonb_build_array('ASSUMPTION','EXCLUSION','DEPENDENCY','CLIENT_RESPONSIBILITY','SCOPE_BOUNDARY'),
    'conditionStates',jsonb_build_array('DRAFT','ACTIVE','STALE','RESOLVED','SUPERSEDED','WITHDRAWN'),
    'promiseTypes',jsonb_build_array('SCOPE','TECHNICAL','TIMELINE','COMMERCIAL','SUPPORT','COMPLIANCE','PERFORMANCE_RESULT','OTHER'),
    'promiseStates',jsonb_build_array('DRAFT','ACTIVE','SUPERSEDED','WITHDRAWN'),
    'conditionSourceTypes',jsonb_build_array('MANUAL','REQUIREMENT','VALIDATION','MEETING'),
    'promiseSourceTypes',jsonb_build_array('INTERNAL_DRAFT','MANUAL_CLIENT_COMMUNICATION','MEETING','REQUIREMENT','VALIDATION'),
    'validationAlignmentStates',jsonb_build_array('NOT_REQUIRED','PENDING','WITHIN_CONSTRAINTS','CONFLICT'),
    'reconciliationRequirementKeys',jsonb_build_array('assumptions','exclusions','client_dependencies'),
    'promiseValidationMap',jsonb_build_object(
      'SCOPE','SCOPE',
      'TECHNICAL','TECHNICAL',
      'TIMELINE','TIMELINE',
      'COMMERCIAL','COMMERCIAL',
      'SUPPORT','SCOPE',
      'COMPLIANCE','COMPLIANCE_RISK',
      'PERFORMANCE_RESULT','COMPLIANCE_RISK',
      'OTHER','SCOPE'
    ),
    'quotationBoundary',jsonb_build_object(
      'writesQuotation',false,
      'finalQuotationSendGateActive',false,
      'futureQuoteCoverage',jsonb_build_array('PROMISE_COVERAGE','FINAL_SCOPE_RECONCILIATION','QUOTATION_SNAPSHOT_COVERAGE')
    )
  ),
  'Part 9 Scope Conditions / Promise policy. Contains lifecycle, source, reconciliation and validation rules only; no price, package scope, payment schedule or delivery-duration truth.'
);

CREATE TABLE public.crm_sales_scope_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE RESTRICT,
  opportunity_id uuid NULL REFERENCES public.crm_opportunities(id) ON DELETE RESTRICT,
  condition_type text NOT NULL CHECK (condition_type IN ('ASSUMPTION','EXCLUSION','DEPENDENCY','CLIENT_RESPONSIBILITY','SCOPE_BOUNDARY')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 240),
  condition_text text NOT NULL CHECK (char_length(btrim(condition_text)) BETWEEN 6 AND 6000),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','ACTIVE','STALE','RESOLVED','SUPERSEDED','WITHDRAWN')),
  source_requirement_id uuid NULL REFERENCES public.crm_requirements(id) ON DELETE RESTRICT,
  source_validation_id uuid NULL REFERENCES public.crm_sales_validations(id) ON DELETE RESTRICT,
  source_meeting_id uuid NULL REFERENCES public.sales_meetings(id) ON DELETE RESTRICT,
  source_type text NOT NULL DEFAULT 'MANUAL' CHECK (source_type IN ('MANUAL','REQUIREMENT','VALIDATION','MEETING')),
  source_record_id text NULL CHECK (source_record_id IS NULL OR char_length(source_record_id) <= 240),
  source_summary text NULL CHECK (source_summary IS NULL OR char_length(source_summary) <= 2000),
  validation_alignment_status text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (validation_alignment_status IN ('NOT_REQUIRED','PENDING','WITHIN_CONSTRAINTS','CONFLICT')),
  created_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  activated_at timestamptz NULL,
  supersedes_condition_id uuid NULL REFERENCES public.crm_sales_scope_conditions(id) ON DELETE RESTRICT,
  resolved_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz NULL,
  resolution_note text NULL CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000),
  withdrawn_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  withdrawn_at timestamptz NULL,
  withdrawal_reason text NULL CHECK (withdrawal_reason IS NULL OR char_length(withdrawal_reason) <= 2000),
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) <= 128),
  CONSTRAINT crm_sales_scope_condition_activation_integrity CHECK (state <> 'ACTIVE' OR (activated_by IS NOT NULL AND activated_at IS NOT NULL)),
  CONSTRAINT crm_sales_scope_condition_resolution_integrity CHECK (state <> 'RESOLVED' OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CONSTRAINT crm_sales_scope_condition_withdrawal_integrity CHECK (state <> 'WITHDRAWN' OR (withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND nullif(btrim(withdrawal_reason),'') IS NOT NULL))
);

COMMENT ON TABLE public.crm_sales_scope_conditions IS
  'Canonical Part 9 pre-quotation Scope Conditions register. Reconciles material assumptions, exclusions, dependencies, client responsibilities and scope boundaries without replacing crm_requirements or quotation snapshots.';

CREATE TABLE public.crm_sales_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE RESTRICT,
  opportunity_id uuid NULL REFERENCES public.crm_opportunities(id) ON DELETE RESTRICT,
  promise_type text NOT NULL CHECK (promise_type IN ('SCOPE','TECHNICAL','TIMELINE','COMMERCIAL','SUPPORT','COMPLIANCE','PERFORMANCE_RESULT','OTHER')),
  promise_text text NOT NULL CHECK (char_length(btrim(promise_text)) BETWEEN 6 AND 6000),
  internal_context text NULL CHECK (internal_context IS NULL OR char_length(internal_context) <= 3000),
  record_state text NOT NULL DEFAULT 'DRAFT' CHECK (record_state IN ('DRAFT','ACTIVE','SUPERSEDED','WITHDRAWN')),
  source_type text NOT NULL DEFAULT 'INTERNAL_DRAFT' CHECK (source_type IN ('INTERNAL_DRAFT','MANUAL_CLIENT_COMMUNICATION','MEETING','REQUIREMENT','VALIDATION')),
  source_record_id text NULL CHECK (source_record_id IS NULL OR char_length(source_record_id) <= 240),
  source_meeting_id uuid NULL REFERENCES public.sales_meetings(id) ON DELETE RESTRICT,
  source_summary text NULL CHECK (source_summary IS NULL OR char_length(source_summary) <= 2000),
  linked_requirement_id uuid NULL REFERENCES public.crm_requirements(id) ON DELETE RESTRICT,
  linked_validation_id uuid NULL REFERENCES public.crm_sales_validations(id) ON DELETE RESTRICT,
  validation_alignment_status text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (validation_alignment_status IN ('NOT_REQUIRED','PENDING','WITHIN_CONSTRAINTS','CONFLICT')),
  promised_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  promised_at timestamptz NULL,
  recorded_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  supersedes_promise_id uuid NULL REFERENCES public.crm_sales_promises(id) ON DELETE RESTRICT,
  withdrawn_at timestamptz NULL,
  withdrawn_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  withdrawal_reason text NULL CHECK (withdrawal_reason IS NULL OR char_length(withdrawal_reason) <= 2000),
  policy_key text NOT NULL DEFAULT 'crm_sales_scope_promise_policy_v1',
  policy_version integer NOT NULL DEFAULT 1,
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) <= 128),
  CONSTRAINT crm_sales_promise_active_integrity CHECK (record_state <> 'ACTIVE' OR (promised_by IS NOT NULL AND promised_at IS NOT NULL)),
  CONSTRAINT crm_sales_promise_withdrawal_integrity CHECK (record_state <> 'WITHDRAWN' OR (withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND nullif(btrim(withdrawal_reason),'') IS NOT NULL))
);

COMMENT ON TABLE public.crm_sales_promises IS
  'Canonical Part 9 internal Promise Register for material commitments ProFox actually communicated to a client. A client request, Seller hypothesis, Package Fit recommendation or internal draft is not automatically an ACTIVE Promise.';

ALTER TABLE public.crm_requirements
  ADD COLUMN proposal_reconciliation_status text NULL CHECK (proposal_reconciliation_status IN ('RECONCILED','NOT_MATERIAL')),
  ADD COLUMN proposal_scope_condition_id uuid NULL REFERENCES public.crm_sales_scope_conditions(id) ON DELETE SET NULL,
  ADD COLUMN proposal_reconciliation_note text NULL CHECK (proposal_reconciliation_note IS NULL OR char_length(proposal_reconciliation_note) <= 2000),
  ADD COLUMN proposal_reconciled_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN proposal_reconciled_at timestamptz NULL;

CREATE UNIQUE INDEX crm_sales_scope_conditions_current_dedupe_uidx
  ON public.crm_sales_scope_conditions(lead_id,dedupe_key)
  WHERE state IN ('DRAFT','ACTIVE','STALE');
CREATE INDEX crm_sales_scope_conditions_lead_state_idx
  ON public.crm_sales_scope_conditions(lead_id,state,updated_at DESC);
CREATE INDEX crm_sales_scope_conditions_opportunity_idx
  ON public.crm_sales_scope_conditions(opportunity_id,state) WHERE opportunity_id IS NOT NULL;
CREATE INDEX crm_sales_scope_conditions_type_idx
  ON public.crm_sales_scope_conditions(lead_id,condition_type,state);
CREATE INDEX crm_sales_scope_conditions_requirement_idx
  ON public.crm_sales_scope_conditions(source_requirement_id,state) WHERE source_requirement_id IS NOT NULL;
CREATE INDEX crm_sales_scope_conditions_validation_idx
  ON public.crm_sales_scope_conditions(source_validation_id,state) WHERE source_validation_id IS NOT NULL;
CREATE INDEX crm_sales_scope_conditions_meeting_idx
  ON public.crm_sales_scope_conditions(source_meeting_id) WHERE source_meeting_id IS NOT NULL;
CREATE INDEX crm_sales_scope_conditions_supersedes_idx
  ON public.crm_sales_scope_conditions(supersedes_condition_id) WHERE supersedes_condition_id IS NOT NULL;

CREATE UNIQUE INDEX crm_sales_promises_current_dedupe_uidx
  ON public.crm_sales_promises(lead_id,dedupe_key)
  WHERE record_state IN ('DRAFT','ACTIVE');
CREATE INDEX crm_sales_promises_lead_state_idx
  ON public.crm_sales_promises(lead_id,record_state,promised_at DESC NULLS LAST,updated_at DESC);
CREATE INDEX crm_sales_promises_opportunity_idx
  ON public.crm_sales_promises(opportunity_id,record_state) WHERE opportunity_id IS NOT NULL;
CREATE INDEX crm_sales_promises_type_idx
  ON public.crm_sales_promises(lead_id,promise_type,record_state);
CREATE INDEX crm_sales_promises_requirement_idx
  ON public.crm_sales_promises(linked_requirement_id,record_state) WHERE linked_requirement_id IS NOT NULL;
CREATE INDEX crm_sales_promises_validation_idx
  ON public.crm_sales_promises(linked_validation_id,record_state) WHERE linked_validation_id IS NOT NULL;
CREATE INDEX crm_sales_promises_meeting_idx
  ON public.crm_sales_promises(source_meeting_id) WHERE source_meeting_id IS NOT NULL;
CREATE INDEX crm_sales_promises_supersedes_idx
  ON public.crm_sales_promises(supersedes_promise_id) WHERE supersedes_promise_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_sales_scope_commitment_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_sales_scope_conditions_touch_updated_at
BEFORE UPDATE ON public.crm_sales_scope_conditions
FOR EACH ROW EXECUTE FUNCTION public.crm_sales_scope_commitment_touch_updated_at();
CREATE TRIGGER trg_crm_sales_promises_touch_updated_at
BEFORE UPDATE ON public.crm_sales_promises
FOR EACH ROW EXECUTE FUNCTION public.crm_sales_scope_commitment_touch_updated_at();

CREATE OR REPLACE FUNCTION public.crm_sales_scope_commitment_prevent_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'Scope Condition and Promise history is immutable; use lifecycle transitions instead of DELETE.';
END;
$$;

CREATE TRIGGER trg_crm_sales_scope_conditions_no_delete
BEFORE DELETE ON public.crm_sales_scope_conditions
FOR EACH ROW EXECUTE FUNCTION public.crm_sales_scope_commitment_prevent_delete();
CREATE TRIGGER trg_crm_sales_promises_no_delete
BEFORE DELETE ON public.crm_sales_promises
FOR EACH ROW EXECUTE FUNCTION public.crm_sales_scope_commitment_prevent_delete();

CREATE OR REPLACE FUNCTION public.crm_sales_scope_commitment_assert_context(
  p_lead_id uuid,
  p_opportunity_id uuid DEFAULT NULL,
  p_requirement_id uuid DEFAULT NULL,
  p_validation_id uuid DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  IF p_lead_id IS NULL OR NOT public.crm_can_access_lead(p_lead_id) THEN
    RAISE EXCEPTION 'Authorized CRM Lead access is required.';
  END IF;
  IF p_opportunity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_opportunities o WHERE o.id=p_opportunity_id AND o.lead_id=p_lead_id AND o.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'Opportunity does not belong to this Lead.'; END IF;
  IF p_requirement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_requirements r WHERE r.id=p_requirement_id AND r.lead_id=p_lead_id
  ) THEN RAISE EXCEPTION 'Requirement does not belong to this Lead.'; END IF;
  IF p_validation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_sales_validations v WHERE v.id=p_validation_id AND v.lead_id=p_lead_id AND (v.opportunity_id IS NULL OR p_opportunity_id IS NULL OR v.opportunity_id=p_opportunity_id)
  ) THEN RAISE EXCEPTION 'Sales Validation does not belong to this Lead/Opportunity.'; END IF;
  IF p_meeting_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sales_meetings m
    LEFT JOIN public.crm_opportunities o ON o.id=m.opportunity_id
    WHERE m.id=p_meeting_id AND (m.lead_id=p_lead_id OR o.lead_id=p_lead_id)
  ) THEN RAISE EXCEPTION 'Meeting does not belong to this Lead.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_sales_scope_condition_requirement_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_changed integer := 0;
  v_event_key text;
BEGIN
  IF ROW(OLD.content,OLD.structured_value,OLD.information_certainty,OLD.record_state)
     IS NOT DISTINCT FROM ROW(NEW.content,NEW.structured_value,NEW.information_certainty,NEW.record_state) THEN
    RETURN NEW;
  END IF;

  UPDATE public.crm_sales_scope_conditions c
  SET state='STALE', updated_by=COALESCE(auth.uid(),c.updated_by), updated_at=now()
  WHERE c.lead_id=NEW.lead_id
    AND c.state='ACTIVE'
    AND (c.source_requirement_id=NEW.id OR c.id=OLD.proposal_scope_condition_id);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF OLD.proposal_reconciliation_status IS NOT NULL OR OLD.proposal_scope_condition_id IS NOT NULL THEN
    UPDATE public.crm_requirements
    SET proposal_reconciliation_status=NULL,
        proposal_scope_condition_id=NULL,
        proposal_reconciliation_note=NULL,
        proposal_reconciled_by=NULL,
        proposal_reconciled_at=NULL
    WHERE id=NEW.id;
  END IF;

  IF v_changed>0 OR OLD.proposal_reconciliation_status IS NOT NULL THEN
    v_event_key := 'scope-condition-source-changed:'||NEW.id::text||':'||md5(
      coalesce(NEW.content,'')||'|'||coalesce(NEW.structured_value::text,'')||'|'||coalesce(NEW.information_certainty,'')||'|'||coalesce(NEW.record_state,'')
    );
    PERFORM public.crm_write_lead_event(
      NEW.lead_id,'scope_condition_source_changed','Scope Condition source changed',
      'A Requirement used for proposal reconciliation changed. Linked active Scope Conditions were marked stale and reconciliation must be reviewed.',
      jsonb_build_object('requirementId',NEW.id,'staleConditionCount',v_changed),
      auth.uid(),NULL,NULL,now(),v_event_key
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_requirement_scope_condition_stale
AFTER UPDATE OF content,structured_value,information_certainty,record_state ON public.crm_requirements
FOR EACH ROW EXECUTE FUNCTION public.crm_sales_scope_condition_requirement_changed();

ALTER TABLE public.crm_sales_scope_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sales_promises ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.crm_sales_scope_conditions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_sales_promises FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crm_sales_scope_conditions TO authenticated;
GRANT SELECT ON TABLE public.crm_sales_promises TO authenticated;

CREATE POLICY crm_sales_scope_conditions_select_authorized
ON public.crm_sales_scope_conditions FOR SELECT TO authenticated
USING (public.crm_can_access_lead(lead_id));
CREATE POLICY crm_sales_promises_select_authorized
ON public.crm_sales_promises FOR SELECT TO authenticated
USING (public.crm_can_access_lead(lead_id));

REVOKE ALL ON FUNCTION public.crm_sales_scope_commitment_assert_context(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_scope_commitment_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_scope_commitment_prevent_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_scope_condition_requirement_changed() FROM PUBLIC, anon, authenticated;
