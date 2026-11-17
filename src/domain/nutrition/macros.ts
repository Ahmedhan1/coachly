import { err, ok, type Result } from './result';
import type { PercentRange } from './energy';

/** kcal per gram. Trainer-editable defaults. */
export interface KcalPerGram {
  protein: number;
  carb: number;
  fat: number;
}

export const DEFAULT_KCAL_PER_GRAM: KcalPerGram = { protein: 4, carb: 4, fat: 9 };

/** Allowed g/kg ranges for the sliders, plus the default slider positions. */
export interface MacroSettings {
  proteinPerKgRange: PercentRange;
  fatPerKgRange: PercentRange;
  kcalPerGram: KcalPerGram;
}

export const DEFAULT_MACRO_SETTINGS: MacroSettings = {
  proteinPerKgRange: { min: 1.6, max: 2.2 },
  fatPerKgRange: { min: 0.6, max: 1 },
  kcalPerGram: DEFAULT_KCAL_PER_GRAM,
};

export const DEFAULT_PROTEIN_G_PER_KG = 2;
export const DEFAULT_FAT_G_PER_KG = 0.8;

export interface MacroInput {
  calories: number;
  weightKg: number;
  proteinPerKg?: number;
  fatPerKg?: number;
}

export interface Macros {
  proteinG: number;
  fatG: number;
  carbG: number;
  proteinKcal: number;
  fatKcal: number;
  carbKcal: number;
  /** True when protein + fat alone exceed the calorie target, so carbs were clamped to 0. */
  carbsClamped: boolean;
  /** kcal by which protein + fat exceed the target (0 when not clamped). */
  excessKcal: number;
}

export type MacroError = 'invalid_calories' | 'invalid_weight' | 'protein_out_of_range' | 'fat_out_of_range';

function within(x: number, r: PercentRange): boolean {
  return Number.isFinite(x) && x >= r.min && x <= r.max;
}

/** Protein and fat from g/kg body weight; carbs fill the remaining calories. */
export function macros(input: MacroInput, s: MacroSettings = DEFAULT_MACRO_SETTINGS): Result<Macros, MacroError> {
  const { calories, weightKg } = input;
  const proteinPerKg = input.proteinPerKg ?? DEFAULT_PROTEIN_G_PER_KG;
  const fatPerKg = input.fatPerKg ?? DEFAULT_FAT_G_PER_KG;
  if (!Number.isFinite(calories) || calories <= 0) return err('invalid_calories');
  if (!Number.isFinite(weightKg) || weightKg <= 0) return err('invalid_weight');
  if (!within(proteinPerKg, s.proteinPerKgRange)) return err('protein_out_of_range');
  if (!within(fatPerKg, s.fatPerKgRange)) return err('fat_out_of_range');

  const proteinG = proteinPerKg * weightKg;
  const fatG = fatPerKg * weightKg;
  const proteinKcal = proteinG * s.kcalPerGram.protein;
  const fatKcal = fatG * s.kcalPerGram.fat;
  const remainder = calories - proteinKcal - fatKcal;
  const carbsClamped = remainder < 0;
  const carbKcal = carbsClamped ? 0 : remainder;
  return ok({
    proteinG,
    fatG,
    carbG: carbKcal / s.kcalPerGram.carb,
    proteinKcal,
    fatKcal,
    carbKcal,
    carbsClamped,
    excessKcal: carbsClamped ? -remainder : 0,
  });
}
