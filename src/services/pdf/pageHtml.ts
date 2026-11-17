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

/** Isolates a value so numbers/Latin inside Arabic keep their order. */
const bdi = (t: string) => `<bdi>${esc(t)}</bdi>`;

/** Colors reach SVG attributes and CSS unquoted: anything but #rrggbb falls back to the default. */
function safeHex(color: string, fallback = '#2F6F5E'): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function chartSvg(points: { date: string; kg: number }[], rawColor: string): string {
  const color = safeHex(rawColor);
  const W = 700;
  const H = 240;
  const pad = { x: 40, top: 16, bottom: 30 };
  const kgs = points.map((p) => p.kg);
  let min = Math.min(...kgs);
  let max = Math.max(...kgs);
  if (max - min < 2) {
    min -= 1;
    max += 1;
  }
  const n = points.length;
  // RTL time axis: the earliest measurement is on the right.
  const x = (i: number) => W - pad.x - (n === 1 ? 0 : (i * (W - 2 * pad.x)) / (n - 1));
  const y = (kg: number) => pad.top + ((max - kg) * (H - pad.top - pad.bottom)) / (max - min);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const dots = points
    .map((p, i) => {
      const [, m, d] = p.date.split('-');
      return (
        `<circle cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="4" fill="${color}"/>` +
        `<text x="${x(i).toFixed(1)}" y="${(y(p.kg) - 9).toFixed(1)}" font-size="12" text-anchor="middle" fill="#1c1c1e">${esc(String(p.kg))}</text>` +
        `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#6e6e73">${esc(`${d}/${m}`)}</text>`
      );
    })
    .join('');
  return (
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">` +
    `<line x1="${pad.x}" y1="${H - pad.bottom}" x2="${W - pad.x}" y2="${H - pad.bottom}" stroke="#d1d1d6"/>` +
    `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>${dots}</svg>`
  );
}

export function blockHtml(b: PdfBlock, urlOf: UrlOf, color: string): string {
  switch (b.type) {
    case 'sectionTitle':
      return `<h2 class="blk b-section">${esc(b.text)}</h2>`;
    case 'subTitle':
      return `<h3 class="blk b-sub"><span>${esc(b.text)}</span>${b.meta ? `<span class="meta">${bdi(b.meta)}</span>` : ''}</h3>`;
    case 'keyValues':
      return `<div class="blk card b-kv">${b.rows.map((r) => `<div class="kv"><span class="k">${esc(r.label)}</span><span class="v">${bdi(r.value)}</span></div>`).join('')}</div>`;
    case 'stats':
      return `<div class="blk b-stats">${b.items
        .map((s) => `<div class="st${s.emphasis ? ' em' : ''}"><div class="lbl">${esc(s.label)}</div><div class="val">${bdi(s.value)}<span class="unit">${esc(s.unit)}</span></div></div>`)
        .join('')}</div>`;
    case 'macroBar':
      return `<div class="blk card b-bar"><div class="bar">${b.parts.map((p) => `<span class="tone-${p.tone}" style="width:${Math.max(0, Math.min(100, p.percent))}%"></span>`).join('')}</div><div class="legend">${b.parts
        .map((p) => `<span><i class="tone-${p.tone}"></i>${esc(p.label)} ${bdi(`${p.percent}%`)}</span>`)
        .join('')}</div></div>`;
    case 'paragraph':
      return `<p class="blk b-p${b.muted ? ' muted' : ''}">${esc(b.text)}</p>`;
    case 'exercise':
      return (
        `<div class="blk card b-ex"><div class="n">${b.index}</div><div class="t">` +
        `<div class="nm">${esc(b.name)}${b.superset ? `<span class="ss">${esc(b.superset)}</span>` : ''}</div>` +
        (b.secondaryName ? `<div class="en">${bdi(b.secondaryName)}</div>` : '') +
        (b.muscles ? `<div class="mus">${esc(b.muscles)}</div>` : '') +
        `<div class="rx">${b.prescription.map((p) => `<span><b>${bdi(p.value)}</b>${esc(p.label)}</span>`).join('')}</div>` +
        (b.notes ? `<div class="note">${esc(b.notes)}</div>` : '') +
        `</div>${b.image ? img(urlOf(b.image), 'pic', b.name) : ''}${b.muscleMap ? img(urlOf(b.muscleMap), 'pic map') : ''}</div>`
      );
    case 'mealItem':
      return `<div class="blk b-meal"><span>${esc(b.text)}</span><span class="d">${bdi(b.detail)}</span></div>`;
    case 'recipe':
      return (
        `<div class="blk card b-rec"><div class="top"><div class="t"><div class="nm">${esc(b.name)}</div>` +
        (b.detail ? `<div class="d">${esc(b.detail)}</div>` : '') +
        `<ul>${b.ingredients.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>${b.image ? img(urlOf(b.image), 'pic', b.name) : ''}</div>` +
        (b.instructions ? `<div class="ins">${esc(b.instructions)}</div>` : '') +
        `</div>`
      );
    case 'supplement':
      return (
        `<div class="blk card b-sup"><div class="t"><div class="nm">${esc(b.name)}</div>` +
        b.rows.map((r) => `<div class="r"><b>${esc(r.label)}</b>${bdi(r.value)}</div>`).join('') +
        (b.notes ? `<div class="note">${esc(b.notes)}</div>` : '') +
        `</div>${b.image ? img(urlOf(b.image), 'pic', b.name) : ''}</div>`
      );
    case 'weightChart':
      return `<div class="blk card b-chart"><div class="ttl">${esc(b.title)} (${esc(b.unit)})</div>${chartSvg(b.points, color)}</div>`;
    case 'photoPair':
      return (
        `<div class="blk card b-photos">` +
        [b.before, b.after].map((p) => `<figure>${img(urlOf(p.image), 'ph')}<figcaption>${esc(p.caption)}</figcaption></figure>`).join('') +
        `</div>`
      );
    case 'contact':
      return `<div class="blk card b-contact"><div class="ttl">${esc(b.title)}</div>${b.lines.map((l) => `<div>${bdi(l)}</div>`).join('')}</div>`;
  }
}

