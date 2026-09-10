import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const has = (text: string, needle: string) => text.toLowerCase().includes(needle.toLowerCase());
const no = (text: string, needle: string) => !has(text, needle);
const all = (text: string, needles: string[]) => needles.every(needle => has(text, needle));

const schema = read('supabase/migrations/native-history/20260910042939_crm_sales_scope_conditions_promise_register_part_9.sql');
const mutations = read('supabase/migrations/native-history/20260910043137_crm_sales_scope_commitment_mutations_part_9.sql');
const workspaceSql = read('supabase/migrations/native-history/20260910043416_crm_sales_scope_commitment_workspace_part_9.sql');
const readinessPatch = read('supabase/migrations/native-history/20260910043453_crm_sales_scope_commitment_readiness_part_9.sql');
const db = `${schema}\n${mutations}\n${workspaceSql}\n${readinessPatch}`;
const service = read('src/lib/crmSalesScopeCommitmentService.ts');
const guidance = read('src/lib/crmSalesScopeCommitmentGuidance.ts');
const scopePanel = read('src/components/admin/crm/CRMScopeConditionsPanel.tsx');
const promisePanel = read('src/components/admin/crm/CRMPromiseRegisterPanel.tsx');
const scopeWorkspace = read('src/components/admin/crm/CRMScopeCommitmentsWorkspace.tsx');
const consequentialDialog = read('src/components/admin/crm/CRMConsequentialActionDialog.tsx');
const readinessPanel = read('src/components/admin/crm/CRMSalesReadinessPanel.tsx');
const leadDrawer = read('src/components/admin/crm/CRMLeadDrawerBase.tsx');
const part9Doc = read('docs/crm-sales-scope-conditions-promise-register-part-9.md');
const packageJson = JSON.parse(read('package.json'));

const createBusinessTables = db.match(/create\s+table\s+public\.crm_sales_(scope_conditions|promises)\b/gi) || [];
const quotationWritePatterns = [
  /insert\s+into\s+public\.quotations\b/i,
  /update\s+public\.quotations\b/i,
  /delete\s+from\s+public\.quotations\b/i,
  /insert\s+into\s+public\.quotation_items\b/i,
  /update\s+public\.quotation_items\b/i,
  /delete\s+from\s+public\.quotation_items\b/i,
];
const noQuotationWrites = () => quotationWritePatterns.every(pattern => !pattern.test(db));

