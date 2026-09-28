import { expect, test } from '@playwright/test';

const CONFIG_ERROR = 'Supabase is not configured';
const SUPABASE_AUTH_ORIGIN = 'https://calabtayklhltyiriiwo.supabase.co';
const CLIENT_PORTAL_RECOVERY_URL = 'https://www.profoxwebdesigner.com/client-portal?recovery=1';

async function disableLiveMaintenanceForLaunchTest(page: import('@playwright/test').Page) {
  await page.route(`${SUPABASE_AUTH_ORIGIN}/rest/v1/content**`, async route => {
    const response = await route.fetch();
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('application/json')) {
      await route.fulfill({ response });
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!Array.isArray(payload)) {
      await route.fulfill({ response });
      return;
    }

    const adjusted = payload.map((row: any) => {
      if (row?.id !== 'siteSettings' || !row?.data || typeof row.data !== 'object') return row;
      return {
        ...row,
        data: {
          ...row.data,
          maintenanceMode: {
            ...(row.data.maintenanceMode || {}),
            enabled: false
          }
        }
      };
    });

    await route.fulfill({ response, json: adjusted });
  });
}

async function logLaunchDiagnostics(page: import('@playwright/test').Page, label: string) {
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText().catch(() => '');
  console.log(`[launch-diagnostic:${label}] url=${page.url()} title=${JSON.stringify(title)} body=${JSON.stringify(body.slice(0, 2400))}`);
}

test.beforeEach(async ({ page }) => {
  // Launch-readiness validates the application beneath the operational maintenance screen.
  // Never mutate the live CMS setting just to make CI pass; override only the browser response.
  await disableLiveMaintenanceForLaunchTest(page);
});

test.afterEach(async ({ page }) => {
  // CMS runtime refreshes may still be in flight as a test ends. Remove route handlers
  // without surfacing teardown races; production traffic and live maintenance state are untouched.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('homepage renders its primary experience without configuration errors', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(CONFIG_ERROR);
  await expect(page.getByRole('link', { name: /digital advisor|conversation|contact/i }).first()).toBeVisible();
});

for (const route of ['/pricing', '/careers', '/talent-partner-program']) {
  test(`${route} is populated and launchable`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(CONFIG_ERROR);
    await expect(page.locator('body')).not.toContainText(/page not found|something went wrong/i);
  });
}

test('careers hero stays locked to the viewport while featured jobs change', async ({ page }) => {
  await page.goto('/careers');
  await expect(page.locator('h1').first()).toBeVisible();

  const hero = page.getByTestId('careers-hero');
  await expect(hero).toBeVisible();

  const readDimensions = () => hero.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
    };
  });

  const before = await readDimensions();
  expect(Math.abs(before.height - before.viewportHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.width - before.viewportWidth)).toBeLessThanOrEqual(1);

  const featuredJobButtons = page.locator('[aria-label="Featured career opportunities"] button');
  const featuredJobCount = await featuredJobButtons.count();

  if (featuredJobCount > 1) {
    await featuredJobButtons.nth(1).click();
    await expect(featuredJobButtons.nth(1)).toHaveAttribute('aria-current', 'true');

    const after = await readDimensions();
    expect(after.height).toBe(before.height);
    expect(after.width).toBe(before.width);
  }
});

test('sales role experience accepts years and months while preserving total months', async ({ page }) => {
  await page.goto('/careers/independent-sales-representative#apply');

  const years = page.getByLabel('Total sales experience years');
  const months = page.getByLabel('Total sales experience additional months');

  await expect(years).toBeVisible();
  await expect(months).toBeVisible();

  await years.fill('2');
  await months.fill('3');

  await expect(page.getByText('27 months total')).toBeVisible();

  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('profox:sales-application-draft:independent-sales-representative');
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.form?.salesExperienceMonths ?? null;
    } catch {
      return null;
    }
  })).toBe('27');
});

