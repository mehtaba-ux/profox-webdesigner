import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const baseUrl = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || '');
const projectRef = String(process.env.SUPABASE_PROJECT_REF || '');

for (const [name, value] of Object.entries({
  PUBLIC_APP_URL: baseUrl,
  VITE_SUPABASE_URL: supabaseUrl,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_ACCESS_TOKEN: accessToken,
  SUPABASE_PROJECT_REF: projectRef,
})) {
  if (!value) throw new Error(`${name} is required for authenticated Part 11 production UI QA.`);
}
if (!/^https:\/\//i.test(baseUrl)) throw new Error('Authenticated Part 11 UI QA must target an HTTPS production URL.');
if (!/^https:\/\//i.test(supabaseUrl)) throw new Error('VITE_SUPABASE_URL must be an HTTPS Supabase project URL.');

const apiKeyResponse = await fetch(
  `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`,
  { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
);
if (!apiKeyResponse.ok) {
  throw new Error(`Supabase Management API key lookup failed with HTTP ${apiKeyResponse.status}.`);
}
const apiKeyPayload = await apiKeyResponse.json();
const keys = Array.isArray(apiKeyPayload)
  ? apiKeyPayload
  : Array.isArray(apiKeyPayload?.data)
    ? apiKeyPayload.data
    : Array.isArray(apiKeyPayload?.keys)
      ? apiKeyPayload.keys
      : [];

const keyValue = item => String(item?.api_key || item?.key || item?.value || '').trim();
const serverKeyEntry =
  keys.find(item => String(item?.type || '').toLowerCase() === 'secret' && keyValue(item).startsWith('sb_secret_'))
  || keys.find(item => String(item?.name || '').toLowerCase() === 'service_role')
  || keys.find(item => String(item?.type || '').toLowerCase() === 'service_role');
const serverKey = keyValue(serverKeyEntry);
if (!serverKey) throw new Error('A server-side Supabase secret/service-role key was not available to the trusted production runner.');

const server = createClient(supabaseUrl, serverKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const publicClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function countRows(table, apply = query => query) {
  const result = await apply(server.from(table).select('*', { count: 'exact', head: true }));
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

async function businessSnapshot() {
  return {
    opportunities: await countRows('crm_opportunities'),
    activities: await countRows('crm_activities'),
    negotiation: await countRows('crm_opportunities', query => query.eq('stage', 'Negotiation / Decision Pending')),
    decisionState: await countRows('crm_opportunities', query => query.not('decision_status', 'is', null)),
    part11Activities: await countRows('crm_activities', query => query.eq('automation_source', 'part11_negotiation_next_action')),
  };
}

async function loadProfiles() {
  const sellerResult = await server
    .from('user_profiles')
    .select('id,email,role,status,onboarding_status,onboarding_progress')
    .eq('email', 'sales.demo@profoxwebdesigner.test')
    .eq('role', 'sales')
    .eq('status', 'active')
    .eq('onboarding_status', 'completed')
    .eq('onboarding_progress', 100)
    .maybeSingle();
  if (sellerResult.error || !sellerResult.data) {
    throw new Error(sellerResult.error?.message || 'Approved synthetic Sales test identity is unavailable.');
  }

  const adminsResult = await server
    .from('user_profiles')
    .select('id,email,role,status')
    .eq('role', 'admin')
    .eq('status', 'active')
    .limit(10);
  if (adminsResult.error || !adminsResult.data?.length) {
    throw new Error(adminsResult.error?.message || 'No active Admin profile is available for authenticated production QA.');
  }

  const sellerAuth = await server.auth.admin.getUserById(sellerResult.data.id);
  if (sellerAuth.error || !sellerAuth.data.user) throw new Error('Synthetic Sales Auth identity is unavailable.');
  if (sellerAuth.data.user.app_metadata?.test_account !== true || !sellerAuth.data.user.email_confirmed_at) {
    throw new Error('Sales QA identity is not a confirmed synthetic test account.');
  }

  let admin = null;
  let adminAuthUser = null;
  for (const candidate of adminsResult.data) {
    const authResult = await server.auth.admin.getUserById(candidate.id);
    if (!authResult.error && authResult.data.user?.email && authResult.data.user.email_confirmed_at) {
      admin = candidate;
      adminAuthUser = authResult.data.user;
      break;
    }
  }
  if (!admin || !adminAuthUser) throw new Error('No confirmed active Admin Auth identity is available for production QA.');

  return {
    seller: { ...sellerResult.data, email: sellerAuth.data.user.email },
    admin: { ...admin, email: adminAuthUser.email },
  };
}

async function issueSession(profile, expectedRole) {
  if (!profile?.email) throw new Error(`${expectedRole} QA identity has no email.`);
  const link = await server.auth.admin.generateLink({ type: 'magiclink', email: profile.email });
  if (link.error) throw link.error;
  const tokenHash = String(link.data?.properties?.hashed_token || '').trim();
  if (!tokenHash) throw new Error(`${expectedRole} one-time session token was not generated.`);

  const verified = await publicClient.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (verified.error || !verified.data.session) {
    throw new Error(verified.error?.message || `${expectedRole} one-time session could not be verified.`);
  }
  if (verified.data.user.id !== profile.id) throw new Error(`${expectedRole} QA session resolved to the wrong user.`);
  return verified.data.session;
}

const storageKey = `sb-${projectRef}-auth-token`;

async function authenticatedContext(browser, session, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: session });
  return context;
}

function attachRuntimeGuards(page, roleLabel) {
  const pageErrors = [];
  const serverErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const url = response.url();
    if (response.status() >= 500 && (url.startsWith(baseUrl) || url.startsWith(supabaseUrl))) {
      serverErrors.push(`${response.status()} ${url}`);
    }
  });
  return () => {
    if (pageErrors.length) throw new Error(`${roleLabel} browser page error(s): ${pageErrors.join(' | ')}`);
    if (serverErrors.length) throw new Error(`${roleLabel} received production 5xx response(s): ${serverErrors.join(' | ')}`);
  };
}

async function expectText(page, text, timeout = 30_000) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout });
}

