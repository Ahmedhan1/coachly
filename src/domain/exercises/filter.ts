import type { EquipmentId, ExerciseCategory, ExerciseLevel, MuscleGroupId } from './pack';
import type { CatalogExercise } from './types';

export interface ExerciseFilter {
  muscles?: readonly MuscleGroupId[];
  /** 'primary' (default): the muscle must be a primary target. 'any': primary or secondary. */
  muscleRole?: 'primary' | 'any';
  equipment?: readonly EquipmentId[];
  levels?: readonly ExerciseLevel[];
  categories?: readonly ExerciseCategory[];
  /** When given, only exercises in this set pass. */
  favourites?: ReadonlySet<string>;
  customOnly?: boolean;
}

const active = <T>(values: readonly T[] | undefined): values is readonly T[] => values !== undefined && values.length > 0;

/** Values inside one facet are ORed; facets are ANDed. Empty or missing facets do not filter. */
export function filterExercises(exercises: readonly CatalogExercise[], filter: ExerciseFilter): CatalogExercise[] {
  const { muscles, equipment, levels, categories, favourites } = filter;
  const anyRole = filter.muscleRole === 'any';
  return exercises.filter((e) => {
    if (active(muscles)) {
      const hit = muscles.some((m) => e.primaryMuscles.includes(m) || (anyRole && e.secondaryMuscles.includes(m)));
      if (!hit) return false;
    }
    if (active(equipment) && !equipment.includes(e.equipment)) return false;
    if (active(levels) && !levels.includes(e.level)) return false;
    if (active(categories) && !categories.includes(e.category)) return false;
    if (favourites !== undefined && !favourites.has(e.id)) return false;
    if (filter.customOnly === true && !e.isCustom) return false;
    return true;
  });
}
