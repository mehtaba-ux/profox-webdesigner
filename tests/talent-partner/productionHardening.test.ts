import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  resolve(here, '../../supabase/migrations/20260829155817_talent_partner_production_hardening.sql'),
  'utf8'
);

test('production hardening keeps Talent Partner access and accounting invariants', () => {
  assert.match(sql, /minimum_payout_by_currency/i);
  assert.match(sql, /talent_partner_minimum_payout_for_currency/i);
  assert.match(sql, /v_status\s*<>\s*'Active'/i);
  assert.match(sql, /user_id\s*=\s*v_uid\s+and\s+status\s*=\s*'Active'/i);
  assert.match(sql, /v_existing\.status\s*=\s*'Reversed'/i);
  assert.match(sql, /source_quotation_id\s*=\s*new\.quotation_id/i);
  assert.match(sql, /UPDATE OF stage, linked_user_id, refusal_reason, closed_at/i);
  assert.match(sql, /insert into public\.talent_partner_payout_batches\s*\(batch_number,status,created_by,currency\)/i);
  assert.match(sql, /where upper\(e\.currency\)\s*=\s*v_currency/i);
});

test('sensitive Talent Partner trigger helpers remain internal', () => {
  assert.match(sql, /revoke all on function public\.talent_partner_payment_reward_trigger\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.talent_partner_payment_reward_trigger\(\) to service_role/i);
  assert.match(sql, /revoke all on function public\.talent_partner_sync_referral_from_applicant\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.talent_partner_sync_referral_from_applicant\(\) to service_role/i);
});
