import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const portalEntry = readFileSync('src/components/client/ClientPortalEntry.tsx', 'utf8');
const verificationFunction = readFileSync('supabase/functions/client-portal-verification/index.ts', 'utf8');

test('Client Portal account creation relies on the canonical auth profile trigger instead of a forbidden profile upsert', () => {
  assert.match(verificationFunction, /auth\.admin\.createUser/);
  assert.match(verificationFunction, /canonical on_auth_user_created trigger/);
  assert.match(verificationFunction, /\.eq\("id", userId\)\s*\.maybeSingle\(\)/);
  assert.match(verificationFunction, /\["pending", "customer"\]\.includes\(String\(createdProfile\.role\)\)/);
  assert.doesNotMatch(verificationFunction, /\.from\("user_profiles"\)\s*\.upsert\(/);
  assert.doesNotMatch(verificationFunction, /\.from\("user_profiles"\)\s*\.update\(/);
});

test('Client Portal activation requires password confirmation before account creation', () => {
  assert.match(portalEntry, /const \[confirmPassword, setConfirmPassword\] = useState\(''\)/);
  assert.match(portalEntry, /if \(password !== confirmPassword\)/);
  assert.match(portalEntry, /Passwords do not match\. Please confirm the same password before creating your account\./);
  assert.match(portalEntry, />Confirm Password</);
  assert.match(portalEntry, /activationPasswordsMatch = password\.length >= 6 && confirmPassword\.length >= 6 && password === confirmPassword/);
});

test('Client Portal password fields provide accessible show and hide controls', () => {
  assert.match(portalEntry, /Eye, EyeOff/);
  assert.match(portalEntry, /type=\{showPassword \? 'text' : 'password'\}/);
  assert.match(portalEntry, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
  assert.match(portalEntry, /type=\{showConfirmPassword \? 'text' : 'password'\}/);
  assert.match(portalEntry, /aria-label=\{showConfirmPassword \? 'Hide confirm password' : 'Show confirm password'\}/);
  assert.match(portalEntry, /showRecoveryPassword/);
  assert.match(portalEntry, /showRecoveryConfirm/);
});

test('Client Portal surfaces structured Edge Function errors instead of the generic non-2xx SDK message', () => {
  assert.match(portalEntry, /async function functionErrorMessage/);
  assert.match(portalEntry, /context\.clone/);
  assert.match(portalEntry, /payload\?\.error \|\| payload\?\.message/);
  assert.match(portalEntry, /Edge Function returned a non-2xx status code/);
  assert.match(portalEntry, /Client Portal account could not be created\. Please try again or contact ProFox support\./);
});
