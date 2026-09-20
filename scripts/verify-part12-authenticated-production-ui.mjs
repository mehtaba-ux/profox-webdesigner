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
  if (!value) throw new Error(`${name} is required for authenticated Part 12 production UI QA.`);
}
if (!/^https:\/\//i.test(baseUrl)) throw new Error('Authenticated Part 12 UI QA must target an HTTPS production URL.');

const apiKeyResponse = await fetch(
  `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`,
  { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
);
if (!apiKeyResponse.ok) throw new Error(`Supabase Management API key lookup failed with HTTP ${apiKeyResponse.status}.`);
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
if (!serverKey) throw new Error('Trusted production runner could not obtain a server-side Supabase key.');

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
  const paymentRows = await server.from('payments')
    .select('id,status,amount_due,amount_paid,verified_at,verified_by,client_id,quotation_id,opportunity_id')
    .order('id');
  if (paymentRows.error) throw paymentRows.error;

  const opportunityRows = await server.from('crm_opportunities')
    .select('id,stage,status,won_at,client_id')
    .order('id');
  if (opportunityRows.error) throw opportunityRows.error;

  return {
    payments: await countRows('payments'),
    verifiedPayments: await countRows('payments', query => query.eq('status', 'Verified')),
    opportunities: await countRows('crm_opportunities'),
    won: await countRows('crm_opportunities', query => query.or('stage.eq.Won,status.eq.Won')),
    awaitingAdvance: await countRows('crm_opportunities', query => query.eq('stage', 'Awaiting Advance Payment')),
    clients: await countRows('clients'),
    projects: await countRows('projects'),
    onboardings: await countRows('client_onboardings'),
    commissions: await countRows('commission_entries'),
    activities: await countRows('crm_activities'),
    paymentRows: paymentRows.data,
    opportunityRows: opportunityRows.data,
  };
}

async function loadQaTruth() {
  const sellerResult = await server.from('user_profiles')
    .select('id,email,role,status,onboarding_status,onboarding_progress')
    .eq('email', 'sales.demo@profoxwebdesigner.test')
    .eq('role', 'sales')
    .eq('status', 'active')
    .eq('onboarding_status', 'completed')
    .eq('onboarding_progress', 100)
    .maybeSingle();
  if (sellerResult.error || !sellerResult.data) throw new Error(sellerResult.error?.message || 'Approved synthetic Sales test identity is unavailable.');

  const opportunityResult = await server.from('crm_opportunities')
    .select('id,name,company_name,stage,status,salesperson_id')
    .eq('stage', 'Awaiting Advance Payment')
    .eq('salesperson_id', sellerResult.data.id)
    .eq('status', 'Open')
    .limit(2);
  if (opportunityResult.error) throw opportunityResult.error;
  if (opportunityResult.data?.length !== 1) {
    throw new Error(`Expected exactly one existing safe Awaiting Advance Payment opportunity owned by the synthetic Seller; found ${opportunityResult.data?.length || 0}.`);
  }
  const opportunity = opportunityResult.data[0];

  const quoteResult = await server.from('quotations')
    .select('id,status,accepted_at')
    .eq('opportunity_id', opportunity.id)
    .eq('status', 'Accepted')
    .not('accepted_at', 'is', null)
    .limit(2);
  if (quoteResult.error || quoteResult.data?.length !== 1) {
    throw new Error('Safe Part 12 QA requires one canonically accepted quotation for the synthetic Seller Awaiting Payment opportunity.');
  }

  const paymentResult = await server.from('payments')
    .select('id,payment_type,status,amount_due,amount_paid,due_date,payment_link,quotation_id,opportunity_id')
    .eq('opportunity_id', opportunity.id)
    .eq('quotation_id', quoteResult.data[0].id)
    .in('payment_type', ['Advance','Full Payment'])
    .order('milestone_number', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (paymentResult.error || !paymentResult.data) throw new Error('Safe Part 12 QA requires the existing canonical qualifying payment request.');
  if (!['Sent','Pending','Partially Paid','Verification Pending'].includes(paymentResult.data.status)) {
    throw new Error(`Part 12 QA will not mutate a payment in unexpected state ${paymentResult.data.status}.`);
  }

  const sellerAuth = await server.auth.admin.getUserById(sellerResult.data.id);
  if (sellerAuth.error || !sellerAuth.data.user?.email) throw new Error('Synthetic Seller Auth identity is unavailable.');
  if (sellerAuth.data.user.app_metadata?.test_account !== true || !sellerAuth.data.user.email_confirmed_at) {
    throw new Error('Seller QA identity is not a confirmed synthetic test account.');
  }

  const adminsResult = await server.from('user_profiles')
    .select('id,email,role,status')
    .eq('role', 'admin')
    .eq('status', 'active')
    .limit(10);
  if (adminsResult.error || !adminsResult.data?.length) throw new Error('No active Admin profile is available for authenticated production QA.');

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
    opportunity,
    quotation: quoteResult.data[0],
    payment: paymentResult.data,
  };
}

async function issueSession(profile, label) {
  const link = await server.auth.admin.generateLink({ type: 'magiclink', email: profile.email });
  if (link.error) throw link.error;
  const tokenHash = String(link.data?.properties?.hashed_token || '').trim();
  if (!tokenHash) throw new Error(`${label} one-time session token was not generated.`);
  const verified = await publicClient.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (verified.error || !verified.data.session) throw new Error(verified.error?.message || `${label} session verification failed.`);
  if (verified.data.user.id !== profile.id) throw new Error(`${label} session resolved to the wrong user.`);
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

function runtimeGuard(page, label) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 500 && (response.url().startsWith(baseUrl) || response.url().startsWith(supabaseUrl))) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  return () => {
    if (errors.length) throw new Error(`${label} runtime error(s): ${errors.join(' | ')}`);
  };
}

