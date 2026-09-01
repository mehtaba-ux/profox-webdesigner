import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const baseSql = readFileSync(resolve(root, 'supabase/migrations/20260830164000_revenue_distribution_margin_engine.sql'), 'utf8');
const hardeningSql = readFileSync(resolve(root, 'supabase/migrations/20260830181500_revenue_distribution_margin_engine_hardening.sql'), 'utf8');
const mappingSql = readFileSync(resolve(root, 'supabase/migrations/20260830182500_revenue_distribution_role_mapping_fix.sql'), 'utf8');
const deliverySql = readFileSync(resolve(root, 'supabase/migrations/20260830184000_delivery_worker_revenue_distribution_integration.sql'), 'utf8');
const metadataSql = readFileSync(resolve(root, 'supabase/migrations/20260830185000_content_assignment_revenue_budget_metadata_alignment.sql'), 'utf8');
const completionSql = readFileSync(resolve(root, 'supabase/migrations/20260831103000_revenue_distribution_profiles_profitability_reporting.sql'), 'utf8');
const adminSource = readFileSync(resolve(root, 'src/components/admin/RevenueDistributionAdmin.tsx'), 'utf8');
const serviceSource = readFileSync(resolve(root, 'src/lib/revenueDistributionService.ts'), 'utf8');
const commissionServiceSource = readFileSync(resolve(root, 'src/lib/commissionService.ts'), 'utf8');
const configurationSource = readFileSync(resolve(root, 'src/components/admin/ConfigurationCenter.tsx'), 'utf8');
const commissionAdminSource = readFileSync(resolve(root, 'src/components/admin/AdminCommissionManager.tsx'), 'utf8');
const quotationSource = readFileSync(resolve(root, 'src/components/admin/QuotationProfitabilityPanel.tsx'), 'utf8');
const publicContentVerifierSource = readFileSync(resolve(root, 'scripts/verify-public-content.mjs'), 'utf8');

test('revenue distribution keeps Sales Catalog and existing engines canonical', () => {
  assert.match(baseSql, /Package prices remain canonical in Sales Catalog/i);
  assert.match(baseSql, /from public\.sales_products/i);
  assert.match(baseSql, /from public\.commission_rules/i);
  assert.match(baseSql, /from public\.talent_partner_reward_plans/i);
  assert.match(configurationSource, /Sales Catalog remains the commercial price source/i);
  assert.match(adminSource, /Change a package price in Sales Catalog/i);
});

test('margin policy is versioned, configurable and cent-safe at the minimum boundary', () => {
  assert.match(baseSql, /'targetMarginPercent',45/i);
  assert.match(baseSql, /'minimumMarginPercent',40/i);
  assert.match(baseSql, /admin_save_revenue_distribution_config/i);
  assert.match(hardeningSql, /v_company_amount\+0\.01>=v_target_amount/i);
  assert.match(hardeningSql, /v_company_amount\+0\.01>=v_min_amount/i);
  assert.match(hardeningSql, /selfGeneratedBonusUsesMarginBuffer/i);
  assert.match(hardeningSql, /if coalesce\(p_self_generated,false\) and not v_self_uses_buffer then/i);
});

test('sales Talent Partner reserve includes the one-time retention liability without duplicating it per sale', () => {
  assert.match(hardeningSql, /v_sales_retention_total/i);
  assert.match(hardeningSql, /v_sales_retention_per_sale:=round\(v_sales_retention_total\/v_sales_qualifying_count,2\)/i);
  assert.match(hardeningSql, /retentionReservePerQualifyingSale/i);
  assert.match(hardeningSql, /retentionTotalReserve/i);
  assert.match(hardeningSql, /salary-percentage based.*Finance review/is);
});

test('recurring Care Plan revenue is separated from one-time project distribution', () => {
  assert.match(hardeningSql, /lower\(coalesce\(qi\.item_type,''\)\)<>'care_plan'/i);
  assert.match(hardeningSql, /lower\(coalesce\(qi\.item_type,''\)\)='care_plan'/i);
  assert.match(hardeningSql, /recurringServiceRevenue/i);
  assert.match(hardeningSql, /separate_from_project_distribution/i);
  assert.match(hardeningSql, /recurringQuoteDiscountAllocated/i);
});

test('Admin configuration rejects broken Talent Partner job references', () => {
  assert.match(hardeningSql, /validate_revenue_distribution_config_row/i);
  assert.match(hardeningSql, /Sales Talent Partner job slug does not exist/i);
  assert.match(hardeningSql, /Delivery Talent Partner job .* must use a project reward plan/i);
  assert.match(hardeningSql, /trg_validate_revenue_distribution_config/i);
});

