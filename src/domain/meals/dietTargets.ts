import type { DietSettings } from './dietSettings';

export type DietGoal = 'cut' | 'maintain' | 'bulk' | 'recomp';
export type DietStyle = 'balanced' | 'low_carb' | 'high_protein';

export interface KcalPerGramLike {
  protein: number;
  carb: number;
  fat: number;
}

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

export interface GoalTargetInput {
  tdee: number;
  weightKg: number;
  proteinPerKg: number;
  fatPerKg: number;
}

/**
 * Calories from the goal (a cut subtracts `percent` of the daily burn, a bulk adds it; maintain and recomp
 * stay at the burn), protein and fat from g/kg of body weight, carbs fill the rest and never go negative.
 */
export function goalTargets(input: GoalTargetInput, goal: DietGoal, percent: number, kpg: KcalPerGramLike): MacroTargets {
  const p = Math.max(0, percent);
  const factor = goal === 'cut' ? 100 - p : goal === 'bulk' ? 100 + p : 100;
  const kcal = Math.round((input.tdee * factor) / 100);
  const proteinG = input.proteinPerKg * input.weightKg;
  const fatG = input.fatPerKg * input.weightKg;
  const carbG = Math.max(0, (kcal - proteinG * kpg.protein - fatG * kpg.fat) / kpg.carb);
  return { kcal, proteinG, fatG, carbG };
}

/** Rebuilds carbs from what is left after protein and fat; when nothing is left, fat gives way (calories stay). */
function fillCarbs(kcal: number, proteinG: number, fatG: number, kpg: KcalPerGramLike): MacroTargets {
  const left = kcal - proteinG * kpg.protein - fatG * kpg.fat;
  if (left >= 0) return { kcal, proteinG, fatG, carbG: left / kpg.carb };
  const fatLeft = Math.max(0, (kcal - proteinG * kpg.protein) / kpg.fat);
  return { kcal, proteinG, fatG: fatLeft, carbG: Math.max(0, (kcal - proteinG * kpg.protein - fatLeft * kpg.fat) / kpg.carb) };
}

/**
 * Re-splits the same calories for the chosen eating style. Balanced keeps the goal's split; high protein
 * lifts protein (to the setting, never lower than before) and lets carbs give way; low carb caps carbs at a
 * share of the calories and lets fat fill the rest.
 */
export function styleTargets(base: MacroTargets, style: DietStyle, weightKg: number, ds: DietSettings, kpg: KcalPerGramLike): MacroTargets {
  if (style === 'balanced') return { ...base };
  if (style === 'high_protein') {
    const proteinG = Math.max(base.proteinG, weightKg * ds.highProteinPerKg);
    return fillCarbs(base.kcal, proteinG, base.fatG, kpg);
  }
  const capped = Math.min(base.carbG, (base.kcal * ds.lowCarbPercent) / 100 / kpg.carb);
  const fatKcal = base.kcal - base.proteinG * kpg.protein - capped * kpg.carb;
  if (fatKcal >= 0) return { kcal: base.kcal, proteinG: base.proteinG, carbG: capped, fatG: fatKcal / kpg.fat };
  const proteinG = Math.max(0, (base.kcal - capped * kpg.carb) / kpg.protein);
  return { kcal: base.kcal, proteinG, carbG: capped, fatG: 0 };
}
