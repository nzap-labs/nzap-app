import { defineConfig, devices } from '@playwright/test'

const PORT = 4180

/** Use a locally installed Chromium instead of Playwright's download (sandboxes, offline). */
const chromiumLaunch = process.env.PW_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
  : {}

/**
 * Web E2E: the real UI in Chromium and WebKit (the engine behind macOS and
 * Linux webviews) against the simulated engine. Desktop E2E, with the real
 * Rust engine, lives in e2e/desktop.
 */
export default defineConfig({
  testDir: 'e2e/web',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 860 },
        ...chromiumLaunch,
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 860 } },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
