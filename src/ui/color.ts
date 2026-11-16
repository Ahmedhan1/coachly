/** Pure color helpers used to derive readable brand variants from the trainer's chosen color. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`bad color ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black text, whichever reads better on `background`. */
export function textOn(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#0b0b0c') ? '#ffffff' : '#0b0b0c';
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * Moves `hex` toward `target` until it reaches `minContrast` against `against`.
 * Used for: brand on light surfaces (darken) and brand on dark surfaces (lighten).
 */
export function ensureContrast(hex: string, against: string, minContrast: number, target: string): string {
  const base = hexToRgb(hex);
  const goal = hexToRgb(target);
  for (let step = 0; step <= 20; step++) {
    const candidate = rgbToHex(mix(base, goal, step / 20));
    if (contrastRatio(candidate, against) >= minContrast) return candidate;
  }
  return target;
}

export interface BrandPalette {
  light: string;
  onLight: string;
  dark: string;
  onDark: string;
}

/** Brand variants that keep 3:1 against their surface (WCAG non-text / large text). */
export function brandPalette(primary: string): BrandPalette {
  const light = ensureContrast(primary, '#ffffff', 3, '#000000');
  const dark = ensureContrast(primary, '#1c1c1e', 3.5, '#ffffff');
  return { light, onLight: textOn(light), dark, onDark: textOn(dark) };
}
