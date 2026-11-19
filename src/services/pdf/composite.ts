/**
 * Draws the page's pictures straight onto the page canvas instead of letting html-to-image paint them.
 *
 * Why: html-to-image renders the page as an SVG <foreignObject>. WebKit (every browser on iPhone) often leaves
 * <img> inside it blank — warm-up passes help for one small logo but not for a page of exercise photos, so the
 * trainer got PDFs with empty frames. Canvas drawImage from an already-decoded <img> is reliable on iPhone.
 *
 * Order per page: white → "under" pictures (page background, cover photo) → the html-to-image snapshot taken
 * with every <img> hidden and the page/hero fills transparent → every other picture on top, inside its content
 * box (so borders like the client photo's white ring stay visible) and clipped to its rounded corners.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pictures painted below the snapshot: everything else on the page sits on top of them. */
export const UNDER_SELECTOR = '.ptpdf-bg, .cimg';

/** Where the picture lands inside `box` for a CSS object-fit (object-position is always centre here). */
export function fitRect(fit: string, box: Box, naturalW: number, naturalH: number): Box {
  if (naturalW <= 0 || naturalH <= 0 || fit === 'fill') return box;
  const cover = box.w / naturalW > box.h / naturalH ? box.w / naturalW : box.h / naturalH;
  const contain = Math.min(box.w / naturalW, box.h / naturalH);
  let scale: number;
  if (fit === 'cover') scale = cover;
  else if (fit === 'contain') scale = contain;
  else if (fit === 'none') scale = 1;
  else if (fit === 'scale-down') scale = Math.min(1, contain);
  else return box;
  const w = naturalW * scale;
  const h = naturalH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** A computed border-radius ("8px", "50%", "0px") as px for a box, capped at half the shorter side. */
export function radiusPx(value: string, w: number, h: number): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const px = value.trim().endsWith('%') ? (n / 100) * Math.min(w, h) : n;
  return Math.min(px, Math.min(w, h) / 2);
}

function roundedPath(ctx: CanvasRenderingContext2D, b: Box, r: number): void {
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(b.x, b.y, b.w, b.h);
    return;
  }
  ctx.moveTo(b.x + r, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r);
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r);
  ctx.closePath();
}

/** Every loaded picture on the page that belongs to `layer`, drawn at `scale` canvas px per CSS px. */
export function paintPictures(ctx: CanvasRenderingContext2D, page: HTMLElement, scale: number, layer: 'under' | 'over'): number {
  const origin = page.getBoundingClientRect();
  let painted = 0;
  for (const img of page.querySelectorAll('img')) {
    if ((img.matches(UNDER_SELECTOR) ? 'under' : 'over') !== layer) continue;
    if (!img.complete || img.naturalWidth === 0) continue;
    const cs = getComputedStyle(img);
    const r = img.getBoundingClientRect();
    const px = (v: string) => parseFloat(v) || 0;
    // Content box: inside border and padding.
    const left = px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const right = px(cs.borderRightWidth) + px(cs.paddingRight);
    const top = px(cs.borderTopWidth) + px(cs.paddingTop);
    const bottom = px(cs.borderBottomWidth) + px(cs.paddingBottom);
    const box: Box = {
      x: (r.left - origin.left + left) * scale,
      y: (r.top - origin.top + top) * scale,
      w: (r.width - left - right) * scale,
      h: (r.height - top - bottom) * scale,
    };
    if (box.w <= 0 || box.h <= 0) continue;
    const radius = Math.max(0, radiusPx(cs.borderTopLeftRadius, r.width, r.height) - Math.max(left, top)) * scale;
    const target = fitRect(cs.objectFit || 'fill', box, img.naturalWidth, img.naturalHeight);
    ctx.save();
    try {
      ctx.globalAlpha = Math.max(0, Math.min(1, parseFloat(cs.opacity) || 1));
      roundedPath(ctx, box, radius);
      ctx.clip();
      ctx.drawImage(img, target.x, target.y, target.w, target.h);
      painted++;
    } catch {
      // an undrawable picture leaves its frame empty, like before
    } finally {
      ctx.restore();
    }
  }
  return painted;
}

/** CSS applied while snapshotting: pictures hidden (painted by paintPictures), fills under them transparent. */
export const SNAPSHOT_CLASS = 'ptpdf-snap';
export function snapshotStyles(): string {
  return (
    `.${SNAPSHOT_CLASS} img { visibility: hidden !important; }\n` +
    `.ptpdf-page.${SNAPSHOT_CLASS} { background: transparent !important; }\n` +
    `.${SNAPSHOT_CLASS} .hero.photo { background: transparent !important; }\n`
  );
}
