import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const portalEntry = readFileSync('src/components/client/ClientPortalEntry.tsx', 'utf8');

test('forgot-password does not claim a reset was sent for an unactivated invited client', () => {
  const activationGuard = "inviteToken && inviteInfo && !inviteInfo.alreadyLinked && !inviteError";
  const guardIndex = portalEntry.indexOf(activationGuard);
  const resetIndex = portalEntry.indexOf('supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })');

  assert.ok(guardIndex >= 0, 'valid unclaimed invitations must be detected before password recovery');
  assert.ok(resetIndex > guardIndex, 'direct Auth recovery must run only after the activation guard');
  assert.match(portalEntry, /setMode\('activate'\)/);
  assert.match(portalEntry, /This Client Portal has not been activated yet\. Create your account below and ProFox will send the secure verification email to finish setup\./);
  assert.match(portalEntry, /Use the same email address registered for this ProFox client relationship\./);
});

test('established Client Portal accounts retain secure password recovery', () => {
  assert.match(portalEntry, /CLIENT_PORTAL_RECOVERY_ORIGIN = 'https:\/\/www\.profoxwebdesigner\.com'/);
  assert.match(portalEntry, /supabase\.auth\.resetPasswordForEmail\(normalizedEmail, \{ redirectTo \}\)/);
  assert.match(portalEntry, /If this email has an active Client Portal account, a password reset link has been sent\./);
  assert.match(portalEntry, /event === 'PASSWORD_RECOVERY'/);
  assert.match(portalEntry, /supabase\.auth\.updateUser\(\{ password: recoveryPassword \}\)/);
});
