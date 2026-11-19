import type { Per100g } from '@/domain/nutrition';
import type { FoodCategory } from './recipes';

/**
 * One food inside a dish, per serving, as the gram planner sees it: values per 100 g plus what decides how
 * it may be scaled and rounded. Names are data (Arabic, optional English); the domain never picks a locale.
 */
export interface FoodLineSource {
  /** Id of the food-table row the line came from (for allergies, dislikes and favourites). */
  foodId?: string;
  name: string;
  nameEn?: string;
  /** Grams in one serving of the recipe (the starting point the solver scales from). */
  grams: number;
  per100g: Per100g;
  /** Fibre per 100 g when the food table has it. */
  fiberPer100g?: number;
  category?: FoodCategory;
  /** Counted in whole units of this many grams (an egg = 50 g, a baladi loaf = 90 g). */
  unitG?: number;
  /** Halves of a unit are allowed (half a loaf). */
  unitHalf?: boolean;
  /** Household name of the unit (بيضة، رغيف) and its English form. */
  unitLabel?: string;
  unitLabelEn?: string;
}

/** Which macro a food is the dish's lever for. Fixed foods (vegetables, spices, sauces) keep the recipe's grams. */
export type LineRole = 'protein' | 'carb' | 'fat' | 'fixed';

/** Integer values the screen shows for one line; meal and day totals are sums of these, so they never drift. */
export interface ShownMacros {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

const PROTEIN_CATEGORIES: ReadonlySet<FoodCategory> = new Set(['poultry', 'meat', 'fish', 'eggs', 'protein']);
const ONE_GRAM_CATEGORIES: ReadonlySet<FoodCategory> = new Set(['fats', 'nuts', 'protein']);

/** Under this energy density a food is a "volume" food (vegetables, sauces) and is not scaled. */
const LOW_DENSITY_KCAL = 50;
/** Under this many calories per serving a food is a seasoning (cumin, a squeeze of lemon) and is not scaled. */
const SEASONING_KCAL = 15;

/** The macro a food mainly brings, from its category and its calorie split. */
export function lineRole(src: Pick<FoodLineSource, 'per100g' | 'category' | 'grams'>): LineRole {
  const p = src.per100g;
  if (p.kcal < LOW_DENSITY_KCAL || (p.kcal * src.grams) / 100 < SEASONING_KCAL) return 'fixed';
  const energy = p.proteinG * 4 + p.carbG * 4 + p.fatG * 9;
  if (energy <= 0) return 'fixed';
  const ps = (p.proteinG * 4) / energy;
  const cs = (p.carbG * 4) / energy;
  const fs = (p.fatG * 9) / energy;
  if (src.category && PROTEIN_CATEGORIES.has(src.category) && ps >= 0.25) return 'protein';
  if (ps >= 0.4) return 'protein';
  if (fs >= 0.6) return 'fat';
  if (cs >= 0.5) return 'carb';
  if (ps >= 0.3) return 'protein';
  return fs >= cs ? 'fat' : 'carb';
}

export interface Rounding {
  /** Grams step for weighed foods. */
  step: number;
  /** Set for counted foods: grams per unit and the smallest unit fraction. */
  unitG?: number;
  unitStep?: number;
}

/** 1 g for oils, nuts, whey and small amounts; whole (or half) units for eggs and loaves; 5 g for the rest. */
export function roundingFor(src: Pick<FoodLineSource, 'category' | 'grams' | 'unitG' | 'unitHalf'>, role: LineRole): Rounding {
  if (src.unitG !== undefined && src.unitG > 0) return { step: 1, unitG: src.unitG, unitStep: src.unitHalf ? 0.5 : 1 };
  if ((src.category && ONE_GRAM_CATEGORIES.has(src.category)) || role === 'fat' || src.grams < 20) return { step: 1 };
  return { step: 5 };
}

/** Rounds grams to the food's step (never to zero); counted foods also return how many units. */
export function roundGrams(grams: number, r: Rounding): { grams: number; units: number | null } {
  if (r.unitG !== undefined) {
    const unitStep = r.unitStep ?? 1;
    const units = Math.max(unitStep, Math.round(grams / r.unitG / unitStep) * unitStep);
    return { grams: Math.round(units * r.unitG), units };
  }
  return { grams: Math.max(r.step, Math.round(grams / r.step) * r.step), units: null };
}

/** Shown (integer) values for an amount of a food. */
export function shownMacros(per100g: Per100g, grams: number): ShownMacros {
  const k = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * k),
    proteinG: Math.round(per100g.proteinG * k),
    carbG: Math.round(per100g.carbG * k),
    fatG: Math.round(per100g.fatG * k),
  };
}

export const ZERO_SHOWN: ShownMacros = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };

export function addShown(a: ShownMacros, b: ShownMacros): ShownMacros {
  return { kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbG: a.carbG + b.carbG, fatG: a.fatG + b.fatG };
}

const CAP_G: Partial<Record<FoodCategory, number>> = { protein: 60, eggs: 300, fats: 25, nuts: 60, grains: 450 };

/** Sane gram range for a food in one meal: around the recipe's amount, capped per food group. */
export function lineBounds(src: Pick<FoodLineSource, 'grams' | 'category' | 'unitG' | 'unitHalf'>, role: LineRole): { min: number; max: number } {
  const base = src.grams;
  if (role === 'fixed') return { min: base, max: base };
  const cap = (src.category && CAP_G[src.category]) ?? (role === 'protein' ? 350 : role === 'fat' ? 150 : 400);
  let min: number;
  let max: number;
  if (role === 'protein') [min, max] = [Math.max(base * 0.5, 20), base * 2.5];
  else if (role === 'carb') [min, max] = [base * 0.3, base * 3];
  else [min, max] = [base * 0.2, base * 2.5];
  if (src.unitG !== undefined) min = Math.max(min, src.unitG * (src.unitHalf ? 0.5 : 1));
  max = Math.min(max, cap);
  return { min: Math.min(min, base), max: Math.max(max, base) };
}
