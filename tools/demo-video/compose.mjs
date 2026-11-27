#!/usr/bin/env node
// Turns record.mjs footage into the demo video: 1080×1920, 30 fps, H.264 + AAC music.
// - The footage plays on a tilted 3D phone. The phone is built with CSS 3D (titanium edge made of stacked slabs,
//   bezel, Dynamic Island, side buttons, glass glare) and rendered by Chromium; its screen corners are measured in
//   the browser and ffmpeg's perspective filter maps every frame onto them. No third-party device artwork is used.
// - Captions and intro/outro cards are drawn by Chromium too (Rubik, correct Arabic shaping).
// - No camera moves: the whole phone stays in view. Off-camera parts are cut; the pace is slightly sped up.
// - Music: tools/demo-video/music.mjs (synthesized, nothing to license).
// Usage: node tools/demo-video/compose.mjs <dir from record.mjs> [out.mp4]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');

const dir = resolve(process.argv[2] ?? 'demo-out');
const outFile = resolve(process.argv[3] ?? join(dir, 'demo.mp4'));
const root = fileURLToPath(new URL('../..', import.meta.url));
const { view, events, total } = JSON.parse(readFileSync(join(dir, 'events.json'), 'utf8'));

const W = 1080;
const H = 1920;
const FPS = 30;
const SPEED = 1.15;
const INTRO = 2.2;
const OUTRO = 2.8;
const XFADE = 0.45;
const CAPTION_H = 230;
// The phone's screen before the 3D tilt (centre and width on the canvas).
const SCREEN_W = 660;
const SCREEN_H = Math.round((SCREEN_W * view.height) / view.width);
const CENTER = { x: 540, y: 1085 };
const TILT = 'rotateX(7deg) rotateY(-17deg) rotateZ(1.5deg)';

// ---------- timeline: cuts and speed ----------
const cuts = [];
for (const e of events) {
  if (e.type === 'cutStart') cuts.push([e.t, total]);
  if (e.type === 'cutEnd' && cuts.length) cuts[cuts.length - 1][1] = e.t;
}
const keep = [];
let cursor = 0;
for (const [a, b] of cuts) {
  if (a > cursor) keep.push([cursor, a]);
  cursor = Math.max(cursor, b);
}
if (cursor < total) keep.push([cursor, total]);
/** Footage ms → output seconds (null when the moment was cut). */
function outTime(ms) {
  let before = 0;
  for (const [a, b] of keep) {
    if (ms >= a && ms <= b) return (before + ms - a) / 1000 / SPEED;
    before += b - a;
  }
  return null;
}
const mainDur = keep.reduce((s, [a, b]) => s + b - a, 0) / 1000 / SPEED;
const totalDur = INTRO + mainDur + OUTRO - 2 * XFADE;

const scenes = events
  .filter((e) => e.type === 'scene')
  .map((e) => ({ caption: e.caption, t: outTime(e.t) }))
  .filter((s) => s.t !== null);
scenes.forEach((s, i) => (s.end = i + 1 < scenes.length ? scenes[i + 1].t : mainDur));

// ---------- stills drawn by Chromium ----------
const fontFace = ['arabic', 'latin']
  .map((s) => `@font-face{font-family:Rubik;src:url('file://${root}public/fonts/rubik-${s}.woff2') format('woff2');font-weight:300 900;}`)
  .join('');
