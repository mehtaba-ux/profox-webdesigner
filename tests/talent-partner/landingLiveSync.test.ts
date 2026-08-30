import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../src/pages/TalentPartnerProgramView.tsx'), 'utf8');
const contentMigration = readFileSync(resolve(here, '../../supabase/migrations/20260830193000_talent_partner_program_conversion_content.sql'), 'utf8');

test('Talent Partner landing reads every reward value from the public live program RPC', () => {
  assert.match(source, /supabase\.rpc\('public_get_talent_partner_program'\)/);
  assert.match(source, /orderedRewards\(role\)\.map\(\(rule\)/);
  assert.match(source, /rewardRuleLabel\(rule, role\)/);
  assert.match(source, /role\.retentionRatePercent/);
  assert.match(source, /role\.retentionFixedAmount/);
  assert.match(source, /role\.qualifyingEventCount/);
  assert.match(source, /program\?\.attributionWindowDays/);
  assert.match(source, /program\?\.payoutHoldDays/);
});

test('Talent Partner landing makes reward-cycle limits explicit without hard-coded commission values', () => {
  assert.match(source, /How Long Do You Earn From One Referral/);
  assert.match(source, /salesCompletionCopy/);
  assert.match(source, /projectCompletionCopy/);
  assert.match(source, /one-time final retention reward/);
  assert.doesNotMatch(source, />5%<|>5\.5%<|>6%<|>\$50</);
});

test('editable CMS copy uses live-value tokens instead of copied reward values', () => {
  assert.match(contentMigration, /\{\{salesCount\}\}/);
  assert.match(contentMigration, /\{\{salesRewards\}\}/);
  assert.match(contentMigration, /\{\{projectCount\}\}/);
  assert.match(contentMigration, /\{\{projectRewards\}\}/);
  assert.match(contentMigration, /\{\{retentionReward\}\}/);
  assert.match(contentMigration, /\{\{retentionMonths\}\}/);
  assert.match(contentMigration, /\{\{attributionDays\}\}/);
  assert.match(contentMigration, /\{\{payoutHoldDays\}\}/);
  assert.doesNotMatch(contentMigration, /5\.5%|\$50/);
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
