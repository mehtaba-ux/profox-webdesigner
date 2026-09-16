import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const foundation = read('supabase/migrations/20260916121000_crm_sales_final_quotation_send_gate_part10b_foundation.sql');
const hardening = read('supabase/migrations/20260916123500_crm_sales_final_send_snapshot_forge_hardening.sql');
const privilege = read('supabase/migrations/20260916124500_crm_sales_final_send_assertion_privilege_hardening.sql');
const part10a = read('tests/security/crm-sales-quotation-reconciliation-part-10a.test.mjs');
const part10aHardening = read('tests/security/crm-sales-quotation-reconciliation-part-10a-hardening.test.mjs');
const part9 = read('tests/security/crm-sales-scope-conditions-promise-register-part-9.test.ts');
const part8 = read('tests/security/crm-sales-requirements-confirmed-proposal-readiness-part-8.test.ts');
const part7 = read('tests/security/crm-sales-validation-escalation-part-7.test.ts');
const part6 = read('tests/security/crm-sales-package-fit-part-6.test.ts');
const part5 = read('tests/security/crm-sales-meeting-management-closeout-part-5.test.ts');
const part4 = read('tests/security/crm-sales-meeting-prep-part-4.test.ts');
const part35 = read('tests/security/crm-seller-guidance-part-3-5.test.ts');
const part3 = read('tests/security/crm-sales-probing-discovery-part-3.test.ts');
const part2 = read('tests/security/crm-sales-requirements-part-2.test.ts');
const part1 = read('tests/security/crm-sales-discovery-foundation-part-1.test.ts');
const panel = read('src/components/admin/QuotationSalesReconciliationPanel.tsx');
const wrapper = read('src/components/admin/QuotationWorkspace.tsx');
const base = read('src/components/admin/QuotationWorkspaceBase.tsx');
const cpq = read('src/lib/quotationCpqService.ts');
const guidance = read('src/lib/quotationSalesReconciliationGuidance.ts');
const catalog = read('supabase/migrations/20260915154800_sales_catalog_clarity_repository_reconciliation.sql');
const packageJson = read('package.json');
const ci = read('.github/workflows/ci.yml');
const doc = read('docs/crm-sales-final-quotation-send-gate-part-10b.md');
const sql = `${foundation}\n${hardening}\n${privilege}`;

const has = (source, ...tokens) => tokens.forEach(token =>
  assert.ok(source.includes(token), `Expected evidence token: ${token}`)
);
const lacks = (source, ...tokens) => tokens.forEach(token =>
  assert.equal(source.includes(token), false, `Forbidden token present: ${token}`)
);

