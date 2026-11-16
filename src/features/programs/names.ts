import { EQUIPMENT_LABELS_AR, muscleGroupLabelAr, type CatalogExercise } from '@/domain/exercises';
import type { BuiltinTemplateId } from '@/domain/programs';
import { t, type TKey } from '@/i18n';

export const templateName = (id: BuiltinTemplateId) => t(`training.programs.templates.${id}` as TKey);

export function templateDayName(key: string): string {
  const k = `training.programs.dayNames.${key}` as TKey;
  const label = t(k);
  return label === k ? key : label;
}

/** Arabic name, or the raw id when the exercise is missing from the catalog (deleted custom exercise). */
export const exerciseName = (exercise: CatalogExercise | undefined, id: string) => exercise?.nameAr ?? id.replace(/_/g, ' ');

/** "جلوتس · بار" — first primary muscle and the equipment, like the design's sub-line. */
export function exerciseSubline(exercise: CatalogExercise | undefined): string {
  if (!exercise) return '';
  const muscle = exercise.primaryMuscles[0];
  const parts = [muscle ? muscleGroupLabelAr(muscle) : null, exercise.equipment !== 'other' ? EQUIPMENT_LABELS_AR[exercise.equipment] : null];
  return parts.filter(Boolean).join(' · ');
}
