import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const qa = await readFile('scripts/verify-part13-authenticated-production-ui.mjs', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

test('Part 13 production QA uses trusted server-side session issuance only', () => {
  assert.match(qa, /api-keys\?reveal=true/);
  assert.match(qa, /SUPABASE_ACCESS_TOKEN/);
  assert.match(qa, /auth\.admin\.generateLink/);
  assert.match(qa, /verifyOtp/);
  assert.match(qa, /sales\.demo@profoxwebdesigner\.test/);
});

test('Part 13 server key never enters browser storage/page context', () => {
  assert.match(qa, /context\.addInitScript/);
  assert.match(qa, /\{ key: storageKey, value: session \}/);
  assert.doesNotMatch(qa, /localStorage\.setItem\([^\n]*serverKey/);
  assert.doesNotMatch(qa, /addInitScript[\s\S]{0,500}serverKey/);
});

test('Part 13 authenticated QA performs no production business mutation', () => {
  assert.doesNotMatch(qa, /\.insert\s*\(/);
  assert.doesNotMatch(qa, /\.update\s*\(/);
  assert.doesNotMatch(qa, /\.upsert\s*\(/);
  assert.doesNotMatch(qa, /\.delete\s*\(/);
  assert.doesNotMatch(qa, /submit_sales_project_handover|accept_sales_project_handover|return_sales_project_handover/);
  assert.match(qa, /const before = await businessSnapshot/);
  assert.match(qa, /const after = await businessSnapshot/);
  assert.match(qa, /mutated real handoff\/business truth/);
});

test('Part 13 production QA refuses to manufacture PM/submission/review state', () => {
  assert.match(qa, /project_manager_id !== null/);
  assert.match(qa, /refusing to assume or replace a legitimate PM assignment/);
  assert.match(qa, /lifecycle attempt now exists/);
  assert.match(qa, /no real handoff was submitted, accepted, returned, assigned a fake PM, or advanced solely for QA/i);
});

test('Part 13 production QA requires the one existing real Sales Handover project', () => {
  assert.match(qa, /Expected exactly one existing real Sales Handover Project/);
  assert.match(qa, /sales_handover_submission/);
  assert.match(qa, /sales_handover_review/);
  assert.match(qa, /Not Submitted/);
  assert.match(qa, /Handoff Readiness: BLOCKED/);
});

test('Part 13 Seller QA verifies lack of Delivery decision authority', () => {
  assert.match(qa, /Seller unexpectedly received Delivery Accept authority/);
  assert.match(qa, /Seller unexpectedly received Delivery Return authority/);
  assert.match(qa, /Blocked real handoff unexpectedly exposed an enabled Seller submit action/);
});

test('Part 13 Admin QA verifies no early Accept Return or Seller impersonation', () => {
  assert.match(qa, /Admin unexpectedly received Accept on an unsubmitted\/unassigned real handoff/);
  assert.match(qa, /Admin unexpectedly received Return on an unsubmitted\/unassigned real handoff/);
  assert.match(qa, /Admin unexpectedly received source-Seller submission authority/);
});

test('Part 13 production UI QA is chained after Part 12 in canonical deploy command', () => {
  assert.match(packageJson.scripts['production:verify-part12-ui'], /production:verify-part13-ui/);
  assert.match(packageJson.scripts['production:verify-part13-ui'], /verify-part13-authenticated-production-ui/);
});

test('Part 13 focused test command includes matrix and QA contract', () => {
  assert.match(packageJson.scripts['test:crm-part13'], /crm-sales-delivery-handoff-part-13\.test\.mjs/);
  assert.match(packageJson.scripts['test:crm-part13'], /crm-sales-delivery-handoff-part-13-matrix\.test\.mjs/);
  assert.match(packageJson.scripts['test:crm-part13'], /part13-authenticated-production-ui\.test\.mjs/);
});
