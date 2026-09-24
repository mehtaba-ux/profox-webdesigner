import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration1 = read('supabase/migrations/native-history/20260910124932_crm_sales_quotation_reconciliation_part10a.sql');
const migration2 = read('supabase/migrations/native-history/20260910125143_crm_sales_quotation_reconciliation_assessment_part10a.sql');
const service = read('src/lib/quotationSalesReconciliationService.ts');
const panel = read('src/components/admin/QuotationSalesReconciliationPanel.tsx');
const wrapper = read('src/components/admin/QuotationWorkspace.tsx');
const base = read('src/components/admin/QuotationWorkspaceBase.tsx');
const cpq = read('src/lib/quotationCpqService.ts');
const docs = read('docs/crm-sales-quotation-reconciliation-part-10a.md');
const frontend = [service, panel, wrapper, docs].join('\n');

const positiveGroups = [
  ['schema/security', migration1, [
    'create table public.quotation_sales_coverage',
    'quotation_id uuid not null references public.quotations',
    'scope_condition_id uuid references public.crm_sales_scope_conditions',
    'promise_id uuid references public.crm_sales_promises',
    'quotation_sales_coverage_one_source',
    'quotation_sales_coverage_status_check',
    'quotation_sales_coverage_target_type_check',
    'quotation_sales_coverage_target_shape_check',
    'quotation_sales_coverage_current_scope_uq',
    'quotation_sales_coverage_current_promise_uq',
    'quotation_sales_coverage_quote_idx',
    'quotation_sales_coverage_item_idx',
    'enable row level security',
    'quotation_sales_coverage_no_direct_authenticated',
    'using (false)',
    'with check (false)',
    'revoke all on table public.quotation_sales_coverage from public, anon, authenticated',
    'reviewed_by uuid not null references public.user_profiles',
    'reviewed_at timestamptz not null default statement_timestamp()',
    'supersedes_coverage_id uuid references public.quotation_sales_coverage',
    'target_fingerprint text',
    'target_excerpt text',
    'coverage_note text',
    'is_current boolean not null default true',
    'on delete set null',
  ]],
  ['policy/target map', migration1, [
    'crm_quotation_sales_reconciliation_policy_v1',
    "'policyVersion',1",
    "'finalQuotationSendGateActive',false",
    "'allowNotApplicable',false",
    "'UNMAPPED','PARTIAL','COVERED','CONFLICT','STALE','NOT_APPLICABLE'",
    "'reviewableStatuses',jsonb_build_array('PARTIAL','COVERED','CONFLICT')",
    "'scope_summary'",
    "'exclusions'",
    "'client_responsibilities'",
    "'delivery_assumptions'",
    "'handover_support'",
    "'terms_and_conditions'",
    "'payment_terms'",
    "'duration_snapshot_text'",
    "'internal_notes','customer_notes'",
    "'ASSUMPTION',jsonb_build_array('delivery_assumptions')",
    "'EXCLUSION',jsonb_build_array('exclusions')",
    "'CLIENT_RESPONSIBILITY',jsonb_build_array('client_responsibilities')",
    "'DEPENDENCY',jsonb_build_array('delivery_assumptions','client_responsibilities','scope_summary','terms_and_conditions')",
    "'SCOPE_BOUNDARY',jsonb_build_array('scope_summary','QUOTATION_ITEM','terms_and_conditions')",
    "'SCOPE',jsonb_build_array('scope_summary','QUOTATION_ITEM','terms_and_conditions')",
    "'TECHNICAL',jsonb_build_array('QUOTATION_ITEM','scope_summary','terms_and_conditions')",
    "'TIMELINE',jsonb_build_array('duration_snapshot_text','terms_and_conditions')",
    "'COMMERCIAL',jsonb_build_array('payment_terms','terms_and_conditions')",
    "'SUPPORT',jsonb_build_array('handover_support','QUOTATION_ITEM')",
    "'COMPLIANCE',jsonb_build_array('scope_summary','terms_and_conditions')",
    "'PERFORMANCE_RESULT',jsonb_build_array('scope_summary','terms_and_conditions')",
    "'OTHER',jsonb_build_array('scope_summary','QUOTATION_ITEM','terms_and_conditions')",
    "'historicalStatuses',jsonb_build_array('Sent','Accepted','Rejected','Expired')",
  ]],
  ['review mutation', migration1, [
    'crm_review_quotation_sales_coverage',
    'v_uid uuid:=auth.uid()',
    'Authentication is required for quotation Sales reconciliation',
    'Authorized quotation ownership is required',
    'Superseded quotation revisions are read-only',
    'Coverage review is available only before a quotation is delivered',
    'Quotation must be connected to a CRM opportunity',
    'crm_can_access_lead',
    'Part 10A policy must keep final quotation send enforcement inactive',
    'Only a current Active Scope Condition can be reviewed',
    'Only a current Active Promise can be reviewed',
    'This quotation field is not an eligible coverage target',
    'Internal/customer note fields cannot satisfy material Sales coverage',
    'A quotation item is not an eligible target',
    'Coverage target must be a committed customer-visible quotation destination',
    'Coverage target must contain meaningful current customer-visible content',
    "target_fingerprint is not distinct from v_evidence->>'fingerprint'",
    "'idempotent',true",
    'set is_current=false',
    'supersedes_coverage_id',
    'statement_timestamp(),true,v_existing.id',
    'crm_write_lead_event',
    "'quotation_sales_coverage_reviewed'",
    'grant execute on function public.crm_review_quotation_sales_coverage',
    "set search_path=''",
  ]],
  ['deterministic evaluator', migration2, [
    'crm_get_quotation_sales_reconciliation',
    'language plpgsql',
    'stable',
    'security definer',
    'v_historical',
    'v_legacy',
    'availableTargets',
    'LEGACY_QUOTATION_CRM_LINK_NOT_CAPTURED',
    'QUOTATION_CRM_LINKAGE_REQUIRED',
    'LEGACY_COVERAGE_NOT_CAPTURED',
    "crm_get_sales_gate_assessment(v_q.opportunity_id,'PROPOSAL_READINESS')",
    'crm_get_sales_scope_commitment_assessment(v_q.opportunity_id)',
    'crm_get_package_fit_assessment(v_lead_id,v_q.opportunity_id)',
    'QUOTED_PACKAGE_FIT_MISMATCH',
    'QUOTED_PRIMARY_PACKAGE_MISSING',
    'QUOTED_PACKAGE_ALIGNMENT_MISMATCH',
    'QUOTED_PACKAGE_ALIGNMENT_REVIEW',
    "c.state='ACTIVE'",
    "p.record_state='ACTIVE'",
    'SCOPE_COVERAGE_STALE',
    'SCOPE_COVERAGE_CONFLICT',
    'SCOPE_COVERAGE_REQUIRED',
    'PROMISE_COVERAGE_STALE',
    'PROMISE_COVERAGE_CONFLICT',
    'PROMISE_COVERAGE_REQUIRED',
    'promiseIntegrityStatus',
    'approvedConstraints',
    'NO_MATERIAL_PROMISES_REGISTERED',
    'PROMISE_COVERAGE',
    'FINAL_SCOPE_RECONCILIATION',
    'QUOTATION_SNAPSHOT_COVERAGE',
    'READY_TO_SNAPSHOT',
    'NOT_FROZEN',
    'LEGACY_NOT_CAPTURED',
    "'finalQuotationSendGateActive',false",
    "'writesQuotation',false",
    "'writesCoverageOnRead',false",
  ]],
  ['snapshot builder', migration2, [
    'crm_build_quotation_sales_scope_snapshot',
    "'snapshotSchemaVersion',1",
    "'quotationRevision',v_q.revision_number",
    "'proposalReadiness'",
    "'packageFit'",
    "'quotedProducts',v_products",
    "'activeScopeConditions',v_scope",
    "'activePromises',v_promises",
    "'coverageMappings'",
    "'approvedConstraints'",
    "'finalReconciliationStatus'",
    "'quotationDimensions'",
    "'snapshotCoverageState'",
    "'readyForSnapshot'",
    "'persisted',false",
    "'finalQuotationSendGateActive',false",
    'exactWording',
    'versionSourceId',
    'sourceRequirementId',
    'sourceValidationId',
    'sourceMeetingId',
    'linkedRequirementId',
    'linkedValidationId',
    'clientExpectationsSnapshot',
  ]],
  ['frontend contract', frontend, [
    'crm_get_quotation_sales_reconciliation',
    'crm_review_quotation_sales_coverage',
    'crm_build_quotation_sales_scope_snapshot',
    'p_quotation_id: quotationId',
    'p_source_type: input.sourceType',
    'p_source_id: input.sourceId',
    'p_coverage_status: input.coverageStatus',
    'p_target_type: input.targetType',
    'p_quotation_field_key',
    'p_quotation_item_id',
    'p_coverage_note',
    'Sales Reconciliation',
    'FINAL SEND GATE — ACTIVE',
    'FINAL SEND GATE — STAGED / NOT ACTIVE',
    'Build server preview',
    'Opening this workspace never writes the final snapshot',
    'Scope Conditions',
    'Promise Coverage',
    'No material Active Promises are registered',
    'Package alignment',
  ]],
];

