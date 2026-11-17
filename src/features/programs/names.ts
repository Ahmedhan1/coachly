import type { CatalogExercise } from '@/domain/exercises';
import { equipmentName, exName, muscleName } from '@/features/exercises/localized';
import type { BuiltinTemplateId } from '@/domain/programs';
import { t, type TKey } from '@/i18n';

export const templateName = (id: BuiltinTemplateId) => t(`training.programs.templates.${id}` as TKey);

export function templateDayName(key: string): string {
  const k = `training.programs.dayNames.${key}` as TKey;
  const label = t(k);
  return label === k ? key : label;
}

/** Name in the app language (the trainer's rename wins), or the raw id when the exercise is missing from the catalog. */
export const exerciseName = (exercise: CatalogExercise | undefined, id: string) => (exercise ? exName(exercise) : id.replace(/_/g, ' '));

/** "جلوتس · بار" — first primary muscle and the equipment, like the design's sub-line. */
export function exerciseSubline(exercise: CatalogExercise | undefined): string {
  if (!exercise) return '';
  const muscle = exercise.primaryMuscles[0];
  const parts = [muscle ? muscleName(muscle) : null, exercise.equipment !== 'other' ? equipmentName(exercise.equipment) : null];
  return parts.filter(Boolean).join(' · ');
}

/** A program day's label: its name, or "اليوم n" by position. Empty string when the day is gone. */
export function programDayName(days: readonly { id: string; name: string }[], dayId: string | null | undefined): string {
  const index = days.findIndex((d) => d.id === dayId);
  const day = days[index];
  if (!day) return '';
  return day.name || t('training.programs.builder.dayDefault', { n: index + 1 });
}
