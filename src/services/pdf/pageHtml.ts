import type { PdfBlock, PdfDocument, PdfImageRef, PdfPage } from '@/domain/pdf';

/** Every text goes through this before it reaches innerHTML. */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Only blob:/data:/same-origin relative URLs produced by the renderer are allowed into src attributes. */
function safeUrl(url: string | null): string | null {
  if (!url) return null;
  return /^(blob:|data:image\/|\/|[a-z0-9_.-]+\/)/i.test(url) ? url : null;
}

export type UrlOf = (ref: PdfImageRef | null) => string | null;

function img(url: string | null, cls: string, alt = ''): string {
  const u = safeUrl(url);
  return u ? `<img class="${cls}" src="${esc(u)}" alt="${esc(alt)}">` : `<div class="${cls}"></div>`;
}

const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Isolates a value so numbers/Latin inside Arabic keep their order. A value with no Arabic letter
 * ("31%", "-20%", "× 1.55", "8-10") is forced left-to-right: with `dir=auto` such a value has no strong
 * character and took the page's RTL direction, printing "% 31" and "20%-".
 */
export const bdi = (t: string) => (ARABIC_LETTER.test(t) ? `<bdi>${esc(t)}</bdi>` : `<bdi dir="ltr">${esc(t)}</bdi>`);

const nice = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Colors reach SVG attributes and CSS unquoted: anything but #rrggbb falls back to the default. */
function safeHex(color: string, fallback = '#2F6F5E'): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function chartSvg(points: { date: string; kg: number }[], rawColor: string): string {
  const color = safeHex(rawColor);
  const W = 700;
  const H = 230;
  const pad = { start: 52, end: 24, top: 26, bottom: 30 };
  const kgs = points.map((p) => p.kg);
  let min = Math.floor(Math.min(...kgs));
  let max = Math.ceil(Math.max(...kgs));
  if (max - min < 4) {
    const mid = (max + min) / 2;
    min = Math.floor(mid - 2);
    max = Math.ceil(mid + 2);
  }
  const n = points.length;
  const plotW = W - pad.start - pad.end;
  // RTL time axis: the earliest measurement is on the right; the kg scale sits on the left.
  const x = (i: number) => W - pad.end - (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (kg: number) => pad.top + ((max - kg) * (H - pad.top - pad.bottom)) / (max - min);
  const base = H - pad.bottom;
  const grid = [0, 1, 2, 3]
    .map((k) => {
      const kg = min + ((max - min) * k) / 3;
      const gy = y(kg).toFixed(1);
      return (
        `<line x1="${pad.start}" y1="${gy}" x2="${W - pad.end}" y2="${gy}" stroke="#e8e8ea" stroke-dasharray="${k === 0 ? '0' : '4 4'}"/>` +
        `<text x="${pad.start - 8}" y="${(y(kg) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#8e8e93">${esc(nice(Math.round(kg * 10) / 10))}</text>`
      );
    })
    .join('');
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`);
  const area = `${x(0).toFixed(1)},${base} ${pts.join(' ')} ${x(n - 1).toFixed(1)},${base}`;
  const dots = points
    .map((p, i) => {
      const [, m, d] = p.date.split('-');
      const last = i === n - 1;
      return (
        `<circle cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="${last ? 6 : 4}" fill="${last ? color : '#fff'}" stroke="${color}" stroke-width="2.5"/>` +
        `<text x="${x(i).toFixed(1)}" y="${(y(p.kg) - 11).toFixed(1)}" font-size="${last ? 14 : 12}" font-weight="${last ? 700 : 500}" text-anchor="middle" fill="#1c1c1e">${esc(String(p.kg))}</text>` +
        `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#6e6e73">${esc(`${d}/${m}`)}</text>`
      );
    })
    .join('');
  return (
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${grid}` +
    `<polygon points="${area}" fill="${color}" fill-opacity="0.10"/>` +
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`
  );
}

/** Page-level things a block may print (the closing card shows the logo and trainer name). */
export interface BlockContext {
  logoUrl: string | null;
  trainerName: string;
}

const NO_CONTEXT: BlockContext = { logoUrl: null, trainerName: '' };

function statTile(s: { label: string; value: string; unit: string; emphasis?: boolean }): string {
  return `<div class="st${s.emphasis ? ' em' : ''}"><div class="lbl">${esc(s.label)}</div><div class="val">${bdi(s.value)}<span class="unit">${esc(s.unit)}</span></div></div>`;
}

