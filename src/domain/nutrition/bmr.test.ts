import { describe, expect, it } from 'vitest';
import { bmr, katchMcArdle, leanBodyMassKg, mifflinStJeor } from './bmr';

describe('mifflinStJeor', () => {
  it('male reference: 80 kg, 180 cm, 30 y', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 })).toEqual({ ok: true, value: 1780 });
  });

  it('female reference: 60 kg, 165 cm, 25 y', () => {
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
    expect(mifflinStJeor({ sex: 'female', weightKg: 60, heightCm: 165, ageYears: 25 })).toEqual({ ok: true, value: 1345.25 });
  });

  it('uses trainer-supplied coefficients', () => {
    // 11*80 + 6*180 - 4*30 + 0 = 880 + 1080 - 120 = 1840
    const r = mifflinStJeor(
      { sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 },
      { perKg: 11, perCm: 6, perYear: 4, maleConstant: 0, femaleConstant: 0 },
    );
    expect(r).toEqual({ ok: true, value: 1840 });
  });

  it.each([
    [{ weightKg: 0, heightCm: 180, ageYears: 30 }, 'invalid_weight'],
    [{ weightKg: Number.NaN, heightCm: 180, ageYears: 30 }, 'invalid_weight'],
    [{ weightKg: -70, heightCm: 180, ageYears: 30 }, 'invalid_weight'],
    [{ weightKg: 80, heightCm: 0, ageYears: 30 }, 'invalid_height'],
    [{ weightKg: 80, heightCm: 180, ageYears: 5 }, 'invalid_age'],
    [{ weightKg: 80, heightCm: 180, ageYears: 0 }, 'invalid_age'],
    [{ weightKg: 80, heightCm: 180, ageYears: Number.POSITIVE_INFINITY }, 'invalid_age'],
  ])('rejects %o with %s', (input, error) => {
    expect(mifflinStJeor({ sex: 'male', ...input })).toEqual({ ok: false, error });
  });
});

describe('leanBodyMassKg / katchMcArdle', () => {
  it('LBM = W * (1 - BF%)', () => {
    // 80 * (1 - 0.20) = 64
    expect(leanBodyMassKg(80, 20)).toEqual({ ok: true, value: 64 });
  });

  it('Katch-McArdle reference: 80 kg at 20 %', () => {
    // 370 + 21.6 * 64 = 370 + 1382.4 = 1752.4
    const r = katchMcArdle({ weightKg: 80, bodyFatPercent: 20 });
    expect(r.ok && r.value).toBeCloseTo(1752.4, 10);
  });

  it('missing or invalid body fat is an error, not NaN', () => {
    expect(katchMcArdle({ weightKg: 80, bodyFatPercent: null })).toEqual({ ok: false, error: 'missing_body_fat' });
    expect(katchMcArdle({ weightKg: 80, bodyFatPercent: undefined })).toEqual({ ok: false, error: 'missing_body_fat' });
    expect(katchMcArdle({ weightKg: 80, bodyFatPercent: 0 })).toEqual({ ok: false, error: 'invalid_body_fat' });
    expect(katchMcArdle({ weightKg: 80, bodyFatPercent: 90 })).toEqual({ ok: false, error: 'invalid_body_fat' });
    expect(katchMcArdle({ weightKg: 0, bodyFatPercent: 20 })).toEqual({ ok: false, error: 'invalid_weight' });
  });
});

describe('bmr (formula selector)', () => {
  const person = { sex: 'male' as const, weightKg: 80, heightCm: 180, ageYears: 30, bodyFatPercent: 20 };

  it('defaults to Mifflin-St Jeor', () => {
    expect(bmr(person)).toEqual({ ok: true, value: 1780 });
  });

  it('uses Katch-McArdle when selected', () => {
    const r = bmr({ ...person, formula: 'katch-mcardle' });
    expect(r.ok && r.value).toBeCloseTo(1752.4, 10);
  });

  it('Katch-McArdle without body fat reports missing_body_fat', () => {
    expect(bmr({ ...person, bodyFatPercent: undefined, formula: 'katch-mcardle' })).toEqual({
      ok: false,
      error: 'missing_body_fat',
    });
  });
});
