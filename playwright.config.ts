import { defineConfig, devices } from '@playwright/test';

/** Agents working in parallel set E2E_PORT / E2E_OUT so their servers and builds never collide. */
const PORT = Number(process.env.E2E_PORT ?? 4319);
/** e2e build lives under node_modules so git and eslint never see it. */
const OUT_DIR = process.env.E2E_OUT ?? 'node_modules/.e2e-dist';

/**
 * Runs against a production build (service worker included) served by `vite preview`.
 * VITE_E2E=1 enables the `?standalone=1` install-gate bypass in that build only.
 *
 * WebKit is the target engine (Safari on iOS). It is not installed in the build sandbox, so CI/dev
 * machines run `--project=webkit`, and the sandbox runs `--project=chromium`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `VITE_E2E=1 npx vite build --outDir ${OUT_DIR} --emptyOutDir && npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'webkit',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
