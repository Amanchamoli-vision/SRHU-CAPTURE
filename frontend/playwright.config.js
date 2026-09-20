// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * Only `*.spec.js` is picked up: `tests/unit/*.test.js` holds the pure-function
 * tests, which vitest runs (`npm run test:unit`) because they need Vite's module
 * resolution rather than a browser.
 *
 * The API is not started here -- it needs its own virtualenv and database. Start
 * it first (see backend/README.md) and point PW_BASE_URL at the frontend if it
 * is not on the default port.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* Reuse a dev server that is already running, otherwise start one. */
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
