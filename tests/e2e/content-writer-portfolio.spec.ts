import { expect, test } from '@playwright/test';

const SUPABASE_ORIGIN = 'https://calabtayklhltyiriiwo.supabase.co';
const TASK_TOKEN = 'portfolio-e2e-token';

const completeCases = [1, 2, 3].map(index => ({
  projectTitle: `Portfolio project ${index}`,
  industry: index === 1 ? 'Roofing' : index === 2 ? 'HVAC' : 'Home remodeling',
  contentType: index === 3 ? 'Email sequence' : 'Landing page',
  briefProblem: 'The business needed clearer customer-facing content that explained the problem, the service, and the next action without unsupported claims.',
  contribution: 'I structured the message, wrote the customer-facing copy, clarified the offer, and kept every claim tied to the supplied business evidence.',
  researchProcess: 'I reviewed the service scope, customer questions, objections, available proof, and competing messages before outlining and drafting the content.',
  resultOutcome: 'The intended outcome was clearer understanding and a stronger path to the relevant enquiry or booking action.',
  sampleUrl: `https://example.com/portfolio-${index}`,
}));

function publicTask(overrides: Record<string, unknown> = {}) {
  return {
    taskKey: 'content_writer_portfolio_v2',
    stage: 'Portfolio Review',
    title: 'Content Writer Portfolio — 3 Case Studies',
    description: 'Submit three structured examples of your Content Writer work for review.',
    targetMarket: '',
    targetNiche: '',
    requiredItems: 3,
    estimatedMinutes: 60,
    instructions: [
      { key: 'problem', title: 'Show the problem', text: 'Explain the brief, customer need, and why the content was required.' },
      { key: 'contribution', title: 'Own your contribution', text: 'Describe exactly what you personally researched, structured, and wrote.' },
      { key: 'evidence', title: 'Use authorized evidence', text: 'Share only public or authorized samples and describe outcomes accurately.' },
    ],
    attemptNo: 1,
    maxAttempts: 2,
    candidateName: 'Portfolio E2E Candidate',
    applicationReference: 'PF-CW-E2E',
    status: 'Issued',
    issuedAt: '2026-09-06T04:00:00.000Z',
    dueAt: '2026-09-09T04:00:00.000Z',
    submittedAt: null,
    retryFeedback: '',
    expired: false,
    canEdit: true,
    answers: { portfolioCases: [] },
    ...overrides,
  };
}

async function mockCmsMaintenanceOff(page: import('@playwright/test').Page) {
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/content**`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test.beforeEach(async ({ page }) => {
  await mockCmsMaintenanceOff(page);
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('Content Writer portfolio renders structured instruction objects as readable copy', async ({ page }) => {
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/rpc/public_open_recruitment_task**`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(publicTask()) });
  });

  await page.goto(`/recruitment/content-portfolio/${TASK_TOKEN}`);

  await expect(page.getByRole('heading', { name: 'Content Writer Portfolio — 3 Case Studies' })).toBeVisible();
  await expect(page.getByText('Show the problem')).toBeVisible();
  await expect(page.getByText('Explain the brief, customer need, and why the content was required.')).toBeVisible();
  await expect(page.getByText('Own your contribution')).toBeVisible();
  await expect(page.getByText('Use authorized evidence')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('[object Object]');
});

test('candidate can submit three complete cases and the attempt becomes read-only', async ({ page }) => {
  let submitted = false;
  let submitCount = 0;

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/rpc/public_open_recruitment_task**`, async route => {
    const payload = submitted
      ? publicTask({
          status: 'Submitted',
          submittedAt: '2026-09-06T05:00:00.000Z',
          canEdit: false,
          answers: { portfolioCases: completeCases },
        })
      : publicTask();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/rpc/public_save_recruitment_task_draft**`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/rpc/public_submit_recruitment_task**`, async route => {
    submitted = true;
    submitCount += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  page.on('dialog', dialog => void dialog.accept());
  await page.goto(`/recruitment/content-portfolio/${TASK_TOKEN}`);

  for (let index = 0; index < 3; index += 1) {
    const section = page.locator(`#portfolio-case-${index + 1}`);
    const inputs = section.locator('input');
    const textareas = section.locator('textarea');
    const item = completeCases[index];

    await inputs.nth(0).fill(item.projectTitle);
    await inputs.nth(1).fill(item.industry);
    await inputs.nth(2).fill(item.contentType);
    await inputs.nth(3).fill(item.sampleUrl);
    await textareas.nth(0).fill(item.briefProblem);
    await textareas.nth(1).fill(item.contribution);
    await textareas.nth(2).fill(item.researchProcess);
    await textareas.nth(3).fill(item.resultOutcome);
  }

  const submitButton = page.getByRole('button', { name: 'Submit portfolio for review' });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await expect(page.getByRole('heading', { name: 'Portfolio submitted' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit portfolio for review' })).toHaveCount(0);
  expect(submitCount).toBe(1);
});
