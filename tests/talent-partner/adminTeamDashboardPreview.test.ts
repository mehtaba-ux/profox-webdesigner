import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260831173000_admin_team_dashboard_preview.sql', 'utf8');
const component = readFileSync('src/components/admin/AdminTeamDashboardPreview.tsx', 'utf8');
const authContext = readFileSync('src/lib/AuthContext.tsx', 'utf8');

test('team dashboard preview keeps the authenticated Admin identity', () => {
  assert.match(component, /You remain signed in as Admin/i);
  assert.match(component, /No employee session or credential was created/i);
  assert.doesNotMatch(component, /signInWithPassword|verifyOtp|setSession|magiclink/i);
  assert.doesNotMatch(authContext, /previewed_user|impersonat/i);
});

test('only real current departmental team members can be previewed', () => {
  assert.match(component, /PREVIEWABLE_ROLES/i);
  assert.match(component, /status !== 'pending'/i);
  assert.match(component, /@profoxwebdesigner\.test/i);
  assert.match(migration, /role in \('admin','customer','pending'\)/i);
  assert.match(migration, /status = 'pending'/i);
  assert.match(migration, /@profoxwebdesigner\.test/i);
});

test('preview openings are Admin-authorized, audited and not client-writable', () => {
  assert.match(migration, /not public\.is_admin\(\)/i);
  assert.match(migration, /admin_team_dashboard_preview_events/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.admin_team_dashboard_preview_events from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.admin_record_team_dashboard_preview\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_record_team_dashboard_preview\(uuid\) to authenticated/i);
});
