import { describe, expect, it } from 'vitest';
import { brandPalette, contrastRatio, hexToRgb, rgbToHex, textOn } from './color';

describe('color helpers', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(hexToRgb('#2f6f5e'))).toBe('#2f6f5e');
    expect(() => hexToRgb('#fff')).toThrow();
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
  it('picks readable text on a color', () => {
    expect(textOn('#ffffff')).toBe('#0b0b0c');
    expect(textOn('#1a1a1a')).toBe('#ffffff');
  });
  it.each(['#2f6f5e', '#ffee00', '#111111', '#ff0000', '#f5f5f5'])('brand %s stays readable in both modes', (c) => {
    const p = brandPalette(c);
    expect(contrastRatio(p.light, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.dark, '#1c1c1e')).toBeGreaterThanOrEqual(3.5);
    expect(contrastRatio(p.light, p.onLight)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.dark, p.onDark)).toBeGreaterThanOrEqual(3);
  });
});
