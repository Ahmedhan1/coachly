/**
 * One brand color → every brand token, for light and dark (docs/DESIGN.md §2).
 * Port of the design-phase brand-derive.mjs reference with two additions that turn its intent into guarantees:
 *  - brand-ink must also read on the brand tint (chips, selected rows), not only on the page background;
 *  - text on a brand fill always reaches 4.5:1 — when neither white nor near-black does, the fill is
 *    nudged (darker for white text, lighter for dark text) until one does.
 * Pure: no DOM, no clock.
 */

export interface BrandTokens {
  /** Fill: primary button, hero block, selected pill, center add button. */
  brand: string;
  /** Text and icons on a brand fill. */
  brandOn: string;
  /** Brand used as text (links, active tab icon, chip text). */
  brandInk: string;
  brandTint: string;
  brandTintStrong: string;
}

export interface BrandTheme {
  source: string;
  light: BrandTokens;
  dark: BrandTokens;
}

export interface ModeSurfaces {
  bg: string;
  surface: string;
  surface2: string;
}

export interface Surfaces {
  light: ModeSurfaces;
  dark: ModeSurfaces;
}

/** The app's neutrals (Pebble, src/ui/tokens.css): brand tokens are derived to stay readable on each of these. */
export const APP_SURFACES: Surfaces = {
  light: { bg: '#F3F1ED', surface: '#FFFFFF', surface2: '#EFECE6' },
  dark: { bg: '#131211', surface: '#1E1C1A', surface2: '#282623' },
};

export const ON_LIGHT = '#FFFFFF';
export const ON_DARK = '#111111';
export const DEFAULT_BRAND = '#F25C1F';

/** Swatches offered in identity setup. Labels are i18n keys under `identity.presets`. */
export const BRAND_PRESETS = [
  { id: 'orange', hex: '#F25C1F' },
  { id: 'crimson', hex: '#C81E3A' },
  { id: 'blue', hex: '#1D5FD1' },
  { id: 'green', hex: '#1F7A4D' },
  { id: 'teal', hex: '#0E7C86' },
  { id: 'gold', hex: '#E0A100' },
  { id: 'graphite', hex: '#2B2F33' },
  { id: 'pink', hex: '#D63A7A' },
] as const;

export type BrandPresetId = (typeof BRAND_PRESETS)[number]['id'];

const MIN_TEXT = 4.5;
const MIN_INK_DARK = 5.5;
const MIN_FILL_DARK = 3;
const STEPS = 50;

/** `#abc`, `abc`, `#AABBCC` → `#AABBCC`; anything else → null. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${[...raw].map((c) => c + c).join('')}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`.toUpperCase();
  return null;
}

function requireHex(input: string): string {
  const hex = normalizeHex(input);
  if (hex === null) throw new Error(`invalid color: ${input}`);
  return hex;
}

function channels(hex: string): [number, number, number] {
  const n = requireHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function toHex(c: readonly number[]): string {
  return `#${c
    .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

const linear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `t` = 0 → a, 1 → b (sRGB interpolation, same as the reference). */
export function mixHex(a: string, b: string, t: number): string {
  const A = channels(a);
  const B = channels(b);
  return toHex(A.map((v, i) => v * (1 - t) + (B[i] ?? 0) * t));
}

/** Moves `color` toward `toward` in small steps until `meets(candidate)`; returns `toward` if never met. */
function nudge(color: string, toward: string, meets: (candidate: string) => boolean): string {
  for (let i = 0; i <= STEPS; i++) {
    const candidate = mixHex(color, toward, i / STEPS);
    if (meets(candidate)) return candidate;
  }
  return toward;
}

const minContrast = (color: string, against: readonly string[]): number =>
  Math.min(...against.map((bg) => contrastRatio(color, bg)));

function bestOn(fill: string): string {
  return contrastRatio(fill, ON_LIGHT) >= contrastRatio(fill, ON_DARK) ? ON_LIGHT : ON_DARK;
}

/** Fill plus readable on-color; nudges the fill only when neither on-color reaches 4.5:1. */
function fillWithOn(fill: string): { brand: string; brandOn: string } {
  const on = bestOn(fill);
  if (contrastRatio(fill, on) >= MIN_TEXT) return { brand: fill, brandOn: on };
  const toward = on === ON_LIGHT ? '#000000' : '#FFFFFF';
  const nudged = nudge(fill, toward, (c) => contrastRatio(c, on) >= MIN_TEXT);
  return { brand: nudged, brandOn: on };
}

function lightTokens(brand: string, s: ModeSurfaces): BrandTokens {
  const brandTint = mixHex(s.bg, brand, 0.1);
  const brandTintStrong = mixHex(s.bg, brand, 0.2);
  const inkOn = [s.bg, s.surface, s.surface2, brandTint];
  const brandInk = nudge(brand, '#000000', (c) => minContrast(c, inkOn) >= MIN_TEXT);
  return { ...fillWithOn(brand), brandInk, brandTint, brandTintStrong };
}

function darkTokens(brand: string, s: ModeSurfaces): BrandTokens {
  const lifted = contrastRatio(brand, s.bg) < MIN_FILL_DARK
    ? nudge(brand, '#FFFFFF', (c) => contrastRatio(c, s.bg) >= MIN_FILL_DARK)
    : brand;
  const brandTint = mixHex(s.bg, brand, 0.16);
  const brandTintStrong = mixHex(s.bg, brand, 0.28);
  const brandInk = nudge(
    brand,
    '#FFFFFF',
    (c) => minContrast(c, [s.bg, s.surface]) >= MIN_INK_DARK && minContrast(c, [s.surface2, brandTint]) >= MIN_TEXT,
  );
  return { ...fillWithOn(lifted), brandInk, brandTint, brandTintStrong };
}

export function deriveBrand(color: string, surfaces: Surfaces = APP_SURFACES): BrandTheme {
  const source = requireHex(color);
  return { source, light: lightTokens(source, surfaces.light), dark: darkTokens(source, surfaces.dark) };
}

export interface ContrastCheck {
  mode: 'light' | 'dark';
  pair: string;
  ratio: number;
  min: number;
  ok: boolean;
  /** 'text' pairs must pass; 'fill' pairs (brand block vs page) are advisory. */
  kind: 'text' | 'fill';
}

/** Re-run whenever the trainer changes the color; show a warning if a 'text' pair fails. */
export function auditBrand(theme: BrandTheme, surfaces: Surfaces = APP_SURFACES): ContrastCheck[] {
  const checks: ContrastCheck[] = [];
  const add = (mode: 'light' | 'dark', pair: string, a: string, b: string, min: number, kind: 'text' | 'fill') => {
    const ratio = contrastRatio(a, b);
    checks.push({ mode, pair, ratio, min, ok: ratio >= min, kind });
  };
  for (const mode of ['light', 'dark'] as const) {
    const t = theme[mode];
    const s = surfaces[mode];
    add(mode, 'brand-on/brand', t.brandOn, t.brand, MIN_TEXT, 'text');
    add(mode, 'brand-ink/bg', t.brandInk, s.bg, MIN_TEXT, 'text');
    add(mode, 'brand-ink/surface', t.brandInk, s.surface, MIN_TEXT, 'text');
    add(mode, 'brand-ink/brand-tint', t.brandInk, t.brandTint, MIN_TEXT, 'text');
    add(mode, 'brand/bg', t.brand, s.bg, mode === 'dark' ? MIN_FILL_DARK : 1, 'fill');
  }
  return checks;
}
