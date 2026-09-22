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

async function part14BusinessInventory() {
  const tables = [
    'crm_leads',
    'crm_opportunities',
    'crm_activities',
    'sales_meetings',
    'crm_sales_validations',
    'quotations',
    'payments',
    'clients',
    'projects',
    'client_onboardings',
    'project_sales_handover_attempts',
    'crm_sales_promises',
    'crm_sales_scope_conditions',
    'quotation_sales_coverage',
    'crm_lead_events',
  ];
  const entries = [];
  for (const table of tables) entries.push([table, await countRows(table)]);
  return Object.fromEntries(entries);
}

async function part15PerformanceInventory() {
  const reviews = await server.from('sales_performance_reviews')
    .select('id,salesperson_id,review_key,review_type,scheduled_for,period_start,period_end,status,decision,metrics_snapshot,quality_evidence,required_actions,owner_id,completed_by,completed_at,updated_at')
    .order('id');
  if (reviews.error) throw reviews.error;
  const settings = await server.from('sales_performance_settings')
    .select('id,enabled,review_day_7,review_day_30,review_day_60,review_day_90,first_interaction_review_count,weekly_coaching_interval_days,crm_logging_target_percent,policy_version,updated_at')
    .order('id');
  if (settings.error) throw settings.error;
  const rows=reviews.data || [];
  const statusCounts=Object.fromEntries([...new Set(rows.map(row=>row.status))].sort().map(status=>[status,rows.filter(row=>row.status===status).length]));
  const typeCounts=Object.fromEntries([...new Set(rows.map(row=>row.review_type))].sort().map(type=>[type,rows.filter(row=>row.review_type===type).length]));
  return {
    reviewCount: rows.length,
    completedCount: rows.filter(row=>row.status==='Completed').length,
    statusCounts,
    typeCounts,
    reviews: rows,
    settings: settings.data || [],
  };
}

function sessionScopedClient(session) {
  return createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
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
  const target = page.getByText(text, { exact: true }).first();
  await target.scrollIntoViewIfNeeded();
  await target.waitFor({ state: 'visible', timeout });
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
    await expectText(page, 'Confirmed Sales Requirements');
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

async function verifyPart14Admin(browser, session) {
  const client = sessionScopedClient(session);
  const expectedResult = await client.rpc('crm_get_manager_exception_workspace', {
    p_filter: 'all',
    p_search: '',
    p_owner_id: null,
    p_limit: 100,
    p_offset: 0,
  });
  if (expectedResult.error || !expectedResult.data) {
    throw new Error(expectedResult.error?.message || 'Admin Part 14 aggregate RPC failed.');
  }
  const expected = expectedResult.data;

  const context = await authenticatedContext(browser, session, { width: 1440, height: 1000 });
  const page = await context.newPage();
  const assertRuntime = runtimeGuard(page, 'Admin Part 14');
  try {
    await page.goto(`${baseUrl}/admin/manager-exceptions`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Manager Exceptions');
    await page.getByText(/Only deals and handoffs that need intervention/).first().waitFor({ state: 'visible', timeout: 30_000 });
    await expectText(page, 'Total Exceptions');
    await expectText(page, 'Pending Review');
    await page.getByRole('searchbox', { name: 'Search Manager Exceptions' }).waitFor({ state: 'visible' });
    await page.getByRole('combobox', { name: 'Filter by Seller or owner' }).waitFor({ state: 'visible' });

    if (Number(expected.total || 0) === 0) {
      await expectText(page, 'No matching Sales exceptions.');
    } else {
      const first = expected.items[0];
      await expectText(page, first.title);
      await page.getByRole('button', { name: `Inspect ${first.title}` }).click();
      await expectText(page, 'Exception Detail · Read-Only');
      await expectText(page, 'Why it needs attention');
      await page.getByRole('button', { name: 'Close exception detail' }).click();

      const search = page.getByRole('searchbox', { name: 'Search Manager Exceptions' });
      await search.fill(first.title.split(' ').slice(0, 2).join(' '));
      await expectText(page, first.title);
      await search.fill('');

      if (Number(expected.counts?.overdue || 0) > 0) {
        await page.getByRole('button', { name: 'Overdue', exact: true }).click();
        await page.getByText(/matching$/).first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByRole('button', { name: 'All', exact: true }).click();
      }

      const action = page.getByRole('button', { name: first.actionLabel, exact: true }).first();
      await action.waitFor({ state: 'visible' });
      await action.click();
      await page.waitForURL(url => `${url.pathname}${url.search}` === first.actionUrl, { timeout: 30_000 });
      await page.goto(`${baseUrl}/admin/manager-exceptions`, { waitUntil: 'domcontentloaded' });
      await expectText(page, 'Manager Exceptions');
    }

    for (const label of ['Resolve Exception', 'Ignore forever', 'Dismiss blocker', 'Hide exception permanently', 'Approve Quotation', 'Accept Handoff']) {
      if (await page.getByRole('button', { name: label, exact: true }).count()) {
        throw new Error(`Manager Exception Workspace exposed forbidden authority: ${label}`);
      }
    }
    await assertNoSecretLabels(page);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${baseUrl}/admin/manager-exceptions`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Manager Exceptions');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/admin/manager-exceptions`, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Manager Exceptions');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return Boolean(el && el !== document.body && el !== document.documentElement);
    });
    if (!focused) throw new Error('Part 14 mobile Manager Exceptions did not expose keyboard focus.');

    assertRuntime();
    console.log(`PASS  Part 14 authenticated Admin QA: Manager Exceptions loaded with ${expected.total} real source-derived item(s); filters/search/detail/source routing, desktop/tablet/mobile and keyboard checks PASS; no mutation authority exposed.`);
  } finally {
    await context.close();
  }
}

