import { defineConfig } from '@playwright/test'

/**
 * Android E2E: the real app (the R8-minified release build with the `e2e`
 * feature) on an emulator, driven through its WebView, with the real Rust
 * engine talking to nzap-mock-colab on the host (`adb reverse`).
 * `scripts/android-e2e.sh` prepares the emulator, the mock and the APK.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // One device, one app: the specs run in order and share its state.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: 'artifacts/results',
})