/** Font stack: the trainer's font, then the bundled fonts, then the system. */
export function fontStack(family: string): string {
  const safe = family.replace(/['";]/g, '');
  return `'${safe}', 'Readex Pro', 'Alexandria', system-ui, sans-serif`;
}

function pageVars(doc: PdfDocument): string {
  const px = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  return (
    `--c1:${safeHex(doc.theme.primaryColor)};--c2:${safeHex(doc.theme.secondaryColor, '#3A3A3C')};` +
    `--hlogo:${px(doc.theme.headerLogoPx)}px;--clogo:${px(doc.theme.coverLogoPx)}px;font-family:${esc(fontStack(doc.theme.fontFamily))};`
  );
}

function footerHtml(doc: PdfDocument, page: PdfPage, withNumber: boolean): string {
  const f = doc.footer;
  return (
    `<footer class="ptpdf-ftr">${f.disclaimer ? `<div class="disc">${esc(f.disclaimer)}</div>` : ''}` +
    `<div class="row">${f.text ? `<span>${esc(f.text)}</span>` : ''}${f.contact ? `<span class="contact">${bdi(f.contact)}</span>` : ''}` +
    `${withNumber ? `<span class="num"><bdi dir="ltr">${page.number} / ${page.total}</bdi></span>` : ''}</div></footer>`
  );
}

/** Full HTML of one A4 page (794 × 1123 CSS px). */
export function pageHtml(doc: PdfDocument, page: PdfPage, urlOf: UrlOf, title: string): string {
  const t = doc.theme;
  const color = safeHex(t.primaryColor);
  const logoUrl = urlOf(t.logo);
  if (page.kind === 'cover') {
    const c = page.cover;
    const coverUrl = urlOf(t.coverImage);
    return (
      `<div class="ptpdf-page ptpdf-cover" dir="rtl" lang="ar" style="${pageVars(doc)}">` +
      (coverUrl ? `${img(coverUrl, 'cimg')}<div class="shade"></div>` : '<div class="plain"></div>') +
      `<div class="inner">${logoUrl ? `<div class="logo ${esc(t.logoPlacement)}">${img(logoUrl, '', t.trainerName)}</div>` : ''}<div class="spacer"></div>` +
      `<h1>${esc(c.title)}</h1>${c.subtitle ? `<div class="sub">${esc(c.subtitle)}</div>` : ''}` +
      `<dl>${c.clientName ? `<dt>${esc(c.clientLabel)}</dt><dd>${esc(c.clientName)}</dd>` : ''}` +
      `${c.trainerName ? `<dt>${esc(c.preparedByLabel)}</dt><dd>${esc(c.trainerName)}</dd>` : ''}` +
      `<dt>${esc(c.dateLabel)}</dt><dd>${bdi(c.dateText)}</dd></dl></div>` +
      `${footerHtml(doc, page, false)}</div>`
    );
  }
  const bgUrl = t.background ? urlOf(t.background.image) : null;
  return (
    `<div class="ptpdf-page${bgUrl ? ' ptpdf-onbg' : ''}" dir="rtl" lang="ar" style="${pageVars(doc)}">` +
    (bgUrl ? `<img class="ptpdf-bg" src="${esc(safeUrl(bgUrl) ?? '')}" alt="" style="opacity:${Math.min(1, Math.max(0, Number(t.background!.opacity) || 0))}">` : '') +
    `<header class="ptpdf-hdr">${logoUrl ? img(logoUrl, '', t.trainerName) : ''}<span class="who">${esc(t.trainerName)}</span><span class="doc">${esc(title)}</span></header>` +
    `<main class="ptpdf-content">${page.blocks.map((b) => blockHtml(b, urlOf, color)).join('')}</main>` +
    `${footerHtml(doc, page, true)}</div>`
  );
}
