import { describe, expect, it } from 'vitest';
import { macros } from './macros';

describe('macros', () => {
  it('reference: 2200 kcal, 80 kg, protein 2 g/kg, fat 0.8 g/kg', () => {
    // protein 2*80 = 160 g -> 640 kcal; fat 0.8*80 = 64 g -> 576 kcal
    // carbs (2200 - 640 - 576) = 984 kcal -> 246 g
    const r = macros({ calories: 2200, weightKg: 80, proteinPerKg: 2, fatPerKg: 0.8 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.proteinG).toBeCloseTo(160, 9);
    expect(r.value.proteinKcal).toBeCloseTo(640, 9);
    expect(r.value.fatG).toBeCloseTo(64, 9);
    expect(r.value.fatKcal).toBeCloseTo(576, 9);
    expect(r.value.carbKcal).toBeCloseTo(984, 9);
    expect(r.value.carbG).toBeCloseTo(246, 9);
    expect(r.value.carbsClamped).toBe(false);
    expect(r.value.excessKcal).toBe(0);
  });

  it('uses default slider positions (2.0 and 0.8 g/kg)', () => {
    const r = macros({ calories: 2200, weightKg: 80 });
    expect(r.ok && r.value.carbG).toBeCloseTo(246, 9);
  });

  it('clamps carbs to 0 and reports the excess when protein + fat exceed the target', () => {
    // 120 kg, 2.2 g/kg protein = 264 g -> 1056 kcal; 1 g/kg fat = 120 g -> 1080 kcal; total 2136
    // target 1800 -> remainder 1800 - 2136 = -336
    const r = macros({ calories: 1800, weightKg: 120, proteinPerKg: 2.2, fatPerKg: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.carbG).toBe(0);
    expect(r.value.carbKcal).toBe(0);
    expect(r.value.carbsClamped).toBe(true);
    expect(r.value.excessKcal).toBeCloseTo(336, 9);
  });

  it('remainder exactly 0 is not clamped', () => {
    // 50 kg * 2 g = 100 g -> 400 kcal; 50 * 0.8 = 40 g -> 360 kcal; target 760
    const r = macros({ calories: 760, weightKg: 50, proteinPerKg: 2, fatPerKg: 0.8 });
    expect(r.ok && r.value.carbsClamped).toBe(false);
    expect(r.ok && r.value.carbG).toBeCloseTo(0, 9);
  });

  it.each([
    [{ calories: 0, weightKg: 80 }, 'invalid_calories'],
    [{ calories: Number.NaN, weightKg: 80 }, 'invalid_calories'],
    [{ calories: 2000, weightKg: 0 }, 'invalid_weight'],
    [{ calories: 2000, weightKg: 80, proteinPerKg: 1.5 }, 'protein_out_of_range'],
    [{ calories: 2000, weightKg: 80, proteinPerKg: 2.3 }, 'protein_out_of_range'],
    [{ calories: 2000, weightKg: 80, fatPerKg: 0.5 }, 'fat_out_of_range'],
    [{ calories: 2000, weightKg: 80, fatPerKg: 1.1 }, 'fat_out_of_range'],
  ])('rejects %o', (input, error) => {
    expect(macros(input)).toEqual({ ok: false, error });
  });

  it('honours trainer kcal-per-gram and ranges', () => {
    // protein 3*10 = 30 g * 5 = 150 kcal; fat 1*10 = 10 g * 10 = 100 kcal; carbs (500-250)/5 = 50 g
    const r = macros(
      { calories: 500, weightKg: 10, proteinPerKg: 3, fatPerKg: 1 },
      {
        proteinPerKgRange: { min: 1, max: 3 },
        fatPerKgRange: { min: 0.5, max: 1 },
        kcalPerGram: { protein: 5, carb: 5, fat: 10 },
      },
    );
    expect(r.ok && r.value.carbG).toBeCloseTo(50, 9);
  });
});
