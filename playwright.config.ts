import { defineConfig, devices } from '@playwright/test'

const PORT = 4180

/** Use a locally installed Chromium instead of Playwright's download (sandboxes, offline). */
const chromiumLaunch = process.env.PW_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
  : {}

/**
 * Web E2E: the real UI against the simulated engine.
 *
 * - `e2e/mobile` runs on phones and a portrait tablet (touch, the bottom tab
 *   bar, sheets) in Chromium — Android's WebView engine — and WebKit — iOS's.
 * - `e2e/web` runs the wide layout (tablets in landscape, the desktop
 *   development build) in both engines.
 *
 * The real app on an Android emulator is covered by e2e/android.
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Phones and portrait tablets.
    {
      name: 'pixel-7',
      testDir: 'e2e/mobile',
      use: { ...devices['Pixel 7'], ...chromiumLaunch },
    },
    {
      name: 'galaxy-s8',
      testDir: 'e2e/mobile',
      use: { ...devices['Galaxy S8'], ...chromiumLaunch },
    },
    {
      name: 'iphone-15',
      testDir: 'e2e/mobile',
      use: { ...devices['iPhone 15'] },
    },
    {
      name: 'ipad-mini',
      testDir: 'e2e/mobile',
      use: { ...devices['iPad Mini'] },
    },
    // The wide layout.
    {
      name: 'chromium',
      testDir: 'e2e/web',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 860 },
        ...chromiumLaunch,
      },
    },
    {
      name: 'webkit',
      testDir: 'e2e/web',
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
