import type { Per100g } from '@/domain/nutrition';

export type MacroTotals = Per100g;

export const ZERO_TOTALS: MacroTotals = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };

export interface PlanItem {
  recipeId: string | null;
  text: string;
  servings: number;
}

export interface PlanMeal {
  items: readonly PlanItem[];
}

/** Per-serving macros by recipe id. Free-text items and unknown recipes count as zero (and are reported). */
export type PerServingLookup = ReadonlyMap<string, MacroTotals>;

export function addTotals(a: MacroTotals, b: MacroTotals): MacroTotals {
  return { kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbG: a.carbG + b.carbG, fatG: a.fatG + b.fatG };
}

export function itemTotals(item: PlanItem, lookup: PerServingLookup): { totals: MacroTotals; counted: boolean } {
  const per = item.recipeId ? lookup.get(item.recipeId) : undefined;
  if (!per || !(item.servings > 0)) return { totals: ZERO_TOTALS, counted: false };
  const k = item.servings;
  return { totals: { kcal: per.kcal * k, proteinG: per.proteinG * k, carbG: per.carbG * k, fatG: per.fatG * k }, counted: true };
}

export function mealTotals(meal: PlanMeal, lookup: PerServingLookup): { totals: MacroTotals; uncounted: number } {
  let totals = ZERO_TOTALS;
  let uncounted = 0;
  for (const item of meal.items) {
    const r = itemTotals(item, lookup);
    totals = addTotals(totals, r.totals);
    if (!r.counted) uncounted += 1;
  }
  return { totals, uncounted };
}

export function dayTotals(meals: readonly PlanMeal[], lookup: PerServingLookup): { totals: MacroTotals; uncounted: number } {
  return meals.reduce(
    (acc, meal) => {
      const m = mealTotals(meal, lookup);
      return { totals: addTotals(acc.totals, m.totals), uncounted: acc.uncounted + m.uncounted };
    },
    { totals: ZERO_TOTALS, uncounted: 0 },
  );
}

export type TargetStatus = 'under' | 'on' | 'over' | 'no_target';

export interface TargetComparison {
  status: TargetStatus;
  /** actual − target, kcal. */
  diffKcal: number;
  /** actual / target (0 when there is no target). */
  ratio: number;
}

/** Compares a day's calories to the target; within ± tolerancePercent counts as on target. */
export function compareToTarget(actualKcal: number, targetKcal: number | null, tolerancePercent: number): TargetComparison {
  if (targetKcal === null || !(targetKcal > 0)) return { status: 'no_target', diffKcal: 0, ratio: 0 };
  const diffKcal = actualKcal - targetKcal;
  const ratio = actualKcal / targetKcal;
  const band = (Math.max(0, tolerancePercent) / 100) * targetKcal;
  const status: TargetStatus = Math.abs(diffKcal) <= band ? 'on' : diffKcal < 0 ? 'under' : 'over';
  return { status, diffKcal, ratio };
}
