import { describe, expect, it } from 'vitest';
import { defaultDietSettings, goalRate, suggestKcalChange, weightTrend, type WeighIn } from '..';

const DS = defaultDietSettings();
const NOW = new Date('2026-11-18T10:00:00Z');
const series = (start: number, perWeek: number, days: number[]): WeighIn[] =>
  days.map((ago) => {
    const d = new Date(NOW.getTime() - ago * 86_400_000);
    return { date: d.toISOString().slice(0, 10), weightKg: start - (perWeek * ago) / 7 };
  });

describe('weight trend and calorie suggestions', () => {
  it('needs at least two weigh-ins 10+ days apart inside the window', () => {
    expect(weightTrend([], NOW)).toBeNull();
    expect(weightTrend(series(80, -0.5, [3, 0]), NOW)).toBeNull();
    expect(weightTrend(series(80, -0.5, [60, 50]), NOW)).toBeNull();
  });

  it('fits the weekly change', () => {
    const t = weightTrend(series(80, -0.5, [21, 14, 7, 0]), NOW);
    expect(t?.kgPerWeek).toBeCloseTo(-0.5, 6);
    expect(t?.spanDays).toBe(21);
    expect(t?.points).toBe(4);
  });

  it('goal ranges come from the diet settings', () => {
    expect(goalRate('cut', DS)).toEqual({ min: -1, max: -0.4 });
    expect(goalRate('maintain', DS)).toEqual({ min: -0.25, max: 0.25 });
  });

  it('cut stalled for two weeks → suggests fewer calories (rounded to 50, 100–300)', () => {
    const t = weightTrend(series(80, 0, [14, 7, 0]), NOW);
    expect(t).not.toBeNull();
    const s = t && suggestKcalChange(t, 'cut', DS);
    expect(s?.reason).toBe('stalled');
    expect(s?.weeks).toBe(2);
    expect(s?.deltaKcal).toBeLessThan(0);
    expect(Math.abs(s?.deltaKcal ?? 0) % 50).toBe(0);
    expect(Math.abs(s?.deltaKcal ?? 0)).toBeGreaterThanOrEqual(100);
    expect(Math.abs(s?.deltaKcal ?? 0)).toBeLessThanOrEqual(300);
  });

  it('cut losing too fast → more calories; on target → nothing', () => {
    const fast = weightTrend(series(80, -1.6, [14, 7, 0]), NOW);
    expect(fast && suggestKcalChange(fast, 'cut', DS)?.reason).toBe('tooFast');
    expect((fast && suggestKcalChange(fast, 'cut', DS)?.deltaKcal) ?? 0).toBeGreaterThan(0);
    const good = weightTrend(series(80, -0.5, [14, 7, 0]), NOW);
    expect(good && suggestKcalChange(good, 'cut', DS)).toBeNull();
  });

  it('bulk not gaining → more calories; maintain drifting up → fewer', () => {
    const flat = weightTrend(series(70, 0, [14, 7, 0]), NOW);
    expect((flat && suggestKcalChange(flat, 'bulk', DS)?.deltaKcal) ?? 0).toBeGreaterThan(0);
    const up = weightTrend(series(70, 0.6, [21, 14, 7, 0]), NOW);
    const s = up && suggestKcalChange(up, 'maintain', DS);
    expect(s?.reason).toBe('drifting_up');
    expect(s?.deltaKcal ?? 0).toBeLessThan(0);
  });
});
