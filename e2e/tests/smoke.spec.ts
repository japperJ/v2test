import { test, expect } from '@playwright/test';

/**
 * Smoke suite: login → create site → list sites → logout
 *
 * Requires the full stack (backend + frontend) to be running locally.
 * Start with: docker compose -f infrastructure/docker-compose.dev.yml up
 *
 * Credentials are read from environment variables so they never appear in
 * source control:
 *   E2E_ADMIN_EMAIL    (default: admin@example.com)
 *   E2E_ADMIN_PASSWORD (default: changeme)
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'changeme';
// Use a unique slug per run to avoid collisions between test runs
const SITE_SLUG = `e2e-smoke-${Date.now()}`;
const SITE_NAME = `E2E Smoke Site ${Date.now()}`;

test.describe('Smoke: login → create site → list sites → logout', () => {
  test('full flow', async ({ page }) => {
    // --- Login flow ---
    await page.goto('/login');
    await expect(page).toHaveURL(/login/);

    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    // After login we should land on the sites list page
    await expect(page).toHaveURL(/sites/);

    // --- Create site flow ---
    // Navigate to "new site" and fill the form
    await page.getByRole('link', { name: /new site|add site|create/i }).click();
    await expect(page).toHaveURL(/sites\/(new|create)/);

    await page.getByLabel(/name/i).fill(SITE_NAME);
    await page.getByLabel(/slug/i).fill(SITE_SLUG);
    await page.getByRole('button', { name: /save|create/i }).click();

    // After saving, we should be redirected back to the site list or the detail page
    await expect(page).toHaveURL(/sites/);

    // --- List sites flow — verify our new site appears ---
    await page.goto('/sites');
    await expect(page.getByText(SITE_NAME)).toBeVisible();

    // --- Logout flow ---
    await page.getByRole('button', { name: /logout|sign out/i }).click();

    // After logout the page should redirect to /login and our protected route
    // should no longer be accessible
    await expect(page).toHaveURL(/login/);
    await page.goto('/sites');
    await expect(page).toHaveURL(/login/);
  });
});