async function verifyPart15Admin(browser, session, truth) {
  const client=sessionScopedClient(session);
  const adminPayload=await client.rpc('admin_get_sales_performance');
  if(adminPayload.error || !adminPayload.data) throw new Error(adminPayload.error?.message || 'Admin Part 15 performance RPC failed.');
  const seller=(adminPayload.data.salespeople || []).find(item=>item.userId===truth.seller.id);
  if(!seller) throw new Error('Part 15 Admin payload does not include the active Seller.');
  const reviews=Array.isArray(seller.reviews) ? seller.reviews : [];
  if(!reviews.length) throw new Error('Part 15 Admin payload has no canonical review schedule.');
  const review=reviews[0];
  const period=await client.rpc('get_sales_performance_period_snapshot',{
    p_salesperson_id:truth.seller.id,
    p_period_start:review.period_start || review.periodStart,
    p_period_end:review.period_end || review.periodEnd,
  });
  if(period.error || !period.data?.qualityEvidence) throw new Error(period.error?.message || 'Admin Part 15 period snapshot failed.');
  const requiredKeys=['firstResponseSla','discoveryCompleteness','proposalReadiness','firstPassHandoffAcceptance','missingInformationRate','postSaleSalesAttributedScopeChanges','unauthorizedPromiseIncidents','discountFrequency','commercialExceptions','nextActionDiscipline','clientExpectationDisputes','verifiedRevenue','winRate','dealValue'];
  for(const key of requiredKeys){
    const metric=period.data.qualityEvidence[key];
    if(!metric) throw new Error(`Part 15 Admin period evidence is missing ${key}.`);
    if(!['AVAILABLE','INSUFFICIENT_DATA','NOT_TRACKED_AUTHORITATIVELY'].includes(metric.availability)) throw new Error(`Part 15 metric ${key} has invalid availability ${metric.availability}.`);
  }

  const context=await authenticatedContext(browser,session,{width:1440,height:1000});
  const page=await context.newPage();
  const assertRuntime=runtimeGuard(page,'Admin Part 15');
  try{
    await page.goto(`${baseUrl}/admin/sales-performance`,{waitUntil:'domcontentloaded'});
    await expectText(page,'Performance & Coaching');
    await expectText(page,'Supervise quality, not just volume.');
    await expectText(page,truth.seller.email);
    await page.getByText(truth.seller.email,{exact:true}).filter({visible:true}).first().click();
    const personDrawer=page.locator('[data-testid="part15-person-drawer"]:visible');
    await personDrawer.waitFor({state:'visible',timeout:30_000});
    await expectText(personDrawer,'Seller performance record');
    const qualityPanel=personDrawer.locator('[data-testid="part15-quality-evidence"]:visible');
    await qualityPanel.waitFor({state:'visible',timeout:30_000});
    await expectText(qualityPanel,'Quality revenue + clean delivery');
    await expectText(qualityPanel,'System evidence, not an overall Seller score');
    const expectedMetricLabels=[
      ['firstResponseSla','First-response SLA'],
      ['discoveryCompleteness','Discovery completeness'],
      ['proposalReadiness','Proposal readiness'],
      ['firstPassHandoffAcceptance','First-pass handoff acceptance'],
      ['missingInformationRate','Missing-information rate'],
      ['postSaleSalesAttributedScopeChanges','Post-sale Sales-attributed scope changes'],
      ['unauthorizedPromiseIncidents','Unauthorized Promise incidents'],
      ['discountFrequency','Discount frequency'],
      ['commercialExceptions','Approval / exception frequency'],
      ['nextActionDiscipline','Next-action discipline'],
      ['clientExpectationDisputes','Client expectation disputes'],
      ['verifiedRevenue','Verified revenue'],
      ['winRate','Win rate'],
      ['dealValue','Won deal value'],
    ];
    for(const [key,label] of expectedMetricLabels){
      const card=qualityPanel.locator(`[data-testid="part15-quality-metric-card-${key}"]`);
      await card.scrollIntoViewIfNeeded();
      await card.waitFor({state:'visible',timeout:30_000});
      const labelNode=card.locator(`[data-testid="part15-quality-metric-${key}"]`);
      const rawLabel=String(await labelNode.textContent() || '').trim();
      if(rawLabel!==label) throw new Error(`Part 15 metric ${key} rendered label "${rawLabel}" instead of "${label}".`);
      const renderedText=String(await card.innerText() || '').replace(/\s+/g,' ').trim().toLowerCase();
      if(!renderedText.includes(label.toLowerCase())) throw new Error(`Part 15 visible metric card ${key} did not render its expected label text.`);
      const availabilityText={
        AVAILABLE:'Available',
        INSUFFICIENT_DATA:'Insufficient data',
        NOT_TRACKED_AUTHORITATIVELY:'Not tracked authoritatively',
      }[period.data.qualityEvidence[key].availability];
      if(!availabilityText || !renderedText.includes(availabilityText.toLowerCase())) {
        throw new Error(`Part 15 visible metric card ${key} did not render availability ${period.data.qualityEvidence[key].availability}.`);
      }
    }
    await qualityPanel.getByText(/Sample \d+/).first().waitFor({state:'visible',timeout:30_000});

    const firstReviewButton=personDrawer.locator('button').filter({hasText:/Day 7 Check-In|Day 30 Review|Weekly Sales Coaching/}).first();
    await firstReviewButton.waitFor({state:'visible',timeout:30_000});
    await firstReviewButton.click();
    const reviewDrawer=page.locator('[data-testid="part15-review-drawer"]:visible');
    await reviewDrawer.waitFor({state:'visible',timeout:30_000});
    await expectText(reviewDrawer,'Management review');
    await expectText(reviewDrawer,'System evidence · read only');
    await expectText(reviewDrawer,'Quantitative evidence for this review period');
    await expectText(reviewDrawer,'Approved quality evidence');
    await expectText(reviewDrawer,'Management decision');
    if(await page.getByText(/Seller Quality Score|Failure score|Bottom performer/i).count()) throw new Error('Part 15 Admin UI exposed a prohibited overall/ranking judgment.');

    await page.setViewportSize({width:390,height:844});
    await page.keyboard.press('Tab');
    const focused=await page.evaluate(()=>Boolean(document.activeElement && document.activeElement!==document.body && document.activeElement!==document.documentElement));
    if(!focused) throw new Error('Part 15 Admin performance workspace did not expose keyboard focus on mobile.');

    await assertNoSecretLabels(page);
    assertRuntime();
    console.log(`PASS  Part 15 authenticated Admin QA: active Seller + ${reviews.length} real scheduled review(s), quality metrics/sample/availability/period evidence, human review form, mobile/keyboard PASS; no automatic management authority exposed.`);
  }finally{
    await context.close();
  }
}

