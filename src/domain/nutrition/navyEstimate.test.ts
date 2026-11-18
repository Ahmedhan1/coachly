import { describe, expect, it } from 'vitest';
import { bodyFatForPlan, navyBodyFat, navyFromMeasures } from '.';

describe('Navy body fat from measurements', () => {
  it('uses the latest neck and waist (and hip for women)', () => {
    const entries = [
      { date: '2026-10-01', measurements: { waistCm: 95, neckCm: 38 } },
      { date: '2026-11-01', measurements: { waistCm: 90 } },
    ];
    const bf = navyFromMeasures(entries, 'male', 178);
    const ref = navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 38, waistCm: 90 });
    expect(ref.ok && bf).toBeCloseTo(ref.ok ? Math.round(ref.value * 10) / 10 : 0, 6);
    expect(navyFromMeasures(entries, 'female', 165)).toBeNull();
    expect(navyFromMeasures([{ date: '2026-11-01', measurements: { waistCm: 80, neckCm: 32, hipCm: 100 } }], 'female', 165)).toBeGreaterThan(10);
    expect(navyFromMeasures([{ date: '2026-11-01', measurements: { waistCm: 90 } }], 'male', 178)).toBeNull();
  });

  it('a given body fat wins; otherwise the estimate, with its source', () => {
    const entries = [{ date: '2026-11-01', measurements: { waistCm: 90, neckCm: 38 } }];
    expect(bodyFatForPlan(18, entries, 'male', 178)).toEqual({ bodyFatPercent: 18, source: 'given' });
    expect(bodyFatForPlan(null, entries, 'male', 178).source).toBe('navy');
    expect(bodyFatForPlan(null, [], 'male', 178)).toEqual({ bodyFatPercent: null, source: null });
  });
});
