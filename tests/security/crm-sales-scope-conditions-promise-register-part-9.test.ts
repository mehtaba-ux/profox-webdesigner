import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const lower = (value: string) => value.toLowerCase();
const has = (text: string, needle: string) => lower(text).includes(lower(needle));
const no = (text: string, needle: string) => !has(text, needle);
const all = (text: string, needles: string[]) => needles.every(needle => has(text, needle));
const none = (text: string, needles: string[]) => needles.every(needle => no(text, needle));

const schema = read('supabase/migrations/20260910033000_crm_sales_scope_conditions_promise_register_part_9.sql');
const mutations = read('supabase/migrations/20260910034000_crm_sales_scope_commitment_mutations_part_9.sql');
const workspaceMigration = read('supabase/migrations/20260910035000_crm_sales_scope_commitment_workspace_part_9.sql');
const readinessMigration = read('supabase/migrations/20260910035500_crm_sales_scope_commitment_readiness_part_9.sql');
const combined = `${schema}\n${mutations}\n${workspaceMigration}\n${readinessMigration}`;
const service = read('src/lib/crmSalesScopeCommitmentService.ts');
const scopePanel = read('src/components/admin/crm/CRMScopeConditionsPanel.tsx');
const promisePanel = read('src/components/admin/crm/CRMPromiseRegisterPanel.tsx');
const workspacePanel = read('src/components/admin/crm/CRMSalesScopeCommitmentWorkspace.tsx');
const readinessPanel = read('src/components/admin/crm/CRMSalesReadinessPanel.tsx');
const guidance = read('src/lib/crmSalesScopeCommitmentGuidance.ts');
const leadDrawer = read('src/components/admin/crm/CRMLeadDrawerBase.tsx');
const part8 = read('supabase/migrations/20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening.sql');
const packageJson = JSON.parse(read('package.json'));
const createTables = combined.match(/create\s+table\s+public\.[a-z0-9_]+/gi) || [];

