import { describe, expect, it } from 'vitest';
import {
  auditBrand,
  BRAND_PRESETS,
  contrastRatio,
  DEFAULT_BRAND,
  deriveBrand,
  APP_SURFACES,
  mixHex,
  normalizeHex,
  ON_DARK,
  ON_LIGHT,
} from './brand';

describe('normalizeHex', () => {
  it.each([
    ['#F25C1F', '#F25C1F'],
    ['f25c1f', '#F25C1F'],
    ['  #f25c1f ', '#F25C1F'],
    ['#abc', '#AABBCC'],
    ['abc', '#AABBCC'],
  ])('%s -> %s', (input, out) => expect(normalizeHex(input)).toBe(out));

  it.each(['', '#12', '#12345', '#GGGGGG', 'red', '#1234567'])('rejects %s', (input) => {
    expect(normalizeHex(input)).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // order does not matter
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#777777'), 10);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});

describe('mixHex', () => {
  it('interpolates in sRGB', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});

describe('deriveBrand', () => {
  it('keeps the default signal orange and puts dark text on it (docs/DESIGN.md §2)', () => {
    const theme = deriveBrand(DEFAULT_BRAND);
    expect(theme.light.brand).toBe('#F25C1F');
    expect(theme.light.brandOn).toBe(ON_DARK);
    expect(theme.dark.brand).toBe('#F25C1F');
    expect(theme.dark.brandOn).toBe(ON_DARK);
    // tint-strong matches the fallbacks in src/ui/tokens.css (derived over the Pebble surfaces)
    expect(theme.light.brandTintStrong).toBe('#F3D3C4');
    expect(theme.dark.brandTintStrong).toBe('#512715');
  });

  it('flips the on-brand text to white for crimson', () => {
    const theme = deriveBrand('#C81E3A');
    expect(theme.light.brandOn).toBe(ON_LIGHT);
    expect(theme.dark.brandOn).toBe(ON_LIGHT);
    expect(theme.light.brandTintStrong).toBe('#EAC7C9');
    expect(theme.dark.brandTint).toBe('#301418');
  });

  it('accepts lower-case and short hex', () => {
    expect(deriveBrand('#c81e3a')).toEqual(deriveBrand('#C81E3A'));
    expect(deriveBrand('#fff').light.brand).toBe('#FFFFFF');
  });

  it('throws on an invalid color', () => {
    expect(() => deriveBrand('orange')).toThrow();
  });

  it('lifts a fill that disappears into the dark background', () => {
    const theme = deriveBrand('#101820');
    expect(contrastRatio(theme.dark.brand, APP_SURFACES.dark.bg)).toBeGreaterThanOrEqual(3);
    expect(theme.light.brand).toBe('#101820');
  });

  it('brand-ink stays readable on the background and on the brand tint (chips)', () => {
    const theme = deriveBrand(DEFAULT_BRAND);
    expect(contrastRatio(theme.light.brandInk, APP_SURFACES.light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.light.brandInk, theme.light.brandTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.dark.brandInk, APP_SURFACES.dark.bg)).toBeGreaterThanOrEqual(5.5);
    expect(contrastRatio(theme.dark.brandInk, theme.dark.brandTint)).toBeGreaterThanOrEqual(4.5);
  });

  // The guarantee the identity-setup preview relies on: any color the trainer types passes the audit.
  const samples = [
    ...BRAND_PRESETS.map((p) => p.hex),
    '#000000', '#FFFFFF', '#777777', '#808080', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF',
    '#FFD600', '#7F7F7F', '#3A86FF', '#8338EC', '#2F6F5E', '#E9C46A', '#264653', '#F4A261', '#1A1A1A', '#EEEEEE',
  ];
  it.each(samples)('every text pair passes for %s', (hex) => {
    const audit = auditBrand(deriveBrand(hex));
    const failing = audit.filter((c) => c.kind === 'text' && !c.ok);
    expect(failing).toEqual([]);
  });

  it('is deterministic and pure', () => {
    expect(deriveBrand('#3A86FF')).toEqual(deriveBrand('#3A86FF'));
  });
});

describe('auditBrand', () => {
  it('reports each pair with its ratio and minimum', () => {
    const audit = auditBrand(deriveBrand(DEFAULT_BRAND));
    const onBrand = audit.find((c) => c.mode === 'light' && c.pair === 'brand-on/brand');
    expect(onBrand?.min).toBe(4.5);
    expect(onBrand?.ratio).toBeGreaterThan(4.5);
    expect(audit.every((c) => c.ratio >= 1)).toBe(true);
  });

  it('flags a broken hand-made theme', () => {
    const theme = deriveBrand(DEFAULT_BRAND);
    const broken = { ...theme, light: { ...theme.light, brandOn: '#F25C1F' } };
    expect(auditBrand(broken).some((c) => c.pair === 'brand-on/brand' && !c.ok)).toBe(true);
  });
});

describe('BRAND_PRESETS', () => {
  it('starts with the default and has unique, valid colors', () => {
    expect(BRAND_PRESETS[0]?.hex).toBe(DEFAULT_BRAND);
    const hexes = BRAND_PRESETS.map((p) => p.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const hex of hexes) expect(normalizeHex(hex)).toBe(hex);
  });
});
