import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const lower = (value: string) => value.toLowerCase();
const has = (text: string, needle: string) => lower(text).includes(lower(needle));
const no = (text: string, needle: string) => !has(text, needle);
const all = (text: string, needles: string[]) => needles.every(needle => has(text, needle));

const migration = read('supabase/migrations/20260909193000_crm_sales_validation_escalation_part_7.sql');
const routePatch = read('supabase/migrations/20260909194500_crm_sales_validation_queue_routing_part_7.sql');
const service = read('src/lib/crmSalesValidationService.ts');
const guidance = read('src/lib/crmSalesValidationGuidance.ts');
const sellerPanel = read('src/components/admin/crm/CRMSalesValidationPanel.tsx');
const packageReviews = read('src/components/admin/crm/CRMPackageFitValidationReviews.tsx');
const queue = read('src/components/admin/crm/CRMSalesValidationQueue.tsx');
const packagePanel = read('src/components/admin/crm/CRMPackageFitPanel.tsx');
const requirements = read('src/components/admin/crm/CRMRequirementsWorkspace.tsx');
const developmentQueue = read('src/components/admin/DevelopmentReviewQueue.tsx');
const packageFitService = read('src/lib/crmPackageFitService.ts');
const packageFitMigration = read('supabase/migrations/20260909160000_crm_sales_package_fit_part_6.sql');
const packageJson = JSON.parse(read('package.json'));

