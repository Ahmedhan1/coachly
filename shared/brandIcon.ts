// Trainer logo on the home-screen icon (shared by the app and the app Worker in deploy/app).
//
// iOS reads the home-screen icon and launch image once, when the trainer taps "Add to Home Screen" in Safari,
// and never again. So the logo has to be chosen before installing: the install page builds the icon set on the
// phone, uploads it here (only these generated pictures and the colour: no names, no client data), and points
// the page's icon / manifest / launch-image links at the hosted copies. The installed app then starts at
// `/?brand=<id>` and copies the logo into its own settings.

/** Content-addressed brand id: 24 lowercase hex chars. */
export const BRAND_ID = /^[0-9a-f]{24}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const BRAND_LIMITS = {
  icon180: 120_000,
  icon512: 600_000,
  logo: 600_000,
  startup: 1_500_000,
  /** Largest launch image side, device pixels (iPhone Pro Max is 1320 × 2868). */
  startupMaxSide: 3200,
} as const;

export interface BrandStartup {
  png: Uint8Array;
  width: number;
  height: number;
  ratio: number;
}

export interface BrandUpload {
  color: string;
  icon180: Uint8Array;
  icon512: Uint8Array;
  logo: Uint8Array;
  startup: BrandStartup | null;
}

export type BrandUploadError = 'shape' | 'color' | 'icon180' | 'icon512' | 'logo' | 'startup';

/** Width and height of a PNG (from its IHDR chunk), or null when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function decodePng(value: unknown, maxBytes: number): Uint8Array | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil((maxBytes * 4) / 3) + 4 || !BASE64.test(value)) return null;
  try {
    const bin = atob(value);
    if (bin.length > maxBytes) return null;
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function square(bytes: Uint8Array | null, size: number): Uint8Array | null {
  const s = bytes && pngSize(bytes);
  return s && s.width === size && s.height === size ? bytes : null;
}

/** Validates an upload from the install page: exact icon sizes, PNG only, size caps. */
export function parseBrandUpload(input: unknown): { ok: true; value: BrandUpload } | { ok: false; error: BrandUploadError } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'shape' };
  const v = input as Record<string, unknown>;
  if (typeof v.color !== 'string' || !HEX.test(v.color)) return { ok: false, error: 'color' };
  const icon180 = square(decodePng(v.icon180, BRAND_LIMITS.icon180), 180);
  if (!icon180) return { ok: false, error: 'icon180' };
  const icon512 = square(decodePng(v.icon512, BRAND_LIMITS.icon512), 512);
  if (!icon512) return { ok: false, error: 'icon512' };
  const logo = decodePng(v.logo, BRAND_LIMITS.logo);
  const logoSize = logo && pngSize(logo);
  if (!logo || !logoSize || Math.max(logoSize.width, logoSize.height) > 512) return { ok: false, error: 'logo' };
  let startup: BrandStartup | null = null;
  if (v.startup !== undefined && v.startup !== null) {
    const s = v.startup as Record<string, unknown>;
    const png = typeof s === 'object' ? decodePng(s.png, BRAND_LIMITS.startup) : null;
    const size = png && pngSize(png);
    const ratio = typeof s.ratio === 'number' && Number.isInteger(s.ratio) && s.ratio >= 1 && s.ratio <= 3 ? s.ratio : null;
    if (!png || !size || ratio === null || size.width !== s.width || size.height !== s.height || Math.max(size.width, size.height) > BRAND_LIMITS.startupMaxSide) {
      return { ok: false, error: 'startup' };
    }
    startup = { png, width: size.width, height: size.height, ratio };
  }
  return { ok: true, value: { color: v.color.toUpperCase(), icon180, icon512, logo, startup } };
}

/** The brand id in a URL query (`?brand=<id>`), or null. */
export function brandParam(search: string): string | null {
  const id = new URLSearchParams(search).get('brand');
  return id && BRAND_ID.test(id) ? id : null;
}

export const brandPath = (id: string, file: 'icon-180.png' | 'icon-512.png' | 'logo.png' | 'startup.png' | 'manifest.webmanifest' | 'brand.json') => `/b/${id}/${file}`;

/** Web app manifest for one brand: same app (id '/'), the trainer's icons, starts with the brand id. */
export function brandManifest(id: string, color: string) {
  return {
    id: '/',
    name: 'Coachly',
    short_name: 'Coachly',
    lang: 'ar',
    dir: 'rtl',
    display: 'standalone',
    orientation: 'portrait',
    start_url: `/?brand=${id}`,
    scope: '/',
    background_color: color,
    theme_color: color,
    icons: [
      { src: brandPath(id, 'icon-180.png'), sizes: '180x180', type: 'image/png' },
      { src: brandPath(id, 'icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}

/** Media query iOS uses to pick a launch image for a screen (portrait, device pixels → CSS pixels). */
export function startupMedia(width: number, height: number, ratio: number): string {
  return `(device-width: ${Math.round(width / ratio)}px) and (device-height: ${Math.round(height / ratio)}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
}
