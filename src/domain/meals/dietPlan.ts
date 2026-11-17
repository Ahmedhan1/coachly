import { applyKcalFloor, dietWarnings, kcalFloor, type DietWarning } from './dietSafety';
import type { DietSettings } from './dietSettings';
import { goalTargets, styleTargets, type DietGoal, type DietStyle, type MacroTargets } from './dietTargets';
import type { SavedCalculation } from './savedCalc';
import type { NutritionSettings } from './settings';

export interface GoalDefaults {
  /** Calories change in percent of the daily burn (0 for maintain and recomp). */
  percent: number;
  proteinPerKg: number;
  fatPerKg: number;
}

const clampTo = (x: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, x));

/** Starting values for the four goals, all from the trainer's calculator settings (ranges, defaults) and diet settings. */
export function goalDefaults(goal: DietGoal, s: NutritionSettings, ds: DietSettings): GoalDefaults {
  const protein = s.defaultProteinPerKg;
  const fat = s.defaultFatPerKg;
  if (goal === 'cut') return { percent: s.defaultGoalPercent.cut, proteinPerKg: clampTo(protein + ds.cutProteinBoostPerKg, s.proteinPerKgRange), fatPerKg: fat };
  if (goal === 'bulk') return { percent: s.defaultGoalPercent.bulk, proteinPerKg: protein, fatPerKg: fat };
  if (goal === 'recomp') return { percent: 0, proteinPerKg: s.proteinPerKgRange.max, fatPerKg: fat };
  return { percent: 0, proteinPerKg: protein, fatPerKg: fat };
}

export interface DietPlanInput {
  saved: Pick<SavedCalculation, 'tdee'> & { input: Pick<SavedCalculation['input'], 'sex' | 'weightKg'> };
  goal: DietGoal;
  style: DietStyle;
  percent: number;
  proteinPerKg: number;
  fatPerKg: number;
}

export interface DietPlanTargets {
  targets: MacroTargets;
  warnings: DietWarning[];
  /** The calories were lifted to the safety floor. */
  floored: boolean;
}

/** Goal → targets from the client's saved daily burn, then the eating style, then the safety floor. */
export function dietPlanTargets(input: DietPlanInput, s: NutritionSettings, ds: DietSettings): DietPlanTargets {
  const { weightKg, sex } = input.saved.input;
  const base = goalTargets({ tdee: input.saved.tdee, weightKg, proteinPerKg: input.proteinPerKg, fatPerKg: input.fatPerKg }, input.goal, input.percent, s.kcalPerGram);
  const styled = styleTargets(base, input.style, weightKg, ds, s.kcalPerGram);
  const { targets, lifted } = applyKcalFloor(styled, kcalFloor(sex, ds), s.kcalPerGram);
  const warnings = dietWarnings(targets, { sex, weightKg, tdee: input.saved.tdee, goal: input.goal }, ds);
  return { targets, warnings, floored: lifted };
}
