import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const qa=await readFile('scripts/verify-part13-authenticated-production-ui.mjs','utf8');
const pkg=JSON.parse(await readFile('package.json','utf8'));

test('shared authenticated production QA includes Part 16 Seller and Admin verification',()=>{
  assert.match(qa,/async function verifyPart16Admin/);
  assert.match(qa,/async function verifyPart16Seller/);
  assert.match(qa,/await verifyPart16Admin\(browser, adminSession, truth\)/);
  assert.match(qa,/await verifyPart16Seller\(browser, sellerSession, truth\)/);
});

test('Part 16 QA is non-destructive and compares full certification lifecycle inventory',()=>{
  assert.match(qa,/async function part16CertificationInventory/);
  for(const source of [
    'sales_certification_package_grants','user_training_progress','training_reviews',
    'final_certification_state','final_certification_sessions','applicants',
    'sales_academy_test_bypasses','sales_performance_reviews','crm_leads',
    'crm_opportunities','crm_activities','quotations','payments','projects',
    'project_sales_handover_attempts'
  ]) assert.match(qa,new RegExp(source));
  assert.match(qa,/JSON\.stringify\(part16Before\) !== JSON\.stringify\(part16After\)/);
  assert.match(qa,/No real package certification, Academy progress, Final Certification, applicant stage/);
});

test('Seller QA denies self-grant, policy mutation, Admin view and cross-user scope',()=>{
  assert.match(qa,/admin_grant_sales_package_certification/);
  assert.match(qa,/Seller unexpectedly received Part 16 package-certification grant authority/);
  assert.match(qa,/admin_update_sales_certification_policy/);
  assert.match(qa,/Seller unexpectedly received Part 16 policy mutation authority/);
  assert.match(qa,/admin_get_sales_certification_permissions/);
  assert.match(qa,/sales_get_certification_permission_snapshot/);
});

test('Seller UI QA verifies staged authority, remediation, training route, mobile and keyboard',()=>{
  assert.match(qa,/part16-certification-panel/);
  assert.match(qa,/Staged — package enforcement is not active/);
  assert.match(qa,/Current deal authority is unchanged/);
  assert.match(qa,/Open training \/ re-certification/);
  assert.match(qa,/setViewportSize\(\{width:390,height:844\}\)/);
  assert.match(qa,/Part 16 Seller certification panel did not expose keyboard focus on mobile/);
});

test('Admin UI QA verifies evidence, policy controls and staged grant protection',()=>{
  assert.match(qa,/part16-final-certification-evidence/);
  assert.match(qa,/part16-policy-admin/);
  assert.match(qa,/part16-policy-product-rules/);
  assert.match(qa,/part16-policy-addon-rules/);
  assert.match(qa,/part16-policy-protected-stages/);
  assert.match(qa,/Part 16 staged Admin workspace unexpectedly enabled real certification granting/);
  assert.match(qa,/Final Certification Control Center/);
});

test('existing deployment QA chain will execute the extended shared script',()=>{
  assert.match(pkg.scripts['production:verify-part13-ui'],/verify-part13-authenticated-production-ui\.mjs/);
  assert.match(pkg.scripts['production:verify-part15-ui'],/verify-part13-authenticated-production-ui\.mjs/);
});
