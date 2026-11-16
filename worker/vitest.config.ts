import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { TEST_ADMIN_PASSWORD, TEST_APP_ORIGIN, TEST_DATA_KEY, TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test/fixtures.ts';

export default defineConfig({
  resolve: {
    alias: { '@noble/ed25519': fileURLToPath(new URL('./node_modules/@noble/ed25519/index.js', import.meta.url).href) },
  },
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url).href)),
          LICENSE_PRIVATE_KEY: TEST_PRIVATE_KEY,
          LICENSE_PUBLIC_KEY: TEST_PUBLIC_KEY,
          ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
          DATA_KEY: TEST_DATA_KEY,
          APP_ORIGIN: `${TEST_APP_ORIGIN},http://localhost:5173`,
        },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