test('sales application country selection persists and validates correctly', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('profox:sales-application-draft:independent-sales-representative', JSON.stringify({
      step: 1,
      form: {
        fullName: 'Test Candidate',
        email: 'candidate@example.com',
        phone: '+918894135994',
        country: '',
        countryCode: '',
        timezone: 'Asia/Calcutta',
        linkedinUrl: 'https://www.linkedin.com/in/test-candidate',
      },
      cvName: '',
    }));
  });

  await page.goto('/careers/independent-sales-representative#apply');

  const country = page.getByLabel('Country *');
  await expect(country).toBeVisible();
  await country.selectOption('IN');
  await expect(country).toHaveValue('IN');

  await expect.poll(async () => page.evaluate(() => {
    const raw = window.localStorage.getItem('profox:sales-application-draft:independent-sales-representative');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return {
        countryCode: parsed?.form?.countryCode ?? null,
        country: parsed?.form?.country ?? null,
      };
    } catch {
      return null;
    }
  })).toEqual({ countryCode: 'IN', country: 'India' });

  await page.getByRole('button', { name: /Continue/i }).click();
  await expect(page.getByText('Show us how you sell')).toBeVisible();
  await expect(page.getByText('Select your country.')).toHaveCount(0);
});

test('sales application omits CRM experience while keeping measurable sales result', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('profox:sales-application-draft:independent-sales-representative', JSON.stringify({
      step: 2,
      form: {},
      cvName: '',
    }));
  });

  await page.goto('/careers/independent-sales-representative#apply');

  await expect(page.getByText('Show us how you sell')).toBeVisible();
  await expect(page.getByText('CRM experience (optional)')).toHaveCount(0);
  await expect(page.getByPlaceholder('Which CRM systems have you used and how did you use them?')).toHaveCount(0);
  await expect(page.getByText('One measurable sales result *')).toBeVisible();
});

test('sales application validation scrolls to the first error without duplicate messages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/careers/independent-sales-representative#apply');

  const continueButton = page.getByRole('button', { name: /Continue/i });
  await continueButton.click();

  const experienceError = page.getByText('This role currently requires at least 6 months of sales experience.');
  await expect(experienceError).toHaveCount(1);
  await expect(experienceError).toBeVisible();
  await expect(page.getByLabel('Total sales experience years')).toBeFocused();

  await expect.poll(async () => experienceError.evaluate((element) => {
    const target = element.closest('[data-validation-target="true"]');
    if (!target) return false;
    const rect = target.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  })).toBe(true);

  await page.getByLabel('Total sales experience years').fill('1');
  await continueButton.click();

  const hoursError = page.getByText('This role currently requires at least 35 available hours per week.');
  await expect(hoursError).toHaveCount(1);
  await expect(hoursError).toBeVisible();
  await expect(page.getByLabel('Hours available per week *')).toBeFocused();

  await page.getByLabel('Hours available per week *').fill('35');
  await continueButton.click();

  const eligibilityError = page.getByText('Please confirm every current role requirement before continuing.');
  await expect(eligibilityError).toHaveCount(1);
  await expect(eligibilityError).toBeVisible();
  await expect(page.getByRole('checkbox').first()).toBeFocused();
});

test('sales role apply CTA becomes sticky after the hero on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/careers/independent-sales-representative');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const hero = page.getByTestId('sales-role-hero');
  await expect(hero).toBeVisible();
  await expect(page.getByTestId('sticky-apply-cta')).toHaveCount(0);

  await hero.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.bottom + 8, behavior: 'instant' });
  });

  const stickyApply = page.getByTestId('sticky-apply-cta');
  await expect(stickyApply).toBeVisible();
  await expect(stickyApply).toHaveAttribute('href', '#apply');
  await expect(stickyApply).toContainText('Apply for this role');

  const box = await stickyApply.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
});

