import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260831124232_razorpayx_employee_bulk_payouts.sql', 'utf8');
const sender = readFileSync('supabase/functions/razorpayx-payouts/index.ts', 'utf8');
const webhook = readFileSync('supabase/functions/payout-webhook-razorpay/index.ts', 'utf8');

test('RazorpayX reuses the canonical worker payout ledger', () => {
  assert.match(migration, /alter table public\.worker_payouts/i);
  assert.match(migration, /admin_create_worker_payout_batch/i);
  assert.doesNotMatch(migration, /create table[^;]+employee_payouts/i);
});

test('employee destination details are encrypted and protected', () => {
  assert.match(migration, /pgp_sym_encrypt/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.worker_payout_profiles[\s\S]+from public,anon,authenticated/i);
  assert.match(migration, /Reveal and review the current payout details before verification/i);
});

test('bulk payout dispatch uses composite API and stable idempotency', () => {
  assert.match(sender, /https:\/\/api\.razorpay\.com\/v1\/payouts/);
  assert.match(sender, /X-Payout-Idempotency/);
  assert.match(sender, /fund_account/);
  assert.match(sender, /queue_if_low_balance/);
});

test('signed, deduplicated webhook is the final accounting authority', () => {
  assert.match(webhook, /HMAC/);
  assert.match(webhook, /different \|=/);
  assert.match(webhook, /x-razorpay-event-id/i);
  assert.match(migration, /razorpayx_payout_events/i);
  assert.match(migration, /v_status='processed'/i);
  assert.match(migration, /v_status in \('failed','reversed','cancelled'\)/i);
  assert.match(migration, /set status='Scheduled'/i);
});
