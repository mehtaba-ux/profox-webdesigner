import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260905070000_seller_monthly_payment_verified_won_pipeline.sql', 'utf8');
const service = readFileSync('src/lib/sellerWonSalesService.ts', 'utf8');
const pipeline = readFileSync('src/components/admin/CRMPipeline.tsx', 'utf8');
const wonColumn = readFileSync('src/components/admin/MonthlyWonSalesColumn.tsx', 'utf8');

test('existing pipeline keeps open deal behavior and replaces only the Won presentation', () => {
  assert.match(pipeline, /if \(opp\.status !== 'Open'\) return false/);
  assert.match(pipeline, /stage\.classification === 'won'/);
  assert.match(pipeline, /MonthlyWonSalesColumn/);
  assert.match(pipeline, /Won remains controlled by verified payment/);
});

test('Won column is read-only and cannot become a manual drag target', () => {
  assert.doesNotMatch(wonColumn, /useDroppable/);
  assert.doesNotMatch(wonColumn, /useDraggable/);
  assert.match(wonColumn, /Payment verified only/);
  assert.match(wonColumn, /first verified Advance or Full Payment/);
});

test('monthly history derives from the first verified qualifying customer payment', () => {
  assert.match(migration, /p\.status = 'Verified'/);
  assert.match(migration, /p\.payment_type in \('Advance', 'Full Payment'\)/);
  assert.match(migration, /first_verified_payment/);
  assert.match(migration, /coalesce\(p\.verified_at, p\.paid_at, p\.created_at\) as won_at/);
  assert.doesNotMatch(migration, /create table/i);
});

test('seller access and historical seller attribution are server enforced', () => {
  assert.match(migration, /v_effective_seller := case when v_team then p_salesperson_id else v_uid end/);
  assert.match(migration, /coalesce\(fp\.payment_salesperson_id, o\.salesperson_id\)/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = 'public', 'pg_temp'/i);
  assert.match(migration, /revoke all on function public\.crm_get_seller_monthly_won_sales/);
  assert.match(migration, /grant execute on function public\.crm_get_seller_monthly_won_sales/);
});

test('monthly Won column shows month controls, revenue and verified payment evidence', () => {
  for (const text of ['Payment verified only', 'Previous month', 'Next month', 'Refresh won sales', 'Open customer history']) {
    assert.match(wonColumn, new RegExp(text));
  }
  assert.match(wonColumn, /sale\.paymentType/);
  assert.match(wonColumn, /sale\.paymentAmount/);
  assert.match(wonColumn, /sale\.quotationNumber/);
  assert.match(wonColumn, /sale\.wonAt/);
  assert.match(wonColumn, /sale\.saleValue/);
});

test('Won frontend uses the protected monthly RPC only', () => {
  assert.match(service, /crm_get_seller_monthly_won_sales/);
  assert.doesNotMatch(service, /\.from\(/);
  assert.match(service, /p_timezone/);
  assert.match(migration, /pg_catalog\.pg_timezone_names/);
  assert.match(migration, /fp\.won_at >= v_start_at/);
  assert.match(migration, /fp\.won_at < v_end_at/);
});