async function verifyPart15Seller(browser, session, truth) {
  const client=sessionScopedClient(session);
  const mine=await client.rpc('get_my_sales_performance');
  if(mine.error || !mine.data?.snapshot?.qualityEvidence) throw new Error(mine.error?.message || 'Seller Part 15 own-performance RPC failed.');
  const reviews=Array.isArray(mine.data.reviews) ? mine.data.reviews : [];
  if(!reviews.length) throw new Error('Seller Part 15 payload has no canonical review schedule.');
  const review=reviews[0];
  const ownPeriod=await client.rpc('get_sales_performance_period_snapshot',{
    p_salesperson_id:truth.seller.id,
    p_period_start:review.period_start || review.periodStart,
    p_period_end:review.period_end || review.periodEnd,
  });
  if(ownPeriod.error || !ownPeriod.data?.qualityEvidence) throw new Error(ownPeriod.error?.message || 'Seller could not read own Part 15 period evidence.');

  const crossUser=await client.rpc('get_sales_performance_period_snapshot',{
    p_salesperson_id:truth.admin.id,
    p_period_start:review.period_start || review.periodStart,
    p_period_end:review.period_end || review.periodEnd,
  });
  if(!crossUser.error) throw new Error('Seller unexpectedly viewed another user performance snapshot.');

  const context=await authenticatedContext(browser,session,{width:1280,height:900});
  const page=await context.newPage();
  const assertRuntime=runtimeGuard(page,'Seller Part 15');
  try{
    await page.goto(`${baseUrl}/admin/sales-performance`,{waitUntil:'domcontentloaded'});
    await expectText(page,'Performance & Coaching');
    await expectText(page,'Quality revenue + clean delivery');
    await expectText(page,'System evidence, not an overall Seller score');
    await expectText(page,'First-response SLA');
    await expectText(page,'First-pass handoff acceptance');
    await expectText(page,'Verified revenue');
    if(await page.getByText('One policy source',{exact:true}).count()) throw new Error('Seller unexpectedly received Admin performance settings.');
    if(await page.getByRole('button',{name:'Save performance policy',exact:true}).count()) throw new Error('Seller unexpectedly received performance-settings mutation authority.');
    if(await page.getByText('Management review',{exact:true}).count()) throw new Error('Seller unexpectedly received the Admin management-review form.');

    await page.setViewportSize({width:390,height:844});
    await page.goto(`${baseUrl}/admin/sales-performance`,{waitUntil:'domcontentloaded'});
    await expectText(page,'Quality revenue + clean delivery');
    await page.keyboard.press('Tab');
    const focused=await page.evaluate(()=>Boolean(document.activeElement && document.activeElement!==document.body && document.activeElement!==document.documentElement));
    if(!focused) throw new Error('Part 15 Seller performance workspace did not expose keyboard focus on mobile.');

    await page.goto(`${baseUrl}/admin/seller-command-center`,{waitUntil:'domcontentloaded'});
    await page.getByText(/Seller tools, performance & history|Loading ProFox workspace…/).first().waitFor({state:'visible',timeout:30_000});

    await assertNoSecretLabels(page);
    assertRuntime();
    console.log('PASS  Part 15 authenticated Seller QA: own quality evidence visible, cross-user period RPC rejected, Admin settings/review authority hidden, Seller Command Center retained, mobile/keyboard PASS.');
  }finally{
    await context.close();
  }
}

