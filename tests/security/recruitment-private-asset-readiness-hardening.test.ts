import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260923100000_recruitment_private_asset_acl_hardening.sql','utf8');
const authEnforcement = readFileSync('scripts/enforce-supabase-auth-redirects.mjs','utf8');
const productionReadiness = readFileSync('scripts/verify-production-readiness.mjs','utf8');
const edgeFunction = readFileSync('supabase/functions/recruitment-private-asset-url/index.ts','utf8');

test('private recruitment asset authorization is service-role-only after forward hardening',()=>{
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.service_authorize_recruitment_asset_access\(uuid, uuid, text, text, text\) FROM PUBLIC/);
  assert.match(migration,/FROM anon/);
  assert.match(migration,/FROM authenticated/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.service_authorize_recruitment_asset_access\(uuid, uuid, text, text, text\) TO service_role/);
  assert.match(migration,/has_function_privilege\('anon',v_oid,'EXECUTE'\)/);
  assert.match(migration,/has_function_privilege\('authenticated',v_oid,'EXECUTE'\)/);
  assert.match(migration,/has_function_privilege\('service_role',v_oid,'EXECUTE'\)/);
});

test('edge function authenticates reviewer before service-role RPC invocation',()=>{
  assert.match(edgeFunction,/admin\.auth\.getUser\(token\)/);
  assert.match(edgeFunction,/if \(userError \|\| !user\?\.id\)/);
  assert.match(edgeFunction,/p_actor_user_id: user\.id/);
  assert.match(edgeFunction,/admin\.rpc\("service_authorize_recruitment_asset_access"/);
  assert.doesNotMatch(edgeFunction,/p_actor_user_id:\s*body/);
});

test('production readiness fails if private recruitment helper is exposed to browser roles',()=>{
  assert.match(productionReadiness,/service_authorize_recruitment_asset_access/);
  assert.match(productionReadiness,/authenticated_execute/);
  assert.match(productionReadiness,/service_execute/);
  assert.match(productionReadiness,/Recruitment private-asset RPC/);
  assert.match(productionReadiness,/service-role-only execution verified/);
});

test('production auth enforcement attempts leaked-password protection and fails closed except for documented plan limitation',()=>{
  assert.match(authEnforcement,/password_hibp_enabled:\s*true/);
  assert.match(authEnforcement,/HTTP 402/);
  assert.match(authEnforcement,/current project plan does not include this Pro-level feature/);
  assert.match(authEnforcement,/after\.password_hibp_enabled !== true/);
  assert.match(authEnforcement,/if \(!leakedPasswordProtectionPlanLimited\)/);
  assert.match(authEnforcement,/throw new Error\('Supabase Auth leaked-password protection is not enabled\.'/);
  assert.match(authEnforcement,/leaked-password protection remains disabled because the current project plan returned HTTP 402/);
});
