import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const qa=await readFile('scripts/verify-part13-authenticated-production-ui.mjs','utf8');
const ui=await readFile('src/components/admin/SalesPerformanceManagement.tsx','utf8');
const packageJson=JSON.parse(await readFile('package.json','utf8'));

test('shared authenticated QA resolves visible text before first-match waits',()=>{
  assert.match(qa,/getByText\(text, \{ exact: true \}\)\.filter\(\{ visible: true \}\)\.first\(\)\.waitFor/);
});

test('Part 15 reuses the trusted authenticated Part 13/14 session harness',()=>{
  assert.match(qa,/verifyPart15Admin/);
  assert.match(qa,/verifyPart15Seller/);
  assert.match(qa,/sessionScopedClient/);
  assert.match(qa,/auth\.admin\.generateLink/);
  assert.match(qa,/verifyOtp/);
});

test('Part 15 production QA snapshots performance truth before and after',()=>{
  assert.match(qa,/const part15Before = await part15PerformanceInventory/);
  assert.match(qa,/const part15After = await part15PerformanceInventory/);
  assert.match(qa,/Part 15 authenticated production QA changed performance review\/settings truth/);
  assert.match(qa,/No real performance review was completed\/edited/);
  assert.match(qa,/no fake review\/business record was created/);
});

test('Part 15 Admin QA verifies visible quality evidence and human-review boundary',()=>{
  assert.match(qa,/\/admin\/sales-performance/);
  assert.match(qa,/Quality revenue \+ clean delivery/);
  assert.match(qa,/System evidence · read only/);
  assert.match(qa,/Quantitative evidence for this review period/);
  assert.match(qa,/Approved quality evidence/);
  assert.match(qa,/Management decision/);
  assert.match(qa,/part15-person-drawer/);
  assert.match(qa,/part15-quality-evidence/);
  assert.match(qa,/part15-review-drawer/);
  assert.match(qa,/visible:true/);
  assert.match(ui,/data-testid="part15-person-drawer"/);
  assert.match(ui,/data-testid="part15-quality-evidence"/);
  assert.match(ui,/part15-quality-metric-\$\{metric\.key\}/);
  assert.match(ui,/firstResponseSla: 'First-response SLA'/);
  assert.match(ui,/commercialExceptions: 'Approval \/ exception frequency'/);
  assert.match(ui,/dealValue: 'Won deal value'/);
  assert.match(ui,/data-testid="part15-review-drawer"/);
  assert.match(qa,/Seller Quality Score\|Failure score\|Bottom performer/);
});

test('Part 15 Seller QA verifies self-only access and hides Admin authority',()=>{
  assert.match(qa,/get_my_sales_performance/);
  assert.match(qa,/Seller unexpectedly viewed another user performance snapshot/);
  assert.match(qa,/Seller unexpectedly received Admin performance settings/);
  assert.match(qa,/Seller unexpectedly received performance-settings mutation authority/);
  assert.match(qa,/Seller unexpectedly received the Admin management-review form/);
});

test('Part 15 QA covers metric availability and unsupported-data truth',()=>{
  assert.match(qa,/AVAILABLE/);
  assert.match(qa,/INSUFFICIENT_DATA/);
  assert.match(qa,/NOT_TRACKED_AUTHORITATIVELY/);
  assert.match(qa,/Post-sale Sales-attributed scope changes/);
  assert.match(qa,/Client expectation disputes/);
  assert.match(ui,/Not tracked authoritatively/);
});

test('Part 15 QA covers mobile keyboard and Seller Command Center continuity',()=>{
  assert.match(qa,/width:390,height:844/);
  assert.match(qa,/keyboard\.press\('Tab'\)/);
  assert.match(qa,/\/admin\/seller-command-center/);
});

test('Part 15 package wiring uses focused tests and trusted harness',()=>{
  assert.match(packageJson.scripts['test:crm-part15'],/crm-seller-quality-performance-part-15\.test\.mjs/);
  assert.match(packageJson.scripts['test:crm-part15'],/crm-seller-quality-performance-part-15-matrix\.test\.mjs/);
  assert.match(packageJson.scripts['test:crm-part15'],/part15-authenticated-production-ui\.test\.mjs/);
  assert.match(packageJson.scripts['production:verify-part15-ui'],/verify-part13-authenticated-production-ui\.mjs/);
});

test('Part 16 remains outside Part 15 QA',()=>{
  assert.doesNotMatch(qa,/Part 16|certification permissions|deal-complexity permissions/i);
});
