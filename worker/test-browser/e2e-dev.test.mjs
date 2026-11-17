// End-to-end against the real bundled Worker in `wrangler dev` (local workerd + local D1/R2, no Cloudflare
// account needed). Run: cd worker && npm run test:e2e
// Covers what the Workers-pool tests cannot: the esbuild bundle, real HTTP request bodies streamed into R2,
// and the client page served by the Worker itself, decrypting in Chromium under the real CSP.
// Uses public test keys only (RFC 8032 vector 1, a test VAPID pair); state lives in a temp folder.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRawKey, openWithKey, sealWithKey, sealWithPassword } from '../../shared/envelope.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const workerDir = fileURLToPath(new URL('..', import.meta.url));
const persist = mkdtempSync(join(tmpdir(), 'ptcoach-e2e-'));
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = 'e2e-admin-password';
const VARS = {
  LICENSE_PRIVATE_KEY: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  LICENSE_PUBLIC_KEY: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  ADMIN_PASSWORD: ADMIN,
  DATA_KEY: 'e2e-data-key',
  APP_ORIGIN: 'https://app.example',
  VAPID_PRIVATE_KEY: 'RVN97ZGt23rXHSVkQ4ncT_uNTDMwCQxBOEK52YqCUCk',
  VAPID_PUBLIC_KEY: 'BEn8vbGWpoCUuvmo-UnEMflbaJL3UkagEmqVC7q3HqYPPuUZ6p8gn5gBcqF7Kcjy-fGTjBBg-EgB0ntr63-QXbs',
  VAPID_SUBJECT: 'mailto:owner@example.com',
};
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const ok = (name) => console.log(`  ok  ${name}`);

const migrate = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'pt-coach-licenses', '--local', '--persist-to', persist], {
  cwd: workerDir,
  encoding: 'utf8',
  env: { ...process.env, CI: '1' },
});
assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);

const varArgs = Object.entries(VARS).flatMap(([k, v]) => ['--var', `${k}:${v}`]);
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist, ...varArgs], {
  cwd: workerDir,
  env: { ...process.env, CI: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let devLog = '';
dev.stdout.on('data', (d) => (devLog += d));
dev.stderr.on('data', (d) => (devLog += d));

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/push/vapid`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not start:\n${devLog}`);
}

const browser = await chromium.launch();
try {
  await waitReady();
  ok('wrangler dev serves the bundled Worker');

  // Owner issues a code, the app activates it.
  const login = await fetch(`${BASE}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE },
    body: `password=${ADMIN}`,
  });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  const issued = await (
    await fetch(`${BASE}/admin/codes`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=e2e&duration=lifetime&window=14',
    })
  ).text();
  const code = /class="code">([A-Z0-9-]{14})</.exec(issued)?.[1];
  assert.ok(code, 'no code issued');
  const { license } = await (
    await fetch(`${BASE}/api/activate`, { method: 'POST', body: JSON.stringify({ code, deviceId: crypto.randomUUID() }) })
  ).json();
  assert.ok(license);
  const auth = { Authorization: `Bearer ${license}` };
  ok('license issued and activated');

  // Backup: a real 3 MB PTP1 envelope over HTTP, streamed into local R2, and back.
  const backupPlain = new Uint8Array(randomBytes(3 * 1024 * 1024 - 64));
  const backup = await sealWithPassword('كلمة سر المدرب', backupPlain, 100_000);
  const put = await fetch(`${BASE}/api/backup`, { method: 'PUT', headers: auth, body: backup });
  assert.equal(put.status, 201, await put.clone().text());
  const head = await fetch(`${BASE}/api/backup`, { method: 'HEAD', headers: auth });
  assert.equal(head.headers.get('x-backup-size'), String(backup.length));
  const back = new Uint8Array(await (await fetch(`${BASE}/api/backup`, { headers: auth })).arrayBuffer());
  assert.equal(Buffer.compare(Buffer.from(back), Buffer.from(backup)), 0);
  assert.equal((await fetch(`${BASE}/api/backup`, { method: 'PUT', headers: auth, body: new Uint8Array(10) })).status, 400);
  ok(`backup PUT/HEAD/GET round-trips ${backup.length} bytes`);

  // Client page: publish, open in Chromium from the Worker's own /c/ page, post a check-in.
  const shareId = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const key = generateRawKey();
  const ikm = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveBits']);
  const token = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('pt-checkin-write') }, ikm, 256),
  );
  const checkinKey = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', token)));
  const doc = {
    v: 1,
    updatedAt: Math.floor(Date.now() / 1000),
    brand: { name: 'كابتن e2e', color: '#1B7040' },
    client: { firstName: 'سلمى' },
    days: [{ title: 'اليوم 1', exercises: [{ name: 'ديدليفت', sets: 3, reps: '5' }] }],
    meals: [],
    supplements: [],
    notes: '',
    checkinsEnabled: true,
  };
  const envelope = await sealWithKey(key, new TextEncoder().encode(JSON.stringify(doc)));
  const shared = await fetch(`${BASE}/api/share/${shareId}`, { method: 'PUT', headers: { ...auth, 'X-Checkin-Key': checkinKey }, body: envelope });
  assert.equal(shared.status, 200, await shared.clone().text());

  const page = await browser.newPage();
  const problems = [];
  page.on('console', (m) => /Refused|Content Security Policy/.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.goto(`${BASE}/c/${shareId}#k=${b64url(key)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15_000 });
  assert.ok((await page.textContent('#app')).includes('ديدليفت'));
  await page.click('#t-p-checkin');
  await page.fill('input[name=weight]', '64.2');
  await page.click('#p-checkin .btn');
  await page.waitForFunction(() => document.querySelector('#p-checkin .status')?.textContent?.includes('وصلت'), null, { timeout: 15_000 });
  assert.deepEqual(problems, []);
  ok('client page from the Worker decrypts under its CSP and posts a check-in');

  const list = await (await fetch(`${BASE}/api/share/${shareId}/checkins`, { headers: auth })).json();
  assert.equal(list.checkins.length, 1);
  const blob = new Uint8Array(await (await fetch(`${BASE}/api/share/${shareId}/checkins/${list.checkins[0].id}`, { headers: auth })).arrayBuffer());
  const opened = await openWithKey(key, blob);
  assert.ok(opened.ok);
  assert.equal(JSON.parse(new TextDecoder().decode(opened.data)).weightKg, 64.2);
  ok('trainer lists and decrypts the check-in with shared/envelope.ts');

  assert.equal((await fetch(`${BASE}/api/share/${shareId}`, { method: 'DELETE', headers: auth })).status, 200);
  assert.equal((await fetch(`${BASE}/api/share/${shareId}`)).status, 404);
  await page.goto('about:blank');
  await page.goto(`${BASE}/c/${shareId}#k=${b64url(key)}`);
  await page.waitForFunction(() => document.querySelector('#app')?.textContent?.includes('اتلغى'), null, { timeout: 15_000 });
  ok('revoked link answers 404 and the page says so');
  console.log('\ne2e (wrangler dev): all passed');
} catch (error) {
  console.error(devLog.slice(-4000));
  throw error;
} finally {
  await browser.close();
  try {
    process.kill(-dev.pid, 'SIGTERM'); // the whole process group: npx, wrangler and workerd
  } catch {
    // already gone
  }
  rmSync(persist, { recursive: true, force: true });
}
