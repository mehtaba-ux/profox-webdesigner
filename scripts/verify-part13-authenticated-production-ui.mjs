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
  if (!value) throw new Error(`${name} is required for authenticated Part 13 production UI QA.`);
}
if (!/^https:\/\//i.test(baseUrl)) throw new Error('Authenticated Part 13 UI QA must target an HTTPS production URL.');

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

  const opportunities = await server.from('crm_opportunities')
    .select('id,stage,status,salesperson_id')
    .eq('salesperson_id', sellerResult.data.id)
    .eq('status', 'Won')
    .limit(20);
  if (opportunities.error) throw opportunities.error;
  const opportunityIds = (opportunities.data || []).map(row => row.id);
  if (!opportunityIds.length) throw new Error('Synthetic Seller has no Won opportunity connected to the real handoff project.');

  const projectResult = await server.from('projects')
    .select('id,project_number,project_name,stage,status,project_manager_id,source_opportunity_id,sales_handover_notes,updated_at')
    .in('source_opportunity_id', opportunityIds)
    .eq('stage', 'Sales Handover')
    .eq('status', 'Active')
    .limit(2);
  if (projectResult.error) throw projectResult.error;
  if (projectResult.data?.length !== 1) {
    throw new Error(`Expected exactly one existing real Sales Handover Project for safe Part 13 QA; found ${projectResult.data?.length || 0}.`);
  }
  const project = projectResult.data[0];
  if (project.project_manager_id !== null) {
    throw new Error('Part 13 production QA expected the current real Sales Handover Project to remain unassigned; refusing to assume or replace a legitimate PM assignment.');
  }

  const taskResult = await server.from('project_tasks')
    .select('id,workflow_key,status,assigned_to,completed_at,notes,updated_at')
    .eq('project_id', project.id)
    .in('workflow_key', ['sales_handover_submission','sales_handover_review'])
    .order('workflow_key');
  if (taskResult.error) throw taskResult.error;
  if (taskResult.data?.length !== 2) throw new Error('Safe Part 13 QA requires the two existing canonical Sales Handover tasks.');
  const sellerTask = taskResult.data.find(row => row.workflow_key === 'sales_handover_submission');
  const reviewTask = taskResult.data.find(row => row.workflow_key === 'sales_handover_review');
  if (sellerTask?.status !== 'To Do' || reviewTask?.status !== 'To Do') {
    throw new Error(`Part 13 QA refuses to mutate a real Project whose handoff tasks changed independently. Seller=${sellerTask?.status}; Review=${reviewTask?.status}.`);
  }

  const attemptResult = await server.from('project_sales_handover_attempts')
    .select('id,project_id,attempt_number,status,submitted_by,submitted_at,reviewed_by,reviewed_at,decision,return_reason_codes,missing_items,source_digest')
    .eq('project_id', project.id)
    .order('attempt_number');
  if (attemptResult.error) throw attemptResult.error;
  if ((attemptResult.data || []).length !== 0) {
    throw new Error('Part 13 QA refuses to touch the real Project because a handoff lifecycle attempt now exists. This may be legitimate business activity and requires review rather than test mutation.');
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
  if (adminsResult.error || !adminsResult.data?.length) throw new Error('No active Admin profile is available for authenticated Part 13 QA.');

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
    project,
    tasks: taskResult.data,
  };
}

