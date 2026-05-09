import { defineConfig, devices } from '@playwright/test';

/**
 * Project-agnostic Playwright configuration for AI workflow template
 * This configuration is designed to be flexible for any project type:
 * - Web applications (set baseURL in .env or playwright.config.ts)
 * - API testing (use request instead of page)
 * - File system testing
 * - CLI testing
 * 
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL for web projects - override in .env file or here as needed */
    baseURL: process.env.BASE_URL || undefined,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Run browser in headed mode by default for VSCode integration */
    headless: process.env.HEADLESS === 'true' || false,
    
    /* Configure viewport for testing - can be customized per project */
    viewport: { width: 1280, height: 720 },
    
    /* Slow down actions to see what's happening during debugging */
    launchOptions: {
      slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    },
  },

  /* Configure projects for different testing scenarios */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        /* Use Playwright's bundled Chromium (not system Chrome) for consistency */
        channel: 'chromium' as const,
      },
    },
    /*
    // Example: Add mobile viewport testing
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    
    // Example: Add API testing project
    // {
    //   name: 'api',
    //   testMatch: /.*\.api\.spec\.ts/,
    //   use: {
    //     baseURL: process.env.API_BASE_URL,
    //   },
    // },
    */
  ],

  /*
  // Example: Web server configuration for web projects
  // Uncomment and configure as needed for your specific project
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
  */
});
