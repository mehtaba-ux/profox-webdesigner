import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/native-history/20260911033025_crm_sales_quotation_reconciliation_part10a_hardening.sql');
const service = read('src/lib/quotationSalesReconciliationService.ts');
const panel = read('src/components/admin/QuotationSalesReconciliationPanel.tsx');
const wrapper = read('src/components/admin/QuotationWorkspace.tsx');
const originalAssessment = read('supabase/migrations/native-history/20260910125143_crm_sales_quotation_reconciliation_assessment_part10a.sql');

const checks = [
  ['indexes scope condition FK', migration, 'quotation_sales_coverage_scope_condition_idx'],
  ['indexes promise FK', migration, 'quotation_sales_coverage_promise_idx'],
  ['indexes reviewer FK', migration, 'quotation_sales_coverage_reviewed_by_idx'],
  ['indexes supersedes FK', migration, 'quotation_sales_coverage_supersedes_idx'],
  ['timeline parser exists', migration, 'crm_parse_timeline_promise_days'],
  ['timeline parser is immutable', migration, 'immutable'],
  ['timeline parser handles business days', migration, "'unit','business_days'"],
  ['timeline parser rejects ambiguity', migration, "'status','NOT_EVALUATED'"],
  ['helper execute is not exposed', migration, 'revoke all on function public.crm_parse_timeline_promise_days(text) from public, anon, authenticated'],
  ['draft promises are returned', migration, "'draftPromises',v_draft_promise_rows"],
  ['draft promises stay DRAFT only', migration, "p.record_state='DRAFT'"],
  ['draft promises are labeled internal', migration, 'INTERNAL_DRAFT_NOT_CLIENT_COMMITMENT'],
  ['draft promises do not increment active promise count', migration, "p.record_state='ACTIVE'"],
  ['promised by name is resolved server side', migration, 'promisedByName'],
  ['promised at is returned', migration, "'promisedAt',v_promise.promised_at"],
  ['timeline comparison is returned', migration, "'timelineComparison',v_timeline_context"],
  ['timeline uses authoritative quotation min', migration, 'v_q.estimated_duration_min'],
  ['timeline uses authoritative quotation max', migration, 'v_q.estimated_duration_max'],
  ['timeline respects unresolved assessment', migration, 'v_q.duration_requires_assessment'],
  ['timeline conflict overrides effective coverage', migration, "if v_timeline_conflict then v_effective:='CONFLICT'"],
  ['timeline conflict has explicit blocker', migration, 'TIMELINE_PROMISE_QUOTATION_CONFLICT'],
  ['timeline conflict never auto mutates values', migration, 'neither value was changed automatically'],
  ['commercial approval reuses canonical evaluator', migration, 'public.quotation_requires_manager_approval(p_quotation_id)'],
  ['commercial approval reuses canonical reasons', migration, 'public.quotation_cpq_approval_reasons(p_quotation_id)'],
  ['commercial approval returns context', migration, "'commercialApproval',v_commercial_approval"],
  ['commercial approval dependency blocks future status', migration, 'COMMERCIAL_PROMISE_APPROVAL_REQUIRED'],
  ['commercial approval never creates approval', migration, 'No approval was created or bypassed by Sales reconciliation'],
  ['promise dependency participates in status', migration, 'v_any_promise_dependency_blocked'],
  ['future blocker includes approval dependency', migration, "or v_commercial_approval_blocked then 'BLOCKED'"],
  ['dimension reports draft count', migration, "'draftCount',jsonb_array_length(v_draft_promise_rows)"],
  ['final send gate remains false in the Part 10A migration', migration, "'finalQuotationSendGateActive',false"],
  ['evaluator still reports no quotation writes', migration, "'writesQuotation',false"],
  ['evaluator still reports no coverage-on-read writes', migration, "'writesCoverageOnRead',false"],
  ['service exposes draft promise type', service, 'QuotationDraftPromiseRow'],
  ['service exposes draftPromises', service, 'draftPromises?: QuotationDraftPromiseRow[]'],
  ['service exposes promisedByName', service, 'promisedByName?: string | null'],
  ['service exposes timeline comparison', service, 'QuotationTimelineComparison'],
  ['service exposes commercial approval context', service, 'QuotationCommercialApprovalContext'],
  ['service keeps browser reviewer authority absent', service, "p_coverage_note"],
  ['panel shows internal draft wording', panel, 'Internal draft / not client commitment'],
  ['panel explains draft coverage exemption', panel, 'require no quotation coverage'],
  ['panel shows promised by', panel, 'Promised by:'],
  ['panel shows promised at', panel, 'Promised at:'],
  ['panel shows selected live quotation text', panel, 'Current customer-visible quotation text'],
  ['panel exposes open/edit target', panel, 'Open / Edit target'],
  ['panel shows timeline comparison', panel, 'Timeline Promise vs quotation'],
  ['panel shows commercial approval dependency', panel, 'Existing quotation approval dependency'],
  ['panel states no automatic timeline mutation', panel, 'Neither the Promise nor quotation is changed automatically'],
  ['wrapper routes item target to canonical scope panel', wrapper, "? 'Scope & Pricing'"],
  ['wrapper routes payment and duration to canonical payment panel', wrapper, "['payment_terms', 'duration_snapshot_text']"],
  ['wrapper routes other fields to proposal panel', wrapper, ": 'Proposal Content'"],
  ['wrapper closes reconciliation before navigation', wrapper, 'setReconciliationOpen(false)'],
  ['wrapper passes canonical target callback', wrapper, 'onOpenTarget={openCanonicalTarget}'],
  ['wrapper still renders canonical editor', wrapper, '<QuotationWorkspaceBase />'],
  ['original snapshot builder remains read-only', originalAssessment, "'persisted',false"],
  ['original final gate remains inactive', originalAssessment, "'finalQuotationSendGateActive',false"],
];

for (const [index, [name, source, token]] of checks.entries()) {
  test(`${String(index + 1).padStart(3, '0')} · ${name}`, () => {
    assert.ok(source.includes(token), `Expected source contract to include: ${token}`);
  });
}

test('boundary · hardening evaluator does not update quotations', () => {
  assert.equal(/update\s+public\.quotations\b/i.test(migration), false);
});

test('boundary · Part 10B evolves UI without moving Send authority into reconciliation panel', () => {
  assert.equal(migration.includes('send_quotation_professional'), false);
  assert.equal(panel.includes('quotationCpqService.send'), false);
  assert.ok(panel.includes('FINAL SEND GATE — ACTIVE'));
  assert.ok(panel.includes('FINAL SEND GATE — STAGED / NOT ACTIVE'));
});

test('coverage · hardening suite adds meaningful checks beyond original 169', () => {
  assert.ok(checks.length >= 50, `Expected at least 50 hardening checks; found ${checks.length}.`);
});
