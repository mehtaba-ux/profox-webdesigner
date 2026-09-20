import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const verifier = await readFile('scripts/verify-part11-authenticated-production-ui.mjs', 'utf8');
const workflow = await readFile('.github/workflows/deploy-cloudflare.yml', 'utf8');

test('authenticated Part 11 production QA uses trusted server-side session issuance', () => {
  assert.match(verifier, /api-keys\?reveal=true/);
  assert.match(verifier, /SUPABASE_ACCESS_TOKEN/);
  assert.match(verifier, /auth\.admin\.generateLink/);
  assert.match(verifier, /verifyOtp/);
  assert.match(verifier, /sales\.demo@profoxwebdesigner\.test/);
  assert.match(verifier, /role', 'admin'/);
});

test('server API key is never injected into the browser context', () => {
  assert.match(verifier, /context\.addInitScript/);
  assert.match(verifier, /\{ key: storageKey, value: session \}/);
  assert.doesNotMatch(verifier, /addInitScript[\s\S]{0,500}serverKey/);
  assert.doesNotMatch(verifier, /localStorage\.setItem\([^\n]*serverKey/);
});

test('authenticated Part 11 production QA is non-destructive to CRM business truth', () => {
  assert.match(verifier, /const before = await businessSnapshot\(\)/);
  assert.match(verifier, /const after = await businessSnapshot\(\)/);
  assert.match(verifier, /Authenticated Part 11 UI QA mutated CRM business truth/);
  assert.match(verifier, /crm_opportunities/);
  assert.match(verifier, /crm_activities/);
  assert.match(verifier, /part11_negotiation_next_action/);
  assert.doesNotMatch(verifier, /\.insert\s*\(/);
  assert.doesNotMatch(verifier, /\.update\s*\(/);
  assert.doesNotMatch(verifier, /\.upsert\s*\(/);
  assert.doesNotMatch(verifier, /\.delete\s*\(/);
});

test('Seller and Admin production UI checks cover canonical Part 11 surfaces', () => {
  assert.match(verifier, /verifySeller/);
  assert.match(verifier, /verifyAdmin/);
  assert.match(verifier, /Sales Pipeline Command Center/);
  assert.match(verifier, /Activities & Follow-Up/);
  assert.match(verifier, /Quotation Approvals/);
  assert.match(verifier, /Pipeline settings/);
  assert.match(verifier, /Activity settings/);
  assert.match(verifier, /width: 390, height: 844/);
  assert.match(verifier, /keyboard-focusable control/);
});

test('canonical production deploy requires authenticated Part 11 UI QA', () => {
  assert.match(workflow, /Verify authenticated Part 11 Seller\/Admin production UI/);
  assert.match(workflow, /npm run production:verify-part11-ui/);
  assert.match(workflow, /Install Chromium for production smoke tests[\s\S]*Verify authenticated Part 11 Seller\/Admin production UI/);
});
