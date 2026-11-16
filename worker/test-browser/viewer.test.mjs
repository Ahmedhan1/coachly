// Browser test of the client page (/c/:shareId) in Playwright's preinstalled Chromium.
// Run: cd worker && npm run test:viewer
// - The page HTML/headers come from the Worker source (bundled with esbuild), served under its real CSP.
// - The envelope is sealed in Node by shared/envelope.ts; the page must decrypt it (byte compatibility).
// - The check-in the page encrypts is opened in Node by shared/envelope.ts (compatibility the other way).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), 'viewer-test-'));
const shotDir = process.env.SCREENSHOT_DIR ?? join(outDir, 'shots');
mkdirSync(shotDir, { recursive: true });

const entry = join(outDir, 'entry.ts');
writeFileSync(
  entry,
  `export { viewerHtml, viewerHeaders } from ${JSON.stringify(join(here, '../src/share/page.ts'))};
export { sealWithKey, openWithKey, generateRawKey } from ${JSON.stringify(join(here, '../../shared/envelope.ts'))};
export { parseCheckinDocument } from ${JSON.stringify(join(here, '../src/share/document.ts'))};
export { SAMPLE_DOCUMENT } from ${JSON.stringify(join(here, '../test/sampleDocument.ts'))};`,
);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(outDir, 'bundle.mjs'), logLevel: 'error' });
const lib = await import(pathToFileURL(join(outDir, 'bundle.mjs')).href);

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const ORIGIN = 'https://viewer.test';
const APP = 'https://app.test';
const shareId = b64url(crypto.getRandomValues(new Uint8Array(16)));
const key = lib.generateRawKey();
const envelope = await lib.sealWithKey(key, new TextEncoder().encode(JSON.stringify(lib.SAMPLE_DOCUMENT)));

async function expectedWriteToken(raw) {
  const ikm = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('pt-checkin-write') }, ikm, 256);
  return b64url(new Uint8Array(bits));
}

const results = [];
const step = async (name, fn) => {
  await fn();
  results.push(name);
  console.log(`  ok  ${name}`);
};

