// Builds comp/timeline.js (scene frames, clip mapping) and music sections from story/scenes.mjs + footage metas.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FOOT = path.join(ROOT, process.argv[2] || 'footage2');
const STORY = process.argv[3] || 'scenes.mjs';
const OUT = process.argv[4] || 'timeline.js';
const { SCENES } = await import(path.join(ROOT, 'story', STORY));
const FPS = 30;
const BAR = 60; // frames per bar (2 s)

// PDF pages -> png
const pdfDir = path.join(ROOT, 'comp', 'pdf');
if (!fs.existsSync(pdfDir) || !fs.readdirSync(pdfDir).length) {
  fs.mkdirSync(pdfDir, { recursive: true });
  execFileSync('pdftoppm', ['-r', '70', '-png', path.join(FOOT, 'plan.pdf'), path.join(pdfDir, 'p')]);
}
const pdfPages = fs.readdirSync(pdfDir).filter((f) => f.endsWith('.png')).sort().map((f) => '/comp/pdf/' + f);

let start = 0;
const scenes = [];
const sections = [];
for (const s of SCENES) {
  const frames = s.bars * BAR;
  const sc = { ...s, start, frames };
  if (s.clip) {
    const meta = JSON.parse(fs.readFileSync(path.join(FOOT, s.clip, 'meta.json'), 'utf8'));
    if (s.from !== undefined || s.to !== undefined) {
      const a0 = Math.round((s.from || 0) * FPS), a1 = s.to !== undefined ? Math.round(s.to * FPS) : meta.frames.length;
      meta.frames = meta.frames.slice(a0, a1);
      meta.taps = meta.taps.filter((t) => t.f >= a0 && t.f < a1).map((t) => ({ ...t, f: t.f - a0 }));
    }
    const lead = 10, tail = 12;
    const avail = frames - lead - tail;
    const rate = Math.max(1, meta.frames.length / avail);
    sc.clipData = {
      dir: '/' + path.relative(ROOT, path.join(FOOT, s.clip)) + '/',
      frames: meta.frames,
      taps: meta.taps.map((t) => ({ ...t, f: Math.round(t.f / rate) + lead })),
      lead, rate,
    };
  }
  if (s.type === 'pdf') sc.pages = pdfPages;
  scenes.push(sc);
  const b0 = start / BAR;
  sections.push([b0, b0 + s.bars, s.music]);
  start += frames;
}
// merge adjacent sections of the same kind
const merged = [];
for (const s of sections) {
  const last = merged[merged.length - 1];
  if (last && last[2] === s[2] && last[1] === s[0]) last[1] = s[1]; else merged.push([...s]);
}
const total = start + 2 * BAR; // + ending tail (music fade)
merged.push([start / BAR, total / BAR, 'outro']);
fs.writeFileSync(path.join(ROOT, 'comp', OUT), 'window.TL = ' + JSON.stringify({ fps: FPS, total, scenes }) + ';\n');
fs.writeFileSync(path.join(ROOT, 'comp', OUT.replace('.js', '.sections.json')), JSON.stringify(merged));
console.log('scenes', scenes.length, 'frames', total, 'seconds', (total / FPS).toFixed(1), 'bars', total / BAR);
console.log(JSON.stringify(merged));
for (const s of scenes) if (s.clipData) console.log(s.clip.padEnd(10), 'rate', s.clipData.rate.toFixed(2));
