import { test, expect } from '@playwright/test';

/**
 * Template example — NOT an assertion about this repository.
 *
 * This file is the scaffolded sample for a consumer's web application. The
 * template itself ships no web app and configures no `webServer`, and
 * `playwright.config.ts` leaves `baseURL` undefined unless `BASE_URL` is set,
 * so `page.goto('/')` in `beforeEach` has no valid URL to resolve here.
 *
 * Skipping under that condition is not silencing a real assertion: nothing in
 * this file describes this repo. A consumer that sets `BASE_URL` (or adds a
 * `webServer` block) runs the example unchanged — same opt-in the config's
 * own `baseURL: process.env.BASE_URL || undefined` already implies.
 */
test.skip(
  !process.env.BASE_URL,
  'Set BASE_URL to run the example web test (the template ships no web server).',
);

test.describe('Example Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application before each test
    await page.goto('/');
  });

  test('should display homepage with proper structure', async ({ page }) => {
    await test.step('Verify page title', async () => {
      await expect(page).toHaveTitle(/AI Workflow Template/);
    });

    await test.step('Verify main heading exists', async () => {
      const mainHeading = page.getByRole('heading', { level: 1 });
      await expect(mainHeading).toBeVisible();
    });

    await test.step('Verify accessibility structure', async () => {
      // This will verify the page has a proper accessibility tree
      await expect(page.locator('body')).toMatchAriaSnapshot(`
        - document:
          - heading:
      `);
    });
  });
});