test('immutable project snapshots carry financial policy and role allocations', () => {
  assert.match(baseSql, /create table if not exists public\.revenue_distribution_snapshots/i);
  assert.match(baseSql, /project_id uuid not null unique/i);
  assert.match(baseSql, /trg_capture_revenue_distribution_snapshot/i);
  assert.match(hardeningSql, /sales_talent_partner_retention_reserve_amount/i);
  assert.match(hardeningSql, /recurring_service_revenue/i);
  assert.match(hardeningSql, /role_allocations/i);
});

test('worker assignments cannot exceed their snapshotted project role budget', () => {
  assert.match(hardeningSql, /revenue_distribution_project_role_budget_internal/i);
  assert.match(hardeningSql, /trg_z_revenue_distribution_worker_budget/i);
  assert.match(hardeningSql, /new\.suggested_amount:=v_remaining/i);
  assert.match(hardeningSql, /new\.agreed_fee:=v_remaining/i);
  assert.match(hardeningSql, /exceeds its protected project role budget/i);
  assert.match(hardeningSql, /Worker assignment currency .* must match the project/i);
});

test('delivery department aliases map to stable budget keys', () => {
  assert.match(mappingSql, /when 'uiuxdesigner' then return 'uiux'/i);
  assert.match(mappingSql, /when 'webdeveloper' then return 'development'/i);
  assert.match(mappingSql, /when 'contentwriter' then return 'content'/i);
  assert.match(mappingSql, /when 'qualityassurance' then return 'qa'/i);
  assert.match(mappingSql, /when 'projectmanager' then return 'project_management'/i);
});

test('UIUX and Development reuse the existing worker assignment, earning and payout ledger', () => {
  assert.match(deliverySql, /insert into public\.worker_work_assignments/i);
  assert.match(deliverySql, /Fixed Project Fee/i);
  assert.match(deliverySql, /Existing project quality and completion gates/i);
  assert.match(deliverySql, /create or replace function public\.evaluate_worker_assignment_earning/i);
  assert.match(deliverySql, /insert into public\.worker_earnings/i);
  assert.match(deliverySql, /v_project\.status='Completed'.*v_project\.stage='Completed'/is);
  assert.match(deliverySql, /trg_revenue_distribution_delivery_earnings_on_project_completion/i);
  assert.match(deliverySql, /trg_revenue_distribution_delivery_earning_after_acceptance/i);
});