const checks = [];
for (const [group, source, tokens] of positiveGroups) {
  for (const token of tokens) {
    checks.push({
      name: `${group}: ${token}`,
      run: () => assert.ok(source.includes(token), `Expected source contract to include: ${token}`),
    });
  }
}

checks.push(
  {
    name: 'regression: canonical editor still exposes Approved -> openSend',
    run: () => assert.ok(base.includes("draft.status === 'Approved' && <button onClick={openSend}")),
  },
  {
    name: 'regression: canonical CPQ service still owns professional send RPC',
    run: () => assert.ok(cpq.includes("supabase.rpc('send_quotation_professional'")),
  },
  {
    name: 'regression: wrapper still renders canonical QuotationWorkspaceBase',
    run: () => assert.ok(wrapper.includes('<QuotationWorkspaceBase />')),
  },
  {
    name: 'boundary: reconciliation wrapper never calls quotation send',
    run: () => assert.equal(wrapper.includes('quotationCpqService.send('), false),
  },
  {
    name: 'security: browser service cannot submit reviewed_by authority',
    run: () => assert.equal(service.includes('reviewed_by'), false),
  },
  {
    name: 'security: browser service cannot submit reviewed_at authority',
    run: () => assert.equal(service.includes('reviewed_at'), false),
  },
  {
    name: 'security: browser service cannot submit target_fingerprint authority',
    run: () => assert.equal(service.includes('target_fingerprint'), false),
  },
  {
    name: 'boundary: Part 10B UI can display both staged and active final gate states',
    run: () => assert.ok(panel.includes('FINAL SEND GATE — ACTIVE') && panel.includes('FINAL SEND GATE — STAGED / NOT ACTIVE')),
  },
  {
    name: 'boundary: evaluator migration never writes quotation rows',
    run: () => assert.equal(/update\s+public\.quotations\b/i.test(migration2), false),
  },
);

assert.equal(checks.length, 169, `Part 10A acceptance suite must contain exactly 169 checks; found ${checks.length}.`);

for (const [index, check] of checks.entries()) {
  test(`${String(index + 1).padStart(3, '0')} · ${check.name}`, check.run);
}
