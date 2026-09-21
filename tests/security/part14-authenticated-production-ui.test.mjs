import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const qa = await readFile('scripts/verify-part13-authenticated-production-ui.mjs','utf8');
const app = await readFile('src/App.tsx','utf8');
const packageJson = JSON.parse(await readFile('package.json','utf8'));

test('Part 14 reuses the trusted authenticated Part 13 QA session harness', () => {
  assert.match(qa,/verifyPart14Admin/);
  assert.match(qa,/verifyPart14Seller/);
  assert.match(qa,/sessionScopedClient/);
  assert.match(qa,/auth\.admin\.generateLink/);
  assert.match(qa,/verifyOtp/);
});

test('Part 14 production QA is non-destructive and inventory guarded', () => {
  assert.match(qa,/const part14Before = await part14BusinessInventory/);
  assert.match(qa,/const part14After = await part14BusinessInventory/);
  assert.match(qa,/Part 14 authenticated production QA changed business inventory/);
  assert.match(qa,/No fake Validation, quotation approval, activity, returned handoff, Promise conflict, SOP override, business record or exception record was created/);
});

test('Part 14 Admin QA verifies workspace essentials', () => {
  assert.match(qa,/page\.goto\(.*\/admin\/manager-exceptions/);
  assert.match(qa,/Manager Exceptions/);
  assert.match(qa,/Total Exceptions/);
  assert.match(qa,/Pending Review/);
  assert.match(qa,/Search Manager Exceptions/);
  assert.match(qa,/Filter by Seller or owner/);
  assert.match(qa,/Exception Detail · Read-Only/);
});

test('Part 14 Admin QA verifies source routing without new mutation authority', () => {
  assert.match(qa,/first\.actionLabel/);
  assert.match(qa,/first\.actionUrl/);
  assert.match(qa,/Resolve Exception/);
  assert.match(qa,/Ignore forever/);
  assert.match(qa,/Dismiss blocker/);
  assert.match(qa,/Approve Quotation/);
  assert.match(qa,/Accept Handoff/);
});

test('Part 14 Seller QA verifies direct RPC rejection and no team workspace', () => {
  assert.match(qa,/Seller unexpectedly invoked the team-wide Manager Exception RPC/);
  assert.match(qa,/Seller unexpectedly received the team-wide Manager Exception Workspace/);
  assert.match(qa,/Seller Command Center unexpectedly exposed team Manager Exceptions/);
});

test('Part 14 QA covers desktop tablet mobile and keyboard focus', () => {
  assert.match(qa,/width: 1440, height: 1000/);
  assert.match(qa,/width: 768, height: 1024/);
  assert.match(qa,/width: 390, height: 844/);
  assert.match(qa,/mobile Manager Exceptions did not expose keyboard focus/);
});

test('Part 14 focused command contains both implementation tests, exact matrix and QA contract', () => {
  const command=packageJson.scripts['test:crm-part14'];
  assert.match(command,/crm-manager-exception-workspace-part-14\.test\.mjs/);
  assert.match(command,/crm-manager-exception-workspace-part-14-matrix\.test\.mjs/);
  assert.match(command,/part14-authenticated-production-ui\.test\.mjs/);
});

test('Part 14 release verifier is part of production verification', () => {
  assert.match(packageJson.scripts['production:verify'],/production:verify-part14/);
  assert.match(packageJson.scripts['production:verify-part14'],/verify-part14-release-readiness/);
});

test('Part 14 production UI command uses the same trusted harness that deployment already runs', () => {
  assert.match(packageJson.scripts['production:verify-part14-ui'],/verify-part13-authenticated-production-ui/);
  assert.match(packageJson.scripts['production:verify-part13-ui'],/verify-part13-authenticated-production-ui/);
  assert.match(packageJson.scripts['production:verify-part12-ui'],/production:verify-part13-ui/);
});

test('Part 15 remains out of Part 14 QA and package wiring', () => {
  assert.doesNotMatch(qa,/Part 15|seller quality|first-pass handoff acceptance/i);
  assert.equal(packageJson.scripts['test:crm-part15'],undefined);
});


test('shared lazy workspace fallback has visible text for deterministic route readiness', () => {
  assert.match(app,/Loading ProFox workspace…/);
  assert.match(app,/aria-live="polite"/);
});
