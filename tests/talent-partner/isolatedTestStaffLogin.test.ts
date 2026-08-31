import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260831180000_isolated_test_staff_login_audit.sql', 'utf8');
const edgeFunction = readFileSync('supabase/functions/test-staff-login/index.ts', 'utf8');
const service = readFileSync('src/lib/testStaffAccessService.ts', 'utf8');
const dashboard = readFileSync('src/components/admin/TestStaffDashboard.tsx', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');

test('retained departmental test identities remain inactive at the database boundary', () => {
  assert.match(service, /profile\.status === 'inactive'/i);
  assert.match(edgeFunction, /targetProfile\.status === "inactive"/i);
  assert.doesNotMatch(migration, /set\s+status\s*=\s*'active'/i);
  assert.match(migration, /p\.status='inactive'/i);
});

test('test session issuance remains active-Admin only and fail-closed audited', () => {
  assert.match(edgeFunction, /callerProfile\.role !== "admin" \|\| callerProfile\.status !== "active"/i);
  assert.match(edgeFunction, /targetAuthUser\.app_metadata\?\.test_account !== true/i);
  assert.match(edgeFunction, /test_staff_login_audit/i);
  assert.match(edgeFunction, /if \(auditError\) throw new Error/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.test_staff_login_audit from public, anon, authenticated/i);
  assert.match(migration, /grant insert on table public\.test_staff_login_audit to service_role/i);
});

test('signed-in test identities render only a non-persistent inspection dashboard', () => {
  assert.match(dashboard, /Live CRM records, projects, payments, messages, uploads, and settings are not loaded/i);
  assert.match(dashboard, /WORKSPACE_APPS\.filter/i);
  assert.doesNotMatch(dashboard, /supabase|\.rpc\(|\.from\(/i);
  assert.match(workflow, /VITE_ENABLE_TEST_STAFF_LOGIN: 'true'/i);
  assert.match(workflow, /supabase secrets set ENABLE_TEST_STAFF_LOGIN=true/i);
});