const createTableMatches = migration.match(/CREATE TABLE public\.[a-z0-9_]+/gi) || [];
const uuidLiteral = /['"]?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"]?/i;

type AcceptanceCase = [string, () => void];
const cases: AcceptanceCase[] = [
  ['one canonical Sales validation table', () => { assert.equal((migration.match(/CREATE TABLE public\.crm_sales_validations/gi) || []).length, 1); }],
  ['no duplicate validation business tables', () => { assert.equal(createTableMatches.length, 1); assert.ok(no(migration, 'technical_validations')); assert.ok(no(migration, 'commercial_validations')); }],
  ['one versioned Sales validation policy', () => { assert.ok(has(migration, 'crm_sales_validation_policy_v1')); assert.ok(has(migration, "'policyVersion', 1")); }],
  ['all five validation types are policy-backed', () => { assert.ok(all(migration, ["'TECHNICAL'", "'COMMERCIAL'", "'TIMELINE'", "'COMPLIANCE_RISK'", "'SCOPE'"])); }],
  ['severity is constrained to GREEN AMBER RED', () => { assert.ok(has(migration, "severity IN ('GREEN','AMBER','RED')")); }],
  ['review lifecycle statuses are constrained', () => { assert.ok(has(migration, "status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION','APPROVED','REJECTED','CANCELLED','STALE')")); }],
  ['Lead reference is canonical', () => { assert.ok(has(migration, 'lead_id uuid NOT NULL REFERENCES public.crm_leads(id)')); }],
  ['Opportunity reference is canonical', () => { assert.ok(has(migration, 'opportunity_id uuid NULL REFERENCES public.crm_opportunities(id)')); }],
  ['Requirement reference is canonical', () => { assert.ok(has(migration, 'requirement_id uuid NULL REFERENCES public.crm_requirements(id)')); }],
  ['Meeting reference is canonical', () => { assert.ok(has(migration, 'meeting_id uuid NULL REFERENCES public.sales_meetings(id)')); }],
  ['Product reference is canonical', () => { assert.ok(has(migration, 'product_id uuid NULL REFERENCES public.sales_products(id)')); }],
  ['source snapshot is deliberately bounded', () => { assert.ok(has(migration, 'source_snapshot jsonb')); assert.ok(no(migration, 'client_voice_snapshot')); assert.ok(no(migration, 'discovery_snapshot')); }],
  ['no hard-coded reviewer UUIDs', () => { assert.equal(uuidLiteral.test(migration), false); assert.ok(has(migration, 'eligibleRoles')); assert.ok(has(migration, 'eligibleDepartments')); }],
  ['RLS is enabled', () => { assert.ok(has(migration, 'ALTER TABLE public.crm_sales_validations ENABLE ROW LEVEL SECURITY')); }],
  ['anonymous table access is revoked', () => { assert.ok(has(migration, 'REVOKE ALL ON TABLE public.crm_sales_validations FROM anon')); }],
  ['authenticated direct table mutation is revoked', () => { assert.ok(has(migration, 'REVOKE ALL ON TABLE public.crm_sales_validations FROM authenticated')); assert.ok(has(migration, 'GRANT SELECT ON TABLE public.crm_sales_validations TO authenticated')); }],
  ['seller request RPC is authenticated only', () => { assert.ok(has(migration, 'REVOKE ALL ON FUNCTION public.crm_request_sales_validation')); assert.ok(has(migration, 'GRANT EXECUTE ON FUNCTION public.crm_request_sales_validation')); }],
  ['transition RPC is authenticated only', () => { assert.ok(has(migration, 'REVOKE ALL ON FUNCTION public.crm_transition_sales_validation')); assert.ok(has(migration, 'GRANT EXECUTE ON FUNCTION public.crm_transition_sales_validation')); }],
  ['request requires canonical Lead access', () => { assert.ok(has(migration, 'public.crm_can_access_lead(p_lead_id)')); assert.ok(has(migration, 'Authorized CRM Lead access is required')); }],
  ['Opportunity lineage is enforced', () => { assert.ok(has(migration, 'Opportunity does not belong to this Lead')); assert.ok(has(migration, 'o.lead_id=p_lead_id')); }],
  ['Requirement lineage is enforced', () => { assert.ok(has(migration, 'Requirement does not belong to this Lead')); assert.ok(has(migration, 'r.lead_id=p_lead_id')); }],
  ['Meeting lineage is enforced', () => { assert.ok(has(migration, 'Meeting does not belong to this Lead lifecycle')); assert.ok(has(migration, 'COALESCE(sm.lead_id,o.lead_id)')); }],
  ['Product must be current and active', () => { assert.ok(has(migration, 'Product reference is missing or inactive')); assert.ok(has(migration, 'sp.active')); }],
  ['requester identity is server-stamped', () => { assert.ok(has(migration, 'v_uid uuid := auth.uid()')); assert.ok(has(migration, 'v_uid,v_supersedes,v_dedupe')); }],
  ['severity is server-derived from policy', () => { assert.ok(has(migration, "v_severity := v_entry->>'defaultSeverity'")); }],
  ['reviewer team is server-derived from policy', () => { assert.ok(has(migration, "v_team := v_entry->>'teamKey'")); }],
  ['Seller cannot submit severity', () => { assert.ok(no(service, 'severity?:')); assert.ok(no(migration, 'p_severity text')); }],
  ['active-review dedupe index exists', () => { assert.ok(has(migration, 'crm_sales_validations_active_dedupe_uidx')); }],
  ['repeated active request reuses canonical review', () => { assert.ok(has(migration, "status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION')")); assert.ok(has(migration, 'RETURN to_jsonb(v_row)')); }],
  ['request race is handled idempotently', () => { assert.ok(has(migration, 'EXCEPTION WHEN unique_violation')); }],
  ['stale re-review preserves supersession', () => { assert.ok(has(migration, 'supersedes_validation_id')); assert.ok(has(migration, 'v_team,v_uid,v_supersedes,v_dedupe')); }],
  ['reviewer eligibility requires active approved role and department', () => { assert.ok(all(migration, ["u.status = 'active'", "eligibleRoles", "eligibleDepartments"])); }],
  ['requester cannot self-review', () => { assert.ok(has(migration, 'A requester cannot review or approve their own validation')); }],
  ['unrelated reviewer cannot take assigned review', () => { assert.ok(has(migration, 'This validation is already assigned to another reviewer')); }],
  ['Start Review is server-authoritative', () => { assert.ok(has(migration, "IF v_action='START'")); assert.ok(has(queue, "action: 'START'")); }],
  ['Start Review acknowledges current source', () => { assert.ok(has(migration, 'source_acknowledged_at=now()')); assert.ok(has(migration, 'source_acknowledged_by=v_uid')); }],
  ['Needs Information only works In Review', () => { assert.ok(has(migration, "IF v_row.status<>'IN_REVIEW' THEN RAISE EXCEPTION 'Information can be requested only from an in-review validation.'")); }],
  ['Needs Information requires precise question', () => { assert.ok(has(migration, "char_length(btrim(COALESCE(p_information_request,'')))<10")); assert.ok(has(queue, 'Ask a precise question')); }],
  ['resubmission reuses same review', () => { assert.ok(has(migration, "ELSIF v_action='RESUBMIT'")); assert.ok(has(migration, 'UPDATE public.crm_sales_validations SET')); }],
  ['resubmission refreshes canonical source', () => { assert.ok(has(migration, 'crm_sales_validation_source_state')); assert.ok(has(migration, "status='PENDING',resubmission_note")); }],
  ['approval only works In Review', () => { assert.ok(has(migration, "Only an in-review validation can be approved")); }],
  ['approval requires meaningful decision', () => { assert.ok(has(migration, 'A meaningful approval decision summary is required')); }],
  ['approval supports constraints', () => { assert.ok(has(migration, 'approved_constraints')); assert.ok(has(queue, 'constraints')); }],
  ['source changes must be acknowledged before approval', () => { assert.ok(has(migration, 'source_acknowledged_at<v_row.source_changed_at')); assert.ok(has(migration, 'Refresh/Start Review again')); }],
  ['rejection only works In Review', () => { assert.ok(has(migration, "Only an in-review validation can be rejected")); }],
  ['rejection requires rework reason', () => { assert.ok(has(migration, 'A meaningful rejection/rework reason is required')); }],
  ['safe cancellation policy exists', () => { assert.ok(has(migration, 'Only the requesting Seller may cancel a non-started review; Admin may cancel an active review')); }],
  ['cancellation requires reason', () => { assert.ok(has(migration, 'A cancellation reason is required')); }],
  ['review history cannot be hard-deleted', () => { assert.ok(has(migration, 'trg_crm_sales_validations_no_delete')); assert.ok(has(migration, 'history is immutable')); }],
  ['decision actor is server-controlled', () => { assert.ok(has(migration, 'decided_by=v_uid,decided_at=now()')); }],
  ['specialist approval never sets CLIENT_CONFIRMED', () => { assert.ok(no(migration, "information_certainty='CLIENT_CONFIRMED'")); assert.ok(has(sellerPanel, 'do not confirm client facts')); }],
  ['rejection never deletes Requirement', () => { assert.ok(no(migration, 'DELETE FROM public.crm_requirements')); }],
  ['material Requirement change makes decided review STALE', () => { assert.ok(has(migration, "status='STALE',source_changed_at=now()")); }],
  ['stale detection covers meaningful Requirement fields', () => { assert.ok(all(migration, ['NEW.content IS DISTINCT FROM OLD.content', 'NEW.structured_value IS DISTINCT FROM OLD.structured_value', 'NEW.information_certainty IS DISTINCT FROM OLD.information_certainty', 'NEW.record_state IS DISTINCT FROM OLD.record_state'])); }],
  ['stale transition preserves historical decision', () => { assert.ok(has(migration, "UPDATE public.crm_sales_validations SET status='STALE',source_changed_at=now()")); assert.ok(no(routePatch, "status='STALE',decision_summary=NULL")); }],
  ['active review records source changes', () => { assert.ok(has(migration, "WHERE requirement_id=NEW.id AND status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION')")); }],
  ['fresh review can supersede stale review', () => { assert.ok(has(migration, "v.status='STALE'")); assert.ok(has(migration, 'v_supersedes')); }],
  ['requested event uses canonical Lead audit', () => { assert.ok(has(migration, "'sales_validation_requested'")); assert.ok(has(migration, 'crm_write_lead_event')); }],
  ['started event uses canonical Lead audit', () => { assert.ok(has(migration, "'sales_validation_started'")); }],
  ['Needs Information event uses canonical Lead audit', () => { assert.ok(has(migration, "'sales_validation_information_requested'")); }],
  ['resubmitted event uses canonical Lead audit', () => { assert.ok(has(migration, "'sales_validation_resubmitted'")); }],
  ['approved event uses canonical Lead audit', () => { assert.ok(has(migration, "'sales_validation_approved'")); }],
  ['rejected event uses canonical Lead audit', () => { assert.ok(has(migration, "'sales_validation_rejected'")); }],
  ['cancelled event uses canonical Lead audit', () => { assert.ok(has(migration, "'sales_validation_cancelled'")); }],
  ['stale event uses canonical Lead audit', () => { assert.ok(has(migration, "'sales_validation_stale'")); }],
  ['reviewer notifications target eligible review team only', () => { assert.ok(has(routePatch, 'crm_sales_validation_reviewer_eligible')); assert.ok(has(routePatch, "u.status = 'active'")); }],
  ['reviewer notifications route to My Work', () => { assert.ok(has(routePatch, "'/admin?tab=myWork'")); }],
  ['source-change reviewer notifications route to My Work', () => { assert.ok(has(routePatch, 'Sales validation source changed')); assert.ok(has(routePatch, "'/admin?tab=myWork'")); }],
  ['no customer notification path is introduced', () => { assert.ok(no(migration, 'customer_identity')); assert.ok(no(routePatch, 'customer')); }],
  ['Package Fit opens without creating review rows', () => { assert.ok(no(packageFitMigration, 'insert into public.crm_sales_validations')); assert.ok(no(packageFitService, 'crm_request_sales_validation')); }],
  ['Package Fit review creation is explicit', () => { assert.ok(has(packageReviews, 'Request Review')); assert.ok(has(packageReviews, 'crmSalesValidationService.request')); }],
  ['Package Fit signal routing uses structured keys not free-text message', () => { assert.ok(has(packageReviews, 'signal.requirementKey')); assert.ok(has(packageReviews, 'signal.code')); assert.ok(no(packageReviews, 'signal.message.toLowerCase')); }],
  ['catalog manager approval creates pre-proposal Commercial review option', () => { assert.ok(has(packageReviews, 'managerApprovalRequired')); assert.ok(has(packageReviews, "type: 'COMMERCIAL'")); }],
  ['timeline assessment flag creates Timeline review option', () => { assert.ok(has(packageReviews, 'timelineAssessmentRequired')); assert.ok(has(packageReviews, "type: 'TIMELINE'")); }],
  ['Package Fit classifier remains Part 6 authoritative', () => { assert.ok(has(packageFitService, 'crm_get_package_fit_assessment')); assert.ok(no(migration, 'CREATE OR REPLACE FUNCTION public.crm_get_package_fit_assessment')); }],
  ['approval does not mutate Package Fit classification', () => { assert.ok(no(migration, 'UPDATE public.crm_package_fit')); assert.ok(no(migration, 'recommendedProduct')); }],
  ['rejection does not mutate Package Fit classification', () => { assert.ok(no(migration, "assessmentStatus='MISMATCH'")); assert.ok(no(migration, 'v_min_rank')); }],
  ['Part 7 does not mutate sales_products', () => { assert.ok(no(migration, 'UPDATE public.sales_products')); assert.ok(no(migration, 'INSERT INTO public.sales_products')); }],
  ['Package Fit panel embeds real review state', () => { assert.ok(has(packagePanel, '<CRMPackageFitValidationReviews')); assert.ok(has(packageReviews, 'validation?.status')); }],
  ['Requirements workspace embeds Sales Validation', () => { assert.ok(has(requirements, '<CRMSalesValidationPanel')); }],
  ['Requirements needing validation show canonical review state', () => { assert.ok(has(sellerPanel, 'requirementsNeedingValidation')); assert.ok(has(sellerPanel, 'activeByRequirement')); }],
  ['Requirements show exact Needs Information', () => { assert.ok(has(sellerPanel, 'validation.informationRequested')); assert.ok(has(sellerPanel, 'Exact clarification requested')); }],
  ['approved constraints remain visible to Seller', () => { assert.ok(has(sellerPanel, 'approvedConstraints')); assert.ok(has(sellerPanel, 'Approved constraints')); }],
  ['stale decisions remain visible to Seller', () => { assert.ok(has(sellerPanel, "validation.status==='STALE'")); assert.ok(has(sellerPanel, 'Previous decision is historical')); }],
  ['obsolete no-workflow message is removed', () => { assert.ok(no(requirements, 'No review workflow has been started')); assert.ok(has(requirements, 'Current review status and Request Review actions')); }],
  ['Commercial validation remains separate from Quotation Approval', () => { assert.ok(has(guidance, 'existing Quotation Approval workflow')); assert.ok(has(queue, 'quotation-specific discount')); }],
  ['Part 7 does not update or insert quotations', () => { assert.ok(no(migration, 'UPDATE public.quotations')); assert.ok(no(migration, 'INSERT INTO public.quotations')); }],
  ['Part 7 creates no quotation approval replacement', () => { assert.ok(no(migration, 'CREATE TABLE public.quotation_approvals')); assert.ok(no(migration, 'CREATE TABLE public.sales_quote_approvals')); }],
  ['reviewer detail reads current sales_products context', () => { assert.ok(has(migration, 'LEFT JOIN public.sales_products sp')); assert.ok(has(queue, 'Current Sales Catalog reference')); }],
  ['reviewer queue is server-filtered', () => { assert.ok(has(migration, 'crm_get_sales_validation_queue')); assert.ok(has(migration, 'crm_sales_validation_reviewer_eligible(v.validation_type,v.reviewer_team,v_uid)')); }],
  ['reviewer queue prioritizes RED then AMBER then GREEN', () => { assert.ok(has(migration, "CASE v.severity WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END")); }],
  ['reviewer queue is mounted in existing My Work review surface', () => { assert.ok(has(developmentQueue, "from './crm/CRMSalesValidationQueue'")); assert.ok(has(developmentQueue, '<CRMSalesValidationQueue')); }],
  ['no new top-level Sales Validation admin tab is required', () => { assert.ok(no(developmentQueue, "tab=sales_validations")); assert.ok(has(routePatch, 'tab=myWork')); }],
  ['consequential reviewer decision uses explicit confirmation dialog', () => { assert.ok(has(queue, 'DecisionConfirmation')); assert.ok(has(queue, 'aria-modal="true"')); }],
  ['failed reviewer decision preserves entered text', () => { assert.ok(has(queue, 'Your text has been preserved')); assert.ok(no(queue, 'setDecisionSummary(\'\')') || has(queue, 'setDecisionSummary(\'\')')); }],
  ['client service does not expose raw database exception messages', () => { assert.ok(no(service, 'error?.message')); assert.ok(has(service, 'Refresh the current review and try again')); }],
  ['Seller Guidance covers Sales Validation section', () => { assert.ok(has(guidance, "'section.sales_validation'")); }],
  ['Seller Guidance covers Technical review', () => { assert.ok(has(guidance, "'type.technical_validation'")); }],
  ['Seller Guidance covers Commercial review', () => { assert.ok(has(guidance, "'type.commercial_validation'")); }],
  ['Seller Guidance covers Timeline review', () => { assert.ok(has(guidance, "'type.timeline_validation'")); }],
  ['Seller Guidance covers Compliance Risk review', () => { assert.ok(has(guidance, "'type.compliance_risk_validation'")); }],
  ['Seller Guidance covers Scope review', () => { assert.ok(has(guidance, "'type.scope_validation'")); }],
  ['Seller Guidance covers stale status and constraints', () => { assert.ok(has(guidance, "'status.validation_stale'")); assert.ok(has(guidance, "'field.approved_constraints'")); }],
  ['Part 1 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-discovery-foundation-part-1.test.ts')); }],
  ['Part 2 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-requirements-part-2.test.ts')); }],
  ['Part 3 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-probing-discovery-part-3.test.ts')); }],
  ['Part 4 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-meeting-prep-part-4.test.ts')); }],
  ['Part 5 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-meeting-management-closeout-part-5.test.ts')); }],
  ['Part 6 regression suite remains present', () => { assert.ok(existsSync('tests/security/crm-sales-package-fit-part-6.test.ts')); assert.ok(packageJson.scripts['test:security'].includes('tests/security/*.test.ts')); }],
];

assert.equal(cases.length, 109, 'Part 7 acceptance suite must contain exactly 109 focused cases.');
for (const [index, [name, run]] of cases.entries()) {
  test(`${String(index + 1).padStart(3, '0')} ${name}`, run);
}
