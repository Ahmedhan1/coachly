#!/usr/bin/env node
// Turns record.mjs footage into the demo video: 1080×1920, 30 fps, H.264.
// - Phone frame, captions and the intro/outro cards are drawn by Chromium (Rubik, correct Arabic shaping).
// - ffmpeg cuts the off-camera parts, speeds up slightly, and moves a "camera": an eased zoom toward each tap and
//   back out, so every press reads on a small screen. Captions fade in/out per scene. Cards crossfade in and out.
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
const SPEED = 1.1;
const SCREEN = { x: 168, y: 170, w: 744, h: Math.round((744 * view.height) / view.width) };
const INTRO = 2.4;
const OUTRO = 2.8;
const XFADE = 0.45;
const BG = '#EFEAE2';

// ---------- timeline: cuts, speed, events in output time ----------
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

const scenes = events
  .filter((e) => e.type === 'scene')
  .map((e) => ({ caption: e.caption, t: outTime(e.t) }))
  .filter((s) => s.t !== null);
scenes.forEach((s, i) => (s.end = i + 1 < scenes.length ? scenes[i + 1].t : mainDur));

const toCanvas = (x, y) => [SCREEN.x + (x * SCREEN.w) / view.width, SCREEN.y + (y * SCREEN.h) / view.height];
const taps = [];
for (const e of events.filter((e) => e.type === 'tap' && e.zoom)) {
  const t = outTime(e.t);
  if (t === null || (taps.length && t - taps[taps.length - 1].t < 1.55)) continue;
  const [cx, cy] = toCanvas(e.x, e.y);
  taps.push({ t, cx, cy });
}

// ---------- camera expressions (ffmpeg expr syntax) ----------
const Z = 0.42; // extra zoom at a tap (1.42×)
const smooth = (u) => `(${u})*(${u})*(3-2*(${u}))`;
function envelope({ t }) {
  const a = Math.max(0, t - 0.45);
  const b = t;
  const c = t + 0.45;
  const d = t + 0.95;
  return `(between(t,${a.toFixed(3)},${b.toFixed(3)})*${smooth(`(t-${a.toFixed(3)})/${(b - a).toFixed(3)}`)}+between(t,${b.toFixed(3)},${c.toFixed(3)})*gt(t,${b.toFixed(3)})+between(t,${c.toFixed(3)},${d.toFixed(3)})*gt(t,${c.toFixed(3)})*(1-${smooth(`(t-${c.toFixed(3)})/${(d - c).toFixed(3)}`)}))`;
}
// A slow push-in at the start of the footage, then the tap bumps.
const intro = `(1-${smooth('min(t,1.4)/1.4')})*0.18`;
const zExpr = `min(1.6,1+${intro}+${taps.map((p) => `${Z}*${envelope(p)}`).join('+') || '0'})`;
const cxExpr = `${W / 2}+${taps.map((p) => `${(p.cx - W / 2).toFixed(1)}*${envelope(p)}`).join('+') || '0'}`;
const cyExpr = `${H / 2}+${taps.map((p) => `${(p.cy - H / 2).toFixed(1)}*${envelope(p)}`).join('+') || '0'}`;

// ---------- stills drawn by Chromium ----------
const fontFace = ['arabic', 'latin']
  .map((s) => `@font-face{font-family:Rubik;src:url('file://${root}public/fonts/rubik-${s}.woff2') format('woff2');font-weight:300 900;}`)
  .join('');
