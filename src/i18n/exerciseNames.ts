/**
 * Exercise names and labels in the active app language (Arabic by default, English when chosen in
 * Settings). Thin wrappers over the pure helpers in src/domain/exercises/display.ts.
 */
import {
  categoryLabel,
  equipmentLabel,
  exerciseAltName,
  exerciseCues,
  exerciseName,
  levelLabel,
  muscleLabel,
  type CatalogExercise,
  type EquipmentId,
  type ExerciseCategory,
  type ExerciseLevel,
  type MuscleGroupId,
} from '@/domain/exercises';
import { getLocale } from '@/i18n';

type Named = Pick<CatalogExercise, 'nameAr' | 'nameEn' | 'renamed' | 'renamedEn'>;

export const exName = (exercise: Named): string => exerciseName(exercise, getLocale());
export const exAltName = (exercise: Named): string | null => exerciseAltName(exercise, getLocale());
export const exCues = (exercise: Pick<CatalogExercise, 'cues' | 'cuesEn'>): readonly string[] => exerciseCues(exercise, getLocale());
export const muscleName = (id: MuscleGroupId): string => muscleLabel(id, getLocale());
export const equipmentName = (id: EquipmentId): string => equipmentLabel(id, getLocale());
export const levelName = (id: ExerciseLevel): string => levelLabel(id, getLocale());
export const categoryName = (id: ExerciseCategory): string => categoryLabel(id, getLocale());
