import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20260916121000_crm_sales_final_quotation_send_gate_part10b_foundation.sql');
const hardening = read('supabase/migrations/20260916123500_crm_sales_final_send_snapshot_forge_hardening.sql');
const service = read('src/lib/quotationSalesReconciliationService.ts');
const panel = read('src/components/admin/QuotationSalesReconciliationPanel.tsx');
const wrapper = read('src/components/admin/QuotationWorkspace.tsx');
const base = read('src/components/admin/QuotationWorkspaceBase.tsx');
const guidance = read('src/lib/quotationSalesReconciliationGuidance.ts');
const catalog = read('supabase/migrations/20260915154800_sales_catalog_clarity_repository_reconciliation.sql');

const checks = [
  ['minimal snapshot JSON column', migration, 'sales_scope_snapshot jsonb'],
  ['minimal snapshot time column', migration, 'sales_scope_snapshot_at timestamptz'],
  ['minimal snapshot schema column', migration, 'sales_scope_snapshot_schema_version integer'],
  ['canonical reconciliation policy reused', migration, "crm_quotation_sales_reconciliation_policy_v1"],
  ['policy evolves to version 2', migration, "'{policyVersion}', '2'::jsonb"],
  ['foundation deliberately stays inactive', migration, "'{finalQuotationSendGateActive}', 'false'::jsonb"],
  ['canonical evaluator evolved in place', migration, "pg_get_functiondef('public.crm_get_quotation_sales_reconciliation(uuid)'::regprocedure)"],
  ['no evaluator v2 fork', migration, 'supports both staged (false) and active (true)'],
  ['coverage remediation remains available when active', migration, 'keeps canonical coverage remediation available while the final gate is active'],
  ['snapshot builder remains canonical', migration, 'create or replace function public.crm_build_quotation_sales_scope_snapshot'],
  ['snapshot schema version is 2', migration, "'snapshotSchemaVersion',2"],
  ['snapshot includes quotation revision', migration, "'quotationRevision',v_q.revision_number"],
  ['snapshot includes active scope conditions', migration, "'activeScopeConditions',v_scope"],
  ['snapshot includes active promises', migration, "'activePromises',v_promises"],
  ['snapshot includes coverage mappings', migration, "'coverageMappings',v_coverage_refs"],
  ['snapshot includes current approved specialist constraints', migration, "'currentApprovedSpecialistConstraints'"],
  ['snapshot includes validation references', migration, "'relevantValidations'"],
  ['snapshot includes Promise Coverage result', migration, "'promiseCoverageResult'"],
  ['snapshot includes Final Scope Reconciliation result', migration, "'finalScopeReconciliationResult'"],
  ['snapshot has pre-send state', migration, "'snapshotCoverageState',v_assessment->>'snapshotCoverageState'"],
  ['snapshot excludes full seller guidance', migration, 'catalogSnapshotRef'],
  ['catalog item version referenced', migration, 'catalogVersionSnapshot'],
  ['existing item catalog snapshot columns remain canonical', catalog, 'catalog_snapshot jsonb'],
  ['existing catalog version snapshot remains canonical', catalog, 'catalog_version_snapshot integer'],
  ['CPQ summary evolved additively', migration, 'create or replace function public.get_quotation_cpq_summary'],
  ['CPQ keeps existing sensitive authority', migration, 'get_quotation_cpq_summary_sensitive_internal'],
  ['CPQ exposes sales reconciliation', migration, "'salesReconciliation',v_reconciliation"],
  ['CPQ exposes snapshot metadata', migration, "'salesScopeSnapshot',v_snapshot_meta"],
  ['CPQ exposes final gate flag', migration, "'finalSendGateActive',v_gate_active"],
  ['CPQ exposes exact blockers', migration, "'finalSendBlockers',v_sales_blockers"],
  ['CPQ only combines Sales gate when active', migration, 'if v_gate_active then'],
  ['one canonical shared send assertion', migration, 'create or replace function public.crm_assert_quotation_send_ready'],
  ['assertion requires authenticated actor', migration, 'Authentication is required to send a quotation'],
  ['assertion enforces ownership or Admin', migration, 'Authorized quotation ownership is required'],
  ['assertion rejects superseded quotation', migration, 'Superseded quotation revisions cannot be sent'],
  ['assertion requires Approved', migration, 'Only an Approved quotation can be sent'],
  ['assertion consumes CPQ readiness', migration, "v_cpq:=public.get_quotation_cpq_summary"],
  ['assertion consumes canonical reconciliation', migration, "v_reconciliation:=v_cpq->'salesReconciliation'"],
  ['no score bypass', migration, 'final Sales reconciliation is not ready to snapshot'],
  ['server-only capture helper', migration, 'crm_capture_quotation_sales_scope_snapshot'],
  ['capture calls shared assertion', migration, 'v_assertion:=public.crm_assert_quotation_send_ready'],
  ['capture calls canonical builder', migration, 'v_snapshot:=public.crm_build_quotation_sales_scope_snapshot'],
  ['capture stamps server time', migration, 'statement_timestamp()'],
  ['capture stamps server actor', migration, "'sendAuthorizedBy',auth.uid()"],
  ['capture marks snapshot captured', migration, "'snapshotCoverageState','SNAPSHOT_CAPTURED'"],
  ['capture marks snapshot dimension PASS', migration, "'quotationSnapshotCoverageResult',jsonb_build_object('key','QUOTATION_SNAPSHOT_COVERAGE','status','PASS'"],
  ['capture records no send-time blockers on pass', migration, "'sendTimeBlockers','[]'::jsonb"],
  ['central transition protection evolved', migration, 'create or replace function public.protect_quotation_transition'],
  ['Sent transition condition centralized', migration, "old.status<>'Sent' and new.status='Sent'"],
  ['same-statement material mutation rejected', migration, 'Material quotation content cannot be changed in the same statement that sends the quotation'],
  ['server attaches snapshot to NEW row', migration, 'new.sales_scope_snapshot:=v_snapshot'],
  ['server attaches snapshot time', migration, 'new.sales_scope_snapshot_at:=statement_timestamp()'],
  ['server attaches snapshot schema', migration, 'new.sales_scope_snapshot_schema_version:=2'],
  ['foundation snapshot mutation rejected', migration, 'Quotation Sales scope snapshot is server-controlled and immutable'],
  ['revision is correction path in error', migration, 'Create a quotation revision for corrections'],
  ['Admin bypass remains after central invariant', migration, 'if public.is_admin() then return new; end if'],
  ['atomic bypass remains after central invariant', migration, "if v_atomic='1' then return new; end if"],
  ['browser cannot execute capture helper', migration, 'from public, anon, authenticated'],
  ['capture helper only service role', migration, 'grant execute on function public.crm_capture_quotation_sales_scope_snapshot(uuid) to service_role'],
  ['trusted functions use fixed empty search path', migration, "set search_path=''"],
  ['hardening keeps canonical transition function', hardening, 'create or replace function public.protect_quotation_transition'],
  ['hardening rejects every incoming snapshot mutation', hardening, 'if v_snapshot_changed then'],
  ['hardening rejection precedes Sent transition logic', hardening, 'No browser/Admin/ordinary RPC caller may submit, clear or rewrite snapshot authority'],
  ['hardening retains server capture after incoming check', hardening, 'new.sales_scope_snapshot:=v_snapshot'],
  ['hardening retains Admin invariant ordering', hardening, 'if public.is_admin() then return new; end if'],
  ['hardening retains atomic invariant ordering', hardening, "if v_atomic='1' then return new; end if"],
  ['service gate flag is dynamic boolean', service, 'finalQuotationSendGateActive: boolean'],
  ['service exposes snapshot metadata', service, 'QuotationSalesScopeSnapshotMetadata'],
  ['service snapshot persisted state is dynamic', service, 'persisted: boolean'],
  ['panel shows Part 10B identity', panel, 'Part 10B · Final quotation integrity'],
  ['panel shows active gate state', panel, 'FINAL SEND GATE — ACTIVE'],
  ['panel shows staged state', panel, 'FINAL SEND GATE — STAGED / NOT ACTIVE'],
  ['panel shows exact blocker count', panel, 'final blocker'],
  ['panel shows Ready to Send', panel, 'Ready to Send'],
  ['panel shows Ready to freeze', panel, 'Ready to freeze'],
  ['panel shows captured immutable state', panel, 'Captured / immutable'],
  ['panel hides raw snapshot JSON', panel, 'Raw snapshot JSON is intentionally not exposed here'],
  ['panel preserves canonical coverage editor', panel, 'Save Review'],
  ['panel preserves canonical target action', panel, 'Open / Edit target'],
  ['panel shows Proposal Readiness', panel, 'Proposal Readiness'],
  ['panel shows Scope Reconciliation', panel, 'Scope Reconciliation'],
  ['panel shows Promise Coverage', panel, 'Promise Coverage'],
  ['panel shows Package alignment', panel, 'Package alignment'],
  ['panel surfaces remediation', panel, 'Resolution:'],
  ['wrapper preserves canonical quotation editor', wrapper, '<QuotationWorkspaceBase />'],
  ['wrapper reuses existing reconciliation panel', wrapper, '<QuotationSalesReconciliationPanel'],
  ['canonical base still owns Send Quotation', base, 'Send Quotation'],
  ['canonical base still gates send from readyToSend', base, 'disabled={!readiness?.readyToSend}'],
  ['guidance includes active gate help', guidance, 'status.final_send_gate_active'],
  ['guidance includes blocked help', guidance, 'status.final_send_blocked'],
  ['guidance includes ready snapshot help', guidance, 'status.ready_to_snapshot'],
  ['guidance includes captured snapshot help', guidance, 'status.snapshot_captured'],
  ['guidance includes final blockers help', guidance, 'field.final_send_blockers'],
  ['guidance includes snapshot boundary help', guidance, 'field.sales_scope_snapshot'],
  ['guidance includes resolve action', guidance, 'action.resolve_send_blocker'],
  ['guidance includes canonical send action', guidance, 'action.send_quotation'],
  ['guidance includes immutable snapshot help', guidance, 'field.immutable_send_snapshot'],
];