const page = (body, css) =>
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${fontFace}*{margin:0;box-sizing:border-box}html,body{width:${W}px;background:transparent;font-family:Rubik,sans-serif}${css}</style></head><body>${body}</body></html>`;

const R = 56;
const stills = {
  frame: page(
    `<div class="hole"></div><div class="bezel"></div>`,
    `body{height:${H}px;position:relative}
     .hole{position:absolute;left:${SCREEN.x}px;top:${SCREEN.y}px;width:${SCREEN.w}px;height:${SCREEN.h}px;border-radius:${R}px;box-shadow:0 0 0 3000px ${BG}}
     .bezel{position:absolute;left:${SCREEN.x - 14}px;top:${SCREEN.y - 14}px;width:${SCREEN.w + 28}px;height:${SCREEN.h + 28}px;border-radius:${R + 14}px;border:14px solid #1C1A17;box-shadow:0 40px 80px rgba(60,40,20,.22),0 8px 20px rgba(60,40,20,.12)}`,
  ),
  intro: page(
    `<div class="wrap"><div class="mark">ك</div><h1>كوتش</h1><p>تطبيق المدرب الشخصي</p><div class="tags"><span>حسابات</span><span>جيمات</span><span>مزامنة</span></div></div>`,
    `body{height:${H}px;background:#F3F1ED}.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
     .mark{width:240px;height:240px;border-radius:64px;background:#F25C1F;color:#111;display:grid;place-items:center;font-size:150px;font-weight:700;box-shadow:0 30px 60px rgba(242,92,31,.3)}
     h1{font-size:120px;font-weight:700;color:#1C1A17}p{font-size:48px;color:#57524A}
     .tags{display:flex;gap:18px}.tags span{padding:14px 34px;border-radius:999px;background:#fff;font-size:38px;font-weight:600;color:#AE4216;box-shadow:0 4px 14px rgba(40,30,20,.06)}`,
  ),
  outro: page(
    `<div class="wrap"><div class="mark">ك</div><h1>جاهز على الآيفون</h1><p>من Safari ← «إضافة إلى الشاشة الرئيسية»</p><div class="url">pt-coach.nexus-ahmed.workers.dev</div></div>`,
    `body{height:${H}px;background:#F25C1F}.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;color:#111}
     .mark{width:200px;height:200px;border-radius:54px;background:#111;color:#F25C1F;display:grid;place-items:center;font-size:124px;font-weight:700}
     h1{font-size:96px;font-weight:700}p{font-size:42px;font-weight:500;opacity:.85}
     .url{direction:ltr;padding:20px 40px;border-radius:999px;background:#111;color:#fff;font-size:38px;font-weight:600}`,
  ),
};
scenes.forEach((s, i) => {
  stills[`cap${i}`] = page(
    `<div class="cap"><span>${s.caption}</span></div>`,
    `body{height:${SCREEN.y}px}.cap{height:100%;display:flex;align-items:center;justify-content:center;padding-top:18px}
     span{padding:18px 44px;border-radius:999px;background:#1C1A17;color:#fff;font-size:46px;font-weight:600;box-shadow:0 10px 24px rgba(30,20,10,.18)}`,
  );
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
for (const [name, html] of Object.entries(stills)) {
  const p = await ctx.newPage();
  const file = join(dir, `${name}.html`);
  writeFileSync(file, html);
  await p.goto(`file://${file}`);
  await p.evaluate(() => document.fonts.ready);
  const height = name.startsWith('cap') ? SCREEN.y : H;
  await p.screenshot({ path: join(dir, `${name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: W, height } });
  await p.close();
}
await browser.close();

// ---------- ffmpeg graph ----------
const inputs = ['-i', join(dir, 'raw.mp4'), '-loop', '1', '-i', join(dir, 'frame.png'), '-loop', '1', '-t', String(INTRO), '-i', join(dir, 'intro.png'), '-loop', '1', '-t', String(OUTRO), '-i', join(dir, 'outro.png')];
scenes.forEach((_, i) => inputs.push('-loop', '1', '-t', mainDur.toFixed(3), '-i', join(dir, `cap${i}.png`)));

const g = [];
keep.forEach(([a, b], i) => g.push(`[0:v]trim=start=${(a / 1000).toFixed(3)}:end=${(b / 1000).toFixed(3)},setpts=PTS-STARTPTS[k${i}]`));
g.push(`${keep.map((_, i) => `[k${i}]`).join('')}concat=n=${keep.length}:v=1:a=0,setpts=PTS/${SPEED},fps=${FPS},scale=${SCREEN.w}:${SCREEN.h}:flags=lanczos[phone]`);
g.push(`color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${mainDur.toFixed(3)}[bg]`);
g.push(`[bg][phone]overlay=${SCREEN.x}:${SCREEN.y}:shortest=1[p1]`);
g.push(`[p1][1:v]overlay=0:0:shortest=1,format=yuv420p[p2]`);
// Camera: scale up by z(t) and crop the 1080×1920 window around the tap.
g.push(
  `[p2]scale=w='trunc(${W}*(${zExpr})/2)*2':h='trunc(${H}*(${zExpr})/2)*2':eval=frame:flags=bicubic,` +
    `crop=${W}:${H}:x='max(0,min(in_w-${W},(${cxExpr})*in_w/${W}-${W / 2}))':y='max(0,min(in_h-${H},(${cyExpr})*in_h/${H}-${H / 2}))',setsar=1[cam]`,
);
let last = 'cam';
scenes.forEach((s, i) => {
  const a = s.t.toFixed(3);
  const b = Math.max(s.t + 0.5, s.end - 0.25).toFixed(3);
  g.push(`[${4 + i}:v]format=rgba,fade=t=in:st=${a}:d=0.25:alpha=1,fade=t=out:st=${b}:d=0.25:alpha=1[c${i}]`);
  g.push(`[${last}][c${i}]overlay=0:0:enable='between(t,${a},${(s.end + 0.01).toFixed(3)})'[m${i}]`);
  last = `m${i}`;
});
g.push(`[${last}]format=yuv420p,setsar=1[main]`);
g.push(`[2:v]fps=${FPS},format=yuv420p,setsar=1[in]`);
g.push(`[3:v]fps=${FPS},format=yuv420p,setsar=1[out]`);
g.push(`[in][main]xfade=transition=fade:duration=${XFADE}:offset=${(INTRO - XFADE).toFixed(3)}[im]`);
g.push(`[im][out]xfade=transition=smoothup:duration=${XFADE}:offset=${(INTRO + mainDur - 2 * XFADE).toFixed(3)}[v]`);

const graphFile = join(dir, 'graph.txt');
writeFileSync(graphFile, g.join(';\n'));
execFileSync(
  'ffmpeg',
  ['-y', '-v', 'error', ...inputs, '-filter_complex_script', graphFile, '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS), outFile],
  { stdio: 'inherit' },
);
console.log(`wrote ${outFile}: ${(INTRO + mainDur + OUTRO - 2 * XFADE).toFixed(1)} s, ${taps.length} camera moves, ${scenes.length} captions`);
