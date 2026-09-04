import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sellerFlow = readFileSync('supabase/migrations/20260904125851_seller_onboarding_followup_and_portal_verification.sql', 'utf8');
const hardening = readFileSync('supabase/migrations/20260904130946_harden_seller_onboarding_handoff.sql', 'utf8');
const leadDrawer = readFileSync('src/components/admin/crm/CRMLeadDrawer.tsx', 'utf8');
const portalEntry = readFileSync('src/components/client/ClientPortalEntry.tsx', 'utf8');
const verificationFunction = readFileSync('supabase/functions/client-portal-verification/index.ts', 'utf8');
const productionDeploy = readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
const authRedirectEnforcement = readFileSync('scripts/enforce-supabase-auth-redirects.mjs', 'utf8');

test('seller lead workspace uses the canonical paid-project onboarding handoff', () => {
  assert.match(leadDrawer, /crm_get_lead_onboarding_handoff/);
  assert.match(leadDrawer, /crm_resend_lead_onboarding/);
  assert.match(leadDrawer, /\/client-onboarding\//);
  assert.match(leadDrawer, /allowedOrigins/);
  assert.match(leadDrawer, /Resend onboarding invite/);
  assert.match(leadDrawer, /do not create duplicate onboarding records/);
});

test('seller handoff server RPCs keep access scoped to CRM ownership and reuse onboarding', () => {
  assert.match(sellerFlow, /create or replace function public\.crm_get_lead_onboarding_handoff/);
  assert.match(sellerFlow, /if not public\.crm_can_access_lead\(p_lead_id\)/);
  assert.match(sellerFlow, /create or replace function public\.crm_resend_lead_onboarding/);
  assert.match(sellerFlow, /perform public\.ensure_client_onboarding_for_project\(v_project_id,true\)/);
  assert.doesNotMatch(sellerFlow, /crm_resend_lead_onboarding[\s\S]*insert into public\.client_onboardings/);
});

test('seller onboarding resend is server-side rate limited and capped', () => {
  assert.match(hardening, /for update/);
  assert.match(hardening, /interval '120 seconds'/);
  assert.match(hardening, /coalesce\(v_invite_count,0\)>=50/);
  assert.match(hardening, /crm_can_access_lead\(p_lead_id\)/);
});

test('seller receives Day 1 through Day 7 reminders only while onboarding is incomplete', () => {
  assert.match(sellerFlow, /queue_due_client_onboarding_seller_reminders/);
  assert.match(sellerFlow, /o\.status in \('Pending','In Progress'\)/);
  assert.match(sellerFlow, /v_day<1 or v_day>7/);
  assert.match(sellerFlow, /clientOnboardingSellerReminders/);
  assert.match(sellerFlow, /client_onboarding_completion_cleanup_trigger/);
  assert.match(sellerFlow, /status='Cancelled'/);
});

test('raw onboarding handoff tokens stay behind service-only table privileges', () => {
  assert.match(sellerFlow, /alter table public\.client_onboarding_private_links enable row level security/);
  assert.match(sellerFlow, /revoke all on public\.client_onboarding_private_links from public, anon, authenticated/);
  assert.match(sellerFlow, /grant all on public\.client_onboarding_private_links to service_role/);
});

test('client portal verification is generated server-side and delivered by tracked ProFox notification flow', () => {
  assert.match(verificationFunction, /service_client_portal_verification_context/);
  assert.match(verificationFunction, /auth\.admin\.generateLink/);
  assert.match(verificationFunction, /service_queue_client_portal_verification/);
  assert.match(verificationFunction, /\["pending", "customer"\]/);
  assert.match(verificationFunction, /allowedOrigins/);
  assert.doesNotMatch(verificationFunction, /api\.brevo\.com|api\.resend\.com/);
});

test('client portal verification emails always return to production even during localhost development', () => {
  assert.match(verificationFunction, /CLIENT_PORTAL_ORIGIN = "https:\/\/www\.profoxwebdesigner\.com"/);
  assert.match(verificationFunction, /const redirectTo = `\$\{CLIENT_PORTAL_ORIGIN\}\/client-portal\?invite=/);
  assert.match(verificationFunction, /generatedRedirect\.startsWith\(`\$\{CLIENT_PORTAL_ORIGIN\}\/client-portal`\)/);
  assert.doesNotMatch(verificationFunction, /const safeOrigin = origin/);
  assert.doesNotMatch(verificationFunction, /`\$\{origin\}\/client-portal/);
});

test('portal UI reports queued verification only after the verification service accepts the request', () => {
  assert.match(portalEntry, /functions\.invoke\('client-portal-verification'/);
  assert.match(portalEntry, /data\?\.verificationQueued !== true/);
  assert.match(portalEntry, /Verification email queued securely through ProFox/);
  assert.match(portalEntry, /Queue another verification email/);
  assert.match(portalEntry, /verificationQueued \? 'Verification Queued'/);
});

test('verification email queue has resend cooldown, attempt cap and indexed lookup', () => {
  assert.match(sellerFlow, /customer_client_portal_email_verification/);
  assert.match(sellerFlow, /interval '120 seconds'/);
  assert.match(sellerFlow, /v_attempt>=20/);
  assert.match(hardening, /notification_outbox_portal_verification_onboarding_idx/);
});

test('client portal password recovery always returns to the canonical production portal', () => {
  assert.match(portalEntry, /CLIENT_PORTAL_RECOVERY_ORIGIN = 'https:\/\/www\.profoxwebdesigner\.com'/);
  assert.match(portalEntry, /`\$\{CLIENT_PORTAL_RECOVERY_ORIGIN\}\/client-portal\?\$\{recoveryParams\.toString\(\)\}`/);
  assert.match(portalEntry, /resetPasswordForEmail\(normalizedEmail, \{ redirectTo \}\)/);
  assert.match(portalEntry, /event === 'PASSWORD_RECOVERY'/);
  assert.match(portalEntry, /auth\.updateUser\(\{ password: recoveryPassword \}\)/);
  assert.doesNotMatch(portalEntry, /`\$\{window\.location\.origin\}\/client-portal/);
});

test('production deployment enforces hosted Supabase Auth URLs and deploys Client Portal verification', () => {
  assert.match(productionDeploy, /Enforce production Supabase Auth redirects/);
  assert.match(productionDeploy, /node scripts\/enforce-supabase-auth-redirects\.mjs/);
  assert.match(productionDeploy, /functions deploy client-portal-verification --no-verify-jwt/);
  assert.match(authRedirectEnforcement, /site_url: canonicalOrigin/);
  assert.match(authRedirectEnforcement, /uri_allow_list: nextAllowList\.join\(','\)/);
  assert.match(authRedirectEnforcement, /https:\/\/www\.profoxwebdesigner\.com/);
  assert.match(authRedirectEnforcement, /https:\/\/profoxwebdesigner\.com/);
  assert.match(authRedirectEnforcement, /isLocalRedirect/);
  assert.match(authRedirectEnforcement, /managementRequest\('PATCH'/);
  assert.match(authRedirectEnforcement, /managementRequest\('GET'/);
});
