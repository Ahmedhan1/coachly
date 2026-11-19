import type { AppServices } from '@/app/services';
import { readBrandCache, writeBrandCache, applyHeadIcons, type BrandCache } from '@/app/pwa/BootSplash';
import { contrastRatio, normalizeHex, ON_DARK, ON_LIGHT, DEFAULT_BRAND } from '@/domain/branding';

/** Where a `w × h` picture lands inside a `box` square with `pad` (fraction of the box) on each side, aspect kept. */
export function containRect(w: number, h: number, box: number, pad: number): { x: number; y: number; w: number; h: number } {
  const inner = box * (1 - 2 * pad);
  const scale = w > 0 && h > 0 ? Math.min(inner / w, inner / h) : 0;
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  return { x: Math.round((box - dw) / 2), y: Math.round((box - dh) / 2), w: dw, h: dh };
}

/** Text colour that reads best on the brand colour. */
export function onColorFor(color: string): string {
  return contrastRatio(color, ON_LIGHT) >= contrastRatio(color, ON_DARK) ? ON_LIGHT : ON_DARK;
}

type Bitmap = { width: number; height: number; source: CanvasImageSource; close: () => void };

async function bitmapOf(blob: Blob): Promise<Bitmap | null> {
  try {
    const b = await createImageBitmap(blob);
    return { width: b.width, height: b.height, source: b, close: () => b.close() };
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight, source: img, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      return null;
    }
  }
}

function drawPng(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  draw(ctx);
  const url = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  return url.startsWith('data:image/png') ? url : null;
}

/** Square icon: brand background, the logo on a white rounded card (works for any logo colours). */
function squareIcon(bmp: Bitmap, size: number, color: string): string | null {
  return drawPng(size, size, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, size, size);
    const card = Math.round(size * 0.78);
    const o = Math.round((size - card) / 2);
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.roundRect(o, o, card, card, Math.round(card * 0.18));
    c.fill();
    const r = containRect(bmp.width, bmp.height, card, 0.1);
    c.drawImage(bmp.source, o + r.x, o + r.y, r.w, r.h);
  });
}

/** The logo alone, ≤ `max` px on the long side (transparent background kept). */
export function scaledLogo(bmp: Bitmap, max: number): string | null {
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  return drawPng(w, h, (c) => c.drawImage(bmp.source, 0, 0, w, h));
}

/** Launch image for this screen: brand colour with the logo card in the middle (portrait, device pixels). */
function startupImage(bmp: Bitmap, color: string): BrandCache['startup'] {
  const ratio = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 2)));
  const width = Math.round(window.screen.width * ratio);
  const height = Math.round(window.screen.height * ratio);
  if (!(width > 0 && height > 0)) return null;
  const url = drawPng(width, height, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, width, height);
    const card = Math.round(Math.min(width * 0.56, height * 0.34));
    const x = Math.round((width - card) / 2);
    const y = Math.round((height - card) / 2);
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.roundRect(x, y, card, card, Math.round(card * 0.12));
    c.fill();
    const r = containRect(bmp.width, bmp.height, card, 0.1);
    c.drawImage(bmp.source, x + r.x, y + r.y, r.w, r.h);
  });
  return url ? { url, width, height, ratio } : null;
}

/** Builds the cached splash / icon set from the trainer's identity. */
export async function buildBrandCache(colorInput: string, logo: Blob | undefined): Promise<BrandCache> {
  const color = normalizeHex(colorInput) ?? DEFAULT_BRAND;
  const base: BrandCache = { color, onColor: onColorFor(color), logo: null, icon180: null, icon512: null, startup: null };
  const bmp = logo ? await bitmapOf(logo) : null;
  if (!bmp) return base;
  try {
    return { ...base, logo: scaledLogo(bmp, 512), icon180: squareIcon(bmp, 180, color), icon512: squareIcon(bmp, 512, color), startup: startupImage(bmp, color) };
  } finally {
    bmp.close();
  }
}

/** Last identity the cache was built from, so the work runs only when the logo or colour changes. */
const SOURCE_KEY = 'pt.brandAssets.source';

function readSource(): string | null {
  try {
    return window.localStorage.getItem(SOURCE_KEY);
  } catch {
    return null;
  }
}

/**
 * Refreshes the splash and home-screen icons from settings when the logo or colour changed. Returns true
 * when the logo changed (the caller may show the one-time "re-add to home screen" hint).
 */
export async function refreshBrandAssets(services: Pick<AppServices, 'data'>): Promise<boolean> {
  const s = await services.data.repos.settings.get();
  const source = `${s.logoImageId ?? ''}|${s.primaryColor}`;
  const previous = readSource();
  if (previous === source && readBrandCache()) return false;
  const blob = s.logoImageId ? await services.data.repos.images.getBlob(s.logoImageId) : undefined;
  const cache = await buildBrandCache(s.primaryColor, blob);
  writeBrandCache(cache);
  applyHeadIcons(cache);
  try {
    window.localStorage.setItem(SOURCE_KEY, source);
  } catch {
    // ignore
  }
  return s.logoImageId !== null && (previous ?? '').split('|')[0] !== s.logoImageId;
}

/** Small logo for the client page header (data URL ≤ 100 000 chars), or null. */
export async function clientPageLogo(services: Pick<AppServices, 'data'>): Promise<string | null> {
  const s = await services.data.repos.settings.get();
  const blob = s.logoImageId ? await services.data.repos.images.getBlob(s.logoImageId) : undefined;
  const bmp = blob ? await bitmapOf(blob) : null;
  if (!bmp) return null;
  try {
    for (const max of [192, 144, 96]) {
      const url = scaledLogo(bmp, max);
      if (url && url.length <= 100_000) return url;
    }
    return null;
  } finally {
    bmp.close();
  }
}

