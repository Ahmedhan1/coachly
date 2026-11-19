import type { DietSchedule } from './dietSlots';
import type { DietGoal, DietStyle } from './dietTargets';

/**
 * Keys of the short nutritionist notes shown with a plan (texts live in i18n under nutrition.diet.notes).
 * Practical habits only: water, protein spread, refeeds and diet breaks, progressive surplus — never a
 * supplement amount.
 */
export function dietNoteKeys(goal: DietGoal, style: DietStyle, schedule: DietSchedule): string[] {
  const keys: string[] = ['water'];
  if (goal === 'cut') keys.push('cutPace', 'cutProtein', 'cutRefeed', 'cutDietBreak');
  else if (goal === 'bulk') keys.push('bulkSurplus', 'bulkProgress', 'bulkMeals');
  else if (goal === 'recomp') keys.push('recompProtein', 'recompTraining');
  else keys.push('maintainHabits');
  if (style === 'low_carb') keys.push('lowCarb');
  if (style === 'high_protein') keys.push('highProtein');
  if (schedule === 'if_16_8') keys.push('if');
  if (schedule === 'ramadan') keys.push('ramadan');
  return keys;
}
