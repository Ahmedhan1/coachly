/**
 * Language-aware names and labels for exercises. Pure: the caller passes the language in (the domain never
 * reads the app locale). Arabic is the default; a trainer's own name always wins in both languages.
 */
import {
  CATEGORY_LABELS_AR,
  CATEGORY_LABELS_EN,
  EQUIPMENT_LABELS_AR,
  EQUIPMENT_LABELS_EN,
  LEVEL_LABELS_AR,
  LEVEL_LABELS_EN,
  muscleGroup,
} from './labels';
import type { EquipmentId, ExerciseCategory, ExerciseLevel, MuscleGroupId } from './pack';
import type { CatalogExercise } from './types';

/** Same values as the app's Locale type (src/i18n/locale.ts). */
export type ExerciseLocale = 'ar' | 'en';

type Named = Pick<CatalogExercise, 'nameAr' | 'nameEn' | 'renamed' | 'renamedEn'>;

/**
 * The name to show. English: the trainer's English name, else their Arabic rename, else the pack's English
 * name. Arabic: always the Arabic name (the trainer's rename when there is one).
 */
export function exerciseName(exercise: Named, locale: ExerciseLocale): string {
  const en = exercise.nameEn.trim();
  if (locale === 'en' && en !== '' && (exercise.renamedEn === true || exercise.renamed !== true)) return exercise.nameEn;
  return exercise.nameAr;
}

/** The name in the other language (a small second line), or null when there is none or it is the same. */
export function exerciseAltName(exercise: Named, locale: ExerciseLocale): string | null {
  const main = exerciseName(exercise, locale);
  const other = exerciseName(exercise, locale === 'en' ? 'ar' : 'en');
  return other !== main ? other : null;
}

export function exerciseCues(exercise: Pick<CatalogExercise, 'cues' | 'cuesEn'>, locale: ExerciseLocale): readonly string[] {
  if (locale === 'en' && exercise.cuesEn !== undefined && exercise.cuesEn.length > 0) return exercise.cuesEn;
  return exercise.cues ?? [];
}

export const muscleLabel = (id: MuscleGroupId, locale: ExerciseLocale): string =>
  locale === 'en' ? muscleGroup(id).labelEn : muscleGroup(id).labelAr;

export const equipmentLabel = (id: EquipmentId, locale: ExerciseLocale): string =>
  (locale === 'en' ? EQUIPMENT_LABELS_EN : EQUIPMENT_LABELS_AR)[id];

export const levelLabel = (id: ExerciseLevel, locale: ExerciseLocale): string =>
  (locale === 'en' ? LEVEL_LABELS_EN : LEVEL_LABELS_AR)[id];

export const categoryLabel = (id: ExerciseCategory, locale: ExerciseLocale): string =>
  (locale === 'en' ? CATEGORY_LABELS_EN : CATEGORY_LABELS_AR)[id];