async function businessSnapshot(projectId) {
  const projectResult = await server.from('projects')
    .select('id,stage,status,project_manager_id,sales_handover_notes,updated_at')
    .eq('id', projectId)
    .single();
  if (projectResult.error) throw projectResult.error;

  const taskResult = await server.from('project_tasks')
    .select('id,workflow_key,status,assigned_to,completed_at,notes,updated_at')
    .eq('project_id', projectId)
    .in('workflow_key', ['sales_handover_submission','sales_handover_review'])
    .order('workflow_key');
  if (taskResult.error) throw taskResult.error;

  const attemptResult = await server.from('project_sales_handover_attempts')
    .select('id,project_id,attempt_number,status,submitted_by,submitted_at,reviewed_by,reviewed_at,decision,return_reason_codes,missing_items,source_digest')
    .eq('project_id', projectId)
    .order('attempt_number');
  if (attemptResult.error) throw attemptResult.error;

  return {
    projectCount: await countRows('projects'),
    handoffProjectCount: await countRows('projects', query => query.eq('stage','Sales Handover')),
    lifecycleAttemptCount: await countRows('project_sales_handover_attempts'),
    inAppNotificationCount: await countRows('in_app_notifications'),
    project: projectResult.data,
    tasks: taskResult.data,
    attempts: attemptResult.data,
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

async function assertNoSecretLabels(page) {
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const forbidden of ['provider_payment_id','access_token','refresh_token','private_key','api_secret']) {
    if (body.includes(forbidden)) throw new Error(`Part 13 handoff rendered forbidden secret/internal field label: ${forbidden}`);
  }
}

async function verifySeller(browser, session, truth) {
  const context = await authenticatedContext(browser, session, { width: 1440, height: 1000 });
  const page = await context.newPage();
  const assertRuntime = runtimeGuard(page, 'Seller Part 13');
  try {
    await page.goto(`${baseUrl}/admin/project-handover/${truth.project.id}`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Authoritative Client Brief & Delivery Review');
    await expectText(page, 'Not Submitted');
    await expectText(page, 'Handoff Readiness: BLOCKED');
    await expectText(page, 'Confirmed Structured Requirements');
    await expectText(page, 'Accepted Commercial Agreement');
    await expectText(page, 'Payment & Client Onboarding');
    await expectText(page, 'Review History');
    await expectText(page, 'Project Manager');
    await expectText(page, 'Not Assigned');

    if (await page.getByRole('button', { name: 'Accept Handoff' }).count()) throw new Error('Seller unexpectedly received Delivery Accept authority.');
    if (await page.getByRole('button', { name: 'Return to Sales' }).count()) throw new Error('Seller unexpectedly received Delivery Return authority.');
    const submit = page.getByRole('button', { name: 'Send to Delivery' });
    if (await submit.count()) {
      if (await submit.first().isEnabled()) throw new Error('Blocked real handoff unexpectedly exposed an enabled Seller submit action.');
    }

    await assertNoSecretLabels(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/admin/project-handover/${truth.project.id}`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Authoritative Client Brief & Delivery Review');
    await expectText(page, 'Not Submitted');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el !== document.body && el !== document.documentElement);
    });
    if (!focused) throw new Error('Part 13 mobile Seller handoff did not expose keyboard focus.');

    assertRuntime();
    console.log('PASS  Part 13 authenticated Seller QA: real Handoff loads as Not Submitted/BLOCKED, canonical sections render, PM remains unassigned, no Accept/Return authority, no mutation, mobile/keyboard PASS.');
  } finally {
    await context.close();
  }
}

async function verifyAdmin(browser, session, truth) {
  const context = await authenticatedContext(browser, session, { width: 1440, height: 1000 });
  const page = await context.newPage();
  const assertRuntime = runtimeGuard(page, 'Admin Part 13');
  try {
    await page.goto(`${baseUrl}/admin/project-handover/${truth.project.id}`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Authoritative Client Brief & Delivery Review');
    await expectText(page, 'Not Submitted');
    await expectText(page, 'Handoff Readiness: BLOCKED');
    await expectText(page, 'Project Manager');
    await expectText(page, 'Not Assigned');
    await expectText(page, 'Review History');

    if (await page.getByRole('button', { name: 'Accept Handoff' }).count()) throw new Error('Admin unexpectedly received Accept on an unsubmitted/unassigned real handoff.');
    if (await page.getByRole('button', { name: 'Return to Sales' }).count()) throw new Error('Admin unexpectedly received Return on an unsubmitted/unassigned real handoff.');
    if (await page.getByRole('button', { name: 'Send to Delivery' }).count()) throw new Error('Admin unexpectedly received source-Seller submission authority.');

    await assertNoSecretLabels(page);
    assertRuntime();
    console.log('PASS  Part 13 authenticated Admin QA: authoritative review route loads, unassigned-PM state is truthful, no Accept/Return before submission, no Seller impersonation, no mutation.');
  } finally {
    await context.close();
  }
}

const truth = await loadQaTruth();
const before = await businessSnapshot(truth.project.id);
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

const after = await businessSnapshot(truth.project.id);
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error(`Part 13 authenticated production QA mutated real handoff/business truth. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`);
}

console.log(`PASS  Part 13 production handoff immutability: projects=${after.projectCount}, Sales Handover projects=${after.handoffProjectCount}, lifecycle attempts=${after.lifecycleAttemptCount}, Seller task=${after.tasks.find(row => row.workflow_key==='sales_handover_submission')?.status}, PM review task=${after.tasks.find(row => row.workflow_key==='sales_handover_review')?.status}, PM assigned=${after.project.project_manager_id !== null}.`);
console.log('PASS  No fake Client/Opportunity/Payment/Project/Onboarding/Handoff was created; no real handoff was submitted, accepted, returned, assigned a fake PM, or advanced solely for QA.');
console.log('Authenticated Part 13 Seller/Admin production UI QA: COMPLETE (current Project has no assigned PM, so Admin routing/unassigned-PM behavior was verified instead of fabricating a PM identity).');
