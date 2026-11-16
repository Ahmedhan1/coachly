import type { CalcError } from '@/domain/meals';
import type { NavyError, RecipeError } from '@/domain/nutrition';
import { t } from '@/i18n';

/** Friendly Arabic text for every domain error code. */
export function calcErrorText(error: CalcError): string {
  return t(`nutrition.errors.${error}`);
}

export function navyErrorText(error: NavyError): string {
  return t(`nutrition.navyErrors.${error}`);
}

export function recipeErrorText(error: RecipeError): string {
  return t(`nutrition.recipeErrors.${error}`);
}
