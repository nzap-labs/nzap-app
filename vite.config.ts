import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// `tauri dev` points the webview at this server; the port must match
// `build.devUrl` in src-tauri/tauri.conf.json.
const DEV_PORT = 1420

// `tauri android dev` / `tauri ios dev` on a physical device serve over the
// network: the CLI sets TAURI_DEV_HOST to this machine's address.
const DEV_HOST = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [
    // must run before the react plugin so routeTree.gen.ts is fresh
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Tauri prints its own logs; keep Rust errors visible.
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: DEV_HOST || '127.0.0.1',
    hmr: DEV_HOST ? { protocol: 'ws', host: DEV_HOST, port: DEV_PORT + 1 } : undefined,
    watch: {
      // Rebuilding the frontend on every Rust change would reload the webview.
      ignored: ['**/src-tauri/**', '**/crates/**', '**/plugins/**', '**/target/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // Tailwind v4 needs Chrome 111+ / Safari 16.4+: Android System WebView
    // (updated through the Play Store, 111+ even on Android 7) and iOS 16.4+.
    target:
      process.env.TAURI_ENV_PLATFORM === 'android' || process.env.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome111'
        : 'safari16.4',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
  },
})
