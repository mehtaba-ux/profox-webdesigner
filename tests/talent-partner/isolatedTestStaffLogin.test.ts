import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const auditMigration = readFileSync('supabase/migrations/20260831180000_isolated_test_staff_login_audit.sql', 'utf8');
const activationMigration = readFileSync('supabase/migrations/20260831190000_restore_full_departmental_test_accounts.sql', 'utf8');
const calendarResetMigration = readFileSync('supabase/migrations/20260831191000_reset_test_seller_stale_calendar_connection.sql', 'utf8');
const edgeFunction = readFileSync('supabase/functions/test-staff-login/index.ts', 'utf8');
const service = readFileSync('src/lib/testStaffAccessService.ts', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
const routes = [
  'src/components/admin/workspace/AdminEntry.tsx',
  'src/components/admin/workspace/AdminAppWorkspace.tsx',
  'src/components/admin/workspace/WorkspaceLauncher.tsx',
  'src/components/admin/workspace/WorkspaceRouteFrame.tsx',
].map(file => readFileSync(file, 'utf8')).join('\n');

test('retained departmental test identities have normal active employee access', () => {
  assert.match(service, /profile\.status === 'active'/i);
  assert.match(edgeFunction, /targetProfile\.status === "active"/i);
  assert.match(activationMigration, /set status='active'/i);
  assert.doesNotMatch(routes, /test-workspace|isSyntheticTestProfile/i);
});

test('test session issuance remains active-Admin only and fail-closed audited', () => {
  assert.match(edgeFunction, /callerProfile\.role !== "admin" \|\| callerProfile\.status !== "active"/i);
  assert.match(edgeFunction, /targetAuthUser\.app_metadata\?\.test_account !== true/i);
  assert.match(edgeFunction, /test_staff_login_audit/i);
  assert.match(edgeFunction, /if \(auditError\) throw new Error/i);
  assert.match(auditMigration, /enable row level security/i);
  assert.match(auditMigration, /revoke all on table public\.test_staff_login_audit from public, anon, authenticated/i);
  assert.match(auditMigration, /grant insert on table public\.test_staff_login_audit to service_role/i);
});

test('Sales test identity is published through the normal booking eligibility flow', () => {
  assert.match(activationMigration, /service_ensure_sales_public_booking_profile/i);
  assert.match(activationMigration, /set is_public=true,accepting_bookings=true/i);
  assert.match(activationMigration, /user_calendar_settings[\s\S]+active is true/i);
  assert.match(calendarResetMigration, /service_disconnect_google_calendar/i);
  assert.match(workflow, /VITE_ENABLE_TEST_STAFF_LOGIN: 'true'/i);
  assert.match(workflow, /supabase secrets set ENABLE_TEST_STAFF_LOGIN=true/i);
});