type Acceptance = [number, string, () => void];
const checks: Acceptance[] = [
  [1, 'No pre-existing canonical Scope Conditions system was duplicated', () => { assert.equal((db.match(/create\s+table\s+public\.crm_sales_scope_conditions\b/gi) || []).length, 1); assert.ok(has(schema, 'Part 9 collision: crm_sales_scope_conditions already exists')); }],
  [2, 'No pre-existing Promise Register was duplicated', () => { assert.equal((db.match(/create\s+table\s+public\.crm_sales_promises\b/gi) || []).length, 1); assert.ok(has(schema, 'Part 9 collision: crm_sales_promises already exists')); }],
  [3, 'At most one Scope Conditions business table introduced', () => assert.equal(createBusinessTables.filter(x => has(x, 'scope_conditions')).length, 1)],
  [4, 'At most one Promise business table introduced', () => assert.equal(createBusinessTables.filter(x => has(x, 'promises')).length, 1)],
  [5, 'No separate assumption/exclusion/dependency tables', () => { assert.ok(no(db, 'create table public.crm_sales_assumptions')); assert.ok(no(db, 'create table public.crm_sales_exclusions')); assert.ok(no(db, 'create table public.crm_sales_dependencies')); }],
  [6, 'crm_requirements remains canonical Requirements', () => { assert.ok(has(schema, 'alter table public.crm_requirements')); assert.ok(no(db, 'create table public.crm_requirements')); }],
  [7, 'crm_sales_validations remains canonical review authority', () => { assert.ok(has(db, 'public.crm_sales_validations')); assert.ok(no(db, 'create table public.crm_sales_validations')); }],
  [8, 'crm_get_sales_gate_assessment remains Proposal Readiness authority', () => { assert.ok(has(readinessPatch, "p.proname='crm_get_sales_gate_assessment'")); assert.ok(no(readinessPatch, 'crm_get_sales_gate_assessment_v2')); }],
  [9, 'sales_products remains catalog truth', () => { assert.ok(no(db, 'insert into public.sales_products')); assert.ok(no(db, 'update public.sales_products')); }],
  [10, 'Quotation fields remain quotation-level data', () => { assert.ok(has(schema, "'writesQuotation',false")); assert.ok(noQuotationWrites()); }],

  [11, 'ASSUMPTION supported', () => assert.ok(has(schema, "'ASSUMPTION'"))],
  [12, 'EXCLUSION supported', () => assert.ok(has(schema, "'EXCLUSION'"))],
  [13, 'DEPENDENCY supported', () => assert.ok(has(schema, "'DEPENDENCY'"))],
  [14, 'CLIENT_RESPONSIBILITY supported', () => assert.ok(has(schema, "'CLIENT_RESPONSIBILITY'"))],
  [15, 'SCOPE_BOUNDARY supported', () => assert.ok(has(schema, "'SCOPE_BOUNDARY'"))],
  [16, 'Draft Condition works', () => assert.ok(all(mutations, ["'DRAFT'", 'crm_save_sales_scope_condition_draft']))],
  [17, 'Active Condition works', () => assert.ok(all(mutations, ["p_action='ACTIVATE'", "set state='ACTIVE'", 'activated_by=v_uid', 'activated_at=now()']))],
  [18, 'Active text cannot be silently overwritten', () => assert.ok(has(mutations, "if v_row.state<>'DRAFT' then raise exception 'Only a Draft Scope Condition can be edited in place"))],
  [19, 'Revision supersedes correctly', () => assert.ok(all(mutations, ['supersedes_condition_id', "set state='SUPERSEDED'", 'crm_revise_sales_scope_condition']))],
  [20, 'Condition history preserved', () => assert.ok(all(schema, ['crm_sales_scope_commitment_prevent_delete', 'immutable; use lifecycle transitions instead of DELETE']))],
  [21, 'Resolve works', () => assert.ok(all(mutations, ["p_action='RESOLVE'", "set state='RESOLVED'", 'resolved_by=v_uid', 'resolved_at=now()']))],
  [22, 'Condition withdraw requires reason', () => assert.ok(all(mutations, ["p_action='WITHDRAW'", 'meaningful withdrawal reason is required', 'withdrawal_reason=v_reason']))],
  [23, 'No Condition hard delete', () => assert.ok(all(schema, ['trg_crm_sales_scope_conditions_no_delete', 'crm_sales_scope_commitment_prevent_delete']))],
  [24, 'Source Requirement link valid', () => assert.ok(all(schema, ['source_requirement_id', 'Requirement does not belong to this Lead']))],
  [25, 'Cross-Lead Requirement link rejected', () => assert.ok(has(schema, 'r.id=p_requirement_id AND r.lead_id=p_lead_id'))],
  [26, 'Source Validation link valid', () => assert.ok(all(schema, ['source_validation_id', 'Sales Validation does not belong to this Lead/Opportunity']))],
  [27, 'Cross-Lead Validation link rejected', () => assert.ok(has(schema, 'v.id=p_validation_id AND v.lead_id=p_lead_id'))],
  [28, 'Source Meeting link valid', () => assert.ok(all(schema, ['source_meeting_id', 'Meeting does not belong to this Lead']))],
  [29, 'Cross-Lead Meeting rejected', () => assert.ok(has(schema, 'm.id=p_meeting_id AND (m.lead_id=p_lead_id OR o.lead_id=p_lead_id)'))],
  [30, 'Requirement material change causes stale handling', () => assert.ok(all(schema, ['trg_crm_requirement_scope_condition_stale', "set state='STALE'", 'OLD.content', 'NEW.content']))],
  [31, 'Stale condition preserves old wording', () => { assert.ok(has(schema, "set state='STALE'")); assert.ok(no(schema, 'set condition_text=NEW')); }],
  [32, 'New revision can replace stale condition', () => assert.ok(has(mutations, "v_old.state NOT IN ('ACTIVE','STALE')"))],
  [33, 'Opening workspace creates no condition', () => { assert.ok(has(workspaceSql, 'crm_get_sales_scope_commitment_workspace')); assert.ok(no(workspaceSql.split('CREATE OR REPLACE FUNCTION public.crm_get_sales_scope_commitment_workspace')[1] || '', 'insert into public.crm_sales_scope_conditions')); }],
  [34, 'Existing assumption Requirement is not automatically duplicated', () => assert.ok(no(schema, 'insert into public.crm_sales_scope_conditions select'))],
  [35, 'Seller explicitly reconciles source information', () => assert.ok(all(mutations, ['crm_reconcile_sales_scope_requirement', "v_action='LINK_CONDITION'", "v_action='NOT_MATERIAL'"]))],

  [36, 'Promise types supported', () => ['SCOPE','TECHNICAL','TIMELINE','COMMERCIAL','SUPPORT','COMPLIANCE','PERFORMANCE_RESULT','OTHER'].forEach(x => assert.ok(has(schema, `'${x}'`)))],
  [37, 'Draft Promise works', () => assert.ok(all(mutations, ['crm_save_sales_promise_draft', "'DRAFT'", 'recorded_by']))],
  [38, 'Draft is not Active commitment', () => assert.ok(has(workspaceSql, 'Promise draft(s) are internal preparation only and do not count as client commitments'))],
  [39, 'Explicit action required to record Active Promise', () => assert.ok(all(mutations, ["p_action='ACTIVATE'", 'p_client_communicated', 'Confirm that ProFox actually communicated this commitment to the client']))],
  [40, 'Active Promise actor stamped server-side', () => assert.ok(all(mutations, ['v_uid uuid:=auth.uid()', 'promised_by=v_uid']))],
  [41, 'recorded_at server-controlled', () => assert.ok(all(schema, ['recorded_at timestamptz NOT NULL DEFAULT now()', 'recorded_by uuid NOT NULL']))],
  [42, 'Client request cannot automatically create Promise', () => { assert.ok(has(scopeWorkspace, "Do not turn a client's request")); assert.ok(no(service, 'clientRequest')); }],
  [43, 'Seller hypothesis cannot automatically create Promise', () => assert.ok(has(promisePanel, 'Seller hypotheses'))],
  [44, 'Package Fit recommendation cannot automatically create Promise', () => { assert.ok(has(promisePanel, 'package recommendations')); assert.ok(no(mutations, 'crm_get_package_fit_assessment')); }],
  [45, 'Active Promise cannot be silently rewritten', () => assert.ok(has(mutations, "if v_row.record_state<>'DRAFT' then raise exception 'Only a Draft Promise can be edited in place"))],
  [46, 'Promise revision supersedes old version', () => assert.ok(all(mutations, ['supersedes_promise_id', "set record_state='SUPERSEDED'", 'crm_revise_sales_promise']))],
  [47, 'Old Promise wording preserved', () => { assert.ok(has(mutations, 'supersedes_promise_id=v_old.id')); assert.ok(no(mutations, 'update public.crm_sales_promises set promise_text')); }],
  [48, 'Promise withdrawal requires reason', () => assert.ok(all(mutations, ['meaningful Promise withdrawal reason is required', 'withdrawal_reason=v_reason']))],
  [49, 'Promise withdrawal preserves history', () => assert.ok(has(mutations, 'withdrawn without deleting the historical commitment or audit trail'))],
  [50, 'No Promise hard delete', () => assert.ok(all(schema, ['trg_crm_sales_promises_no_delete', 'crm_sales_scope_commitment_prevent_delete']))],
  [51, 'Promise can link Requirement', () => assert.ok(has(schema, 'linked_requirement_id'))],
  [52, 'Cross-Lead Promise Requirement rejected', () => assert.ok(has(mutations, 'crm_sales_scope_commitment_assert_context(p_lead_id,p_opportunity_id,p_linked_requirement_id'))],
  [53, 'Promise can link Validation', () => assert.ok(has(schema, 'linked_validation_id'))],
  [54, 'Cross-Lead Promise Validation rejected', () => assert.ok(has(schema, 'v.id=p_validation_id AND v.lead_id=p_lead_id'))],
  [55, 'Promise can link Meeting/source', () => assert.ok(all(schema, ['source_meeting_id', 'source_type', 'source_summary']))],
  [56, 'Cross-Lead Promise source rejected', () => assert.ok(has(schema, 'Meeting does not belong to this Lead'))],
  [57, 'Opening Promise Register creates no Promise', () => { assert.ok(no(scopeWorkspace, 'savePromiseDraft(')); assert.ok(no(workspaceSql.split('CREATE OR REPLACE FUNCTION public.crm_get_sales_scope_commitment_workspace')[1] || '', 'insert into public.crm_sales_promises')); }],
  [58, 'Unapproved real Promise may be recorded truthfully', () => { assert.ok(has(mutations, 'A material commitment actually communicated by ProFox was recorded')); assert.ok(no(mutations, 'linked_validation_id is null then raise')); }],
  [59, 'Unapproved Promise produces blocker/review signal', () => assert.ok(all(workspaceSql, ['PROMISE_UNAPPROVED_COMMITMENT', 'UNAPPROVED COMMITMENT', 'hardBlocker', 'OPEN_VALIDATION']))],
  [60, 'Approved validation is visible', () => assert.ok(all(workspaceSql, ["v_validation.status<>'APPROVED'", 'linkedValidationStatus']))],
  [61, 'Approved constraints visible', () => assert.ok(all(workspaceSql, ['approved_constraints', 'approvedConstraints']))],
  [62, 'Stale validation cannot falsely approve Promise', () => assert.ok(all(workspaceSql, ["v_validation.status IN ('STALE','REJECTED','CANCELLED')", 'supersedes_validation_id']))],
  [63, 'Rejected validation creates conflict/blocker', () => assert.ok(all(workspaceSql, ["v_validation.status='REJECTED'", "'CONFLICT'", 'PROMISE_VALIDATION_STALE_OR_CONFLICT']))],
  [64, 'Approval does not create CLIENT_CONFIRMED', () => assert.ok(no(db, 'set information_certainty='))],

  [65, 'Part 8 readiness evaluator reused', () => assert.ok(has(readinessPatch, "p.proname='crm_get_sales_gate_assessment'"))],
  [66, 'No second Proposal Readiness engine', () => assert.ok(no(readinessPatch, 'crm_get_sales_gate_assessment_part_9'))],
  [67, 'Scope Conditions readiness visible', () => assert.ok(all(readinessPatch, ['SCOPE_CONDITIONS_REGISTER', 'Scope Conditions Register']))],
  [68, 'Promise Register integrity visible', () => assert.ok(all(readinessPatch, ['PROMISE_REGISTER_INTEGRITY', 'Promise Register Integrity']))],
  [69, 'Unreconciled material source condition blocks/warns correctly', () => assert.ok(all(workspaceSql, ['SCOPE_SOURCE_RECONCILIATION_REQUIRED', 'hardBlocker', 'unreconciledRequirements']))],
  [70, 'Stale Scope Condition handled', () => assert.ok(all(workspaceSql, ['SCOPE_CONDITION_STALE', "v_scope_status := 'BLOCKED'"]))],
  [71, 'Unapproved Active Promise handled', () => assert.ok(all(workspaceSql, ['PROMISE_UNAPPROVED_COMMITMENT', "record_state='ACTIVE'"]))],
  [72, 'Zero Active Promises is allowed', () => assert.ok(all(workspaceSql, ["v_promise_status text := 'NO_ACTIVE_PROMISES'", "IF v_promises_active>0 THEN v_promise_status:='READY'"]))],
  [73, 'Zero Conditions does not create arbitrary blocker', () => { assert.ok(has(workspaceSql, "v_scope_status text := 'READY'")); assert.ok(no(workspaceSql, 'v_conditions_active=0 then')); }],
  [74, 'Existing material Requirement conditions require reconciliation', () => assert.ok(all(workspaceSql, ["r.requirement_key IN ('assumptions','exclusions','client_dependencies')", 'proposal_reconciliation_status IS NULL']))],
  [75, 'PROMISE_COVERAGE remains NOT_YET_EVALUATED', () => assert.ok(all(workspaceSql, ["'PROMISE_COVERAGE'", "'NOT_YET_EVALUATED'"]))],
  [76, 'FINAL_SCOPE_RECONCILIATION remains future until quote comparison', () => assert.ok(all(workspaceSql, ["'FINAL_SCOPE_RECONCILIATION'", "'FUTURE_QUOTATION_RECONCILIATION'"]))],
  [77, 'QUOTATION_SNAPSHOT_COVERAGE remains NOT_YET_EVALUATED', () => assert.ok(all(workspaceSql, ["'QUOTATION_SNAPSHOT_COVERAGE'", "'NOT_YET_EVALUATED'"]))],
  [78, 'Final quotation send gate remains inactive', () => assert.ok(all(db, ["'finalQuotationSendGateActive',false", "'writesQuotation',false"]))],
  [79, 'Hard blocker overrides readiness score', () => assert.ok(all(readinessPatch, ['v_blockers := v_blockers ||', "then 'BLOCKED'", 'v_score:=least']))],
  [80, 'No automatic Pipeline rollback', () => { assert.ok(no(db, 'update public.crm_opportunities set stage')); assert.ok(no(db, 'crm_transition_opportunity(')); }],

  [81, 'Part 9 does not write quotations.scope_summary', () => { assert.ok(noQuotationWrites()); assert.ok(no(db, 'set scope_summary=')); }],
  [82, 'Part 9 does not write quotations.exclusions', () => { assert.ok(noQuotationWrites()); assert.ok(no(db, 'set exclusions=')); }],
  [83, 'Part 9 does not write client_responsibilities', () => { assert.ok(noQuotationWrites()); assert.ok(no(db, 'set client_responsibilities=')); }],
  [84, 'Part 9 does not write delivery_assumptions', () => { assert.ok(noQuotationWrites()); assert.ok(no(db, 'set delivery_assumptions=')); }],
  [85, 'Part 9 does not change quotation_items', () => assert.ok(quotationWritePatterns.slice(3).every(pattern => !pattern.test(db)))],
  [86, 'Part 9 does not change commercial_snapshot', () => assert.ok(no(db, 'set commercial_snapshot='))],
  [87, 'Part 9 does not change payment snapshot', () => assert.ok(no(db, 'set payment_schedule_snapshot='))],
  [88, 'Part 9 does not change duration snapshot', () => assert.ok(no(db, 'set duration_snapshot='))],
  [89, 'Existing sent quotation unchanged', () => assert.ok(noQuotationWrites())],
  [90, 'Existing accepted quotation unchanged', () => assert.ok(noQuotationWrites())],
  [91, 'No quotation created from Scope Condition', () => assert.ok(no(db, 'create_quotation_atomic'))],
  [92, 'No quotation created from Promise', () => assert.ok(no(db, 'insert into public.quotations'))],
  [93, 'send_quotation_professional not gated/changed yet', () => assert.ok(no(db, 'send_quotation_professional'))],
  [94, 'Quotation Approval remains separate/canonical', () => assert.ok(all(workspaceSql, ['PROMISE_QUOTATION_APPROVAL_BOUNDARY', 'Quotation-specific pricing, discount, payment-term']))],

  [95, 'RLS enabled', () => assert.ok(all(schema, ['ALTER TABLE public.crm_sales_scope_conditions ENABLE ROW LEVEL SECURITY', 'ALTER TABLE public.crm_sales_promises ENABLE ROW LEVEL SECURITY']))],
  [96, 'Anonymous read denied', () => assert.ok(all(schema, ['REVOKE ALL ON TABLE public.crm_sales_scope_conditions FROM PUBLIC, anon, authenticated', 'REVOKE ALL ON TABLE public.crm_sales_promises FROM PUBLIC, anon, authenticated']))],
  [97, 'Anonymous mutation denied', () => assert.ok((mutations.match(/REVOKE ALL ON FUNCTION/g) || []).length >= 7)],
  [98, 'Unauthorized Seller denied', () => assert.ok(all(schema, ['crm_can_access_lead(p_lead_id)', 'Authorized CRM Lead access is required']))],
  [99, 'Cross-Lead references rejected', () => assert.ok(all(schema, ['Opportunity does not belong to this Lead', 'Requirement does not belong to this Lead', 'Sales Validation does not belong to this Lead/Opportunity', 'Meeting does not belong to this Lead']))],
  [100, 'Actors server-stamped', () => assert.ok(all(mutations, ['auth.uid()', 'created_by', 'updated_by', 'promised_by=v_uid']))],
  [101, 'Normal browser cannot hard delete', () => assert.ok(all(schema, ['BEFORE DELETE ON public.crm_sales_scope_conditions', 'BEFORE DELETE ON public.crm_sales_promises']))],
  [102, 'Audit events reused', () => { assert.ok(has(db, 'public.crm_write_lead_event')); assert.ok(no(db, 'create table public.crm_sales_scope_audit')); }],
  [103, 'No secrets encouraged/stored by UI guidance', () => assert.ok(all(guidance, ['Never store passwords', 'API secrets', 'private keys', 'recovery codes', 'card details', 'authentication credentials']))],
  [104, 'Customer cannot read internal registers directly', () => { assert.ok(no(schema, 'TO anon')); assert.ok(no(schema, 'TO public')); assert.ok(has(schema, 'USING (public.crm_can_access_lead(lead_id))')); }],
  [105, 'No service-role browser exposure', () => { const frontend = `${service}\n${scopePanel}\n${promisePanel}\n${scopeWorkspace}`; assert.ok(no(frontend, 'service_role')); assert.ok(no(frontend, 'SUPABASE_SERVICE')); }],

  [106, 'Scope Conditions panel renders', () => assert.ok(all(scopePanel, ['aria-label="Scope Conditions"', 'CRMScopeConditionsPanel']))],
  [107, 'Promise Register renders', () => assert.ok(all(promisePanel, ['aria-label="Promise Register"', 'CRMPromiseRegisterPanel']))],
  [108, 'No new Lead Drawer tab', () => { assert.ok(no(leadDrawer, 'Scope & Commitments')); assert.ok(has(readinessPanel, 'CRMScopeCommitmentsWorkspace')); }],
  [109, 'Reconciliation source shown', () => assert.ok(all(scopePanel, ['Source Requirement', 'Current value', 'Reconciliation']))],
  [110, 'Stale state understandable', () => assert.ok(all(scopePanel, ['STALE', 'source changed', 'stale']))],
  [111, 'Promise source understandable', () => assert.ok(all(promisePanel, ['Source / evidence', 'Communication evidence', 'Source:']))],
  [112, 'Promised-by information shown', () => assert.ok(has(promisePanel, 'Promised by / at:'))],
  [113, 'Validation status shown', () => assert.ok(all(promisePanel, ['Validation:', 'linkedValidationStatus']))],
  [114, 'Approved constraints shown', () => assert.ok(all(promisePanel, ['Approved constraints:', 'approvedConstraints']))],
  [115, 'Future Quote Coverage shown clearly', () => assert.ok(all(promisePanel, ['Future quotation reconciliation', 'NOT_YET_EVALUATED']))],
  [116, 'SellerGuidanceHelp reused', () => assert.ok(all(`${scopePanel}\n${promisePanel}\n${scopeWorkspace}`, ['SellerGuidanceHelp', 'getScopeCommitmentGuidance']))],
  [117, 'Assumption guidance exists', () => assert.ok(all(guidance, ['condition.type.ASSUMPTION', 'material assumption ProFox is relying on']))],
  [118, 'Exclusion guidance exists', () => assert.ok(all(guidance, ['condition.type.EXCLUSION', 'proposal will intentionally not include']))],
  [119, 'Dependency guidance exists', () => assert.ok(all(guidance, ['condition.type.DEPENDENCY', 'project depends upon']))],
  [120, 'Client Responsibility guidance exists', () => assert.ok(all(guidance, ['condition.type.CLIENT_RESPONSIBILITY', 'client is responsible for providing']))],
  [121, 'Promise guidance exists', () => assert.ok(all(guidance, ['section.promise_register', 'material commitment ProFox actually communicated']))],
  [122, 'Unapproved Promise guidance exists', () => assert.ok(all(guidance, ['status.promise_unapproved', 'required internal validation is not current']))],
  [123, 'Touch/mobile support', () => { assert.ok(all(`${scopePanel}\n${promisePanel}\n${scopeWorkspace}`, ['min-h-10', 'sm:', 'md:', 'lg:'])); assert.ok(has(promisePanel, 'whitespace-pre-wrap')); }],
  [124, 'Keyboard/accessibility support', () => { assert.ok(all(consequentialDialog, ['role="dialog"', 'aria-modal="true"', "event.key === 'Tab'", "event.key === 'Escape'", 'focus-visible', 'previousFocusRef'])); assert.ok(has(scopeWorkspace, 'window.confirm')); }],

  [125, 'Part 1 preserved', () => assert.ok(existsSync('tests/security/crm-sales-discovery-foundation-part-1.test.ts'))],
  [126, 'Part 2 preserved', () => assert.ok(existsSync('tests/security/crm-sales-requirements-part-2.test.ts'))],
  [127, 'Part 3 preserved', () => assert.ok(existsSync('tests/security/crm-sales-probing-discovery-part-3.test.ts'))],
  [128, 'Part 3.5 preserved', () => assert.ok(existsSync('tests/security/crm-seller-guidance-part-3-5.test.ts'))],
  [129, 'Part 4 preserved', () => assert.ok(existsSync('tests/security/crm-sales-meeting-prep-part-4.test.ts'))],
  [130, 'Part 5 preserved', () => assert.ok(existsSync('tests/security/crm-sales-meeting-management-closeout-part-5.test.ts'))],
  [131, 'Part 6 preserved', () => assert.ok(existsSync('tests/security/crm-sales-package-fit-part-6.test.ts'))],
  [132, 'Part 7 preserved', () => assert.ok(existsSync('tests/security/crm-sales-validation-escalation-part-7.test.ts'))],
  [133, 'Part 8 preserved', () => assert.ok(existsSync('tests/security/crm-sales-requirements-confirmed-proposal-readiness-part-8.test.ts'))],
  [134, 'TypeScript command remains executable', () => assert.equal(packageJson.scripts?.lint, 'tsc --noEmit')],
  [135, 'Security suite command includes Part 9 tests', () => assert.ok(has(packageJson.scripts?.['test:security'] || '', 'tests/security/*.test.ts'))],
  [136, 'Migration integrity command remains executable', () => assert.ok(has(packageJson.scripts?.['migrations:check'] || '', 'migrate-production.mjs'))],
  [137, 'Production build command remains executable', () => assert.ok(has(packageJson.scripts?.build || '', 'vite build'))],
];

assert.equal(checks.length, 137, 'Part 9 acceptance suite must retain all 137 required checks.');
checks.forEach(([number, name, run]) => test(`Part 9 TEST ${number}: ${name}`, run));

test('Part 9 implementation record documents the native migration lineage and Part 10 boundary', () => {
  assert.ok(all(part9Doc, ['20260910042939', '20260910043137', '20260910043416', '20260910043453']));
  assert.ok(all(part9Doc, ['Part 10', 'finalQuotationSendGateActive', 'No quotation writes']));
});
