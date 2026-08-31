import { expect, test } from '@playwright/test';

const CONFIG_ERROR = 'Supabase is not configured';

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
