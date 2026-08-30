import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../src/pages/TalentPartnerProgramView.tsx'), 'utf8');

test('Talent Partner landing reads rewards from the public live program RPC', () => {
  assert.match(source, /supabase\.rpc\('public_get_talent_partner_program'\)/);
  assert.match(source, /role\.eventRewards\.map\(\(rule\)/);
  assert.match(source, /rewardRuleLabel\(rule, role\)/);
  assert.match(source, /role\.retentionRatePercent/);
  assert.match(source, /role\.retentionFixedAmount/);
});

test('Talent Partner landing revalidates live configuration while it remains open', () => {
  assert.match(source, /window\.addEventListener\('focus', refreshWhenVisible\)/);
  assert.match(source, /window\.addEventListener\('pageshow', refreshWhenVisible\)/);
  assert.match(source, /window\.addEventListener\('online', refreshWhenVisible\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange', refreshWhenVisible\)/);
  assert.match(source, /window\.setInterval\(refreshWhenVisible, 30000\)/);
  assert.match(source, /window\.clearInterval\(refreshTimer\)/);
});

test('background refresh errors preserve the last valid public configuration', () => {
  assert.match(source, /if \(!loadedOnce\) \{/);
  assert.match(source, /setProgram\(publicProgram as PublicTalentPartnerProgram\)/);
  assert.match(source, /setProgramError\(''\)/);
});
