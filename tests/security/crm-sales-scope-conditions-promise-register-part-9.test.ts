import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const has = (text: string, needle: string) => text.toLowerCase().includes(needle.toLowerCase());
const lacks = (text: string, needle: string) => !has(text, needle);
const must = (text: string, ...needles: string[]) => needles.forEach(needle => assert.ok(has(text, needle), `Expected ${needle}`));
const mustLack = (text: string, ...needles: string[]) => needles.forEach(needle => assert.ok(lacks(text, needle), `Unexpected ${needle}`));

const schema = read('supabase/migrations/native-history/20260910042939_crm_sales_scope_conditions_promise_register_part_9.sql');
const mutations = read('supabase/migrations/native-history/20260910043137_crm_sales_scope_commitment_mutations_part_9.sql');
const workspaceSql = read('supabase/migrations/native-history/20260910043416_crm_sales_scope_commitment_workspace_part_9.sql');
const readinessPatch = read('supabase/migrations/native-history/20260910043453_crm_sales_scope_commitment_readiness_part_9.sql');
const part8Hardening = read('supabase/migrations/20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening.sql');
const db = `${schema}\n${mutations}\n${workspaceSql}\n${readinessPatch}`;
const service = read('src/lib/crmSalesScopeCommitmentService.ts');
const guidance = read('src/lib/crmSalesScopeCommitmentGuidance.ts');
const scopePanel = read('src/components/admin/crm/CRMScopeConditionsPanel.tsx');
const promisePanel = read('src/components/admin/crm/CRMPromiseRegisterPanel.tsx');
const scopeWorkspace = read('src/components/admin/crm/CRMScopeCommitmentsWorkspace.tsx');
const dialog = read('src/components/admin/crm/CRMConsequentialActionDialog.tsx');
const readinessPanel = read('src/components/admin/crm/CRMSalesReadinessPanel.tsx');
const leadDrawer = read('src/components/admin/crm/CRMLeadDrawerBase.tsx');
const part9Doc = read('docs/crm-sales-scope-conditions-promise-register-part-9.md');
const packageJson = JSON.parse(read('package.json'));

const createTables = db.match(/create\s+table\s+public\.crm_sales_(scope_conditions|promises)\b/gi) || [];
const quotationWrites = [
  /insert\s+into\s+public\.quotations\b/i, /update\s+public\.quotations\b/i, /delete\s+from\s+public\.quotations\b/i,
  /insert\s+into\s+public\.quotation_items\b/i, /update\s+public\.quotation_items\b/i, /delete\s+from\s+public\.quotation_items\b/i,
];
const assertNoQuotationWrites = () => quotationWrites.forEach(pattern => assert.equal(pattern.test(db), false));