test('talent partner entry is branded and exposes secure account access', async ({ page }) => {
  await page.goto('/talent-partner');
  await expect(page.getByRole('heading', { name: /help us find great people/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(CONFIG_ERROR);
});

test('unauthenticated workspace is protected by the ProFox sign-in screen', async ({ page }) => {
  await page.goto('/admin/workspace');
  await expect(page.getByRole('heading', { name: 'Sign in to ProFox' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page).toHaveURL(/\/admin(?:\/workspace)?$/);
});

test('Client Portal exposes invitation-only sign in without configuration errors', async ({ page }) => {
  await page.goto('/client-portal');
  await expect(page.getByRole('heading', { name: 'Secure Client Portal' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show password', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.locator('body')).toContainText(/Portal accounts are invitation-only/i);
  await expect(page.locator('body')).not.toContainText(CONFIG_ERROR);
});

test('Client Portal password reset request always sends the canonical production redirect', async ({ page }) => {
  let observedRedirect = '';
  await page.route(`${SUPABASE_AUTH_ORIGIN}/auth/v1/recover**`, async route => {
    const requestUrl = new URL(route.request().url());
    observedRedirect = requestUrl.searchParams.get('redirect_to') || '';
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/client-portal');
  await page.getByLabel('Email').fill('client-reset-smoke@example.com');
  await page.getByRole('button', { name: 'Forgot password?' }).click();

  await expect.poll(() => observedRedirect).toBe(CLIENT_PORTAL_RECOVERY_URL);
  await expect(page.locator('body')).toContainText(/password reset link has been sent/i);
});

test('Client Portal sign in is wired to Supabase password auth and handles invalid credentials safely', async ({ page }) => {
  let signInRequested = false;
  await page.route(`${SUPABASE_AUTH_ORIGIN}/auth/v1/token?grant_type=password`, async route => {
    signInRequested = true;
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
    });
  });

  await page.goto('/client-portal');
  await page.getByLabel('Email').fill('client-signin-smoke@example.com');
  await page.locator('input[autocomplete="current-password"]').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect.poll(() => signInRequested).toBe(true);
  await expect(page.locator('body')).toContainText(/Invalid email\/password/i);
});

test('Client Portal recovery screen is reachable and does not expose an unauthenticated password update', async ({ page }) => {
  await page.goto('/client-portal?recovery=1');
  await expect(page.getByRole('heading', { name: 'Set a New Password' })).toBeVisible();
  const recoveryPasswords = page.locator('input[autocomplete="new-password"]');
  await expect(recoveryPasswords).toHaveCount(2);
  await expect(recoveryPasswords.nth(0)).toBeVisible();
  await expect(recoveryPasswords.nth(1)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show password', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show confirm password', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update Password' })).toBeDisabled();
  await expect(page.locator('body')).toContainText(/recovery session is unavailable or expired/i);
});

test('legacy careers routes resolve to the canonical careers page', async ({ page }) => {
  await page.goto('/carear');
  await expect(page).toHaveURL(/\/careers$/);
  await expect(page.locator('h1').first()).toBeVisible();
});

test('contact page exposes connected quote and meeting entry points', async ({ page }) => {
  page.on('pageerror', error => console.log(`[launch-pageerror:contact] ${error.stack || error.message}`));
  await page.goto('/contact-us?intent=quote');
  const quoteTab = page.getByRole('tab', { name: 'Get a Quote' });
  try {
    await expect(quoteTab).toHaveAttribute('aria-selected', 'true');
  } catch (error) {
    await logLaunchDiagnostics(page, 'contact');
    throw error;
  }
  await expect(page.getByRole('heading', { name: /tell us what you're building/i })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(CONFIG_ERROR);

  await page.getByRole('tab', { name: 'Book a Meeting' }).click();
  const bookingHeading = page.getByRole('heading', { name: /speak with the right profox specialist/i });
  const unavailableHeading = page.getByRole('heading', { name: /booking is currently unavailable/i });
  await expect(bookingHeading.or(unavailableHeading)).toBeVisible();
  const firstAvailable = page.getByRole('button', { name: 'First available' });
  const quoteFallback = page.getByRole('button', { name: /get a quote/i });
  if (await quoteFallback.isVisible()) {
    await expect(quoteFallback).toBeEnabled();
  } else {
    await expect(firstAvailable).toBeVisible();
    await expect(firstAvailable).toBeEnabled();
  }
});

test('standalone meeting page always provides a usable next action', async ({ page }) => {
  page.on('pageerror', error => console.log(`[launch-pageerror:meeting] ${error.stack || error.message}`));
  await page.goto('/book-a-meeting');
  const bookingHeading = page.getByRole('heading', { name: /book a strategy call/i });
  const unavailableHeading = page.getByRole('heading', { name: /booking is currently unavailable/i });
  try {
    await expect(bookingHeading.or(unavailableHeading)).toBeVisible();
  } catch (error) {
    await logLaunchDiagnostics(page, 'meeting');
    throw error;
  }
  await expect(page.locator('body')).not.toContainText(CONFIG_ERROR);
  const firstAvailable = page.getByRole('button', { name: 'First available' });
  const quoteFallback = page.getByRole('link', { name: /get a quote/i });
  if (await quoteFallback.isVisible()) {
    await expect(quoteFallback).toHaveAttribute('href', /intent=quote/);
  } else {
    await expect(firstAvailable).toBeVisible();
    await expect(firstAvailable).toBeEnabled();
  }
});
