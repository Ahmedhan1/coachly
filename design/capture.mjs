// Screenshots every mockup screen: 2 directions x 3 screens x 2 iPhones x light/dark, plus the
// full-scroll Pro Max shots, the alternate-brand proof, and compare.html.
// Run from anywhere: node design/capture.mjs [filter]   (Playwright is installed globally)
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'screenshots');
mkdirSync(out, { recursive: true });
const filter = process.argv[2] ?? '';

const devices = [
  { name: 'se', width: 375, height: 667 },
  { name: 'promax', width: 430, height: 932 },
];
const screens = ['home', 'client', 'program'];
const jobs = [];
for (const dir of ['a', 'b'])
  for (const screen of screens)
    for (const d of devices)
      for (const scheme of ['light', 'dark']) {
        jobs.push({ dir, screen, d, scheme, hash: '', file: `${dir}-${screen}-${d.name}-${scheme}.png` });
        if (d.name === 'promax') jobs.push({ dir, screen, d, scheme, hash: '', full: true, file: `${dir}-${screen}-${d.name}-${scheme}-full.png` });
      }
for (const dir of ['a', 'b'])
  for (const scheme of ['light', 'dark'])
    jobs.push({ dir, screen: 'home', d: devices[1], scheme, hash: '#alt', file: `${dir}-home-promax-${scheme}-altbrand.png` });

const browser = await playwright.chromium.launch();
const fontReport = new Set();
for (const j of jobs.filter((x) => x.file.includes(filter))) {
  const ctx = await browser.newContext({
    viewport: { width: j.d.width, height: j.d.height }, deviceScaleFactor: 2, colorScheme: j.scheme, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const url = pathToFileURL(join(here, `direction-${j.dir}`, `${j.screen}.html`)).href + j.hash;
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`));
  loaded.forEach((f) => fontReport.add(`${j.dir}: ${f}`));
  if (j.full) {
    // Fixed bars must land at the real bottom: grow the viewport to the scroll height instead of fullPage.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: j.d.width, height: Math.max(h, j.d.height) });
    await page.waitForTimeout(50);
  }
  await page.screenshot({ path: join(out, j.file) });
  await ctx.close();
  console.log('saved', j.file);
}

if (('compare'.includes(filter) || filter === '') && existsSync(join(here, 'compare.html'))) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(join(here, 'compare.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(out, 'compare.png'), fullPage: true });
  await ctx.close();
  console.log('saved compare.png');
}
await browser.close();
console.log('\nFonts that actually loaded (document.fonts status=loaded):\n' + [...fontReport].sort().join('\n'));
