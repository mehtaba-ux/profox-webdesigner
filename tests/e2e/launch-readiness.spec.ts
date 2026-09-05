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
  await expect(page.getByLabel('Password')).toBeVisible();
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
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect.poll(() => signInRequested).toBe(true);
  await expect(page.locator('body')).toContainText(/Invalid email\/password/i);
});

test('Client Portal recovery screen is reachable and does not expose an unauthenticated password update', async ({ page }) => {
  await page.goto('/client-portal?recovery=1');
  await expect(page.getByRole('heading', { name: 'Set a New Password' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'New Password', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Confirm New Password', exact: true })).toBeVisible();
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