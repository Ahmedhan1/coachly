import { describe, expect, it } from 'vitest';
import { bmi, navyBodyFat } from './body';

describe('bmi', () => {
  it('80 kg / 1.80^2 = 80 / 3.24 = 24.691...', () => {
    const r = bmi(80, 180);
    expect(r.ok && r.value).toBeCloseTo(24.691358, 5);
  });

  it('rejects zero weight and zero height', () => {
    expect(bmi(0, 180)).toEqual({ ok: false, error: 'invalid_weight' });
    expect(bmi(80, 0)).toEqual({ ok: false, error: 'invalid_height' });
  });
});

describe('navyBodyFat', () => {
  it('male reference: neck 38, waist 85, height 178', () => {
    // log10(85 - 38) = log10(47) = 1.672098; log10(178) = 2.250420
    // 1.0324 - 0.19077*1.672098 + 0.15456*2.250420 = 1.0324 - 0.318986 + 0.347825 = 1.061239
    // 495 / 1.061239 - 450 = 466.436 - 450 = 16.436
    const r = navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 38, waistCm: 85 });
    expect(r.ok && r.value).toBeCloseTo(16.436, 2);
  });

  it('female reference: neck 32, waist 70, hip 95, height 165', () => {
    // log10(70 + 95 - 32) = log10(133) = 2.123852; log10(165) = 2.217484
    // 1.29579 - 0.35004*2.123852 + 0.221*2.217484 = 1.29579 - 0.743433 + 0.490064 = 1.042421
    // 495 / 1.042421 - 450 = 474.856 - 450 = 24.856
    const r = navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 70, hipCm: 95 });
    expect(r.ok && r.value).toBeCloseTo(24.856, 2);
  });

  it('waist <= neck is an error for men (log of zero/negative)', () => {
    expect(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 40, waistCm: 40 })).toEqual({
      ok: false,
      error: 'waist_not_greater_than_neck',
    });
    expect(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 40, waistCm: 35 })).toEqual({
      ok: false,
      error: 'waist_not_greater_than_neck',
    });
  });

  it('female needs the hip', () => {
    expect(navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 70 })).toEqual({
      ok: false,
      error: 'missing_hip',
    });
    expect(navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 70, hipCm: 0 })).toEqual({
      ok: false,
      error: 'invalid_circumference',
    });
  });

  it('rejects zero inputs', () => {
    expect(navyBodyFat({ sex: 'male', heightCm: 0, neckCm: 38, waistCm: 85 })).toEqual({
      ok: false,
      error: 'invalid_height',
    });
    expect(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 0, waistCm: 85 })).toEqual({
      ok: false,
      error: 'invalid_circumference',
    });
  });

  it('implausible measurements give result_out_of_range instead of a negative percentage', () => {
    // waist barely above neck: log10(1) = 0 -> 495 / (1.0324 + 0.347825) - 450 = -91.4
    expect(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 40, waistCm: 41 })).toEqual({
      ok: false,
      error: 'result_out_of_range',
    });
  });
});