for (const [index, [name, source, token]] of checks.entries()) {
  test(`${String(index + 1).padStart(3, '0')} · ${name}`, () => {
    assert.ok(source.includes(token), `Expected source contract to include: ${token}`);
  });
}

test('architecture · no duplicate quotation Sales snapshot table', () => {
  assert.equal(/create\s+table\s+(?:public\.)?(?:quotation_sales_snapshot|proposal_snapshot_v2)/i.test(migration), false);
});

test('architecture · no second reconciliation policy key', () => {
  assert.equal(migration.includes('crm_quotation_sales_reconciliation_policy_v2'), false);
});

test('architecture · no second evaluator function', () => {
  assert.equal(migration.includes('crm_get_quotation_sales_reconciliation_v2'), false);
});

test('architecture · no send workflow v2', () => {
  assert.equal(migration.includes('send_quotation_professional_v2'), false);
});

test('security · no ordinary bypass parameter', () => {
  for (const token of ['force=true', 'adminBypass', 'skipSalesGate', 'ignoreReconciliation']) {
    assert.equal(migration.includes(token), false);
    assert.equal(hardening.includes(token), false);
  }
});

test('security · caller snapshot mutation is rejected before server capture', () => {
  assert.ok(hardening.indexOf('if v_snapshot_changed then') < hardening.indexOf("old.status<>'Sent' and new.status='Sent'"));
});

