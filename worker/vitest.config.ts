import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import {
  TEST_ADMIN_PASSWORD,
  TEST_APP_ORIGIN,
  TEST_AUTH_SECRET,
  TEST_AUTH_URL,
  TEST_GOOGLE_CLIENT_ID,
  TEST_GOOGLE_CLIENT_SECRET,
  TEST_VAPID_PRIVATE,
  TEST_VAPID_PUBLIC,
  TEST_VAPID_SUBJECT,
} from './test/fixtures.ts';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url).href)),
          BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
          BETTER_AUTH_URL: TEST_AUTH_URL,
          GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: TEST_GOOGLE_CLIENT_SECRET,
          ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
          APP_ORIGIN: `${TEST_APP_ORIGIN},http://localhost:5173`,
          VAPID_PRIVATE_KEY: TEST_VAPID_PRIVATE,
          VAPID_PUBLIC_KEY: TEST_VAPID_PUBLIC,
          VAPID_SUBJECT: TEST_VAPID_SUBJECT,
        },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
