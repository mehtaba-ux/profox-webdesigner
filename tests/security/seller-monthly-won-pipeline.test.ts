import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260905070000_seller_monthly_payment_verified_won_pipeline.sql', 'utf8');
const service = readFileSync('src/lib/sellerWonSalesService.ts', 'utf8');
const wrapper = readFileSync('src/components/admin/CRMPipeline.tsx', 'utf8');
const base = readFileSync('src/components/admin/CRMPipelineBase.tsx', 'utf8');
const panel = readFileSync('src/components/admin/MonthlyWonSalesPanel.tsx', 'utf8');

test('existing open pipeline is preserved and monthly won history is additive', () => {
  assert.match(wrapper, /CRMPipelineBase/);
  assert.match(wrapper, /MonthlyWonSalesPanel/);
  assert.match(base, /Sales Pipeline Command Center/);
  assert.match(base, /if \(opp\.status !== 'Open'\) return false/);
  assert.match(base, /Won remains controlled by verified payment/);
});

test('won history is derived only from qualifying verified customer payments', () => {
  assert.match(migration, /p\.status = 'Verified'/);
  assert.match(migration, /p\.payment_type in \('Advance', 'Full Payment'\)/);
  assert.match(migration, /first_verified_payment/);
  assert.match(migration, /coalesce\(p\.verified_at, p\.paid_at, p\.created_at\) as won_at/);
  assert.doesNotMatch(migration, /create table/i);
});

test('seller scope stays server-enforced while management can use team scope', () => {
  assert.match(migration, /v_team := public\.is_admin\(\) or public\.has_active_role\(array\['project_manager'\]::text\[\]\)/);
  assert.match(migration, /v_effective_seller := case when v_team then p_salesperson_id else v_uid end/);
  assert.match(migration, /array\['sales','sales_rep','sales_team'\]/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = 'public', 'pg_temp'/i);
  assert.match(migration, /revoke all on function public\.crm_get_seller_monthly_won_sales/);
  assert.match(migration, /grant execute on function public\.crm_get_seller_monthly_won_sales/);
});

test('monthly won UI supports month navigation, monthly totals and payment evidence', () => {
  for (const text of ['Won Sales', 'Payment verified only', 'Previous', 'Next', 'Won value', 'Verified payment', 'Open customer history']) assert.match(panel, new RegExp(text));
  assert.match(panel, /shiftMonth/);
  assert.match(panel, /isCurrentMonth/);
  assert.match(panel, /paymentReference/);
  assert.match(panel, /quotationNumber/);
  assert.match(panel, /sale\.wonAt/);
});

test('won frontend uses protected RPC only and does not query payment tables directly', () => {
  assert.match(service, /crm_get_seller_monthly_won_sales/);
  assert.doesNotMatch(service, /\.from\(/);
  assert.match(service, /p_timezone/);
  assert.match(migration, /pg_catalog\.pg_timezone_names/);
  assert.match(migration, /fp\.won_at >= v_start_at/);
  assert.match(migration, /fp\.won_at < v_end_at/);
});
