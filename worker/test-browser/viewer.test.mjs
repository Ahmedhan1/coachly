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
  `export { viewerHtml, viewerHeaders, viewerFont } from ${JSON.stringify(join(here, '../src/share/page.ts'))};
export { sealWithKey, openWithKey, generateRawKey } from ${JSON.stringify(join(here, '../../shared/envelope.ts'))};
export { parseCheckinDocument } from ${JSON.stringify(join(here, '../src/share/document.ts'))};
export { SAMPLE_DOCUMENT } from ${JSON.stringify(join(here, '../test/sampleDocument.ts'))};
export { unpackFile } from ${JSON.stringify(join(here, '../../src/domain/files/pack.ts'))};`,
);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(outDir, 'bundle.mjs'), logLevel: 'error' });
const lib = await import(pathToFileURL(join(outDir, 'bundle.mjs')).href);

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const ORIGIN = 'https://viewer.test';
const APP = 'https://app.test';
const shareId = b64url(crypto.getRandomValues(new Uint8Array(16)));
const key = lib.generateRawKey();
let envelope = await lib.sealWithKey(key, new TextEncoder().encode(JSON.stringify(lib.SAMPLE_DOCUMENT)));

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
let postedFile = null;
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
    if (url.origin === ORIGIN && url.pathname === `/api/share/${shareId}/files` && req.method() === 'POST') {
      postedFile = { body: req.postDataBuffer(), token: req.headers()['x-checkin-token'], kind: url.searchParams.get('kind') };
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"f"}' });
    }
    if (url.origin === ORIGIN && url.pathname.startsWith('/c/_/')) {
      const font = lib.viewerFont(url.pathname);
      if (font) return route.fulfill({ status: 200, headers: Object.fromEntries(font.headers), body: Buffer.from(await font.arrayBuffer()) });
    }
    if (url.origin === APP && url.pathname.startsWith('/exercise-pack/img/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: bigPhoto });
    }
    externalRequests.push(req.url());
    return route.abort();
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused/.test(msg.text())) cspErrors.push(msg.text());
  });
  page.on('pageerror', (err) => cspErrors.push(String(err)));

  await step('decrypts a document sealed by shared/envelope.ts and renders it', async () => {
    await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 10_000 });
    // The app's font, served by the page's own origin (no third party): Arabic and Latin faces both load.
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return { ar: document.fonts.check('16px Rubik', 'أهلاً'), la: document.fonts.check('16px Rubik', '2400'), family: getComputedStyle(document.body).fontFamily };
    });
    assert.ok(fonts.ar && fonts.la, `Rubik not loaded: ${JSON.stringify(fonts)}`);
    assert.ok(fonts.family.startsWith('Rubik'), fonts.family);
    const text = await page.textContent('#app');
    // nextDay = 1 opens day 2 first; day 1 is one tap away.
    assert.ok(text.includes('هيب ثرست'), 'next day not shown first');
    assert.ok(text.includes('ده تمرينك الجاي'), 'next workout not flagged');
    await page.click('.pills .pill >> nth=0');
    const day1 = await page.textContent('#app');
    for (const s of ['برنامج 3 أيام', 'بنش برس', 'سيتات 4', 'عدّات 8-10', 'راحة 90 ث', 'تمبو 3-1-1', 'RPE 8', 'سوبر سيت A', 'التزم بالنوم', 'الحصة الجاية', 'فاضل 5 من 12 حصة', 'خسارة دهون']) {
      assert.ok(day1.includes(s), `missing "${s}"`);
    }
    assert.ok((await page.textContent('#brand')).includes('أهلاً نورهان'));
    assert.ok((await page.textContent('#app')).includes('4 أسابيع ورا بعض'), 'streak card');
    assert.equal(await page.locator('#brand img.logo').count(), 1, 'trainer logo');
    assert.equal(await page.textContent('.brand-name'), 'كابتن سارة فيتنس');
    assert.equal(await page.title(), 'كابتن سارة فيتنس');
    // The trainer's colour fills the next-session card (the page's one brand block).
    const brand = await page.evaluate(() => getComputedStyle(document.querySelector('.next')).backgroundColor);
    assert.equal(brand, 'rgb(200, 30, 58)');
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    // Ranges and tempos sit in their own LTR isolate, so "8-10" never shows as "10-8" inside Arabic.
    assert.ok((await page.locator('.ex-main .num').allTextContents()).includes('8-10'), 'rep range isolated');
    assert.ok((await page.locator('.chip .num').allTextContents()).includes('3-1-1'), 'tempo isolated');
    await page.waitForFunction(() => document.querySelector('.ex-img')?.complete);
    assert.equal(await page.getAttribute('.ex-img', 'src'), `${APP}/exercise-pack/img/Barbell_Bench_Press_-_Medium_Grip-0.webp`);
    await page.screenshot({ path: join(shotDir, 'viewer-program-light.png'), fullPage: true });
  });

  await step('tabs are at least 44px tall and the meals tab shows targets, meal days and supplements', async () => {
    const box = await page.locator('.tab').first().boundingBox();
    assert.ok(box && box.height >= 44, `tab height ${box?.height}`);
    await page.click('#t-p-meals');
    const meals = await page.textContent('#p-meals');
    assert.ok(meals.includes('1650') && meals.includes('بروتين') && meals.includes('الفطار') && meals.includes('9:00') && meals.includes('واي بروتين'));
    await page.screenshot({ path: join(shotDir, 'viewer-meals-light.png'), fullPage: true });
    await page.click('#p-meals .pill >> nth=1');
    assert.ok((await page.textContent('#p-meals')).includes('شوفان'));
  });

  await step('meal options: the client picks one, its foods show, and the pick is remembered on this phone', async () => {
    await page.click('#p-meals .pill >> nth=0');
    const lunch = page.locator('#p-meals .card', { hasText: 'الغدا' });
    assert.ok((await lunch.textContent()).includes('200 جم فراخ'));
    await lunch.locator('.pill', { hasText: 'اختيار 2' }).click();
    assert.ok((await lunch.textContent()).includes('250 جم سمك بلطي'));
    assert.ok(!(await lunch.textContent()).includes('200 جم فراخ'));
    await page.screenshot({ path: join(shotDir, 'viewer-meal-options.png'), fullPage: true });
    await page.reload();
    await page.click('#t-p-meals');
    const again = page.locator('#p-meals .card', { hasText: 'الغدا' });
    assert.ok((await again.textContent()).includes('250 جم سمك بلطي'));
    assert.equal(await again.locator('.pill', { hasText: 'اختيار 2' }).getAttribute('aria-pressed'), 'true');
  });

  await step('progress tab draws the weight trend and records', async () => {
    await page.click('#t-p-progress');
    const text = await page.textContent('#p-progress');
    assert.ok(text.includes('الوزن') && text.includes('73.6') && text.includes('−4.4') && text.includes('هيب ثرست'));
    // Milestones come only from published numbers: 4.4 kg lost → "نزلت 2 كجم" done, 5 kg next; streak; history.
    assert.ok(text.includes('إنجازاتك') && text.includes('نزلت 2 كجم') && text.includes('الهدف الجاي: نزلت 5 كجم'), 'milestones');
    assert.ok(text.includes('4 أسابيع التزام ورا بعض') && text.includes('4 متابعات بعتها') && text.includes('بدأت معانا 1/8/2026'));
    assert.ok(text.includes('متابعاتك اللي فاتت') && text.includes('15/9/2026'), 'check-in history');
    assert.equal(await page.locator('#p-progress svg.chart').count(), 2);
    await page.screenshot({ path: join(shotDir, 'viewer-progress-light.png'), fullPage: true });
  });

  await step('check-in: Arabic-Indic digits accepted, photo downscaled to <= 1200px JPEG, encrypted, opened by shared/envelope.ts', async () => {
    await page.click('#t-p-checkin');
    await page.fill('input[name=weight]', '٧١٫٥');
    await page.fill('input[name=waist]', '80');
    await page.fill('textarea[name=notes]', 'الأسبوع ده كان كويس');
    await page.click('#p-checkin summary');
    await page.fill('input[name=arm]', '33');
    await page.fill('input[name=neck]', '38');
    await page.fill('input[name=sleep]', '7.5');
    await page.fill('input[name=adherence]', '٨٠');
    await page.click('.seg-opt >> nth=3');
    const seg = await page.locator('.seg-face').first().boundingBox();
    assert.ok(seg && seg.height >= 44, `energy option height ${seg?.height}`);
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
    assert.equal(doc.armCm, 33);
    assert.equal(doc.neckCm, 38);
    assert.equal(doc.sleepHours, 7.5);
    assert.equal(doc.adherence, 80);
    assert.equal(doc.energy, 4);
    assert.deepEqual(doc.mealPicks, [{ id: 'meal-lunch', o: 1 }], 'the meal pick travels inside the encrypted check-in');
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

  await step('check-in on iPhone Safari: createImageBitmap that draws nothing falls back to <img>; 3 photos, transparent → white', async () => {
    // Three camera-sized photos: two opaque JPEGs and a PNG with a clear background.
    const maker = await context.newPage();
    await maker.setViewportSize({ width: 2016, height: 1512 });
    const shots = [];
    for (const [bg, type] of [['linear-gradient(135deg,#1b7040,#f2c14e)', 'jpeg'], ['linear-gradient(45deg,#2b4a9b,#c81e3a)', 'jpeg']]) {
      await maker.setContent(`<body style="margin:0;background:${bg}"></body>`);
      shots.push({ type, buffer: await maker.screenshot({ type, quality: 90 }) });
    }
    await maker.setViewportSize({ width: 900, height: 1200 });
    await maker.setContent('<body style="margin:0;background:transparent"><div style="margin:300px auto;width:300px;height:600px;background:#c81e3a;border-radius:150px"></div></body>');
    shots.push({ type: 'png', buffer: await maker.screenshot({ type: 'png', omitBackground: true }) });
    await maker.close();

    const safari = await context.newPage();
    // What WebKit does on some iPhones: a bitmap of the right size that paints nothing.
    await safari.addInitScript(() => {
      const real = window.createImageBitmap.bind(window);
      window.__bitmapCalls = 0;
      window.createImageBitmap = async (src) => {
        window.__bitmapCalls++;
        const b = await real(src);
        const empty = await real(new ImageData(b.width, b.height));
        b.close();
        return empty;
      };
    });
    posted = null;
    await safari.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
    await safari.waitForSelector('body[data-ready="1"]', { timeout: 10_000 });
    await safari.click('#t-p-checkin');
    await safari.fill('input[name=weight]', '71');
    const files = shots.map((s, i) => ({ name: `p${i}.${s.type === 'png' ? 'png' : 'jpg'}`, mimeType: `image/${s.type}`, buffer: s.buffer }));
    const thumbCount = () => safari.locator('#p-checkin .thumb').count();
    const addButton = safari.locator('#p-checkin .add-photo');
    assert.equal((await addButton.textContent()).trim(), 'أضف صورة', 'Arabic add-photo button, not the browser\'s "Choose Files"');
    const addBox = await addButton.boundingBox();
    assert.ok(addBox && addBox.height >= 44, `add-photo height ${addBox?.height}`);
    await safari.locator('#p-checkin .add-photo').scrollIntoViewIfNeeded();
    await safari.screenshot({ path: join(shotDir, 'viewer-checkin-add-photo.png') });
    // Picks add up (front, then side, then back), they do not replace each other.
    await safari.setInputFiles('input[name=photo]', files.slice(0, 2));
    assert.equal(await thumbCount(), 2);
    await safari.setInputFiles('input[name=photo]', files.slice(2));
    assert.equal(await thumbCount(), 3);
    assert.ok(await addButton.isHidden(), 'add button hides at 3 photos');
    // Remove one, add it back.
    await safari.locator('#p-checkin .thumb-x').nth(2).click();
    assert.equal(await thumbCount(), 2);
    assert.ok(await addButton.isVisible());
    await safari.screenshot({ path: join(shotDir, 'viewer-checkin-two-photos.png') });
    await safari.setInputFiles('input[name=photo]', files.slice(2));
    assert.equal(await thumbCount(), 3);
    await safari.waitForFunction(() => [...document.querySelectorAll('#p-checkin .thumb img')].filter((i) => i.complete && i.naturalWidth > 0).length === 3);
    await safari.locator('#p-checkin form.card').screenshot({ path: join(shotDir, 'viewer-checkin-photos.png') });
    await safari.click('#p-checkin .btn');
    await safari.waitForFunction(() => document.querySelector('#p-checkin .status')?.textContent?.includes('وصلت'), null, { timeout: 15_000 });
    assert.equal(await thumbCount(), 0, 'photos clear after sending');
    assert.equal(await safari.evaluate(() => window.__bitmapCalls), 3, 'createImageBitmap was tried for each photo');
    const opened = await lib.openWithKey(key, new Uint8Array(posted.body));
    assert.ok(opened.ok);
    const doc = lib.parseCheckinDocument(JSON.parse(new TextDecoder().decode(opened.data)));
    assert.ok(doc && doc.photo && doc.photos?.length === 2, 'all three photos arrive');
    const pixels = await safari.evaluate(async (srcs) => {
      const out = [];
      for (const src of srcs) {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const corner = [...ctx.getImageData(2, 2, 1, 1).data];
        const middle = [...ctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data];
        out.push({ w: c.width, h: c.height, corner, middle });
      }
      return out;
    }, [doc.photo, ...doc.photos]);
    assert.deepEqual(pixels.map((p) => [p.w, p.h]), [[1200, 900], [1200, 900], [900, 1200]]);
    // A blank draw comes out solid white (over a fill) or solid black (JPEG of clear pixels): demand real colour.
    for (const p of pixels.slice(0, 2)) assert.ok(Math.max(...p.middle.slice(0, 3)) - Math.min(...p.middle.slice(0, 3)) > 40, `photo came out blank: ${p.middle}`);
    const png = pixels[2];
    assert.ok(png.corner.slice(0, 3).every((v) => v > 245), `clear background must turn white, got ${png.corner}`);
    assert.ok(png.middle[0] > 150 && png.middle[1] < 80, `red shape missing: ${png.middle}`);
    await safari.close();
  });

  await step("client's own photo: downscaled, packed like the app expects, encrypted with the link key; trainer photo in the header", async () => {
    const withPhoto = { ...lib.SAMPLE_DOCUMENT, brand: { ...lib.SAMPLE_DOCUMENT.brand, photo: lib.SAMPLE_DOCUMENT.brand.logo } };
    envelope = await lib.sealWithKey(key, new TextEncoder().encode(JSON.stringify(withPhoto)));
    await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
    await page.reload();
    await page.waitForSelector('body[data-ready="1"]', { timeout: 10_000 });
    assert.equal(await page.locator('#brand img.trainer-photo').count(), 1, 'trainer photo in the header');
    await page.click('#t-p-checkin');
    assert.equal((await page.locator('.my-photo h3').textContent()).trim(), 'صورتك');
    await page.setInputFiles('input[name=my-photo]', { name: 'me.png', mimeType: 'image/png', buffer: bigPhoto });
    await page.waitForFunction(() => document.querySelector('.my-photo .status')?.textContent?.includes('وصلت'), null, { timeout: 10_000 });
    await page.locator('.my-photo').screenshot({ path: join(shotDir, 'viewer-my-photo.png') });
    assert.ok(postedFile, 'no file POST seen');
    assert.equal(postedFile.kind, 'client_photo');
    assert.equal(postedFile.token, await expectedWriteToken(key));
    const opened = await lib.openWithKey(key, new Uint8Array(postedFile.body));
    assert.ok(opened.ok, 'shared/envelope.ts could not open the photo');
    const unpacked = lib.unpackFile(opened.data);
    assert.ok(unpacked, "the app's unpackFile could not read it");
    assert.equal(unpacked.header.mime, 'image/jpeg');
    assert.deepEqual([...unpacked.bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], 'JPEG bytes');
    envelope = await lib.sealWithKey(key, new TextEncoder().encode(JSON.stringify(lib.SAMPLE_DOCUMENT)));
  });

  await step('workout player: start, set done, rest countdown, progress kept after a reload; next-session countdown', async () => {
    await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
    await page.reload();
    await page.waitForSelector('body[data-ready="1"]');
    await page.evaluate(() => localStorage.clear());
    assert.ok((await page.textContent('.next-count')).startsWith('باقي '), 'countdown to the next session');
    await page.click('.pills .pill >> nth=0');
    await page.click('.wk-bar .btn');
    await page.waitForSelector('.wk');
    let t = await page.textContent('.wk');
    for (const x of ['تمرين 1 من 3', 'بنش برس', 'سيت 1 من 4', 'كمّلت 0 من 10 سيت']) assert.ok(t.includes(x), `player missing "${x}"`);
    await page.click('.wk .btn:has-text("خلّصت السيت")');
    t = await page.textContent('.wk');
    assert.ok(t.includes('راحة') && t.includes('كمّلت 1 من 10 سيت'), 'rest view');
    assert.match(await page.textContent('.wk-count'), /^1:(30|29|28)$/);
    await page.screenshot({ path: join(shotDir, 'viewer-workout-rest.png') });
    await page.click('.wk .btn:has-text("كفاية راحة")');
    assert.ok((await page.textContent('.wk')).includes('سيت 2 من 4'), 'next set after rest');
    await page.screenshot({ path: join(shotDir, 'viewer-workout-set.png') });
    await page.click('.wk-close');
    assert.equal(await page.locator('.wk').count(), 0);
    assert.ok((await page.textContent('.wk-bar')).includes('كمّلت 1 من 10 سيت'), 'small progress under the day');
    assert.ok((await page.textContent('.wk-bar .btn')).includes('كمّل التمرين'));
    await page.reload();
    await page.waitForSelector('body[data-ready="1"]');
    await page.click('.pills .pill >> nth=0');
    assert.ok((await page.textContent('.wk-bar')).includes('كمّلت 1 من 10 سيت'), 'progress kept after a reload');
  });

  await step('live page: the trainer’s new content shows by itself, same tab, check-in typing kept; timed set counts down', async () => {
    await page.click('#t-p-checkin');
    await page.fill('#p-checkin input[name=weight]', '72');
    const doc = structuredClone(lib.SAMPLE_DOCUMENT);
    doc.updatedAt += 60;
    doc.days[0] = { title: 'اليوم 1 — كور', exercises: [{ name: 'بلانك', sets: 1, reps: '2s' }] };
    envelope = await lib.sealWithKey(key, new TextEncoder().encode(JSON.stringify(doc)));
    await page.waitForTimeout(5200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector('.flash', { timeout: 5000 });
    assert.equal(await page.getAttribute('#t-p-checkin', 'aria-selected'), 'true', 'tab kept');
    assert.equal(await page.inputValue('#p-checkin input[name=weight]'), '72', 'typed value kept');
    await page.click('#t-p-program');
    await page.click('.pills .pill >> nth=0');
    assert.ok((await page.textContent('#app')).includes('بلانك'), 'new program shown');
    await page.click('.wk-bar .btn');
    await page.click('.wk .btn:has-text("ابدأ العدّ")');
    await page.waitForSelector('.wk-done', { timeout: 6000 });
    await page.click('.wk .btn:has-text("تمام")');
    envelope = await lib.sealWithKey(key, new TextEncoder().encode(JSON.stringify(lib.SAMPLE_DOCUMENT)));
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
    await page.goto('about:blank');
    await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
    await page.waitForSelector('body[data-ready="1"]');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, 'rgb(19, 18, 17)'); // Pebble dark --bg #131211
    await page.screenshot({ path: join(shotDir, 'viewer-program-dark.png'), fullPage: true });
  });
  await step('an English document (lang: en) renders LTR with English labels, light and dark', async () => {
    envelope = await lib.sealWithKey(key, new TextEncoder().encode(JSON.stringify({ ...lib.SAMPLE_DOCUMENT, lang: 'en' })));
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('about:blank');
      await page.goto(`${ORIGIN}/c/${shareId}#k=${b64url(key)}`);
      await page.waitForSelector('body[data-ready="1"]');
      assert.equal(await page.getAttribute('html', 'dir'), 'ltr');
      assert.equal(await page.getAttribute('html', 'lang'), 'en');
      const tabs = await page.locator('.tab').allTextContents();
      assert.deepEqual(tabs, ['Training', 'Meals', 'Progress', 'Check-in']);
      await page.click('.pills .pill >> nth=0');
      const text = await page.textContent('#app');
      for (const s of ['Next session', 'Your package', '5 of 12 sessions left', 'Sets 4', 'Reps 8-10', 'Rest 90s', 'Superset A', 'This page is private to you']) {
        assert.ok(text.includes(s), `missing "${s}"`);
      }
      assert.ok((await page.textContent('#brand')).includes('Hi '));
      await page.screenshot({ path: join(shotDir, `viewer-program-en-${scheme}.png`), fullPage: true });
    }
    envelope = await lib.sealWithKey(key, new TextEncoder().encode(JSON.stringify(lib.SAMPLE_DOCUMENT)));
    await page.emulateMedia({ colorScheme: 'light' });
  });
} finally {
  await browser.close();
  rmSync(join(outDir, 'bundle.mjs'), { force: true });
}
console.log(`\nviewer browser test: ${results.length} passed. Screenshots: ${shotDir}`);
