import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hardeningSql = readFileSync(
  resolve(here, '../../supabase/migrations/20260829155817_talent_partner_production_hardening.sql'),
  'utf8'
);
const reconciliationSql = readFileSync(
  resolve(here, '../../supabase/migrations/20260829161547_talent_partner_payment_reward_reconciliation_alignment.sql'),
  'utf8'
);
const closureSql = readFileSync(
  resolve(here, '../../supabase/migrations/20260830033958_talent_partner_operational_closure.sql'),
  'utf8'
);

test('production hardening keeps Talent Partner access and accounting invariants', () => {
  assert.match(hardeningSql, /minimum_payout_by_currency/i);
  assert.match(hardeningSql, /talent_partner_minimum_payout_for_currency/i);
  assert.match(hardeningSql, /v_status\s*<>\s*'Active'/i);
  assert.match(hardeningSql, /user_id\s*=\s*v_uid\s+and\s+status\s*=\s*'Active'/i);
  assert.match(hardeningSql, /v_existing\.status\s*=\s*'Reversed'/i);
  assert.match(hardeningSql, /UPDATE OF stage, linked_user_id, refusal_reason, closed_at/i);
  assert.match(hardeningSql, /insert into public\.talent_partner_payout_batches\s*\(batch_number,status,created_by,currency\)/i);
  assert.match(hardeningSql, /where e\.status='Approved'.*upper\(e\.currency\)=v_currency/i);
});

test('payment verification changes reconcile rewards and unpaid payouts safely', () => {
  assert.match(reconciliationSql, /talent_partner_recalculate_unpaid_payout/i);
  assert.match(reconciliationSql, /e\.source_quotation_id=v_quotation_id/i);
  assert.match(reconciliationSql, /v_replacement_payment_id/i);
  assert.match(reconciliationSql, /payout_id=null/i);
  assert.match(reconciliationSql, /v_payout_status='Paid'/i);
  assert.match(reconciliationSql, /status='Cancelled',amount=0,entry_count=0/i);
  assert.match(reconciliationSql, /perform public\.talent_partner_generate_sale_reward\(v_replacement_payment_id\)/i);
});

test('sensitive Talent Partner trigger helpers remain internal', () => {
  assert.match(hardeningSql, /revoke all on function public\.talent_partner_sync_referral_from_applicant\(\) from public, anon, authenticated/i);
  assert.match(hardeningSql, /grant execute on function public\.talent_partner_sync_referral_from_applicant\(\) to service_role/i);
  assert.match(reconciliationSql, /revoke all on function public\.talent_partner_payment_reward_trigger\(\) from public, anon, authenticated/i);
  assert.match(reconciliationSql, /grant execute on function public\.talent_partner_payment_reward_trigger\(\) to service_role/i);
  assert.match(reconciliationSql, /revoke all on function public\.talent_partner_recalculate_unpaid_payout\(uuid\) from public, anon, authenticated/i);
  assert.match(reconciliationSql, /grant execute on function public\.talent_partner_recalculate_unpaid_payout\(uuid\) to service_role/i);
});

test('operational closure locks sales rewards and automates retention', () => {
  assert.match(closureSql, /application_type='sales_representative'.*reward_model is distinct from 'sales'/is);
  assert.match(closureSql, /Sales representative reward plans must use the sales reward model/i);
  assert.match(closureSql, /cron\.schedule\('profox-talent-partner-reward-refresh'/i);
  assert.match(closureSql, /after insert or update of status on public\.sales_career_progression_reviews/i);
  assert.match(closureSql, /talent_partner_reward_integrity_guard/i);
  assert.match(closureSql, /authoritativeWorkerEarning/i);
});

test('operational closure protects tracking and financial settlement', () => {
  assert.match(closureSql, /occurred_at>now\(\)-interval '30 minutes'/i);
  assert.match(closureSql, /reason','rate_limited'/i);
  assert.match(closureSql, /talent_partner_financial_adjustments/i);
  assert.match(closureSql, /maker-checker control/i);
  assert.match(closureSql, /admin_create_talent_partner_final_settlement/i);
  assert.match(closureSql, /talent_partner_get_my_preserved_financials/i);
});

test('all internal Talent Partner trigger helpers are revoked from user roles', () => {
  for (const helper of [
    'talent_partner_project_completion_review_trigger',
    'talent_partner_project_team_review_trigger',
    'talent_partner_paid_reward_adjustment_trigger',
    'talent_partner_payout_separation_guard'
  ]) {
    assert.match(closureSql, new RegExp(`revoke all on function public\\.${helper}\\(\\) from public,anon,authenticated`, 'i'));
    assert.match(closureSql, new RegExp(`grant execute on function public\\.${helper}\\(\\) to service_role`, 'i'));
  }
});
