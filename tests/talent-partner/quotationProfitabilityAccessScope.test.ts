import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260903220000_quotation_profitability_access_scope.sql'), 'utf8');
const wrapper = readFileSync(resolve(root, 'src/components/admin/QuotationWorkspace.tsx'), 'utf8');
const base = readFileSync(resolve(root, 'src/components/admin/QuotationWorkspaceBase.tsx'), 'utf8');

test('non-admin quotation summaries redact the complete profitability payload', () => {
  assert.match(migration, /v_payload\s*-\s*'revenueDistribution'/i);
  assert.match(migration, /'revenueDistribution',\s*null/i);
  assert.match(migration, /'scope',\s*'seller_self'/i);
  assert.match(migration, /\{seller,totalReservedAmount\}/i);
  assert.match(migration, /\{seller,totalRatePercent\}/i);
  assert.doesNotMatch(wrapper, /company\?\.marginPercent|targetMarginPercent|minimumMarginPercent|delivery\?\.roles/i);
});

test('sensitive summary implementation cannot be called directly by browser roles', () => {
  assert.match(migration, /revoke all on function public\.get_quotation_cpq_summary_sensitive_internal\(uuid\)\s+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_quotation_cpq_summary\(uuid\)\s+to authenticated, service_role/i);
});

test('quotation profitability editing is Admin-only on the server', () => {
  assert.match(migration, /if not public\.is_admin\(\) then\s+raise exception 'Admin access required to edit profitability distribution\.'/is);
  assert.match(migration, /revoke all on function public\.set_quotation_revenue_distribution_override_internal\(uuid, jsonb, text\)\s+from public, anon, authenticated/i);
});

test('seller UI exposes only a self allocation and hides the full Profitability tab', () => {
  assert.match(wrapper, /data-profitability-scope=\{isAdmin \? 'admin' : 'restricted'\}/i);
  assert.match(wrapper, /button:nth-child\(4\)[\s\S]*display:\s*none\s*!important/i);
  assert.match(wrapper, /Only your own seller allocation is visible to you\./i);
  assert.match(wrapper, /myRevenueAllocation/i);
});

test('Admin retains the established full profitability panel and calculation flow unchanged', () => {
  assert.match(base, /\['profitability', 'Profitability'\]/i);
  assert.match(base, /QuotationProfitabilityPanel/i);
  assert.match(base, /Expected ProFox Margin/i);
  assert.match(base, /revenueDistribution\?\.success/i);
});
