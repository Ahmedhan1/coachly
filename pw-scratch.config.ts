import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '/home/user/online-coaaching-respiratory/e2e',
  workers: 1, retries: 0, reporter: [['list']], timeout: 30_000,
  outputDir: '/tmp/claude-0/-home-user-online-coaaching-respiratory/5a39ec1f-3429-5822-a448-eafdc304d04b/scratchpad/pw-out',
  use: { baseURL: 'http://localhost:4421', locale: 'ar-EG', timezoneId: 'Africa/Cairo', browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true },
});