async function expectText(page, text, timeout = 30_000) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout });
}

async function verifySeller(browser, session, truth) {
  const context = await authenticatedContext(browser, session, { width: 1440, height: 900 });
  const page = await context.newPage();
  const assertRuntime = runtimeGuard(page, 'Seller Part 12');
  try {
    await page.goto(`${baseUrl}/admin/app/crm?tab=pipeline`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Sales Pipeline Command Center');
    await expectText(page, 'individual');
    await page.getByText(truth.opportunity.name, { exact: true }).first().click();
    await expectText(page, 'Canonical commercial activation state');
    await expectText(page, 'PAYMENT OVERDUE');
    await expectText(page, 'Accepted quotation');
    await expectText(page, 'Open payments');
    if (await page.getByText('Review payment verification', { exact: true }).count()) {
      throw new Error('Seller unexpectedly received payment verification authority.');
    }
    if (await page.getByText('Won', { exact: true }).locator('button:not([disabled])').count()) {
      throw new Error('Seller unexpectedly received an enabled manual Won control.');
    }

    await page.goto(`${baseUrl}/admin/app/sales?tab=payments`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Payments & Transactions');
    if (await page.getByRole('button', { name: 'Admin verify payment through protected workflow' }).count()) {
      throw new Error('Seller unexpectedly received the Admin payment verification control.');
    }

    await page.goto(`${baseUrl}/admin/app/crm?tab=activities`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Activities & Follow-Up');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/admin/app/crm?tab=pipeline`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Sales Pipeline Command Center');
    await expectText(page, 'PAYMENT OVERDUE');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el !== document.body && el !== document.documentElement);
    });
    if (!focused) throw new Error('Part 12 mobile Seller Pipeline did not expose keyboard focus.');

    assertRuntime();
    console.log('PASS  Part 12 authenticated Seller QA: Awaiting Payment visible, overdue text visible, accepted quote/payment routes present, no Verify Payment, no manual Won, Activities reachable, mobile/keyboard PASS.');
  } finally {
    await context.close();
  }
}

async function verifyAdmin(browser, session, truth) {
  const context = await authenticatedContext(browser, session, { width: 1440, height: 900 });
  const page = await context.newPage();
  const assertRuntime = runtimeGuard(page, 'Admin Part 12');
  try {
    await page.goto(`${baseUrl}/admin/app/crm?tab=pipeline`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Sales Pipeline Command Center');
    await expectText(page, 'team');
    await page.getByText(truth.opportunity.name, { exact: true }).first().click();
    await expectText(page, 'Canonical commercial activation state');
    await expectText(page, 'PAYMENT OVERDUE');
    await expectText(page, 'Open payments');

    await page.goto(`${baseUrl}/admin/app/sales?tab=payments`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Payments & Transactions');
    await page.getByRole('button', { name: 'Admin verify payment through protected workflow' }).first().waitFor({ state: 'visible', timeout: 30_000 });

    assertRuntime();
    console.log('PASS  Part 12 authenticated Admin QA: team Pipeline activation state and canonical protected Payment verification route visible; no verification executed.');
  } finally {
    await context.close();
  }
}

const before = await businessSnapshot();
const truth = await loadQaTruth();
const [sellerSession, adminSession] = await Promise.all([
  issueSession(truth.seller, 'Seller'),
  issueSession(truth.admin, 'Admin'),
]);

const browser = await chromium.launch({ headless: true });
try {
  await verifySeller(browser, sellerSession, truth);
  await verifyAdmin(browser, adminSession, truth);
} finally {
  await browser.close();
}

const after = await businessSnapshot();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error(`Part 12 authenticated production QA mutated business truth. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`);
}

console.log(`PASS  Part 12 production business-data immutability: payments=${after.payments}, verified=${after.verifiedPayments}, opportunities=${after.opportunities}, Awaiting=${after.awaitingAdvance}, Won=${after.won}, clients=${after.clients}, projects=${after.projects}, onboardings=${after.onboardings}, commissions=${after.commissions}, activities=${after.activities}.`);
console.log('PASS  No real Payment was verified for QA; no real Opportunity was marked Won for QA; no fake production business record was created.');
console.log('Authenticated Part 12 Seller/Admin production UI QA: COMPLETE.');
