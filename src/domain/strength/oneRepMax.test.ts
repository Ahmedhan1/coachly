import { describe, expect, it } from 'vitest';
import { epleyOneRepMax } from './oneRepMax';

describe('epleyOneRepMax', () => {
  it('100 kg × 5 = 100 × (1 + 5/30) = 116.67', () => {
    const r = epleyOneRepMax(100, 5);
    expect(r.ok && r.value).toBeCloseTo(116.6667, 3);
  });

  it('100 kg × 10 = 100 × (1 + 10/30) = 133.33', () => {
    const r = epleyOneRepMax(100, 10);
    expect(r.ok && r.value).toBeCloseTo(133.3333, 3);
  });

  it('a single rep returns the weight itself', () => {
    expect(epleyOneRepMax(140, 1)).toEqual({ ok: true, value: 140 });
  });

  it('custom divisor: 100 × (1 + 5/40) = 112.5', () => {
    expect(epleyOneRepMax(100, 5, 40)).toEqual({ ok: true, value: 112.5 });
  });

  it('bodyweight (0 kg) is allowed; invalid inputs are errors', () => {
    expect(epleyOneRepMax(0, 10)).toEqual({ ok: true, value: 0 });
    expect(epleyOneRepMax(-5, 5)).toEqual({ ok: false, error: 'invalid_weight' });
    expect(epleyOneRepMax(100, 0)).toEqual({ ok: false, error: 'invalid_reps' });
    expect(epleyOneRepMax(100, 2.5)).toEqual({ ok: false, error: 'invalid_reps' });
  });
});
