import { filterExercises, searchExercises, type CatalogExercise } from '@/domain/exercises';
import type { LibraryFilters } from './libraryUi';

/** Library list = (visible or hidden-only) → filters → search. Composition of src/domain/exercises only. */
export function libraryResults(
  all: readonly CatalogExercise[],
  hidden: ReadonlySet<string>,
  favourites: ReadonlySet<string>,
  filters: LibraryFilters,
  query: string,
): CatalogExercise[] {
  const base = filters.showHidden ? all.filter((e) => hidden.has(e.id)) : all.filter((e) => !hidden.has(e.id));
  const filtered = filterExercises(base, {
    muscles: filters.muscles,
    equipment: filters.equipment,
    levels: filters.levels,
    favourites: filters.favouritesOnly ? favourites : undefined,
    customOnly: filters.customOnly,
  });
  return searchExercises(filtered, query);
}