test('Content assignment metadata follows the authoritative post-trigger amount', () => {
  assert.match(metadataSql, /align_worker_assignment_created_event_to_budget/i);
  assert.match(metadataSql, /suggestedAmount',v\.suggested_amount/i);
  assert.match(metadataSql, /agreedFee',v\.agreed_fee/i);
  assert.match(metadataSql, /align_worker_assignment_notification_to_budget/i);
  assert.match(metadataSql, /to_char\(v\.agreed_fee/i);
});

test('sensitive distribution helpers are not browser-callable', () => {
  for (const helper of [
    'revenue_distribution_calculate_internal',
    'revenue_distribution_quotation_internal',
    'capture_revenue_distribution_snapshot_for_project',
    'revenue_distribution_project_role_budget_internal',
    'revenue_distribution_worker_assignment_budget_guard'
  ]) {
    assert.match(hardeningSql, new RegExp(`revoke all on function public\\.${helper}`, 'i'));
  }
  assert.match(deliverySql, /revoke all on function public\.revenue_distribution_paid_delivery_team_assignment\(\) from public,anon,authenticated/i);
});

test('frontend uses server RPCs rather than duplicating distribution math', () => {
  assert.match(serviceSource, /admin_revenue_distribution_dashboard/i);
  assert.match(serviceSource, /admin_save_revenue_distribution_config/i);
  assert.match(serviceSource, /revenue_distribution_preview_product/i);
  assert.match(serviceSource, /revenue_distribution_preview_quotation/i);
  assert.doesNotMatch(serviceSource, /0\.13|0\.22|0\.45/);
  assert.match(adminSource, /Seller commissions, Talent Partner qualification and worker payouts continue through their existing canonical systems/i);
});

test('Admin exposes the live policy switches and retention provision clearly', () => {
  assert.match(adminSource, /checked=\{config\.reservePerformanceBonus\}/i);
  assert.match(adminSource, /checked=\{config\.selfGeneratedBonusUsesMarginBuffer\}/i);
  assert.match(adminSource, /retentionReservePerQualifyingSale/i);
  assert.match(adminSource, /retentionTotalReserve/i);
  assert.match(adminSource, /Worker budgets are enforced, not just displayed/i);
});

test('Commission Management reuses the editable live policy and explains every setup control', () => {
  assert.match(commissionAdminSource, /Commission & Margin Setup/i);
  assert.match(commissionAdminSource, /<RevenueDistributionAdmin\s*\/>/i);
  assert.match(adminSource, /function HelpTooltip/i);
  assert.match(adminSource, /role="tooltip"/i);
  assert.match(adminSource, /Target contribution margin percent/i);
  assert.match(adminSource, /Absolute minimum margin percent/i);
  assert.match(adminSource, /global delivery weight percent/i);
  assert.match(adminSource, /package delivery weight percent/i);
  assert.match(adminSource, /Save this policy as the next version/i);
});

test('Admin can edit each package seller commission through the canonical commission rule', () => {
  assert.match(adminSource, /Package seller contribution \/ commission/i);
  assert.match(adminSource, /Save Seller Contribution/i);
  assert.match(adminSource, /saveRuleConfirmed/i);
  assert.match(adminSource, /future verified payments/i);
  assert.match(adminSource, /Approved minimum/i);
  assert.match(adminSource, /Approved maximum/i);
  assert.match(commissionServiceSource, /from\('commission_rules'\)\.upsert/i);
  assert.match(commissionServiceSource, /async saveRuleConfirmed/i);
});

test('production verification tolerates bounded Cloudflare asset propagation', () => {
  assert.match(publicContentVerifierSource, /attempt <= 5/i);
  assert.match(publicContentVerifierSource, /assets are still propagating/i);
  assert.match(publicContentVerifierSource, /setTimeout\(resolve, 3000\)/i);
});

test('test seller OAuth health is reported without blocking real-sales production readiness', () => {
  const readinessSource = readFileSync(resolve(root, 'scripts/verify-production-readiness.mjs'), 'utf8');
  assert.match(readinessSource, /unhealthy_test_sellers/i);
  assert.match(readinessSource, /not like '%\.test'/i);
  assert.match(readinessSource, /Test seller Calendar connection/i);
});

test('package profiles change weights without duplicating catalog prices or reward rules', () => {
  assert.match(completionSql, /revenue_distribution_product_profiles/i);
  assert.match(completionSql, /sales_product_id uuid not null unique references public\.sales_products/i);
  assert.match(completionSql, /Only weights may change/i);
  assert.match(completionSql, /admin_save_revenue_distribution_product_profile/i);
  assert.doesNotMatch(completionSql, /package_price|seller_commission_percent|talent_partner_percent/i);
  assert.match(adminSource, /Package-specific delivery profile/i);
});

test('quotation overrides are validated, audited and always routed for approval', () => {
  assert.match(completionSql, /revenue_distribution_override_reason/i);
  assert.match(completionSql, /set_quotation_revenue_distribution_override/i);
  assert.match(completionSql, /Only an unlocked draft quotation can change delivery weights/i);
  assert.match(completionSql, /Project-specific delivery effort weights require Management approval/i);
  assert.match(completionSql, /weights must total exactly 100 percent/i);
  assert.match(quotationSource, /Custom quotation effort weights/i);
});

test('quotation profitability includes protected minimum-price guidance from the server engine', () => {
  assert.match(completionSql, /revenue_distribution_required_price_internal/i);
  assert.match(completionSql, /minimumSellingPrice/i);
  assert.match(completionSql, /additionalRevenueRequired/i);
  assert.match(completionSql, /Required minimum one-time selling price/i);
  assert.match(quotationSource, /Expected ProFox margin/i);
  assert.match(quotationSource, /Required minimum one-time selling price/i);
  assert.doesNotMatch(quotationSource, /0\.13|0\.22|0\.45/);
});

test('actual margin reporting reuses verified payment and canonical payout ledgers', () => {
  assert.match(completionSql, /from public\.payments pay/i);
  assert.match(completionSql, /from public\.commission_entries c/i);
  assert.match(completionSql, /from public\.talent_partner_reward_entries t/i);
  assert.match(completionSql, /from public\.worker_earnings w/i);
  assert.match(completionSql, /admin_revenue_distribution_management_snapshot/i);
  assert.match(adminSource, /Projected versus actual margin/i);
  assert.match(adminSource, /no sample financial data is generated/i);
});

test('profile-aware calculations still use the single established financial formula', () => {
  assert.match(completionSql, /revenue_distribution_calculate_scoped_internal/i);
  assert.match(completionSql, /revenue_distribution_calculate_internal\(p_revenue,p_currency,p_product_code,p_self_generated,p_approved_commission_rate\)/i);
  assert.match(completionSql, /always restores the prior value/i);
  assert.match(completionSql, /revoke all on function public\.revenue_distribution_calculate_scoped_internal/i);
});