test('privacy · seller_guidance is never copied into Part 10B snapshot SQL', () => {
  assert.equal(/seller_guidance/i.test(migration), false);
  assert.equal(/seller_guidance/i.test(hardening), false);
});

test('boundary · commercial_snapshot is not overloaded', () => {
  assert.equal(/commercial_snapshot/i.test(migration), false);
});

test('boundary · no fake Scope, Promise or coverage business rows are inserted', () => {
  const sql = `${migration}\n${hardening}`;
  assert.equal(/insert\s+into\s+public\.crm_sales_scope_conditions/i.test(sql), false);
  assert.equal(/insert\s+into\s+public\.crm_sales_promises/i.test(sql), false);
  assert.equal(/insert\s+into\s+public\.quotation_sales_coverage/i.test(sql), false);
});

test('ordering · universal Sent invariant appears before Admin bypass', () => {
  assert.ok(hardening.indexOf("old.status<>'Sent' and new.status='Sent'") < hardening.indexOf('if public.is_admin() then return new; end if'));
});

test('ordering · universal Sent invariant appears before atomic-RPC bypass', () => {
  assert.ok(hardening.indexOf("old.status<>'Sent' and new.status='Sent'") < hardening.indexOf("if v_atomic='1' then return new; end if"));
});

test('rollout · foundation policy update keeps production gate false', () => {
  assert.ok(migration.includes("'{finalQuotationSendGateActive}', 'false'::jsonb"));
  assert.ok(migration.includes('foundation intentionally ends with activation false'));
  assert.equal(/\{finalQuotationSendGateActive\}',\s*'true'::jsonb/i.test(migration), false);
});

test('coverage · Part 10B suite has broad contract coverage', () => {
  assert.ok(checks.length >= 95, `Expected at least 95 Part 10B contract checks; found ${checks.length}.`);
});
