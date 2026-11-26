import { useMemo } from 'react';
import { useRepos, useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { ExerciseLibraryStore } from '@/data/exerciseLibraryStore';
import { catalogById, catalogFromPack, mergeCatalog, type CatalogExercise, type ExercisePack } from '@/domain/exercises';

const PACK_FOLDER = `${import.meta.env.BASE_URL}exercise-pack/`;

let builtinPromise: Promise<CatalogExercise[] | null> | null = null;

/** The bundled pack (precached by the service worker, so it loads offline). null when it failed to load. */
export function loadBuiltinCatalog(): Promise<CatalogExercise[] | null> {
  if (!builtinPromise) {
    builtinPromise = fetch(`${PACK_FOLDER}exercises.json`)
      .then(async (res) => (res.ok ? catalogFromPack((await res.json()) as ExercisePack, PACK_FOLDER) : null))
      .catch(() => null)
      .then((catalog) => {
        if (catalog === null) builtinPromise = null; // retry next time
        return catalog;
      });
  }
  return builtinPromise;
}

export interface ExerciseCatalog {
  /** Picker list: trainer overrides applied, hidden exercises left out, custom exercises included. */
  list: readonly CatalogExercise[];
  /** Lookup for program items: includes hidden built-ins so old programs still show names and photos. */
  byId: ReadonlyMap<string, CatalogExercise>;
  favourites: ReadonlySet<string>;
}

/** Exercise catalog for programs and session mode. undefined while loading; `null` if the pack failed. */
export function useExerciseCatalog(): ExerciseCatalog | null | undefined {
  const repos = useRepos();
  const { meta } = useServices();
  const store = useMemo(() => new ExerciseLibraryStore(repos, meta), [repos, meta]);
  const builtin = useLive(() => loadBuiltinCatalog(), []);
  const changes = useLive(() => store.changes(), [store]);
  return useMemo(() => {
    if (builtin === undefined || changes === undefined) return undefined;
    if (builtin === null) return null;
    const list = mergeCatalog(builtin, changes);
    const all = mergeCatalog(builtin, { custom: changes.custom, overrides: changes.overrides.map((o) => ({ ...o, hidden: false })) });
    return { list, byId: catalogById(all), favourites: changes.favourites };
  }, [builtin, changes]);
}
