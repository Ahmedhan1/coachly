import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from '@playwright/test';

/**
 * PDF sample generation (pdf-template-qa). Runs the harness page on a Vite dev server.
 *   npx playwright test -c src/services/pdf/harness/playwright.config.ts
 * Chromium only in the build sandbox; WebKit on a dev machine (`--project=webkit` needs it installed).
 */
const PORT = 4329;
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.pw\.ts$/,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, locale: 'ar-EG', timezoneId: 'Africa/Cairo' },
  webServer: {
    command: `npx vite --config vite.config.ts --port ${PORT} --strictPort`,
    // Run from the repo root so vite.config.ts (the @ alias) and public/ are used.
    cwd: fileURLToPath(new URL('../../../..', import.meta.url)),
    url: `http://localhost:${PORT}/src/services/pdf/harness/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
  ],
});
