import type { DietSettings } from './dietSettings';
import type { DietGoal, KcalPerGramLike, MacroTargets } from './dietTargets';

export type DietWarning = 'kcal_floor' | 'protein_low' | 'fat_low' | 'carb_very_low' | 'deficit_deep' | 'surplus_high';

export interface SafetyInput {
  sex: 'male' | 'female';
  weightKg: number;
  tdee: number;
  goal: DietGoal;
}

/** Below this many grams of carbs a day the app mentions it (low-carb style makes this expected, not wrong). */
export const VERY_LOW_CARB_G = 50;

export function kcalFloor(sex: 'male' | 'female', ds: DietSettings): number {
  return sex === 'female' ? ds.minKcalFemale : ds.minKcalMale;
}

/** Lifts calories to the floor (protein and fat stay; carbs take the extra). Reports whether it changed anything. */
export function applyKcalFloor(t: MacroTargets, floor: number, kpg: KcalPerGramLike): { targets: MacroTargets; lifted: boolean } {
  if (t.kcal >= floor) return { targets: t, lifted: false };
  const carbG = Math.max(0, (floor - t.proteinG * kpg.protein - t.fatG * kpg.fat) / kpg.carb);
  return { targets: { ...t, kcal: floor, carbG }, lifted: true };
}

/** What the trainer should look at before using these targets. Empty means nothing unusual. */
export function dietWarnings(t: MacroTargets, input: SafetyInput, ds: DietSettings): DietWarning[] {
  const out: DietWarning[] = [];
  if (t.kcal < kcalFloor(input.sex, ds)) out.push('kcal_floor');
  if (t.proteinG < ds.minProteinPerKg * input.weightKg) out.push('protein_low');
  if (t.fatG < ds.minFatPerKg * input.weightKg) out.push('fat_low');
  if (t.carbG < VERY_LOW_CARB_G) out.push('carb_very_low');
  if (input.tdee > 0) {
    const change = ((t.kcal - input.tdee) / input.tdee) * 100;
    if (input.goal === 'cut' && -change > ds.maxDeficitPercent) out.push('deficit_deep');
    if (input.goal === 'bulk' && change > ds.maxSurplusPercent) out.push('surplus_high');
  }
  return out;
}
