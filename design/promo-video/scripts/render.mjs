// node render.mjs <timeline.js> <outDir> [workers] [frameList|range a-b]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [tlName, outDir, workersArg, sel] = process.argv.slice(2);
const workers = Number(workersArg || 4);
fs.mkdirSync(outDir, { recursive: true });
const html = fs.readFileSync(path.join(ROOT, 'comp', 'comp.html'), 'utf8').replace('src="TIMELINE"', `src="/comp/${tlName}"`);
const pageName = 'built-' + tlName.replace('.js', '.html');
fs.writeFileSync(path.join(ROOT, 'comp', pageName), html);
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'comp', tlName), 'utf8').replace(/^window\.TL = /, '').replace(/;\s*$/, ''));

let frames;
if (sel && sel.includes(',')) frames = sel.split(',').map(Number);
else if (sel && sel.includes('-')) { const [a, b] = sel.split('-').map(Number); frames = Array.from({ length: b - a }, (_, i) => a + i); }
else frames = Array.from({ length: tl.total }, (_, i) => i);
frames = frames.filter((f) => !fs.existsSync(path.join(outDir, String(f).padStart(5, '0') + '.jpg')));
console.log('rendering', frames.length, 'frames with', workers, 'workers');

const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const t0 = Date.now();
let done = 0;
async function worker(list) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.goto(`http://127.0.0.1:4500/comp/${pageName}`);
  await page.evaluate(() => window.ready);
  for (const f of list) {
    await page.evaluate((f) => window.render(f), f);
    await page.screenshot({ path: path.join(outDir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    if (++done % 300 === 0) console.log(`${done}/${frames.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await page.close();
}
// contiguous chunks keep each worker's image cache warm
const chunk = Math.ceil(frames.length / workers);
await Promise.all(Array.from({ length: workers }, (_, i) => worker(frames.slice(i * chunk, (i + 1) * chunk))));
await browser.close();
console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