const page = (body, css, height = H) =>
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${fontFace}*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${height}px;background:transparent;font-family:Rubik,sans-serif;overflow:hidden}${css}</style></head><body>${body}</body></html>`;

const BEZEL = 20;
const RIM = 6;
const R = 70; // screen corner radius
const DEPTH = 34; // phone thickness in px
const bodyW = SCREEN_W + 2 * (BEZEL + RIM);
const bodyH = SCREEN_H + 2 * (BEZEL + RIM);
const slabs = Array.from({ length: 18 }, (_, i) => {
  const z = -DEPTH + (i * DEPTH) / 17;
  return `<div class="slab" style="transform:translateZ(${z.toFixed(1)}px)"></div>`;
}).join('');
/** The phone in 3D, in layers: body (metal edge, under the screen), top (bezel, island, glare, over the screen),
 * mask (white screen only), shadow (soft floor shadow). */
const phoneHtml = (mode) => `
  <div class="stage"><div class="phone">
    ${mode === 'body' ? `${slabs}<div class="btn b1"></div><div class="btn b2"></div><div class="btn b3"></div><div class="btn b4"></div>` : ''}
    ${mode === 'shadow' ? '<div class="shadow"></div>' : ''}
    ${mode === 'top' ? '<div class="front"><div class="rim"></div></div>' : ''}
    <div class="screen">${mode === 'top' ? '<div class="island"></div><div class="glare"></div><i class="m" style="left:0;top:0"></i><i class="m" style="right:0;top:0"></i><i class="m" style="left:0;bottom:0"></i><i class="m" style="right:0;bottom:0"></i>' : ''}</div>
  </div></div>`;
const phoneCss = (mode) => `
  body{background:${mode === 'mask' ? '#000' : 'transparent'}}
  .stage{position:absolute;inset:0;perspective:2600px;perspective-origin:${CENTER.x}px ${CENTER.y - 120}px}
  .phone{position:absolute;left:${CENTER.x - bodyW / 2}px;top:${CENTER.y - bodyH / 2}px;width:${bodyW}px;height:${bodyH}px;transform-style:preserve-3d;transform:${TILT}}
  .slab{position:absolute;inset:0;border-radius:${R + BEZEL + RIM}px;background:linear-gradient(100deg,#2a2a2d 0%,#9a9aa0 22%,#d9d9de 30%,#6d6d72 46%,#3b3b3f 70%,#a7a7ad 92%,#4a4a4e 100%)}
  .btn{position:absolute;width:12px;border-radius:6px;background:linear-gradient(90deg,#55555a,#c8c8cd,#55555a);transform:translateZ(-${DEPTH / 2}px)}
  .b1{left:-7px;top:250px;height:60px}.b2{left:-7px;top:340px;height:110px}.b3{left:-7px;top:470px;height:110px}.b4{right:-7px;top:390px;height:170px}
  .front{position:absolute;inset:0;border-radius:${R + BEZEL + RIM}px;border:${BEZEL + RIM}px solid #0a0a0b;transform:translateZ(1px)}
  .rim{position:absolute;inset:${-(BEZEL + RIM)}px;border-radius:${R + BEZEL + RIM}px;border:${RIM}px solid #b9b9be;box-shadow:inset 0 0 0 1px rgba(255,255,255,.55),0 0 0 1px rgba(0,0,0,.35)}
  .screen{position:absolute;left:${BEZEL + RIM}px;top:${BEZEL + RIM}px;width:${SCREEN_W}px;height:${SCREEN_H}px;transform:translateZ(2px);${mode === 'mask' ? 'background:#fff;' : ''}}
  .island{position:absolute;left:50%;top:18px;width:184px;height:52px;margin-left:-92px;border-radius:26px;background:#050505}
  .glare{position:absolute;inset:0;border-radius:${R}px;background:linear-gradient(118deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.05) 28%,rgba(255,255,255,0) 42%)}
  .m{position:absolute;width:1px;height:1px}
  .shadow{position:absolute;inset:40px -10px -10px 60px;border-radius:${R + 40}px;background:rgba(70,45,20,.42);filter:blur(46px);transform:translateZ(-${DEPTH + 60}px) translate(60px,70px)}`;

const backdrop = `body{background:radial-gradient(1200px 900px at 85% 12%,rgba(242,92,31,.22),transparent 60%),radial-gradient(900px 900px at 0% 100%,rgba(242,92,31,.12),transparent 60%),linear-gradient(180deg,#F6F2EC,#EBE3D8)}`;
const stills = {
  bg: page('', backdrop),
  shadow: page(phoneHtml('shadow'), phoneCss('shadow')),
  body: page(phoneHtml('body'), phoneCss('body')),
  top: page(phoneHtml('top'), phoneCss('top')),
  mask: page(phoneHtml('mask'), phoneCss('mask')),
  intro: page(
    `<div class="wrap"><div class="mark">ك</div><h1>كوتش</h1><p>تطبيق المدرب الشخصي</p><div class="tags"><span>برامج</span><span>مجسم 3D</span><span>جيمات</span></div></div>`,
    `${backdrop}.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
     .mark{width:240px;height:240px;border-radius:64px;background:#F25C1F;color:#111;display:grid;place-items:center;font-size:150px;font-weight:700;box-shadow:0 30px 60px rgba(242,92,31,.3)}
     h1{font-size:120px;font-weight:700;color:#1C1A17}p{font-size:48px;color:#57524A}
     .tags{display:flex;gap:18px}.tags span{padding:14px 34px;border-radius:999px;background:#fff;font-size:38px;font-weight:600;color:#AE4216;box-shadow:0 4px 14px rgba(40,30,20,.06)}`,
  ),
  outro: page(
    `<div class="wrap"><div class="mark">ك</div><h1>جاهز على الآيفون</h1><p>من Safari ← «إضافة إلى الشاشة الرئيسية»</p><div class="url">app.getcoachly.workers.dev</div></div>`,
    `body{background:#F25C1F}.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;color:#111}
     .mark{width:200px;height:200px;border-radius:54px;background:#111;color:#F25C1F;display:grid;place-items:center;font-size:124px;font-weight:700}
     h1{font-size:96px;font-weight:700}p{font-size:42px;font-weight:500;opacity:.85}
     .url{direction:ltr;padding:20px 40px;border-radius:999px;background:#111;color:#fff;font-size:38px;font-weight:600}`,
  ),
};
scenes.forEach((s, i) => {
  stills[`cap${i}`] = page(
    `<div class="cap"><span>${s.caption}</span></div>`,
    `.cap{height:100%;display:flex;align-items:center;justify-content:center;padding-top:30px}
     span{padding:20px 48px;border-radius:999px;background:#1C1A17;color:#fff;font-size:48px;font-weight:600;box-shadow:0 12px 28px rgba(30,20,10,.2)}`,
    CAPTION_H,
  );
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
let corners = null;
for (const [name, html] of Object.entries(stills)) {
  const p = await ctx.newPage();
  const file = join(dir, `${name}.html`);
  writeFileSync(file, html);
  await p.goto(`file://${file}`);
  await p.evaluate(() => document.fonts.ready);
  if (name === 'top') {
    corners = await p.$$eval('.m', (els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }));
  }
  const height = name.startsWith('cap') ? CAPTION_H : H;
  await p.screenshot({ path: join(dir, `${name}.png`), omitBackground: name !== 'mask', clip: { x: 0, y: 0, width: W, height } });
  await p.close();
}
await browser.close();
if (!corners || corners.length !== 4) throw new Error('could not measure the screen corners');
const [tl, tr, bl, br] = corners.map(([x, y]) => [x.toFixed(1), y.toFixed(1)]);

// ---------- ffmpeg graph ----------
const music = join(dir, 'music.wav');
execFileSync('node', [fileURLToPath(new URL('./music.mjs', import.meta.url)), music, String(Math.ceil(totalDur + 1))], { stdio: 'inherit' });

const loop = (file, dur) => ['-loop', '1', '-framerate', String(FPS), '-t', dur.toFixed(3), '-i', join(dir, file)];
const inputs = ['-i', join(dir, 'raw.mp4'), ...loop('bg.png', mainDur), ...loop('shadow.png', mainDur), ...loop('body.png', mainDur), ...loop('mask.png', mainDur), ...loop('intro.png', INTRO), ...loop('outro.png', OUTRO), '-i', music, ...loop('top.png', mainDur)];
const AUDIO = 7;
const TOP = 8;
scenes.forEach((s, i) => inputs.push(...loop(`cap${i}.png`, mainDur)));
const CAP0 = 9;

const g = [];
keep.forEach(([a, b], i) => g.push(`[0:v]trim=start=${(a / 1000).toFixed(3)}:end=${(b / 1000).toFixed(3)},setpts=PTS-STARTPTS[k${i}]`));
g.push(
  `${keep.map((_, i) => `[k${i}]`).join('')}concat=n=${keep.length}:v=1:a=0,setpts=PTS/${SPEED},fps=${FPS},` +
    `scale=${W}:${H}:flags=lanczos,format=rgba,` +
    `perspective=x0=${tl[0]}:y0=${tl[1]}:x1=${tr[0]}:y1=${tr[1]}:x2=${bl[0]}:y2=${bl[1]}:x3=${br[0]}:y3=${br[1]}:sense=destination:interpolation=cubic[warp]`,
);
g.push(`[4:v]format=gray[mask]`);
g.push(`[warp][mask]alphamerge[screen]`);
g.push(`[1:v]format=rgba[bg]`);
g.push(`[bg][2:v]overlay=0:0:shortest=1[s1]`);
g.push(`[s1][3:v]overlay=0:0:shortest=1[s2]`);
g.push(`[s2][screen]overlay=0:0:shortest=1[s2b]`);
g.push(`[s2b][${TOP}:v]overlay=0:0:shortest=1[s3]`);
let last = 's3';
scenes.forEach((s, i) => {
  const a = s.t.toFixed(3);
  const b = Math.max(s.t + 0.5, s.end - 0.25).toFixed(3);
  g.push(`[${CAP0 + i}:v]format=rgba,fade=t=in:st=${a}:d=0.25:alpha=1,fade=t=out:st=${b}:d=0.25:alpha=1[c${i}]`);
  g.push(`[${last}][c${i}]overlay=0:0:enable='between(t,${a},${(s.end + 0.01).toFixed(3)})'[m${i}]`);
  last = `m${i}`;
});
g.push(`[${last}]format=yuv420p,setsar=1[main]`);
g.push(`[5:v]format=yuv420p,setsar=1[in]`);
g.push(`[6:v]format=yuv420p,setsar=1[out]`);
g.push(`[in][main]xfade=transition=fade:duration=${XFADE}:offset=${(INTRO - XFADE).toFixed(3)}[im]`);
g.push(`[im][out]xfade=transition=smoothup:duration=${XFADE}:offset=${(INTRO + mainDur - 2 * XFADE).toFixed(3)}[v]`);
g.push(`[${AUDIO}:a]atrim=0:${totalDur.toFixed(3)},afade=t=in:d=0.4,afade=t=out:st=${(totalDur - 2).toFixed(3)}:d=2,volume=0.9[a]`);

const graphFile = join(dir, 'graph.txt');
writeFileSync(graphFile, g.join(';\n'));
execFileSync(
  'ffmpeg',
  ['-y', '-v', 'error', ...inputs, '-filter_complex_script', graphFile, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-r', String(FPS), outFile],
  { stdio: 'inherit' },
);
console.log(`wrote ${outFile}: ${totalDur.toFixed(1)} s, ${scenes.length} captions, screen corners ${JSON.stringify(corners.map((c) => c.map(Math.round)))}`);
