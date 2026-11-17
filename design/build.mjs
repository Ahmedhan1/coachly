// Injects the shared icon sprite + muscle-map symbols into every mockup page, so each HTML file stays
// self-contained (no external SVG fetch). Run: node design/build.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Muscle shapes for the LEFT half of a 100x230 figure; mirrored for the right half.
// Each muscle's fill comes from a CSS custom property, e.g. --m-glutes, so one <use> can highlight any group.
const shared = {
  base: [
    '<ellipse cx="50" cy="15" rx="8.5" ry="10.5"/>',
    '<path d="M46 24h8l1 7H45z"/>',
    '<ellipse cx="20" cy="113" rx="3.2" ry="6"/>',
    '<ellipse cx="80" cy="113" rx="3.2" ry="6"/>',
    '<path d="M34 202h8l1 9H31zM66 202h-8l-1 9h12z"/>',
    '<ellipse cx="38" cy="155.5" rx="4.4" ry="3.4"/><ellipse cx="62" cy="155.5" rx="4.4" ry="3.4"/>',
  ],
};
const front = {
  traps: ['M45.5 31 37.5 35.6h8.6z'],
  delts: ['M37 35.6c-8 -.6-12.5 4.4-13 15.4l6.5 2.5c.5-7.5 3.5-12 10-14.5z'],
  chest: ['M49.2 38 41.5 38.6C35 41 31.8 47 32.3 55c5.7 4.5 12.7 5 16.9 3z'],
  biceps: ['M24 54c-1.6 7-1.7 15 .2 22h6c1.3-7 1.4-14 .4-20z'],
  forearms: ['M23.6 79c-2.8 9-4.2 19-4 27l5 .5c2.2-8.5 4.6-18.5 5.8-27.5z'],
  abs: ['M43.6 61h5.6v7h-5.6z', 'M43.6 70h5.6v7h-5.6z', 'M43.6 79h5.6v7h-5.6z', 'M43.6 88h5.6v13c-2.7-2-4.6-6-5.6-10z'],
  obliques: ['M41.6 61c-5 2.5-6.4 11-6 23l6 7z'],
  quads: ['M36 101c-5.2 14-5.8 31-2.6 49l9.2 1c2.6-13 3.8-27 4.2-41l-5.3-9.5z'],
  adductors: ['M47.8 110l1.5-3v25c-1.7-1-2.5-6-1.5-22z'],
  calves: ['M33.6 160c-2 12-1.4 26 1.4 38h6.2c1.2-12 1-27 0-38z'],
};
const back = {
  traps: ['M50 24l-4.5 3-8 8.6 6 7.4L50 52z'],
  delts: front.delts,
  lats: ['M42.2 44.5c-5.7 3.5-8.8 13.5-6.8 27.5l8.1 10 5.7-10V55z'],
  triceps: front.biceps,
  forearms: front.forearms,
  lowerback: ['M44.2 83.5l5-8.5v23l-7.4-2c-.2-5 .8-9 2.4-12.5z'],
  obliques: ['M35.6 74l7 9c-1.6 5-2.1 9-2 13l-4.6-2c-1-6-1-14-.4-20z'],
  glutes: ['M41.2 98l8.1 1.5V119c-6.3 2-12.7-1-13.9-9-.2-3 .4-5 1.4-6 2.2-1 3.8-3 4.4-6z'],
  glutemed: ['M36 95.5l4.6 1.8c-.8 2.6-2.4 4.8-4.8 6.2-.6-2.6-.6-5.2.2-8z'],
  hamstrings: ['M35 122c-2.4 12-1.8 24 1 31h11c1.2-12 1.4-22 1-30.5-4 1.5-9 1.5-13-.5z'],
  calves: ['M33 159c-2.6 10-2 22 1.8 32h6.4c2.2-10 2.2-22 .4-32z'],
};

const mirror = (inner) => `<g transform="matrix(-1 0 0 1 100 0)">${inner}</g>`;
function figure(id, map) {
  const muscles = Object.entries(map)
    .map(([name, ds]) => {
      const paths = ds.map((d) => `<path d="${d}"/>`).join('');
      return `<g style="fill:var(--m-${name},var(--muscle-off))">${paths}</g>`;
    })
    .join('');
  return (
    `<symbol id="${id}" viewBox="0 0 100 230">` +
    `<g style="fill:var(--muscle-base)">${shared.base.join('')}</g>` +
    muscles +
    mirror(muscles) +
    `</symbol>`
  );
}

const sprite = readFileSync(join(here, 'icons.svg'), 'utf8').replace(
  '<!--MUSCLES-->',
  figure('body-front', front) + '\n  ' + figure('body-back', back),
);

const statusbar = `<div class="statusbar" aria-hidden="true"><span>9:41</span><div class="island"></div><span class="sys"><svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg><svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.3c2.3 0 4.4.9 6 2.4l1.2-1.2A10 10 0 0 0 8 .6 10 10 0 0 0 .8 3.5L2 4.7a8.4 8.4 0 0 1 6-2.4zm0 3.3c1.4 0 2.6.5 3.6 1.4L12.8 5.8A6.7 6.7 0 0 0 8 3.9a6.7 6.7 0 0 0-4.8 1.9L4.4 7A5 5 0 0 1 8 5.6zm0 3.3c.6 0 1.1.2 1.5.6L8 11 6.5 9.5c.4-.4.9-.6 1.5-.6z"/></svg><svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="currentColor" opacity=".5"/></svg></span></div>`;

let count = 0;
for (const dir of ['direction-a', 'direction-b'].filter((d) => existsSync(join(here, d)))) {
  for (const f of readdirSync(join(here, dir)).filter((n) => n.endsWith('.html'))) {
    const p = join(here, dir, f);
    const html = readFileSync(p, 'utf8');
    const out = html.replace(
      /<!--ICONS:start-->[\s\S]*?<!--ICONS:end-->/,
      `<!--ICONS:start-->\n${sprite}\n<!--ICONS:end-->`,
    ).replace(/<!--STATUSBAR:start-->[\s\S]*?<!--STATUSBAR:end-->/, `<!--STATUSBAR:start-->${statusbar}<!--STATUSBAR:end-->`);
    writeFileSync(p, out);
    count++;
  }
}
console.log(`sprite injected into ${count} pages`);
