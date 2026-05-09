import { test, expect } from '@playwright/test';

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