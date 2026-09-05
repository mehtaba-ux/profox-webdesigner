import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const portalEntry = readFileSync('src/components/client/ClientPortalEntry.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260905103500_make_client_portal_claim_idempotent.sql', 'utf8');

test('an already-linked active customer claim is idempotent before invitation validation', () => {
  const linkedLookup = migration.indexOf('where linked_user_id = v_uid');
  const linkedReturn = migration.indexOf("if found and v_role = 'customer' and v_status = 'active' then");
  const tokenValidation = migration.indexOf('if p_invite_token is null');

  assert.ok(linkedLookup >= 0, 'expected canonical customer identity lookup');
  assert.ok(linkedReturn > linkedLookup, 'expected active linked customer return');
  assert.ok(tokenValidation > linkedReturn, 'already-linked customer must reconcile before invite validation');
  assert.match(migration, /'alreadyLinked', true/);
});

test('unlinked customers still require the canonical completed-onboarding invitation', () => {
  assert.match(migration, /portal_activation_token_hash = v_hash/);
  assert.match(migration, /v_o\.status <> 'Completed'/);
  assert.match(migration, /v_identity\.email <> v_email/);
  assert.match(migration, /portal_activation_expires_at < now\(\)/);
});

test('claim permissions remain authenticated-only', () => {
  assert.match(migration, /revoke execute on function public\.customer_portal_claim_identity\(text\) from public, anon/);
  assert.match(migration, /grant execute on function public\.customer_portal_claim_identity\(text\) to authenticated, service_role/);
});

test('the Client Portal renders the dashboard as soon as the canonical profile is active', () => {
  const dashboardGate = "if (user && profile?.role === 'customer' && profile.status === 'active') return <ClientDashboard />;";
  const incompleteGate = 'if (user) {';
  assert.ok(portalEntry.includes(dashboardGate));
  assert.ok(portalEntry.indexOf(dashboardGate) < portalEntry.indexOf(incompleteGate, portalEntry.indexOf(dashboardGate)));
});
