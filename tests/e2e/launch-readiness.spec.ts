import { expect, test } from '@playwright/test';

const CONFIG_ERROR = 'Supabase is not configured';

async function logLaunchDiagnostics(page: import('@playwright/test').Page, label: string) {
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText().catch(() => '');
  console.log(`[launch-diagnostic:${label}] url=${page.url()} title=${JSON.stringify(title)} body=${JSON.stringify(body.slice(0, 2400))}`);
}

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