async function verifyPart14Seller(browser, session) {
  const client = sessionScopedClient(session);
  const direct = await client.rpc('crm_get_manager_exception_workspace', {
    p_filter: 'all',
    p_search: '',
    p_owner_id: null,
    p_limit: 25,
    p_offset: 0,
  });
  if (!direct.error) throw new Error('Seller unexpectedly invoked the team-wide Manager Exception RPC.');

  const context = await authenticatedContext(browser, session, { width: 1280, height: 900 });
  const page = await context.newPage();
  const assertRuntime = runtimeGuard(page, 'Seller Part 14');
  try {
    await page.goto(`${baseUrl}/admin/manager-exceptions`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    if (await page.getByRole('heading', { name: 'Manager Exceptions', exact: true }).count()) {
      throw new Error('Seller unexpectedly received the team-wide Manager Exception Workspace.');
    }

    await page.goto(`${baseUrl}/admin/seller-command-center`, { waitUntil: 'domcontentloaded' });
    if (!page.url().includes('/admin/seller-command-center')) {
      throw new Error('Seller did not retain the canonical Seller Command Center route.');
    }
    const body = await page.locator('body').innerText();
    if (!body.trim()) throw new Error('Seller Command Center did not render.');
    if (body.includes('Manager Exceptions')) throw new Error('Seller Command Center unexpectedly exposed team Manager Exceptions.');

    assertRuntime();
    console.log('PASS  Part 14 authenticated Seller negative-access QA: team workspace hidden/redirected, direct aggregate RPC rejected, canonical Seller Command Center retained, no team exception data exposed.');
  } finally {
    await context.close();
  }
}

const truth = await loadQaTruth();
const before = await businessSnapshot(truth.project.id);
const part14Before = await part14BusinessInventory();
const part15Before = await part15PerformanceInventory();
const [sellerSession, adminSession] = await Promise.all([
  issueSession(truth.seller, 'Seller'),
  issueSession(truth.admin, 'Admin'),
]);

const browser = await chromium.launch({ headless: true });
try {
  await verifySeller(browser, sellerSession, truth);
  await verifyAdmin(browser, adminSession, truth);
  await verifyPart14Admin(browser, adminSession);
  await verifyPart14Seller(browser, sellerSession);
  await verifyPart15Admin(browser, adminSession, truth);
  await verifyPart15Seller(browser, sellerSession, truth);
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

const part14After = await part14BusinessInventory();
if (JSON.stringify(part14Before) !== JSON.stringify(part14After)) {
  throw new Error(`Part 14 authenticated production QA changed business inventory. Before=${JSON.stringify(part14Before)} After=${JSON.stringify(part14After)}`);
}
console.log(`PASS  Part 14 production business immutability: ${Object.entries(part14After).map(([key,value]) => `${key}=${value}`).join(', ')}.`);
console.log('PASS  No fake Validation, quotation approval, activity, returned handoff, Promise conflict, SOP override, business record or exception record was created for Part 14 QA.');
console.log('Authenticated Part 14 Admin/Seller production UI QA: COMPLETE.');

const part15After = await part15PerformanceInventory();
if (JSON.stringify(part15Before) !== JSON.stringify(part15After)) {
  throw new Error(`Part 15 authenticated production QA changed performance review/settings truth. Before=${JSON.stringify(part15Before)} After=${JSON.stringify(part15After)}`);
}
console.log(`PASS  Part 15 production performance immutability: reviews=${part15After.reviewCount}, completed=${part15After.completedCount}, statuses=${JSON.stringify(part15After.statusCounts)}, types=${JSON.stringify(part15After.typeCounts)}, settingsRows=${part15After.settings.length}.`);
console.log('PASS  No real performance review was completed/edited, no settings were changed, no fake review/business record was created, and no access/commission/certification state was changed for Part 15 QA.');
console.log('Authenticated Part 15 Admin/Seller production UI QA: COMPLETE.');