async function verifySeller(browser, session) {
  const context = await authenticatedContext(browser, session, { width: 1440, height: 900 });
  const page = await context.newPage();
  const assertRuntime = attachRuntimeGuards(page, 'Seller');
  try {
    await page.goto(`${baseUrl}/admin/app/crm?tab=pipeline`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Sales Pipeline Command Center');
    await expectText(page, 'individual');
    if (await page.getByText('Pipeline settings', { exact: true }).count()) {
      throw new Error('Seller unexpectedly received Admin Pipeline settings controls.');
    }

    await page.goto(`${baseUrl}/admin/app/crm?tab=activities`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Activities & Follow-Up');
    if (await page.getByText('Activity settings', { exact: true }).count()) {
      throw new Error('Seller unexpectedly received Admin Activity settings controls.');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/admin/app/crm?tab=pipeline`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Sales Pipeline Command Center');
    await page.keyboard.press('Tab');
    const hasKeyboardFocus = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el !== document.body && el !== document.documentElement);
    });
    if (!hasKeyboardFocus) throw new Error('Seller mobile Pipeline did not expose a keyboard-focusable control.');

    assertRuntime();
    console.log('PASS  Authenticated Seller production UI: Pipeline desktop/mobile, individual scope, Activities, keyboard focus, Admin controls absent.');
  } finally {
    await context.close();
  }
}

async function verifyAdmin(browser, session) {
  const context = await authenticatedContext(browser, session, { width: 1440, height: 900 });
  const page = await context.newPage();
  const assertRuntime = attachRuntimeGuards(page, 'Admin');
  try {
    await page.goto(`${baseUrl}/admin/app/crm?tab=pipeline`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Sales Pipeline Command Center');
    await expectText(page, 'team');
    await expectText(page, 'Pipeline settings');

    await page.goto(`${baseUrl}/admin/app/crm?tab=activities`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Activities & Follow-Up');
    await expectText(page, 'Activity settings');

    await page.goto(`${baseUrl}/admin/quotation-approvals`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Quotation Approvals');
    await expectText(page, 'Approval Requests');

    assertRuntime();
    console.log('PASS  Authenticated Admin production UI: team Pipeline scope, Admin controls, Activities and canonical Quotation Approvals.');
  } finally {
    await context.close();
  }
}

const before = await businessSnapshot();
const profiles = await loadProfiles();
const [sellerSession, adminSession] = await Promise.all([
  issueSession(profiles.seller, 'Seller'),
  issueSession(profiles.admin, 'Admin'),
]);

const browser = await chromium.launch({ headless: true });
try {
  await verifySeller(browser, sellerSession);
  await verifyAdmin(browser, adminSession);
} finally {
  await browser.close();
}

const after = await businessSnapshot();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error(`Authenticated Part 11 UI QA mutated CRM business truth. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`);
}
console.log(`PASS  Part 11 production business-data immutability: ${JSON.stringify(after)}`);
console.log('Authenticated Part 11 Seller/Admin production UI QA: COMPLETE.');