const browser = await chromium.launch();
let posted = null;
let shareStatus = 200;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const cspErrors = [];
  const externalRequests = [];

  // A 2400x1600 PNG to upload as the check-in photo (made by the browser itself).
  const maker = await context.newPage();
  await maker.setViewportSize({ width: 1200, height: 800 });
  await maker.setContent('<body style="margin:0;background:linear-gradient(90deg,#c81e3a,#1b7040)"></body>');
  const bigPhoto = await maker.screenshot({ type: 'png' }); // 2400x1600 at deviceScaleFactor 2
  await maker.close();

  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === ORIGIN && url.pathname === `/c/${shareId}`) {
      const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
      return route.fulfill({ status: 200, headers: lib.viewerHeaders(nonce, APP), body: lib.viewerHtml({ nonce, shareId, imageBase: `${APP}/exercise-pack/img/` }) });
    }
    if (url.origin === ORIGIN && url.pathname === `/api/share/${shareId}` && req.method() === 'GET') {
      if (shareStatus !== 200) return route.fulfill({ status: shareStatus, contentType: 'application/json', body: '{"error":"not_found"}' });
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(envelope) });
    }
    if (url.origin === ORIGIN && url.pathname === `/api/share/${shareId}/checkins` && req.method() === 'POST') {
      posted = { body: req.postDataBuffer(), token: req.headers()['x-checkin-token'], referer: req.headers()['referer'] };
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"x"}' });
    }
    if (url.origin === APP && url.pathname.startsWith('/exercise-pack/img/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: bigPhoto });
    }
    externalRequests.push(req.url());
    return route.abort();
  });

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused/.test(msg.text())) cspErrors.push(msg.text());
  });
  page.on('pageerror', (err) => cspErrors.push(String(err)));

  await step('decrypts a document sealed by shared/envelope.ts and renders it', async () => {
    await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 10_000 });
    const text = await page.textContent('#app');
    for (const s of ['أهلاً نورهان', 'برنامج 3 أيام', 'بنش برس', 'سيتات 4', 'عدّات 8-10', 'راحة 90 ث', 'تمبو 3-1-1', 'RPE 8', 'التزم بالنوم']) {
      assert.ok(text.includes(s), `missing "${s}"`);
    }
    assert.equal(await page.textContent('.brand-name'), 'كابتن سارة فيتنس');
    assert.equal(await page.title(), 'كابتن سارة فيتنس');
    const brand = await page.evaluate(() => getComputedStyle(document.getElementById('brand')).backgroundColor);
    assert.equal(brand, 'rgb(200, 30, 58)');
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    await page.waitForFunction(() => document.querySelector('.ex-img')?.complete);
    assert.equal(await page.getAttribute('.ex-img', 'src'), `${APP}/exercise-pack/img/Barbell_Bench_Press_-_Medium_Grip-0.webp`);
    await page.screenshot({ path: join(shotDir, 'viewer-program-light.png'), fullPage: true });
  });

  await step('tabs are at least 44px tall and the meals tab shows meals and supplements', async () => {
    const box = await page.locator('.tab').first().boundingBox();
    assert.ok(box && box.height >= 44, `tab height ${box?.height}`);
    await page.click('#t-p-meals');
    const meals = await page.textContent('#p-meals');
    assert.ok(meals.includes('الفطار') && meals.includes('9:00') && meals.includes('واي بروتين'));
    await page.screenshot({ path: join(shotDir, 'viewer-meals-light.png'), fullPage: true });
  });

  await step('check-in: Arabic-Indic digits accepted, photo downscaled to <= 1200px JPEG, encrypted, opened by shared/envelope.ts', async () => {
    await page.click('#t-p-checkin');
    await page.fill('input[name=weight]', '٧١٫٥');
    await page.fill('input[name=waist]', '80');
    await page.fill('textarea[name=notes]', 'الأسبوع ده كان كويس');
    await page.setInputFiles('input[name=photo]', { name: 'me.png', mimeType: 'image/png', buffer: bigPhoto });
    await page.screenshot({ path: join(shotDir, 'viewer-checkin-light.png'), fullPage: true });
    await page.click('#p-checkin .btn');
    await page.waitForFunction(() => document.querySelector('#p-checkin .status')?.textContent?.includes('وصلت'), null, { timeout: 10_000 });
    assert.ok(posted, 'no check-in POST seen');
    assert.equal(posted.token, await expectedWriteToken(key));
    const opened = await lib.openWithKey(key, new Uint8Array(posted.body));
    assert.ok(opened.ok, 'shared/envelope.ts could not open the check-in');
    const doc = lib.parseCheckinDocument(JSON.parse(new TextDecoder().decode(opened.data)));
    assert.ok(doc, 'check-in failed the runtime guard');
    assert.equal(doc.weightKg, 71.5);
    assert.equal(doc.waistCm, 80);
    assert.equal(doc.notes, 'الأسبوع ده كان كويس');
    assert.ok(doc.photo.startsWith('data:image/jpeg;base64,'));
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, doc.photo);
    assert.deepEqual(size, [1200, 800]);
    assert.ok(posted.body.length < 3 * 1024 * 1024);
  });

  await step('no CSP violations, no requests outside the page and app origins', async () => {
    assert.deepEqual(cspErrors, []);
    assert.deepEqual(externalRequests, []);
  });

  await step('wrong key, missing key and revoked link show plain Arabic messages', async () => {
    await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(lib.generateRawKey())}`);
    await page.waitForFunction(() => document.querySelector('#app')?.textContent?.includes('لينك جديد'));
    await page.goto(`${ORIGIN}/c/${shareId}`);
    await page.waitForFunction(() => document.querySelector('#app')?.textContent?.includes('اللينك ناقص'));
    shareStatus = 404;
    await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
    await page.waitForFunction(() => document.querySelector('#app')?.textContent?.includes('اتلغى'));
    shareStatus = 200;
  });

  await step('dark mode renders (screenshot)', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
    await page.waitForSelector('body[data-ready="1"]');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, 'rgb(11, 12, 12)');
    await page.screenshot({ path: join(shotDir, 'viewer-program-dark.png'), fullPage: true });
  });
} finally {
  await browser.close();
  rmSync(join(outDir, 'bundle.mjs'), { force: true });
}
console.log(`\nviewer browser test: ${results.length} passed. Screenshots: ${shotDir}`);
