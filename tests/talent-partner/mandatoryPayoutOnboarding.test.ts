import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  resolve(here, '../../supabase/migrations/20260830035714_talent_partner_mandatory_payout_onboarding.sql'),
  'utf8'
);

test('payout setup is mandatory before Talent Partner work starts', () => {
  assert.match(sql, /status in \('Verification Pending','Verified'\)/i);
  assert.match(sql, /v_partner_status not in \('Pending','Active'\)/i);
  assert.match(sql, /'setupRequired',v_required/i);
  assert.match(sql, /'workAccessGranted',v_partner_status='Active' and v_complete/i);
  assert.match(sql, /'accessReason'.*'payout_setup_required'/is);
  assert.match(sql, /talent_partner_payout_onboarding_complete\(v_partner_user_id\)/i);
  assert.match(sql, /return jsonb_build_object\('success',false,'reason','partner_not_ready'\)/i);
});

test('payout setup no longer depends on an approved reward', () => {
  assert.doesNotMatch(sql, /Payout setup becomes available after a reward has been approved/i);
  assert.doesNotMatch(sql, /not found and not exists\s*\(\s*select 1 from public\.talent_partner_reward_entries/is);
  assert.match(sql, /Mandatory payout details submitted/i);
});

test('verification is separate from work access and sensitive helpers stay internal', () => {
  assert.match(sql, /actual payouts remain blocked until verification is complete/i);
  assert.match(sql, /revoke all on function public\.talent_partner_payout_onboarding_complete\(uuid\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.talent_partner_get_dashboard_internal_pre_payout_gate\(\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.public_track_talent_partner_visit_internal_pre_payout_gate\(text,text,text,jsonb\) from public, anon, authenticated/i);
});
