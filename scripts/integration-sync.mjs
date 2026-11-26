#!/usr/bin/env node
// Real-stack round trip (not mocked): the app's e2e build + the real Worker in `wrangler dev` (local D1 + R2).
// Usage: npm run test:integration   (needs `npm ci` in the root and in worker/). About 1-2 minutes.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = process.argv[2] ?? process.cwd();
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright');
const W = 'http://127.0.0.1:8798';
const APP = 'http://localhost:4330';
const ADMIN = 'integration-admin-password';
const persist = mkdtempSync(join(tmpdir(), 'ptc-int-'));
const ok = (m) => console.log(`  ok  ${m}`);

const mig = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'pt-coach-licenses', '--local', '--persist-to', persist], { cwd: join(root, 'worker'), encoding: 'utf8', env: { ...process.env, CI: '1' } });
assert.equal(mig.status, 0, mig.stderr);
const vars = { BETTER_AUTH_SECRET: 'integration-secret-0123456789abcdefghij', BETTER_AUTH_URL: W, ADMIN_PASSWORD: ADMIN, APP_ORIGIN: APP };
const worker = spawn('npx', ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', '8798', '--persist-to', persist, ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])], { cwd: join(root, 'worker'), env: { ...process.env, CI: '1' }, stdio: 'ignore', detached: true });
const out = join(root, 'node_modules/.int-dist');
const build = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: root, encoding: 'utf8', env: { ...process.env, VITE_E2E: '1', VITE_WORKER_URL: W } });
assert.equal(build.status, 0, build.stderr);
const preview = spawn('npx', ['vite', 'preview', '--outDir', out, '--port', '4330', '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });

async function until(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`not up: ${url}`);
}

const browser = await chromium.launch();
try {
  await until(`${W}/api/auth-config`);
  await until(APP);
  ok('real Worker (wrangler dev, local D1/R2) and the app build are up');
  const phone = async () => (await browser.newContext({ bypassCSP: true, viewport: { width: 390, height: 844 }, locale: 'ar-EG' })).newPage();

  // Phone A: new account (pending) → owner approves in /admin → client + cloud backup.
  const a = await phone();
  await a.goto(`${APP}/?standalone=1`);
  await a.getByRole('radio', { name: 'حساب جديد' }).check({ force: true });
  await a.getByLabel('اسمك').fill('كابتن تكامل');
  await a.getByLabel('الإيميل').fill('integration@example.com');
  await a.getByLabel('كلمة السر', { exact: true }).fill('account-pass-1');
  await a.getByRole('button', { name: 'اعمل الحساب' }).click();
  await a.getByRole('heading', { name: 'حسابك مستني الموافقة' }).waitFor();
  ok('sign-up → pending (real better-auth on D1)');

  const login = await fetch(`${W}/admin/login`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: W }, body: `password=${ADMIN}` });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  const dash = await (await fetch(`${W}/admin`, { headers: { Cookie: cookie } })).text();
  const id = /name="id" value="([^"]+)"/.exec(dash)?.[1];
  assert.ok(id, 'account in /admin');
  const approve = await fetch(`${W}/admin/accounts/approve`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: W, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `id=${encodeURIComponent(id)}` });
  assert.equal(approve.status, 303);
  await a.getByRole('button', { name: 'اتأكد تاني' }).click();
  // Identity setup is prefilled from the account name.
  await a.getByText('خطوة 1 من 4').waitFor();
  assert.equal(await a.getByLabel('اسمك زي ما تحب العملاء يشوفوه').inputValue(), 'كابتن تكامل');
  ok('owner approves in /admin → app opens; profile name comes from the account');
  await a.getByRole('button', { name: 'بعدين' }).click();
  await a.getByRole('button', { name: 'إضافة: عميل، حصة، برنامج' }).click();
  await a.getByRole('dialog', { name: 'تضيف إيه؟' }).getByRole('button', { name: /عميل جديد/ }).click();
  await a.getByLabel(/الاسم/).first().fill('عميل متزامن');
  await a.getByRole('button', { name: /حفظ|ضيف/ }).first().click();
  await a.getByRole('heading', { name: 'عميل متزامن' }).waitFor();
  await a.goto(`${APP}/more/settings/backup?standalone=1`);
  await a.getByRole('button', { name: 'شغّل النسخة السحابية' }).click();
  await a.getByLabel('كلمة السر', { exact: true }).fill('backup-pass-1');
  await a.getByLabel('اكتبها تاني').fill('backup-pass-1');
  await a.getByRole('button', { name: 'حفظ' }).click();
  await a.getByRole('button', { name: 'ارفع دلوقتي' }).click();
  await a.getByText('اترفعت النسخة').waitFor({ timeout: 60_000 });
  ok('client added on phone A, encrypted cloud backup uploaded to R2');

  // Phone B: same account → restore offer → restore → the client is there.
  const b = await phone();
  await b.goto(`${APP}/?standalone=1`);
  await b.getByLabel('الإيميل').fill('integration@example.com');
  await b.getByLabel('كلمة السر', { exact: true }).fill('account-pass-1');
  await b.getByRole('button', { name: 'دخول', exact: true }).click();
  await b.getByRole('heading', { name: 'رجّع بياناتك' }).waitFor();
  await b.getByLabel('كلمة سر النسخة الاحتياطية').fill('wrong-pass-1');
  await b.getByRole('button', { name: 'رجّع البيانات' }).click();
  await b.getByText(/كلمة السر غلط/).waitFor();
  await b.getByLabel('كلمة سر النسخة الاحتياطية').fill('backup-pass-1');
  b.once('dialog', (d) => void d.accept());
  await b.getByRole('button', { name: 'رجّع البيانات' }).click();
  await b.waitForURL(`${APP}/`);
  await b.goto(`${APP}/clients?standalone=1`);
  await b.getByText('عميل متزامن').waitFor();
  ok('phone B: sign in → restore offer → wrong password refused → restore → the client is there');
  await b.screenshot({ path: join(root, 'docs/screenshots/core/sync-restored-clients.png') });
} finally {
  await browser.close();
  for (const p of [worker, preview]) {
    try {
      process.kill(-p.pid);
    } catch {
      // already gone
    }
  }
}
