import { describe, expect, it } from 'vitest';
import { fieldText, parseDecimal } from './numbers';

describe('parseDecimal', () => {
  it('accepts Western and Arabic-Indic digits and both decimal marks', () => {
    expect(parseDecimal('72.5')).toBe(72.5);
    expect(parseDecimal('٧٢٫٥')).toBe(72.5);
    expect(parseDecimal('72,5')).toBe(72.5);
    expect(parseDecimal(' 80 ')).toBe(80);
  });
  it('rejects empty and junk', () => {
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('1.2.3')).toBeNaN();
  });
  it('formats numbers for fields', () => {
    expect(fieldText(72.456)).toBe('72.46');
    expect(fieldText(undefined)).toBe('');
  });
});
