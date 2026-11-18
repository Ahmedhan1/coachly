import { describe, expect, it } from 'vitest';
import { defaultDietSettings, macroControlWarnings, macroSpecFrom, macroTargetsFromSpec, type MacroSpec } from '.';

const KPG = { protein: 4, carb: 4, fat: 9 };
const DS = defaultDietSettings();

describe('macro control', () => {
  it('protein g/kg + fat g/kg, carbs take the rest', () => {
    const spec: MacroSpec = { protein: { unit: 'perKg', value: 2 }, fat: { unit: 'perKg', value: 1 }, carb: { unit: 'grams', value: 0 }, rest: 'carb' };
    const t = macroTargetsFromSpec(2400, 80, spec, KPG);
    expect(t.proteinG).toBe(160);
    expect(t.fatG).toBe(80);
    expect(t.carbG).toBe((2400 - 640 - 720) / 4);
    expect(t.kcal).toBe(2400);
  });

  it('fat as % of calories and protein in total grams', () => {
    const spec: MacroSpec = { protein: { unit: 'grams', value: 150 }, fat: { unit: 'percent', value: 25 }, carb: { unit: 'grams', value: 0 }, rest: 'carb' };
    const t = macroTargetsFromSpec(2000, 70, spec, KPG);
    expect(t.proteinG).toBe(150);
    expect(t.fatG).toBeCloseTo(500 / 9, 6);
    expect(t.carbG).toBeCloseTo((2000 - 600 - 500) / 4, 6);
  });

  it('carbs set, fat is the remainder', () => {
    const spec: MacroSpec = { protein: { unit: 'perKg', value: 2 }, fat: { unit: 'perKg', value: 1 }, carb: { unit: 'grams', value: 100 }, rest: 'fat' };
    const t = macroTargetsFromSpec(2000, 75, spec, KPG);
    expect(t.carbG).toBe(100);
    expect(t.fatG).toBeCloseTo((2000 - 600 - 400) / 9, 6);
  });

  it('carbs as g/kg and as % also work', () => {
    const perKg = macroTargetsFromSpec(2000, 75, { protein: { unit: 'perKg', value: 2 }, fat: { unit: 'perKg', value: 1 }, carb: { unit: 'perKg', value: 2 }, rest: 'fat' }, KPG);
    expect(perKg.carbG).toBe(150);
    const pct = macroTargetsFromSpec(2000, 75, { protein: { unit: 'perKg', value: 2 }, fat: { unit: 'perKg', value: 1 }, carb: { unit: 'percent', value: 40 }, rest: 'fat' }, KPG);
    expect(pct.carbG).toBe(200);
  });

  it('never returns a negative remainder; the calories stay and the set macros show the overflow', () => {
    const t = macroTargetsFromSpec(1200, 100, { protein: { unit: 'perKg', value: 2.5 }, fat: { unit: 'perKg', value: 1 }, carb: { unit: 'grams', value: 0 }, rest: 'carb' }, KPG);
    expect(t.carbG).toBe(0);
    expect(t.kcal).toBe(1200);
  });

  it('builds a spec from current targets in the chosen units', () => {
    const spec = macroSpecFrom({ kcal: 2400, proteinG: 160, carbG: 260, fatG: 80 }, 80, { protein: 'perKg', fat: 'percent', carb: 'grams' }, 'carb', KPG);
    expect(spec.protein).toEqual({ unit: 'perKg', value: 2 });
    expect(spec.fat).toEqual({ unit: 'percent', value: 30 });
    expect(spec.carb).toEqual({ unit: 'grams', value: 260 });
  });

  it('friendly warnings: protein too low for a cut, fat under 0.5 g/kg, macros over the calories', () => {
    const w = macroControlWarnings({ kcal: 1800, proteinG: 100, carbG: 250, fatG: 30 }, { goal: 'cut', weightKg: 80, sex: 'male', overflowKcal: 0 }, DS, KPG);
    expect(w).toContain('protein_low_cut');
    expect(w).toContain('fat_low');
    const over = macroControlWarnings({ kcal: 1200, proteinG: 250, carbG: 0, fatG: 100 }, { goal: 'maintain', weightKg: 100, sex: 'male', overflowKcal: 1100 }, DS, KPG);
    expect(over).toContain('over_kcal');
    expect(over).toContain('carb_zero');
  });

  it('warns on very high protein and very high fat share', () => {
    const w = macroControlWarnings({ kcal: 2000, proteinG: 300, carbG: 20, fatG: 110 }, { goal: 'maintain', weightKg: 80, sex: 'male', overflowKcal: 0 }, DS, KPG);
    expect(w).toContain('protein_very_high');
    expect(w).toContain('fat_high');
  });

  it('is quiet for a sane plan', () => {
    const w = macroControlWarnings({ kcal: 2400, proteinG: 160, carbG: 260, fatG: 75 }, { goal: 'cut', weightKg: 80, sex: 'male', overflowKcal: 0 }, DS, KPG);
    expect(w).toEqual([]);
  });
});