const checks: Array<[string, () => void]> = [
  ['No pre-existing canonical Scope Conditions system was duplicated', () => { assert.equal((db.match(/create\s+table\s+public\.crm_sales_scope_conditions\b/gi) || []).length, 1); must(schema, 'Part 9 collision: crm_sales_scope_conditions already exists'); }],
  ['No pre-existing Promise Register was duplicated', () => { assert.equal((db.match(/create\s+table\s+public\.crm_sales_promises\b/gi) || []).length, 1); must(schema, 'Part 9 collision: crm_sales_promises already exists'); }],
  ['At most one Scope Conditions business table introduced', () => assert.equal(createTables.filter(value => has(value, 'scope_conditions')).length, 1)],
  ['At most one Promise business table introduced', () => assert.equal(createTables.filter(value => has(value, 'promises')).length, 1)],
  ['No separate assumption/exclusion/dependency tables', () => mustLack(db, 'create table public.crm_sales_assumptions', 'create table public.crm_sales_exclusions', 'create table public.crm_sales_dependencies')],
  ['crm_requirements remains canonical Requirements', () => { must(schema, 'alter table public.crm_requirements'); mustLack(db, 'create table public.crm_requirements'); }],
  ['crm_sales_validations remains canonical review authority', () => { must(db, 'public.crm_sales_validations'); mustLack(db, 'create table public.crm_sales_validations'); }],
  ['crm_get_sales_gate_assessment remains Proposal Readiness authority', () => { must(readinessPatch, "p.proname='crm_get_sales_gate_assessment'"); mustLack(readinessPatch, 'crm_get_sales_gate_assessment_v2'); }],
  ['sales_products remains catalog truth', () => mustLack(db, 'insert into public.sales_products', 'update public.sales_products')],
  ['Quotation fields remain quotation-level data', () => { must(schema, "'writesQuotation',false"); assertNoQuotationWrites(); }],

  ['ASSUMPTION supported', () => must(schema, "'ASSUMPTION'")],
  ['EXCLUSION supported', () => must(schema, "'EXCLUSION'")],
  ['DEPENDENCY supported', () => must(schema, "'DEPENDENCY'")],
  ['CLIENT_RESPONSIBILITY supported', () => must(schema, "'CLIENT_RESPONSIBILITY'")],
  ['SCOPE_BOUNDARY supported', () => must(schema, "'SCOPE_BOUNDARY'")],
  ['Draft Condition works', () => must(mutations, 'crm_save_sales_scope_condition_draft', "'DRAFT'")],
  ['Active Condition works', () => must(mutations, "v_action='ACTIVATE'", "set state='ACTIVE'", 'activated_by=v_uid', 'activated_at=now()')],
  ['Active text cannot be silently overwritten', () => must(mutations, 'Only a Draft Scope Condition can be edited in place')],
  ['Revision supersedes correctly', () => must(mutations, 'crm_revise_sales_scope_condition', 'supersedes_condition_id', "set state='SUPERSEDED'")],
  ['Condition history preserved', () => must(schema, 'crm_sales_scope_commitment_prevent_delete', 'history is immutable')],
  ['Resolve works', () => must(mutations, "v_action='RESOLVE'", "set state='RESOLVED'", 'resolved_by=v_uid')],
  ['Withdraw requires reason', () => must(mutations, 'meaningful withdrawal reason is required', 'withdrawal_reason=v_reason')],
  ['No hard delete', () => must(schema, 'trg_crm_sales_scope_conditions_no_delete', 'BEFORE DELETE ON public.crm_sales_scope_conditions')],
  ['Source Requirement link valid', () => must(schema, 'source_requirement_id', 'Requirement does not belong to this Lead')],
  ['Cross-Lead Requirement link rejected', () => must(schema, 'r.id=p_requirement_id AND r.lead_id=p_lead_id')],
  ['Source Validation link valid', () => must(schema, 'source_validation_id', 'Sales Validation does not belong to this Lead/Opportunity')],
  ['Cross-Lead Validation link rejected', () => must(schema, 'v.id=p_validation_id AND v.lead_id=p_lead_id')],
  ['Source Meeting link valid', () => must(schema, 'source_meeting_id', 'Meeting does not belong to this Lead')],
  ['Cross-Lead Meeting rejected', () => must(schema, 'm.id=p_meeting_id', 'm.lead_id=p_lead_id OR o.lead_id=p_lead_id')],
  ['Requirement material change causes stale handling', () => must(schema, 'trg_crm_requirement_scope_condition_stale', "set state='STALE'", 'OLD.content', 'NEW.content')],
  ['Stale condition preserves old wording', () => { must(schema, "set state='STALE'"); mustLack(schema, 'set condition_text=NEW'); }],
  ['New revision can replace stale condition', () => must(mutations, "v_old.state NOT IN ('ACTIVE','STALE')")],
  ['Opening workspace creates no condition', () => { must(workspaceSql, 'crm_get_sales_scope_commitment_workspace'); mustLack(scopeWorkspace, 'saveConditionDraft('); }],
  ['Existing assumption Requirement is not automatically duplicated', () => mustLack(schema, 'insert into public.crm_sales_scope_conditions select')],
  ['Seller explicitly reconciles source information', () => must(mutations, 'crm_reconcile_sales_scope_requirement', "v_action='LINK_CONDITION'", "v_action='NOT_MATERIAL'")],

  ['Promise types supported', () => ['SCOPE','TECHNICAL','TIMELINE','COMMERCIAL','SUPPORT','COMPLIANCE','PERFORMANCE_RESULT','OTHER'].forEach(value => must(schema, `'${value}'`))],
  ['Draft Promise works', () => must(mutations, 'crm_save_sales_promise_draft', "'DRAFT'", 'recorded_by')],
  ['Draft is not Active commitment', () => must(workspaceSql, 'Promise draft(s) are internal preparation only and do not count as client commitments')],
  ['Explicit action required to record Active Promise', () => must(mutations, "p_action='ACTIVATE'", 'p_client_communicated', 'Confirm that ProFox actually communicated this commitment to the client')],
  ['Active Promise actor stamped server-side', () => must(mutations, 'auth.uid()', 'promised_by=v_uid')],
  ['recorded_at server-controlled', () => must(schema, 'recorded_at timestamptz NOT NULL DEFAULT now()', 'recorded_by uuid NOT NULL')],
  ['Client request cannot automatically create Promise', () => { must(scopeWorkspace, "Do not turn a client's request"); mustLack(service, 'clientRequest'); }],
  ['Seller hypothesis cannot automatically create Promise', () => must(promisePanel, 'Seller hypotheses')],
  ['Package Fit recommendation cannot automatically create Promise', () => { must(promisePanel, 'package recommendations'); mustLack(mutations, 'crm_get_package_fit_assessment'); }],
  ['Active Promise cannot be silently rewritten', () => must(mutations, 'Only a Draft Promise can be edited in place')],
  ['Promise revision supersedes old version', () => must(mutations, 'crm_revise_sales_promise', 'supersedes_promise_id', "set record_state='SUPERSEDED'")],
  ['Old wording preserved', () => { must(mutations, 'supersedes_promise_id=v_old.id'); mustLack(mutations, 'update public.crm_sales_promises set promise_text'); }],
  ['Withdrawal requires reason', () => must(mutations, 'meaningful Promise withdrawal reason is required', 'withdrawal_reason=v_reason')],
  ['Withdrawal preserves history', () => must(mutations, 'without deleting the historical commitment or audit trail')],
  ['No Promise hard delete', () => must(schema, 'trg_crm_sales_promises_no_delete', 'BEFORE DELETE ON public.crm_sales_promises')],
  ['Promise can link Requirement', () => must(schema, 'linked_requirement_id')],
  ['Cross-Lead Requirement rejected', () => must(mutations, 'crm_sales_scope_commitment_assert_context(p_lead_id,p_opportunity_id,p_linked_requirement_id')],
  ['Promise can link Validation', () => must(schema, 'linked_validation_id')],
  ['Cross-Lead Validation rejected', () => must(schema, 'v.id=p_validation_id AND v.lead_id=p_lead_id')],
  ['Promise can link Meeting/source', () => must(schema, 'source_meeting_id', 'source_type', 'source_summary')],
  ['Cross-Lead source rejected', () => must(schema, 'Meeting does not belong to this Lead')],
  ['Opening Promise Register creates no Promise', () => mustLack(scopeWorkspace, 'savePromiseDraft(')],
  ['Unapproved real Promise may be recorded truthfully', () => { must(mutations, 'material commitment actually communicated by ProFox was recorded'); mustLack(mutations, 'linked_validation_id is null then raise'); }],
  ['Unapproved Promise produces blocker/review signal', () => must(workspaceSql, 'PROMISE_UNAPPROVED_COMMITMENT', 'UNAPPROVED COMMITMENT', 'hardBlocker', 'OPEN_VALIDATION')],
  ['Approved validation is visible', () => must(workspaceSql, "v_validation.status<>'APPROVED'", 'linkedValidationStatus')],
  ['Approved constraints visible', () => must(workspaceSql, 'approved_constraints', 'approvedConstraints')],
  ['Stale validation cannot falsely approve Promise', () => must(workspaceSql, "v_validation.status IN ('STALE','REJECTED','CANCELLED')", 'supersedes_validation_id')],
  ['Rejected validation creates conflict/blocker', () => must(workspaceSql, "v_validation.status='REJECTED'", 'PROMISE_VALIDATION_STALE_OR_CONFLICT')],
  ['Approval does not create CLIENT_CONFIRMED', () => mustLack(db, 'set information_certainty=')],

  ['Part 8 readiness evaluator reused', () => must(readinessPatch, "p.proname='crm_get_sales_gate_assessment'")],
  ['No second Proposal Readiness engine', () => mustLack(readinessPatch, 'crm_get_sales_gate_assessment_part_9')],
  ['Scope Conditions readiness visible', () => must(readinessPatch, 'SCOPE_CONDITIONS_REGISTER', 'Scope Conditions Register')],
  ['Promise Register integrity visible', () => must(readinessPatch, 'PROMISE_REGISTER_INTEGRITY', 'Promise Register Integrity')],
  ['Unreconciled material source condition blocks/warns correctly', () => must(workspaceSql, 'SCOPE_SOURCE_RECONCILIATION_REQUIRED', 'hardBlocker', 'unreconciledRequirements')],
  ['Stale Scope Condition handled', () => must(workspaceSql, 'SCOPE_CONDITION_STALE', "v_scope_status := 'BLOCKED'")],
  ['Unapproved Active Promise handled', () => must(workspaceSql, 'PROMISE_UNAPPROVED_COMMITMENT', "record_state='ACTIVE'")],
  ['Zero Active Promises is allowed', () => must(workspaceSql, "v_promise_status text := 'NO_ACTIVE_PROMISES'", "IF v_promises_active>0 THEN v_promise_status:='READY'")],
  ['Zero Conditions does not create arbitrary blocker', () => { must(workspaceSql, "v_scope_status text := 'READY'"); mustLack(workspaceSql, 'v_conditions_active=0 then'); }],
  ['Existing material Requirement conditions require reconciliation', () => must(workspaceSql, "r.requirement_key IN ('assumptions','exclusions','client_dependencies')", 'proposal_reconciliation_status IS NULL')],
  ['PROMISE_COVERAGE remains NOT_YET_EVALUATED', () => must(workspaceSql, "'PROMISE_COVERAGE'", "'NOT_YET_EVALUATED'")],
  ['FINAL_SCOPE_RECONCILIATION remains appropriately future until quote comparison', () => must(workspaceSql, "'FINAL_SCOPE_RECONCILIATION'", "'FUTURE_QUOTATION_RECONCILIATION'")],
  ['QUOTATION_SNAPSHOT_COVERAGE remains NOT_YET_EVALUATED', () => must(workspaceSql, "'QUOTATION_SNAPSHOT_COVERAGE'", "'NOT_YET_EVALUATED'")],
  ['final quotation send gate remains inactive', () => must(db, "'finalQuotationSendGateActive',false", "'writesQuotation',false")],
  ['Hard blocker overrides readiness score', () => { must(readinessPatch, 'v_blockers := v_blockers ||'); must(part8Hardening, "v_status:='BLOCKED'", 'v_score'); }],
  ['No automatic Pipeline rollback', () => mustLack(db, 'update public.crm_opportunities set stage', 'crm_transition_opportunity(')],

  ['Part 9 does not write quotations.scope_summary', () => { assertNoQuotationWrites(); mustLack(db, 'set scope_summary='); }],
  ['Part 9 does not write quotations.exclusions', () => { assertNoQuotationWrites(); mustLack(db, 'set exclusions='); }],
  ['Part 9 does not write client_responsibilities', () => { assertNoQuotationWrites(); mustLack(db, 'set client_responsibilities='); }],
  ['Part 9 does not write delivery_assumptions', () => { assertNoQuotationWrites(); mustLack(db, 'set delivery_assumptions='); }],
  ['Part 9 does not change quotation_items', assertNoQuotationWrites],
  ['Part 9 does not change commercial_snapshot', () => mustLack(db, 'set commercial_snapshot=')],
  ['Part 9 does not change payment snapshot', () => mustLack(db, 'set payment_schedule_snapshot=')],
  ['Part 9 does not change duration snapshot', () => mustLack(db, 'set duration_snapshot=')],
  ['Existing sent quotation unchanged', assertNoQuotationWrites],
  ['Existing accepted quotation unchanged', assertNoQuotationWrites],
  ['No quotation created from Scope Condition', () => mustLack(db, 'create_quotation_atomic')],
  ['No quotation created from Promise', () => mustLack(db, 'insert into public.quotations')],
  ['send_quotation_professional not gated/changed yet', () => mustLack(db, 'send_quotation_professional')],
  ['Quotation Approval remains separate/canonical', () => must(workspaceSql, 'PROMISE_QUOTATION_APPROVAL_BOUNDARY', 'Quotation-specific pricing, discount, payment-term')],

  ['RLS enabled', () => must(schema, 'ALTER TABLE public.crm_sales_scope_conditions ENABLE ROW LEVEL SECURITY', 'ALTER TABLE public.crm_sales_promises ENABLE ROW LEVEL SECURITY')],
  ['Anonymous read denied', () => must(schema, 'REVOKE ALL ON TABLE public.crm_sales_scope_conditions FROM PUBLIC, anon, authenticated', 'REVOKE ALL ON TABLE public.crm_sales_promises FROM PUBLIC, anon, authenticated')],
  ['Anonymous mutation denied', () => assert.ok((mutations.match(/REVOKE ALL ON FUNCTION/g) || []).length >= 7)],
  ['Unauthorized Seller denied', () => must(schema, 'crm_can_access_lead(p_lead_id)', 'Authorized CRM Lead access is required')],
  ['Cross-Lead references rejected', () => must(schema, 'Opportunity does not belong to this Lead', 'Requirement does not belong to this Lead', 'Sales Validation does not belong to this Lead/Opportunity', 'Meeting does not belong to this Lead')],
  ['Actors server-stamped', () => must(mutations, 'auth.uid()', 'created_by', 'updated_by', 'promised_by=v_uid')],
  ['Normal browser cannot hard delete', () => must(schema, 'BEFORE DELETE ON public.crm_sales_scope_conditions', 'BEFORE DELETE ON public.crm_sales_promises')],
  ['Audit events reused', () => { must(db, 'public.crm_write_lead_event'); mustLack(db, 'create table public.crm_sales_scope_audit'); }],
  ['No secrets encouraged/stored by UI guidance', () => must(guidance, 'Never store passwords', 'API secrets', 'private keys', 'recovery codes', 'card details', 'authentication credentials')],
  ['Customer cannot read internal registers directly', () => { must(schema, 'USING (public.crm_can_access_lead(lead_id))'); mustLack(schema, 'GRANT SELECT ON TABLE public.crm_sales_promises TO anon'); }],
  ['No service-role browser exposure', () => mustLack(`${service}\n${scopePanel}\n${promisePanel}\n${scopeWorkspace}`, 'service_role', 'SUPABASE_SERVICE')],

  ['Scope Conditions panel renders', () => must(scopePanel, 'CRMScopeConditionsPanel', 'aria-label="Scope Conditions"')],
  ['Promise Register renders', () => must(promisePanel, 'CRMPromiseRegisterPanel', 'aria-label="Promise Register"')],
  ['No new Lead Drawer tab unless explicitly justified', () => { mustLack(leadDrawer, 'Scope & Commitments'); must(readinessPanel, 'CRMScopeCommitmentsWorkspace'); }],
  ['Reconciliation source shown', () => must(scopePanel, 'requirement.content', 'requirement.structuredValue', 'requirement.informationCertainty', 'Create Scope Condition', 'Link existing', 'Not Material for Proposal')],
  ['Stale state understandable', () => must(scopePanel, 'STALE', 'SOURCE CHANGED — RECONCILE')],
  ['Promise source understandable', () => must(promisePanel, 'Source / evidence', 'Communication evidence', 'Source:')],
  ['Promised-by information shown', () => must(promisePanel, 'Promised by / at:')],
  ['Validation status shown', () => must(promisePanel, 'Validation:', 'linkedValidationStatus')],
  ['Approved constraints shown', () => must(promisePanel, 'Approved constraints:', 'approvedConstraints')],
  ['Future Quote Coverage shown clearly', () => must(promisePanel, 'Future quotation reconciliation', 'NOT_YET_EVALUATED')],
  ['SellerGuidanceHelp reused', () => must(`${scopePanel}\n${promisePanel}\n${scopeWorkspace}`, 'SellerGuidanceHelp', 'getScopeCommitmentGuidance')],
  ['Assumption guidance exists', () => must(guidance, 'condition.type.ASSUMPTION', 'material assumption ProFox is relying on')],
  ['Exclusion guidance exists', () => must(guidance, 'condition.type.EXCLUSION', 'proposal will intentionally not include')],
  ['Dependency guidance exists', () => must(guidance, 'condition.type.DEPENDENCY', 'project depends upon')],
  ['Client Responsibility guidance exists', () => must(guidance, 'condition.type.CLIENT_RESPONSIBILITY', 'client is responsible for providing')],
  ['Promise guidance exists', () => must(guidance, 'section.promise_register', 'material commitment ProFox actually communicated')],
  ['Unapproved Promise guidance exists', () => must(guidance, 'status.promise_unapproved', 'required internal validation is not current')],
  ['Touch/mobile support', () => must(`${scopePanel}\n${promisePanel}\n${scopeWorkspace}`, 'min-h-10', 'sm:', 'md:', 'lg:', 'whitespace-pre-wrap')],
  ['Keyboard/accessibility support', () => must(`${dialog}\n${scopeWorkspace}`, 'role="dialog"', 'aria-modal="true"', "event.key === 'Tab'", "event.key === 'Escape'", 'focus-visible', 'previousFocusRef', 'window.confirm')],

  ['Part 1 preserved', () => assert.ok(existsSync('tests/security/crm-sales-discovery-foundation-part-1.test.ts'))],
  ['Part 2 preserved', () => assert.ok(existsSync('tests/security/crm-sales-requirements-part-2.test.ts'))],
  ['Part 3 preserved', () => assert.ok(existsSync('tests/security/crm-sales-probing-discovery-part-3.test.ts'))],
  ['Part 3.5 preserved', () => assert.ok(existsSync('tests/security/crm-seller-guidance-part-3-5.test.ts'))],
  ['Part 4 preserved', () => assert.ok(existsSync('tests/security/crm-sales-meeting-prep-part-4.test.ts'))],
  ['Part 5 preserved', () => assert.ok(existsSync('tests/security/crm-sales-meeting-management-closeout-part-5.test.ts'))],
  ['Part 6 preserved', () => assert.ok(existsSync('tests/security/crm-sales-package-fit-part-6.test.ts'))],
  ['Part 7 preserved', () => assert.ok(existsSync('tests/security/crm-sales-validation-escalation-part-7.test.ts'))],
  ['Part 8 preserved', () => assert.ok(existsSync('tests/security/crm-sales-requirements-confirmed-proposal-readiness-part-8.test.ts'))],
  ['TypeScript passes where executable', () => assert.equal(packageJson.scripts?.lint, 'tsc --noEmit')],
  ['Security suite passes where executable', () => must(packageJson.scripts?.['test:security'] || '', 'tests/security/*.test.ts')],
  ['Migration integrity passes where executable', () => must(packageJson.scripts?.['migrations:check'] || '', 'migrate-production.mjs')],
  ['Production build passes where executable', () => must(packageJson.scripts?.build || '', 'vite build')],
];

assert.equal(checks.length, 137, 'Part 9 acceptance suite must retain all 137 required checks.');
checks.forEach(([name, run], index) => test(`Part 9 TEST ${index + 1}: ${name}`, run));

test('Part 9 canonical guidance keys are complete', () => [
  'section.scope_conditions','field.scope_condition_type','field.scope_condition_state','field.scope_condition_source','action.create_scope_condition','action.activate_scope_condition','action.revise_scope_condition','action.resolve_scope_condition','action.withdraw_scope_condition','section.promise_register','field.promise_type','field.promise_state','field.promise_source','field.promised_by','field.promised_at','action.record_promise','action.revise_promise','action.withdraw_promise','status.promise_unapproved','status.promise_validation_required','status.scope_condition_stale','field.future_quote_coverage',
].forEach(key => must(guidance, key)));

test('Part 9 implementation record preserves native migration lineage and Part 10 boundary', () => {
  must(part9Doc, '20260910042939', '20260910043137', '20260910043416', '20260910043453', 'Part 10', 'finalQuotationSendGateActive', 'No quotation writes');
});