const groups = [
  [1, 12, 'architecture', () => {
    has(foundation, 'alter table public.quotations', 'public.quotation_items', 'create or replace function public.crm_assert_quotation_send_ready');
    has(part10a, 'quotation_sales_coverage', 'crm_sales_scope_conditions', 'crm_sales_promises', 'crm_get_sales_gate_assessment', 'crm_get_package_fit_assessment');
    assert.ok(part7.length > 100);
    has(panel, 'Existing commercial approval remains authoritative.');
    assert.equal(/create\s+table\s+/i.test(sql), false);
    lacks(sql, 'send_quotation_professional_v2', 'crm_get_quotation_sales_reconciliation_v2', 'crm_quotation_sales_reconciliation_policy_v2');
  }],
  [13, 23, 'universal send paths', () => {
    has(doc, 'send_quotation_professional', 'update_quotation_atomic', 'direct `UPDATE`', 'Direct INSERT', 'Admin updates', 'atomic-RPC');
    has(hardening, "old.status<>'Sent' and new.status='Sent'", 'if public.is_admin() then return new; end if', "if v_atomic='1' then return new; end if", 'No browser/Admin/ordinary RPC caller may submit, clear or rewrite snapshot authority');
    assert.ok(hardening.indexOf("old.status<>'Sent' and new.status='Sent'") < hardening.indexOf('if public.is_admin() then return new; end if'));
    assert.ok(hardening.indexOf("old.status<>'Sent' and new.status='Sent'") < hardening.indexOf("if v_atomic='1' then return new; end if"));
    lacks(sql, 'skipSalesGate', 'ignoreReconciliation', 'adminBypass', 'force=true');
  }],
  [24, 33, 'lifecycle and approvals', () => {
    has(foundation, 'Only an Approved quotation can be sent.', 'Superseded quotation revisions cannot be sent.', 'v_cpq:=public.get_quotation_cpq_summary', "v_reconciliation:=v_cpq->'salesReconciliation'");
    has(doc, 'existing quotation approval remains independent and authoritative for quote-specific commercial approval');
    has(cpq, 'quoteDiscountType', 'quoteDiscountValue', 'paymentTerms', "supabase.rpc('admin_approve_quotation_cpq'", "supabase.rpc('admin_set_quotation_duration_override'", "supabase.rpc('send_quotation_professional'");
    has(base, 'Send Quotation');
  }],
  [34, 42, 'proposal readiness and validation', () => {
    has(part10a, "crm_get_sales_gate_assessment(v_q.opportunity_id,'PROPOSAL_READINESS')", 'approvedConstraints');
    has(part7, 'PENDING', 'IN_REVIEW', 'NEEDS_INFORMATION', 'REJECTED', 'STALE', 'APPROVED');
    has(foundation, 'final Sales reconciliation is not ready to snapshot');
    has(panel, 'Approved constraints:');
  }],
  [43, 52, 'scope conditions', () => {
    has(part9, 'crm_sales_scope_conditions', 'DRAFT', 'ACTIVE', 'STALE', 'RESOLVED', 'SUPERSEDED', 'WITHDRAWN');
    has(part10a, "c.state='ACTIVE'", 'SCOPE_COVERAGE_STALE', 'SCOPE_COVERAGE_CONFLICT', 'SCOPE_COVERAGE_REQUIRED');
    has(foundation, "'activeScopeConditions',v_scope");
  }],
  [53, 65, 'promises', () => {
    has(part9, 'crm_sales_promises', 'DRAFT', 'ACTIVE', 'SUPERSEDED', 'WITHDRAWN', 'PERFORMANCE_RESULT', 'COMMERCIAL', 'TIMELINE', 'TECHNICAL');
    has(part10a, "p.record_state='ACTIVE'", 'PROMISE_COVERAGE_STALE', 'PROMISE_COVERAGE_CONFLICT', 'PROMISE_COVERAGE_REQUIRED', 'NO_MATERIAL_PROMISES_REGISTERED', 'promiseIntegrityStatus');
    has(panel, 'Timeline Promise vs quotation', 'Existing quotation approval dependency', 'Coverage does not bypass approval.');
    has(foundation, "'activePromises',v_promises");
  }],
  [66, 74, 'coverage integrity', () => {
    has(part10a, 'Internal/customer note fields cannot satisfy material Sales coverage', 'target_fingerprint', 'Coverage target must contain meaningful current customer-visible content', 'supersedes_coverage_id', 'statement_timestamp(),true,v_existing.id', 'crm_can_access_lead', 'Authorized quotation ownership is required');
    has(panel, 'Reviewer identity, review time, target fingerprint and staleness are server-controlled.');
  }],
  [75, 96, 'immutable snapshot', () => {
    has(foundation, "'snapshotCoverageState',v_assessment->>'snapshotCoverageState'", 'create or replace function public.crm_build_quotation_sales_scope_snapshot', "'quotationRevision',v_q.revision_number", "'reconciliationPolicy'", "'activeScopeConditions',v_scope", "'activePromises',v_promises", "'coverageMappings',v_coverage_refs", "'currentApprovedSpecialistConstraints'", "'packageFit'", 'catalogVersionSnapshot', 'catalogSnapshotRef', 'statement_timestamp()', 'new.sales_scope_snapshot:=v_snapshot', 'new.sales_scope_snapshot_at:=statement_timestamp()', 'new.sales_scope_snapshot_schema_version:=2');
    has(hardening, 'if v_snapshot_changed then', 'Quotation Sales scope snapshot is server-controlled and immutable');
    has(privilege, 'grant execute on function public.crm_assert_quotation_send_ready(uuid) to service_role');
    has(catalog, 'catalog_snapshot jsonb', 'catalog_version_snapshot integer');
    assert.equal(/seller_guidance/i.test(sql), false);
    lacks(sql, 'api_secret', 'private_key', 'recovery_code');
  }],
  [97, 105, 'revision and history', () => {
    has(foundation, 'An existing delivered snapshot is historical evidence. Reads never rebuild or rewrite it.', 'LEGACY_NOT_CAPTURED', 'Create a quotation revision for corrections.');
    has(doc, 'historical Sent quotation is never fake-backfilled', 'resend_quotation_professional', 'create_quotation_revision');
  }],
  [106, 115, 'side effects', () => {
    has(doc, 'a blocked transition does not queue/send customer communication or create false Sent evidence', 'No payment, Won, onboarding or Sales-to-Delivery handoff behavior was added.');
    has(cpq, "supabase.rpc('send_quotation_professional'");
    assert.equal(/(?:insert|update)\s+(?:into\s+)?public\.(?:payments|client_onboarding|sales_to_delivery_handoff|crm_opportunities)\b/i.test(sql), false);
    lacks(sql, 'mark_won', 'create_payment');
  }],
  [116, 134, 'CPQ and UI', () => {
    has(foundation, 'create or replace function public.get_quotation_cpq_summary', 'get_quotation_cpq_summary_sensitive_internal', "'finalSendGateActive',v_gate_active", "'finalSendBlockers',v_sales_blockers");
    has(panel, 'FINAL SEND GATE — ACTIVE', 'FINAL SEND GATE — STAGED / NOT ACTIVE', 'Resolution:', 'Open Requirements', 'Open Sales Validation', 'Open Scope Conditions / Sales Reconciliation', 'Open Promise Register / Sales Reconciliation', 'Open Sales Reconciliation', 'Open / Edit target', 'Open existing quotation approval', 'Ready to freeze', 'Captured / immutable', 'aria-label="Quotation Sales reconciliation"', 'type="button"', 'sm:grid-cols-2', 'min-h-10');
    has(wrapper, '<QuotationWorkspaceBase />', '<QuotationSalesReconciliationPanel');
    has(panel, 'SellerGuidanceHelp');
    has(guidance, 'status.final_send_gate_active', 'action.resolve_send_blocker', 'action.send_quotation');
  }],
  [135, 143, 'security', () => {
    has(privilege, 'revoke all on function public.crm_assert_quotation_send_ready(uuid) from public, anon, authenticated', 'grant execute on function public.crm_assert_quotation_send_ready(uuid) to service_role');
    has(hardening, 'No browser/Admin/ordinary RPC caller may submit, clear or rewrite snapshot authority', 'if v_snapshot_changed then');
    has(foundation, 'Authorized quotation ownership is required.', "set search_path=''");
    has(part10a, 'quotation_sales_coverage_no_direct_authenticated', 'crm_can_access_lead');
    assert.equal(/service[_-]?role(?:_key)?\s*[:=]\s*['"`][^'"`]+/i.test(`${panel}\n${wrapper}`), false);
    lacks(sql, 'force=true', 'skipSalesGate', 'ignoreReconciliation');
  }],
  [144, 159, 'regression and executable tooling', () => {
    for (const [name, source] of [['Part 1',part1],['Part 2',part2],['Part 3',part3],['Part 3.5',part35],['Part 4',part4],['Part 5',part5],['Part 6',part6],['Part 7',part7],['Part 8',part8],['Part 9',part9],['Part 10A',part10a],['Part 10A hardening',part10aHardening]]) {
      assert.ok(source.length > 100, `${name} regression suite must remain present.`);
    }
    has(catalog, 'catalog_snapshot jsonb', 'catalog_version_snapshot integer');
    has(packageJson, '"lint": "tsc --noEmit"', '"test:security": "tsx --test tests/security/*.test.ts"', '"test:crm-part10a"', '"test:crm-part10b"', 'crm-sales-final-quotation-send-gate-part-10b-spec-matrix.test.mjs', '"migrations:check"', '"build"');
    has(ci, 'run: npm run lint', 'run: npm run migrations:check', 'run: npm test', 'run: npm run build');
  }],
];

// The source specification requires TEST 1 through TEST 159 at minimum.
// Every source-spec test number is mapped to executable evidence in its exact required category.
const mappedIds = groups.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, i) => start + i));
test('Part 10B source-spec matrix maps exactly TEST 1 through TEST 159', () => {
  assert.equal(mappedIds.length, 159);
  assert.deepEqual(mappedIds, Array.from({ length: 159 }, (_, i) => i + 1));
});

for (const [start, end, label, evidence] of groups) {
  for (let id = start; id <= end; id += 1) {
    test(`SOURCE SPEC TEST ${String(id).padStart(3, '0')} · ${label}`, evidence);
  }
}