export function blockHtml(b: PdfBlock, urlOf: UrlOf, color: string, ctx: BlockContext = NO_CONTEXT): string {
  switch (b.type) {
    case 'sectionTitle':
      return `<h2 class="blk b-section"><span class="no"><bdi dir="ltr">${String(b.index).padStart(2, '0')}</bdi></span><span class="tx">${esc(b.text)}</span></h2>`;
    case 'subTitle':
      return `<h3 class="blk b-sub"><span class="tx">${esc(b.text)}</span>${b.meta ? `<span class="meta">${bdi(b.meta)}</span>` : ''}</h3>`;
    case 'clientCard':
      return (
        `<div class="blk card b-client"><div class="hd"><div class="nm">${bdi(b.name)}</div>` +
        (b.chips.length > 0 ? `<div class="chips">${b.chips.map((c) => `<span>${bdi(c)}</span>`).join('')}</div>` : '') +
        `</div>${b.tiles.length > 0 ? `<div class="tiles">${b.tiles.map(statTile).join('')}</div>` : ''}</div>`
      );
    case 'keyValues':
      return `<div class="blk card b-kv">${b.rows.map((r) => `<div class="kv"><span class="k">${esc(r.label)}</span><span class="v">${bdi(r.value)}</span></div>`).join('')}</div>`;
    case 'stats':
      return `<div class="blk b-stats" style="grid-template-columns:repeat(${Math.min(5, Math.max(1, b.items.length))},1fr)">${b.items.map(statTile).join('')}</div>`;
    case 'macroBar':
      return `<div class="blk card b-bar"><div class="bar">${b.parts.map((p) => `<span class="tone-${p.tone}" style="width:${Math.max(0, Math.min(100, p.percent))}%"></span>`).join('')}</div><div class="legend">${b.parts
        .map((p) => `<span><i class="tone-${p.tone}"></i>${esc(p.label)} <b>${bdi(`${p.percent}%`)}</b></span>`)
        .join('')}</div></div>`;
    case 'paragraph':
      return `<p class="blk b-p${b.muted ? ' muted' : ''}">${esc(b.text)}</p>`;
    case 'exerciseHead': {
      const c = b.columns;
      return (
        `<div class="blk b-exh${b.withMap ? ' wm' : ''}">` +
        (b.continued ? `<div class="cont">${bdi(b.continued)}</div>` : '') +
        `<div class="row"><span class="c-i">#</span><span class="c-n">${esc(c.exercise)}</span><span class="c-sr">${esc(c.setsReps)}</span>` +
        `<span class="c-r">${esc(c.rest)}</span><span class="c-d">${esc(c.details)}</span>${b.withMap ? '<span class="c-m"></span>' : ''}</div></div>`
      );
    }
    case 'exercise':
      return (
        `<div class="blk b-ex${b.withMap ? ' wm' : ''}${b.index % 2 === 0 ? ' even' : ''}${b.last ? ' last' : ''}${b.superset ? ' ss' : ''}">` +
        `<div class="c-i"><span class="n"><bdi dir="ltr">${b.index}</bdi></span></div>` +
        `<div class="c-p">${b.image ? img(urlOf(b.image), 'pic', b.name) : '<div class="pic ph"></div>'}</div>` +
        `<div class="c-n"><div class="nm">${esc(b.name)}</div>` +
        (b.secondaryName ? `<div class="en">${bdi(b.secondaryName)}</div>` : '') +
        (b.muscles ? `<div class="mus">${b.muscles.split(/[،,] /).map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : '') +
        `</div><div class="c-sr"><bdi dir="ltr">${esc(b.sets)}<i>×</i>${esc(b.reps)}</bdi></div>` +
        `<div class="c-r">${bdi(b.rest)}</div>` +
        `<div class="c-d">${b.superset ? `<span class="sst">${esc(b.superset)}</span>` : ''}` +
        b.extras.map((p) => `<span class="x"><b>${esc(p.label)}</b> ${bdi(p.value)}</span>`).join('') +
        (b.notes ? `<span class="note">${bdi(b.notes)}</span>` : '') +
        `</div>${b.withMap ? `<div class="c-m">${b.muscleMap ? img(urlOf(b.muscleMap), 'map') : ''}</div>` : ''}</div>`
      );
    case 'measureTable':
      return (
        `<table class="blk b-mt"><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
        b.rows
          .map(
            (r) =>
              `<tr><td class="l">${esc(r.label)}</td><td>${bdi(r.first)} <small>${esc(r.unit)}</small></td>` +
              `<td class="lt">${bdi(r.latest)} <small>${esc(r.unit)}</small></td><td class="ch">${bdi(r.change)}</td></tr>`,
          )
          .join('') +
        `</tbody></table>`
      );
    case 'mealItem':
      return `<div class="blk b-meal"><span>${esc(b.text)}</span><span class="d">${bdi(b.detail)}</span></div>`;
    case 'mealCard':
      return (
        `<div class="blk card b-mealc"><div class="hd"><span class="nm">${esc(b.name)}</span>${b.time ? `<span class="tm">${bdi(b.time)}</span>` : ''}</div>` +
        `<ul>${b.items.map((i) => `<li><span class="it">${bdi(i.text)}</span><span class="sv">${bdi(i.detail)}</span><span class="gr">${i.grams ? bdi(i.grams) : ''}</span><span class="kc">${i.kcal ? bdi(i.kcal) : ''}</span></li>`).join('')}</ul>` +
        (b.totals ? `<div class="tot">${b.totals.map((t) => `<span class="${t.emphasis ? 'em' : ''}">${esc(t.label)} <b>${bdi(t.value)}</b> ${esc(t.unit)}</span>`).join('')}</div>` : '') +
        `</div>`
      );
    case 'recipe':
      return (
        `<div class="blk card b-rec"><div class="top">${b.image ? img(urlOf(b.image), 'pic', b.name) : ''}<div class="t"><div class="nm">${esc(b.name)}</div>` +
        (b.detail ? `<div class="d">${bdi(b.detail)}</div>` : '') +
        `<ul>${b.ingredients.map((i) => `<li>${bdi(i)}</li>`).join('')}</ul></div></div>` +
        (b.instructions ? `<div class="ins">${esc(b.instructions)}</div>` : '') +
        `</div>`
      );
    case 'supplement':
      return (
        `<div class="blk card b-sup">${b.image ? img(urlOf(b.image), 'pic', b.name) : '<div class="pic ph"></div>'}<div class="t"><div class="nm">${esc(b.name)}</div>` +
        (b.rows.length > 0 ? `<div class="rows">${b.rows.map((r) => `<span class="r"><b>${esc(r.label)}</b>${bdi(r.value)}</span>`).join('')}</div>` : '') +
        (b.notes ? `<div class="note">${esc(b.notes)}</div>` : '') +
        `</div></div>`
      );
    case 'weightChart':
      return `<div class="blk card b-chart"><div class="ttl">${esc(b.title)} <span>(${esc(b.unit)})</span></div>${chartSvg(b.points, color)}</div>`;
    case 'photoPair':
      return (
        `<div class="blk card b-photos">` +
        [b.before, b.after].map((p) => `<figure>${img(urlOf(p.image), 'ph')}<figcaption>${bdi(p.caption)}</figcaption></figure>`).join('') +
        `</div>`
      );
    case 'contact': {
      const logo = safeUrl(ctx.logoUrl);
      return (
        `<div class="blk b-contact">${logo ? `<img class="lg" src="${esc(logo)}" alt="">` : ''}` +
        (ctx.trainerName ? `<div class="who">${esc(ctx.trainerName)}</div>` : '') +
        (b.closing ? `<div class="cl">${esc(b.closing)}</div>` : '') +
        (b.lines.length > 0 ? `<div class="ttl">${esc(b.title)}</div><div class="lines">${b.lines.map((l) => `<span>${bdi(l)}</span>`).join('')}</div>` : '') +
        `</div>`
      );
    }
  }
}

/** Font stack: the trainer's font, then the bundled fonts, then the system. */
export function fontStack(family: string): string {
  const safe = family.replace(/['";]/g, '');
  return `'${safe}', 'Readex Pro', 'Alexandria', system-ui, sans-serif`;
}

/** dir/lang attributes for a page, from the document language (Arabic RTL by default). */
function dirAttrs(doc: PdfDocument): string {
  const ltr = doc.theme.dir === 'ltr';
  return ltr ? 'dir="ltr" lang="en"' : 'dir="rtl" lang="ar"';
}

function pageVars(doc: PdfDocument): string {
  const t = doc.theme;
  const hex = (c: string, d: string) => safeHex(c, d);
  const px = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  return (
    `--c1:${hex(t.primaryColor, '#2F6F5E')};--c2:${hex(t.secondaryColor, '#3A3A3C')};--on1:${hex(t.onPrimary, '#FFFFFF')};` +
    `--ink1:${hex(t.primaryInk, '#2F6F5E')};--tint1:${hex(t.primaryTint, '#F1F6F4')};--deep1:${hex(t.primaryDeep, '#1F4A3E')};` +
    `--hlogo:${px(t.headerLogoPx)}px;--clogo-w:${px(t.coverLogoBox.width)}px;--clogo-h:${px(t.coverLogoBox.height)}px;` +
    `font-family:${esc(fontStack(t.fontFamily))};`
  );
}

function footerHtml(doc: PdfDocument, page: PdfPage): string {
  const f = doc.footer;
  return (
    `<footer class="ptpdf-ftr"><div class="txt">${f.disclaimer ? `<div class="disc">${esc(f.disclaimer)}</div>` : ''}` +
    `<div class="row">${f.text ? `<span>${esc(f.text)}</span>` : ''}${f.contact ? `<span class="contact">${bdi(f.contact)}</span>` : ''}</div></div>` +
    `<span class="num"><bdi dir="ltr">${page.number} / ${page.total}</bdi></span></footer>`
  );
}

function coverHtml(doc: PdfDocument, page: Extract<PdfPage, { kind: 'cover' }>, urlOf: UrlOf): string {
  const t = doc.theme;
  const c = page.cover;
  const logoUrl = safeUrl(urlOf(t.logo));
  const coverUrl = safeUrl(urlOf(t.coverImage));
  const heading = c.clientName || c.title;
  const second = c.clientName ? c.title : c.subtitle;
  const third = c.clientName ? c.subtitle : '';
  const facts = [
    { k: c.dateLabel, v: c.dateText },
    ...(c.trainerName ? [{ k: c.preparedByLabel, v: c.trainerName }] : []),
  ];
  const mark = logoUrl
    ? `<div class="logo-card"><img src="${esc(logoUrl)}" alt="${esc(c.trainerName)}"></div>`
    : c.trainerName
      ? `<div class="mono">${esc(c.trainerName)}</div>`
      : '';
  return (
    `<div class="ptpdf-page ptpdf-cover" ${dirAttrs(doc)} style="${pageVars(doc)}">` +
    `<div class="hero${coverUrl ? ' photo' : ''}">${coverUrl ? `<img class="cimg" src="${esc(coverUrl)}" alt=""><div class="tint"></div>` : ''}` +
    `<div class="ring r1"></div><div class="ring r2"></div><div class="mark ${t.logoPlacement}">${mark}</div></div>` +
    `<div class="body">${c.clientName ? `<div class="kicker">${esc(c.planForLabel)}</div>` : ''}<h1${[...heading].length > 34 ? ' class="long"' : ''}>${bdi(heading)}</h1>` +
    (second ? `<div class="ttl"><span class="bar"></span><span>${bdi(second)}</span></div>` : '') +
    (third ? `<div class="sub">${bdi(third)}</div>` : '') +
    `<div class="facts">${facts.map((f) => `<div><span class="k">${esc(f.k)}</span><span class="v">${bdi(f.v)}</span></div>`).join('')}</div></div>` +
    `<div class="strip">${c.contacts.length > 0 ? `<div class="cl"><span class="k">${esc(c.contactLabel)}</span>${c.contacts.map((l) => `<span class="c">${bdi(l)}</span>`).join('')}</div>` : ''}` +
    (doc.footer.disclaimer ? `<div class="disc">${esc(doc.footer.disclaimer)}</div>` : '') +
    `</div></div>`
  );
}

/** Full HTML of one A4 page (794 × 1123 CSS px). */
export function pageHtml(doc: PdfDocument, page: PdfPage, urlOf: UrlOf, title: string): string {
  const t = doc.theme;
  if (page.kind === 'cover') return coverHtml(doc, page, urlOf);
  const color = /^#[0-9a-f]{6}$/i.test(t.primaryColor) ? t.primaryColor : '#2F6F5E';
  const logoUrl = urlOf(t.logo);
  const ctx: BlockContext = { logoUrl, trainerName: t.trainerName };
  const bgUrl = t.background ? safeUrl(urlOf(t.background.image)) : null;
  return (
    `<div class="ptpdf-page${bgUrl ? ' ptpdf-onbg' : ''}" ${dirAttrs(doc)} style="${pageVars(doc)}">` +
    (bgUrl ? `<img class="ptpdf-bg" src="${esc(bgUrl)}" alt="" style="opacity:${t.background!.opacity}">` : '') +
    `<div class="ptpdf-strip"></div>` +
    `<header class="ptpdf-hdr">${logoUrl ? img(logoUrl, 'lg', t.trainerName) : ''}<div class="id"><span class="who">${esc(t.trainerName)}</span>` +
    `<span class="doc">${bdi(title)}</span></div></header>` +
    `<main class="ptpdf-content">${page.blocks.map((b) => blockHtml(b, urlOf, color, ctx)).join('')}</main>` +
    `${footerHtml(doc, page)}</div>`
  );
}
