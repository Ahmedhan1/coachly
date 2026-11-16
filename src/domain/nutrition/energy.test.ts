import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVITY_FACTORS, goalCalories, tdee } from './energy';

describe('tdee', () => {
  it.each([
    ['sedentary', 2136], // 1780 * 1.2   = 2136
    ['light', 2447.5], // 1780 * 1.375 = 2447.5
    ['moderate', 2759], // 1780 * 1.55  = 2759
    ['high', 3070.5], // 1780 * 1.725 = 3070.5
    ['veryHigh', 3382], // 1780 * 1.9   = 3382
  ] as const)('BMR 1780 × %s = %d', (level, expected) => {
    const r = tdee(1780, level);
    expect(r.ok && r.value).toBeCloseTo(expected, 9);
  });

  it('exposes the five default factors', () => {
    expect(Object.values(DEFAULT_ACTIVITY_FACTORS)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
  });

  it('accepts trainer factors and rejects bad input', () => {
    const custom = { ...DEFAULT_ACTIVITY_FACTORS, moderate: 1.5 };
    expect(tdee(2000, 'moderate', custom)).toEqual({ ok: true, value: 3000 });
    expect(tdee(0, 'moderate')).toEqual({ ok: false, error: 'invalid_bmr' });
    expect(tdee(Number.NaN, 'moderate')).toEqual({ ok: false, error: 'invalid_bmr' });
    expect(tdee(2000, 'moderate', { ...custom, moderate: 0 })).toEqual({ ok: false, error: 'invalid_activity_factor' });
  });
});

describe('goalCalories', () => {
  it('cut 20 %: 2759 * 0.80 = 2207.2', () => {
    const r = goalCalories(2759, 'cut', 20);
    expect(r.ok && r.value).toBeCloseTo(2207.2, 9);
  });

  it('bulk 10 %: 2759 * 1.10 = 3034.9', () => {
    const r = goalCalories(2759, 'bulk', 10);
    expect(r.ok && r.value).toBeCloseTo(3034.9, 9);
  });

  it('maintain returns TDEE and ignores the slider', () => {
    expect(goalCalories(2759, 'maintain', 99)).toEqual({ ok: true, value: 2759 });
  });

  it('slider bounds are inclusive and enforced', () => {
    expect(goalCalories(2000, 'cut', 15)).toEqual({ ok: true, value: 1700 }); // 2000 * 0.85
    expect(goalCalories(2000, 'cut', 25)).toEqual({ ok: true, value: 1500 }); // 2000 * 0.75
    expect(goalCalories(2000, 'cut', 26)).toEqual({ ok: false, error: 'goal_percent_out_of_range' });
    expect(goalCalories(2000, 'bulk', 4)).toEqual({ ok: false, error: 'goal_percent_out_of_range' });
    expect(goalCalories(2000, 'bulk', Number.NaN)).toEqual({ ok: false, error: 'goal_percent_out_of_range' });
    expect(goalCalories(0, 'maintain', 0)).toEqual({ ok: false, error: 'invalid_tdee' });
  });

  it('honours trainer ranges', () => {
    expect(goalCalories(2000, 'cut', 30, { cut: { min: 10, max: 30 }, bulk: { min: 5, max: 15 } })).toEqual({
      ok: true,
      value: 1400, // 2000 * 0.70
    });
  });
});
