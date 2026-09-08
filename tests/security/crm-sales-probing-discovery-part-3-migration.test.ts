import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260908100000_crm_sales_probing_discovery_part_3.sql', 'utf8');

const actorTrigger = 'crm_discovery_questions_stamp_insert_actor';

test('Part 3 seeds only system-global Discovery configuration while the runtime actor trigger is transactionally bypassed', () => {
  assert.match(migration, new RegExp(`alter table public\\.crm_discovery_questions\\s+disable trigger ${actorTrigger}`, 'i'));
  assert.match(migration, /insert into public\.crm_discovery_questions/i);
  assert.match(migration, /c\.applicability,\s+null,\s+false,\s+true,/i);
  assert.match(migration, new RegExp(`alter table public\\.crm_discovery_questions\\s+enable trigger ${actorTrigger}`, 'i'));
});

test('Part 3 migration does not weaken runtime Discovery security functions or policies', () => {
  assert.doesNotMatch(migration, /drop trigger|drop policy|disable row level security|create or replace function public\.crm_sales_discovery_stamp_insert_actor/i);
  assert.doesNotMatch(migration, /grant .*anon/i);
});

test('Part 3 migration still seeds no Lead-specific answers, Client Voice, Requirements, meetings, or commercial data', () => {
  assert.doesNotMatch(migration, /insert into public\.crm_discovery_responses/i);
  assert.doesNotMatch(migration, /insert into public\.crm_client_voice/i);
  assert.doesNotMatch(migration, /insert into public\.crm_requirements/i);
  assert.doesNotMatch(migration, /insert into public\.sales_meetings/i);
  assert.doesNotMatch(migration, /insert into public\.sales_products/i);
});
