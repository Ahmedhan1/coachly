import { describe, expect, it } from 'vitest';
import { bodyFatForPlan, entryNavyEstimate, navyBodyFat, navyFromMeasures } from '.';

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

describe('Navy estimate for one progress entry', () => {
  const male = { sex: 'male' as const, heightCm: 178 };
  it('estimates when neck and waist exist, body fat is empty and the profile has sex and height', () => {
    const r = entryNavyEstimate({ neckCm: 38, waistCm: 90 }, male);
    const ref = navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 38, waistCm: 90 });
    expect(r.status).toBe('estimated');
    expect(r.status === 'estimated' && ref.ok && r.bodyFatPercent).toBe(ref.ok ? Math.round(ref.value * 10) / 10 : -1);
  });

  it('does nothing when body fat is typed or the tape measures are missing', () => {
    expect(entryNavyEstimate({ neckCm: 38, waistCm: 90, bodyFatPercent: 20 }, male)).toEqual({ status: 'none' });
    expect(entryNavyEstimate({ waistCm: 90 }, male)).toEqual({ status: 'none' });
    expect(entryNavyEstimate({ neckCm: 38 }, male)).toEqual({ status: 'none' });
  });

  it('women also need the hip', () => {
    expect(entryNavyEstimate({ neckCm: 32, waistCm: 80 }, { sex: 'female', heightCm: 165 })).toEqual({ status: 'needs', missing: ['hip'] });
    expect(entryNavyEstimate({ neckCm: 32, waistCm: 80, hipCm: 100 }, { sex: 'female', heightCm: 165 }).status).toBe('estimated');
  });

  it('says what the client profile lacks', () => {
    expect(entryNavyEstimate({ neckCm: 38, waistCm: 90 }, { sex: null, heightCm: undefined })).toEqual({ status: 'needs', missing: ['gender', 'height'] });
    expect(entryNavyEstimate({ neckCm: 38, waistCm: 90 }, { sex: 'male', heightCm: undefined })).toEqual({ status: 'needs', missing: ['height'] });
  });

  it('reports a formula rejection', () => {
    expect(entryNavyEstimate({ neckCm: 40, waistCm: 38 }, male)).toEqual({ status: 'invalid', error: 'waist_not_greater_than_neck' });
  });
});