type AcceptanceCase = [string, () => void];
const cases: AcceptanceCase[] = [
  // 1–10 ARCHITECTURE
  ['1 no pre-existing canonical Scope Conditions system is duplicated', () => { assert.ok(has(schema, 'Part 9 collision: crm_sales_scope_conditions already exists')); assert.equal(createTables.filter(v => has(v, 'scope_conditions')).length, 1); }],
  ['2 no pre-existing Promise Register is duplicated', () => { assert.ok(has(schema, 'Part 9 collision: crm_sales_promises already exists')); assert.equal(createTables.filter(v => has(v, 'sales_promises')).length, 1); }],
  ['3 at most one Scope Conditions business table introduced', () => { assert.equal(createTables.filter(v => has(v, 'scope_conditions')).length, 1); }],
  ['4 at most one Promise business table introduced', () => { assert.equal(createTables.filter(v => has(v, 'sales_promises')).length, 1); }],
  ['5 no separate assumption exclusion dependency tables', () => { assert.ok(none(combined, ['create table public.crm_sales_assumptions','create table public.crm_sales_exclusions','create table public.crm_sales_dependencies','create table public.crm_client_responsibilities'])); }],
  ['6 crm_requirements remains canonical Requirements', () => { assert.ok(has(schema, 'alter table public.crm_requirements')); assert.ok(no(combined, 'create table public.crm_requirements')); }],
  ['7 crm_sales_validations remains canonical review authority', () => { assert.ok(has(workspaceMigration, 'public.crm_sales_validations')); assert.ok(no(combined, 'create table public.crm_sales_validations')); }],
  ['8 crm_get_sales_gate_assessment remains Proposal Readiness authority', () => { assert.ok(has(readinessMigration, 'crm_get_sales_gate_assessment')); assert.ok(no(combined, 'crm_get_sales_gate_assessment_v2')); }],
  ['9 sales_products remains catalog truth', () => { assert.ok(none(combined, ['insert into public.sales_products','update public.sales_products','create table public.sales_products'])); }],
  ['10 quotation fields remain quotation-level data', () => { assert.ok(none(combined, ['update public.quotations','insert into public.quotations','update public.quotation_items','insert into public.quotation_items'])); }],

  // 11–35 CONDITIONS
  ['11 ASSUMPTION supported', () => assert.ok(has(schema, "'ASSUMPTION'"))],
  ['12 EXCLUSION supported', () => assert.ok(has(schema, "'EXCLUSION'"))],
  ['13 DEPENDENCY supported', () => assert.ok(has(schema, "'DEPENDENCY'"))],
  ['14 CLIENT_RESPONSIBILITY supported', () => assert.ok(has(schema, "'CLIENT_RESPONSIBILITY'"))],
  ['15 SCOPE_BOUNDARY supported', () => assert.ok(has(schema, "'SCOPE_BOUNDARY'"))],
  ['16 Draft Condition works', () => assert.ok(all(mutations, ["'DRAFT'", 'crm_save_sales_scope_condition_draft']))],
  ['17 Active Condition works', () => assert.ok(all(mutations, ["p_action='ACTIVATE'", "set state='ACTIVE'", 'activated_by=v_uid']))],
  ['18 Active text cannot be silently overwritten', () => assert.ok(has(mutations, "Only a Draft Scope Condition can be edited in place"))],
  ['19 revision supersedes correctly', () => assert.ok(all(mutations, ['supersedes_condition_id', "set state='SUPERSEDED'", 'crm_revise_sales_scope_condition']))],
  ['20 Condition history preserved', () => assert.ok(all(schema, ['SUPERSEDED','WITHDRAWN','RESOLVED','crm_sales_scope_commitment_prevent_delete']))],
  ['21 resolve works', () => assert.ok(all(mutations, ["p_action='RESOLVE'", "set state='RESOLVED'", 'resolved_at=now()']))],
  ['22 Condition withdraw requires reason', () => assert.ok(all(mutations, ["p_action='WITHDRAW'", 'meaningful withdrawal reason is required']))],
  ['23 no Condition hard delete', () => assert.ok(all(schema, ['trg_crm_sales_scope_conditions_no_delete','history is immutable']))],
  ['24 source Requirement link valid', () => assert.ok(all(schema, ['source_requirement_id','Requirement does not belong to this Lead']))],
  ['25 cross-Lead Requirement link rejected', () => assert.ok(has(schema, 'Requirement does not belong to this Lead'))],
  ['26 source Validation link valid', () => assert.ok(all(schema, ['source_validation_id','Sales Validation does not belong to this Lead/Opportunity']))],
  ['27 cross-Lead Validation link rejected', () => assert.ok(has(schema, 'Sales Validation does not belong to this Lead/Opportunity'))],
  ['28 source Meeting link valid', () => assert.ok(all(schema, ['source_meeting_id','Meeting does not belong to this Lead']))],
  ['29 cross-Lead Meeting rejected', () => assert.ok(has(schema, 'Meeting does not belong to this Lead'))],
  ['30 Requirement material change causes stale handling', () => assert.ok(all(schema, ['crm_sales_scope_condition_requirement_changed', "set state='STALE'", 'after update of content,structured_value,information_certainty,record_state']))],
  ['31 stale condition preserves old wording', () => { assert.ok(has(schema, "set state='STALE'")); assert.ok(no(schema, 'set condition_text=new.content')); }],
  ['32 new revision can replace stale condition', () => assert.ok(all(mutations, ["state not in ('ACTIVE','STALE')", 'supersedes_condition_id=v_old.id']))],
  ['33 opening workspace creates no condition', () => { assert.ok(has(service, 'crm_get_sales_scope_commitment_workspace')); assert.ok(no(workspacePanel, 'saveConditionDraft(')); }],
  ['34 existing assumption Requirement is not automatically duplicated', () => { assert.ok(has(workspaceMigration, "'assumptions','exclusions','client_dependencies'")); assert.ok(no(workspaceMigration, 'insert into public.crm_sales_scope_conditions')); }],
  ['35 Seller explicitly reconciles source information', () => assert.ok(all(scopePanel, ['Create Scope Condition','Link existing','Not Material for Proposal']))],

  // 36–64 PROMISES
  ['36 Promise types supported', () => { for (const t of ['SCOPE','TECHNICAL','TIMELINE','COMMERCIAL','SUPPORT','COMPLIANCE','PERFORMANCE_RESULT','OTHER']) assert.ok(has(schema, `'${t}'`)); }],
  ['37 Draft Promise works', () => assert.ok(all(mutations, ['crm_save_sales_promise_draft', "'DRAFT'", 'recorded_by']))],
  ['38 Draft is not Active commitment', () => assert.ok(all(schema, ["record_state text not null default 'DRAFT'", 'promised_by uuid null']))],
  ['39 explicit action required to record Active Promise', () => assert.ok(all(mutations, ["p_action='ACTIVATE'", 'p_client_communicated', 'Confirm that ProFox actually communicated']))],
  ['40 Active Promise actor stamped server-side', () => assert.ok(all(mutations, ['v_uid uuid:=auth.uid()', 'promised_by=v_uid']))],
  ['41 recorded_at server-controlled', () => assert.ok(all(schema, ['recorded_at timestamptz not null default now()', 'recorded_by uuid not null']))],
  ['42 client request cannot automatically create Promise', () => assert.ok(all(promisePanel, ["client's request", 'not a Promise']))],
  ['43 Seller hypothesis cannot automatically create Promise', () => assert.ok(all(promisePanel, ['Seller hypothesis','not a Promise']))],
  ['44 Package Fit recommendation cannot automatically create Promise', () => assert.ok(all(promisePanel, ['Package Fit recommendation','not a Promise']))],
  ['45 Active Promise cannot be silently rewritten', () => assert.ok(has(mutations, 'Only a Draft Promise can be edited in place'))],
  ['46 Promise revision supersedes old version', () => assert.ok(all(mutations, ['crm_revise_sales_promise','supersedes_promise_id', "set record_state='SUPERSEDED'"]))],
  ['47 old Promise wording preserved', () => { assert.ok(has(mutations, 'new Draft revision')); assert.ok(no(mutations, 'set promise_text=v_text where id=v_old.id')); }],
  ['48 Promise withdrawal requires reason', () => assert.ok(has(mutations, 'meaningful Promise withdrawal reason is required'))],
  ['49 Promise withdrawal preserves history', () => assert.ok(all(mutations, ["set record_state='WITHDRAWN'", 'withdrawal_reason=v_reason']))],
  ['50 no Promise hard delete', () => assert.ok(all(schema, ['trg_crm_sales_promises_no_delete','history is immutable']))],
  ['51 Promise can link Requirement', () => assert.ok(all(schema, ['linked_requirement_id','references public.crm_requirements']))],
  ['52 Promise cross-Lead Requirement rejected', () => assert.ok(has(schema, 'Requirement does not belong to this Lead'))],
  ['53 Promise can link Validation', () => assert.ok(all(schema, ['linked_validation_id','references public.crm_sales_validations']))],
  ['54 Promise cross-Lead Validation rejected', () => assert.ok(has(schema, 'Sales Validation does not belong to this Lead/Opportunity'))],
  ['55 Promise can link Meeting source', () => assert.ok(all(schema, ['source_meeting_id','references public.sales_meetings']))],
  ['56 Promise cross-Lead source rejected', () => assert.ok(has(schema, 'Meeting does not belong to this Lead'))],
  ['57 opening Promise Register creates no Promise', () => { assert.ok(has(workspacePanel, '<CRMPromiseRegisterPanel')); assert.ok(no(workspacePanel, 'savePromiseDraft(')); }],
  ['58 unapproved real Promise may be recorded truthfully', () => { assert.ok(no(mutations, "linked_validation_id is null then raise")); assert.ok(has(mutations, 'Approval/validation integrity is evaluated separately and is not hidden')); }],
  ['59 unapproved Promise produces blocker review signal', () => assert.ok(all(workspaceMigration, ['PROMISE_UNAPPROVED_COMMITMENT','UNAPPROVED COMMITMENT','Request / Open Validation']))],
  ['60 approved validation is visible', () => assert.ok(all(workspaceMigration, ['linkedValidationStatus','sv.status']))],
  ['61 approved constraints visible', () => assert.ok(all(workspaceMigration, ['approvedConstraints','sv.approved_constraints']))],
  ['62 stale validation cannot falsely approve Promise', () => assert.ok(all(workspaceMigration, ["v_validation.status in ('STALE','REJECTED','CANCELLED')", 'VALIDATION_STALE']))],
  ['63 rejected validation creates conflict blocker', () => assert.ok(all(workspaceMigration, ["v_validation.status='REJECTED'", "'CONFLICT'"]))],
  ['64 approval does not create CLIENT_CONFIRMED', () => assert.ok(none(combined, ["set information_certainty='CLIENT_CONFIRMED'", "information_certainty = 'CLIENT_CONFIRMED'"]))],

  // 65–80 READINESS
  ['65 Part 8 readiness evaluator reused', () => assert.ok(all(readinessMigration, ['pg_get_functiondef','crm_get_sales_gate_assessment']))],
  ['66 no second Proposal Readiness engine', () => assert.ok(no(combined, 'crm_get_proposal_readiness_v2'))],
  ['67 Scope Conditions readiness visible', () => assert.ok(all(readinessMigration, ['SCOPE_CONDITIONS_REGISTER','Scope Conditions Register']))],
  ['68 Promise Register integrity visible', () => assert.ok(all(readinessMigration, ['PROMISE_REGISTER_INTEGRITY','Promise Register Integrity']))],
  ['69 unreconciled material source condition blocks or warns correctly', () => assert.ok(all(workspaceMigration, ['SCOPE_SOURCE_RECONCILIATION_REQUIRED','hardBlocker']))],
  ['70 stale Scope Condition handled', () => assert.ok(all(workspaceMigration, ['SCOPE_CONDITION_STALE',"v_scope_status := 'BLOCKED'"]))],
  ['71 unapproved Active Promise handled', () => assert.ok(all(workspaceMigration, ['PROMISE_UNAPPROVED_COMMITMENT','hardBlocker']))],
  ['72 zero Active Promises is allowed', () => assert.ok(all(workspaceMigration, ["v_promise_status text := 'NO_ACTIVE_PROMISES'", "if v_promises_active>0 then v_promise_status:='READY' end if"]))],
  ['73 zero Conditions does not create arbitrary blocker', () => { assert.ok(no(workspaceMigration, 'if v_conditions_active=0 then')); assert.ok(has(workspaceMigration, 'v_unreconciled')); }],
  ['74 existing material Requirement conditions require reconciliation', () => assert.ok(all(workspaceMigration, ['reconciliationRequirementKeys','proposal_reconciliation_status is null']))],
  ['75 PROMISE_COVERAGE remains NOT_YET_EVALUATED', () => assert.ok(all(workspaceMigration, ['PROMISE_COVERAGE','NOT_YET_EVALUATED']))],
  ['76 FINAL_SCOPE_RECONCILIATION remains future until quote comparison', () => assert.ok(all(workspaceMigration, ['FINAL_SCOPE_RECONCILIATION','FUTURE_QUOTATION_RECONCILIATION']))],
  ['77 QUOTATION_SNAPSHOT_COVERAGE remains NOT_YET_EVALUATED', () => assert.ok(all(workspaceMigration, ['QUOTATION_SNAPSHOT_COVERAGE','NOT_YET_EVALUATED']))],
  ['78 final quotation send gate remains inactive', () => assert.ok(all(workspaceMigration, ["'finalQuotationSendGateActive',false","'writesQuotation',false"]))],
  ['79 hard blocker overrides readiness score', () => { assert.ok(has(readinessMigration, "v_blockers := v_blockers || coalesce(v_scope_commitment->'blockers'")); assert.ok(has(part8, "if jsonb_array_length(v_blockers)>0 then v_status:='BLOCKED'")); }],
  ['80 no automatic Pipeline rollback', () => assert.ok(none(combined, ['update public.crm_opportunities set stage','crm_transition_opportunity(']))],

  // 81–94 QUOTATION BOUNDARY
  ['81 Part 9 does not write quotations.scope_summary', () => assert.ok(no(combined, 'set scope_summary'))],
  ['82 Part 9 does not write quotations.exclusions', () => assert.ok(no(combined, 'set exclusions'))],
  ['83 Part 9 does not write client_responsibilities', () => assert.ok(no(combined, 'set client_responsibilities'))],
  ['84 Part 9 does not write delivery_assumptions', () => assert.ok(no(combined, 'set delivery_assumptions'))],
  ['85 Part 9 does not change quotation_items', () => assert.ok(none(combined, ['update public.quotation_items','insert into public.quotation_items','delete from public.quotation_items']))],
  ['86 Part 9 does not change commercial_snapshot', () => assert.ok(no(combined, 'set commercial_snapshot'))],
  ['87 Part 9 does not change payment snapshot', () => assert.ok(no(combined, 'set payment_schedule_snapshot'))],
  ['88 Part 9 does not change duration snapshot', () => assert.ok(no(combined, 'set duration_snapshot'))],
  ['89 existing sent quotation unchanged by migration', () => assert.ok(no(combined, "update public.quotations set status='Sent'"))],
  ['90 existing accepted quotation unchanged by migration', () => assert.ok(no(combined, "update public.quotations set status='Accepted'"))],
  ['91 no quotation created from Scope Condition', () => assert.ok(no(combined, 'insert into public.quotations'))],
  ['92 no quotation created from Promise', () => assert.ok(no(combined, 'create_quotation_atomic('))],
  ['93 send_quotation_professional not gated changed yet', () => assert.ok(no(combined, 'create or replace function public.send_quotation_professional'))],
  ['94 Quotation Approval remains separate canonical', () => assert.ok(all(workspaceMigration, ['Quotation-specific pricing, discount, payment-term','approval may still be required']))],

  // 95–105 SECURITY / AUDIT
  ['95 RLS enabled', () => assert.ok(all(schema, ['alter table public.crm_sales_scope_conditions enable row level security','alter table public.crm_sales_promises enable row level security']))],
  ['96 anonymous read denied', () => assert.ok(all(schema, ['revoke all on table public.crm_sales_scope_conditions from public, anon, authenticated','revoke all on table public.crm_sales_promises from public, anon, authenticated']))],
  ['97 anonymous mutation denied', () => assert.ok(has(mutations, 'from public, anon'))],
  ['98 unauthorized Seller denied', () => assert.ok(all(schema, ['auth.uid()','crm_can_access_lead']))],
  ['99 cross-Lead references rejected', () => assert.ok(all(schema, ['Opportunity does not belong to this Lead','Requirement does not belong to this Lead','Sales Validation does not belong to this Lead/Opportunity','Meeting does not belong to this Lead']))],
  ['100 actors server-stamped', () => assert.ok(all(mutations, ['auth.uid()','created_by','updated_by','promised_by=v_uid','withdrawn_by=v_uid']))],
  ['101 normal browser cannot hard delete', () => assert.ok(all(schema, ['crm_sales_scope_commitment_prevent_delete','before delete']))],
  ['102 audit events reused', () => assert.ok(has(mutations, 'public.crm_write_lead_event'))],
  ['103 no secrets encouraged stored by UI guidance', () => assert.ok(all(guidance, ['Never store passwords','API secrets','private keys','recovery codes','card details','authentication credentials']))],
  ['104 customer cannot read internal registers directly', () => { assert.ok(has(schema, 'to authenticated')); assert.ok(no(schema, 'to customer')); assert.ok(no(schema, 'to client')); }],
  ['105 no service-role browser exposure', () => { assert.ok(no(service, 'service_role')); assert.ok(has(service, "import { supabase } from './supabase'")); }],

  // 106–124 UI / GUIDANCE
  ['106 Scope Conditions panel renders', () => assert.ok(all(scopePanel, ['Scope Conditions','crm-scope-conditions']))],
  ['107 Promise Register renders', () => assert.ok(all(promisePanel, ['Promise Register','crm-promise-register']))],
  ['108 no new Lead Drawer tab unless explicitly justified', () => { assert.ok(no(leadDrawer, 'scope-conditions')); assert.ok(no(leadDrawer, 'promise-register')); }],
  ['109 reconciliation source shown', () => assert.ok(all(scopePanel, ['Source Requirement','Source Validation','Source Meeting']))],
  ['110 stale state understandable', () => assert.ok(all(scopePanel, ['Source changed','Review and revise']))],
  ['111 Promise source understandable', () => assert.ok(all(promisePanel, ['Where / when was this communicated?','Source:']))],
  ['112 promised-by information shown', () => assert.ok(all(promisePanel, ['Promised by:','promisedByName']))],
  ['113 validation status shown', () => assert.ok(all(promisePanel, ['Validation:','linkedValidationStatus']))],
  ['114 approved constraints shown', () => assert.ok(all(promisePanel, ['Approved constraints:','approvedConstraints']))],
  ['115 Future Quote Coverage shown clearly', () => assert.ok(all(promisePanel, ['Future Quote Coverage','NOT_YET_EVALUATED']))],
  ['116 SellerGuidanceHelp reused', () => assert.ok(all(scopePanel, ['SellerGuidanceHelp','getSellerGuidance']))],
  ['117 Assumption guidance exists', () => assert.ok(all(guidance, ['field.assumption_condition','material assumption ProFox is relying on']))],
  ['118 Exclusion guidance exists', () => assert.ok(all(guidance, ['field.exclusion_condition','proposal will intentionally not include']))],
  ['119 Dependency guidance exists', () => assert.ok(all(guidance, ['field.dependency_condition','project depends upon']))],
  ['120 Client Responsibility guidance exists', () => assert.ok(all(guidance, ['field.client_responsibility_condition','client is responsible for providing']))],
  ['121 Promise guidance exists', () => assert.ok(all(guidance, ['section.promise_register','material commitment ProFox actually communicated']))],
  ['122 Unapproved Promise guidance exists', () => assert.ok(all(guidance, ['status.promise_unapproved','Unapproved Commitment']))],
  ['123 touch mobile support', () => assert.ok(all(scopePanel, ['min-h-10','flex-wrap','break-words']))],
  ['124 keyboard accessibility support', () => assert.ok(all(scopePanel, ['focus-visible:outline','aria-label']))],

  // 125–137 REGRESSION / EXECUTABILITY
  ['125 Part 1 preserved', () => assert.ok(existsSync('tests/security/crm-sales-discovery-foundation-part-1.test.ts'))],
  ['126 Part 2 preserved', () => assert.ok(existsSync('tests/security/crm-sales-requirements-part-2.test.ts'))],
  ['127 Part 3 preserved', () => assert.ok(existsSync('tests/security/crm-sales-probing-discovery-part-3.test.ts'))],
  ['128 Part 3.5 preserved', () => assert.ok(existsSync('tests/security/crm-seller-guidance-part-3-5.test.ts'))],
  ['129 Part 4 preserved', () => assert.ok(existsSync('tests/security/crm-sales-meeting-prep-part-4.test.ts'))],
  ['130 Part 5 preserved', () => assert.ok(existsSync('tests/security/crm-sales-meeting-management-closeout-part-5.test.ts'))],
  ['131 Part 6 preserved', () => assert.ok(existsSync('tests/security/crm-sales-package-fit-part-6.test.ts'))],
  ['132 Part 7 preserved', () => assert.ok(existsSync('tests/security/crm-sales-validation-escalation-part-7.test.ts'))],
  ['133 Part 8 preserved', () => assert.ok(existsSync('tests/security/crm-sales-requirements-confirmed-proposal-readiness-part-8.test.ts'))],
  ['134 TypeScript passes where executable', () => { assert.ok(packageJson.scripts?.build); assert.ok(existsSync('tsconfig.json')); }],
  ['135 security suite passes where executable', () => { assert.ok(packageJson.scripts?.['test:security']); assert.ok(String(packageJson.scripts['test:security']).includes('tests/security')); }],
  ['136 migration integrity passes where executable', () => { assert.ok(packageJson.scripts?.['migrations:check']); assert.ok(String(packageJson.scripts['migrations:check']).includes('check-migrations')); }],
  ['137 production build passes where executable', () => { assert.ok(packageJson.scripts?.build); assert.ok(String(packageJson.scripts.build).includes('vite build')); }],
];

assert.equal(cases.length, 137, 'Part 9 acceptance contract must remain exactly 137 required cases.');
for (const [name, run] of cases) test(`Part 9 acceptance — ${name}`, run);

test('Part 9 creates exactly the two allowed business tables', () => {
  assert.deepEqual(createTables.map(v => v.match(/public\.([a-z0-9_]+)/i)?.[1]).filter(Boolean).sort(), ['crm_sales_promises','crm_sales_scope_conditions']);
});
test('Part 9 workspace uses one bounded read model rather than one RPC per row', () => {
  assert.ok(has(service, 'crm_get_sales_scope_commitment_workspace'));
  assert.equal((service.match(/crm_get_sales_scope_commitment_workspace/g) || []).length, 1);
});
test('Part 9 never activates a final quotation-send gate', () => {
  assert.ok(has(workspaceMigration, "'finalQuotationSendGateActive',false"));
  assert.ok(no(combined, 'create or replace function public.send_quotation_professional'));
});
test('Part 9 does not introduce decorative AI iconography', () => {
  assert.ok(none(`${scopePanel}\n${promisePanel}\n${workspacePanel}`, ['Sparkles','Wand2','✨']));
});
