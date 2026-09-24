import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const qa = await readFile('scripts/verify-part12-authenticated-production-ui.mjs', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

test('Part 12 production QA uses only trusted server-side session issuance', () => {
  assert.match(qa, /api-keys\?reveal=true/);
  assert.match(qa, /SUPABASE_ACCESS_TOKEN/);
  assert.match(qa, /auth\.admin\.generateLink/);
  assert.match(qa, /verifyOtp/);
  assert.match(qa, /sales\.demo@profoxwebdesigner\.test/);
});

test('Part 12 server key never enters browser storage or page context', () => {
  assert.match(qa, /context\.addInitScript/);
  assert.match(qa, /\{ key: storageKey, value: session \}/);
  assert.doesNotMatch(qa, /localStorage\.setItem\([^\n]*serverKey/);
  assert.doesNotMatch(qa, /addInitScript[\s\S]{0,500}serverKey/);
});

test('Part 12 authenticated QA performs no production CRM/payment mutation', () => {
  assert.doesNotMatch(qa, /\.insert\s*\(/);
  assert.doesNotMatch(qa, /\.update\s*\(/);
  assert.doesNotMatch(qa, /\.upsert\s*\(/);
  assert.doesNotMatch(qa, /\.delete\s*\(/);
  assert.doesNotMatch(qa, /verifyPayment\s*\(/);
  assert.doesNotMatch(qa, /verify_payment_atomic/);
  assert.match(qa, /const before = await businessSnapshot\(\)/);
  assert.match(qa, /const after = await businessSnapshot\(\)/);
  assert.match(qa, /mutated business truth/);
});

test('Part 12 QA requires the existing safe Awaiting Payment fixture rather than creating one', () => {
  assert.match(qa, /sales\.demo@profoxwebdesigner\.test/);
  assert.match(qa, /Expected exactly one existing safe Awaiting Advance Payment opportunity/);
  assert.match(qa, /Safe Part 12 QA requires one canonically accepted quotation/);
  assert.match(qa, /No real Payment was verified for QA/);
  assert.match(qa, /no fake production business record was created/i);
});

test('existing authenticated deploy QA command is composed to fail on Part 12 QA', () => {
  assert.match(packageJson.scripts['production:verify-part11-ui'], /verify-part11-authenticated-production-ui/);
  assert.match(packageJson.scripts['production:verify-part11-ui'], /production:verify-part12-ui/);
});
