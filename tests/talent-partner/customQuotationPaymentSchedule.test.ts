import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const sql = readFileSync(resolve(root, 'supabase/migrations/20260903223000_custom_primary_quotation_payment_schedule_fallback.sql'), 'utf8');

test('custom-priced primary catalog offers receive the established automatic payment schedule fallback', () => {
  assert.match(sql, /create or replace function public\.resolve_quotation_payment_schedule/i);
  assert.match(sql, /sp\.payment_schedule,sp\.standard_payment_terms,sp\.price_mode/i);
  assert.match(sql, /if v_product\.price_mode='custom'/i);
  assert.match(sql, /auto_custom_quotation_payment_schedule\(v_quotation_total\)/i);
  assert.match(sql, /AUTO-V1/i);
});

test('explicit configured schedules still win and payment safety checks stay intact', () => {
  assert.match(sql, /v_schedule:=v_product\.payment_schedule/i);
  assert.match(sql, /approved payment schedule must total 100 percent/i);
  assert.match(sql, /first approved payment milestone must be Advance or Full Payment/i);
  assert.match(sql, /selected offer does not have an approved payment schedule/i);
});
