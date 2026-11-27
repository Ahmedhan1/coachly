#!/usr/bin/env node
// Real-stack round trip (not mocked): the app's e2e build + the real Worker in `wrangler dev` (local D1 + R2).
// Usage: npm run test:integration   (needs `npm ci` in the root and in worker/). About 1-2 minutes.
//        INTEGRATION_BROWSER=webkit npm run test:integration   (Safari's engine; install WebKit first, see README).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = process.argv[2] ?? process.cwd();
const require = createRequire(join(root, 'package.json'));
const { chromium, webkit } = require('playwright');
// INTEGRATION_BROWSER=webkit runs the same round trip in Safari's engine (see README: Testing in real WebKit).
const engine = process.env.INTEGRATION_BROWSER === 'webkit' ? webkit : chromium;
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
// WebKit enforces the app's CSP (Chromium runs with bypassCSP): allow the local http Worker for this preview only.
const preview = spawn('npx', ['vite', 'preview', '--outDir', out, '--port', '4330', '--strictPort'], { cwd: root, stdio: 'ignore', detached: true, env: { ...process.env, PREVIEW_EXTRA_CONNECT: W } });

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

/** Every image row on the page's phone: stored as raw bytes (never a Blob, which WebKit loses). */
async function imageRows(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('pt-coach');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const read = (store, key) =>
      new Promise((res) => {
        const r = key === undefined ? db.transaction(store).objectStore(store).getAll() : db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(undefined);
      });
    const rows = await read('images');
    const token = (await read('meta', 'auth.token'))?.value;
    db.close();
    return { rows: rows.map((r) => ({ bytes: r.data instanceof ArrayBuffer, blob: r.blob !== undefined, width: r.width })), token };
  });
}

const browser = await engine.launch();
console.log(`  ..  engine: ${engine.name()}`);
try {
  await until(`${W}/api/auth-config`);
  await until(APP);
  ok('real Worker (wrangler dev, local D1/R2) and the app build are up');
  const phone = async () => {
    const page = await (await browser.newContext({ bypassCSP: true, viewport: { width: 390, height: 844 }, locale: 'ar-EG' })).newPage();
    if (process.env.INTEGRATION_DEBUG) {
      page.on('console', (m) => console.log('  [console]', m.type(), m.text().slice(0, 200)));
      page.on('requestfailed', (r) => console.log('  [failed]', r.method(), r.url(), r.failure()?.errorText));
      page.on('response', (r) => r.url().startsWith(W) && console.log('  [worker]', r.status(), r.request().method(), r.url().slice(W.length)));
    }
    return page;
  };

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

  // Images: a client photo (1600x1200 PNG) stored as bytes on the phone, its encrypted copy uploaded to the bucket.
  const maker = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
  await maker.setContent('<body style="margin:0;background:linear-gradient(90deg,#c81e3a,#1b7040)"></body>');
  const photo = await maker.screenshot({ type: 'png' });
  await maker.close();
  await a.locator('input[type=file][accept="image/*"]').first().setInputFiles({ name: 'client.png', mimeType: 'image/png', buffer: photo });
  await a.getByRole('img', { name: 'صورة عميل متزامن' }).waitFor();
  const onA = await imageRows(a);
  assert.ok(onA.rows.length >= 2 && onA.rows.every((r) => r.bytes && !r.blob), `phone A images stored as bytes: ${JSON.stringify(onA.rows)}`);
  assert.equal(typeof onA.token, 'string', 'session token on phone A');
  let copies = [];
  for (let i = 0; i < 120 && copies.length === 0; i++) {
    const res = await fetch(`${W}/api/files?kind=client_photo`, { headers: { Authorization: `Bearer ${onA.token}` } });
    copies = res.ok ? (await res.json()).files : [];
    if (copies.length === 0) await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(copies.length >= 1, 'encrypted client photo copy in the bucket');
  const blob = await (await fetch(`${W}/api/files/${copies[0].id}`, { headers: { Authorization: `Bearer ${onA.token}` } })).arrayBuffer();
  const head = Buffer.from(blob).subarray(0, 8);
  const plainImage = head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) || head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.ok(blob.byteLength > 1000 && !plainImage, `bucket holds encrypted bytes, not a plain JPEG/PNG (starts ${head.toString('hex')})`);
  ok('client photo on phone A: stored as bytes, encrypted copy in the bucket (R2) and readable back');

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

  // The photo came back: it renders on phone B, stored as bytes.
  await b.getByRole('link', { name: /عميل متزامن/ }).click();
  const img = b.getByRole('img', { name: 'صورة عميل متزامن' });
  await img.waitFor({ timeout: 60_000 });
  await b.waitForFunction(() => {
    const el = [...document.querySelectorAll('img')].find((i) => i.alt === 'صورة عميل متزامن');
    return !!el && el.complete && el.naturalWidth > 0;
  });
  const onB = await imageRows(b);
  assert.ok(onB.rows.length >= 1 && onB.rows.every((r) => r.bytes && !r.blob), `phone B images stored as bytes: ${JSON.stringify(onB.rows)}`);
  ok('phone B: the client photo is back and renders, stored as bytes');
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
