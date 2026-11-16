import { useCallback, useEffect, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { ExerciseLibraryStore, type BuiltinRef, type LibraryChanges } from '@/data/exerciseLibraryStore';
import {
  catalogById,
  catalogFromPack,
  mergeCatalog,
  type CatalogExercise,
  type ExercisePack,
} from '@/domain/exercises';
import { exercisePackService, PACK_FOLDER } from '@/services/exercisePack';

export interface CatalogState {
  status: 'loading' | 'error' | 'ready';
  /** Every exercise incl. hidden ones (check `changes.hidden`), trainer edits applied. */
  all: readonly CatalogExercise[];
  /** What the library shows by default: `all` without hidden ones. */
  visible: readonly CatalogExercise[];
  byId: ReadonlyMap<string, CatalogExercise>;
  changes: LibraryChanges;
  pack: ExercisePack | null;
  store: ExerciseLibraryStore;
  /** Built-in reference for override rows; null for custom exercises. */
  builtinRef(id: string): BuiltinRef | null;
  retry(): void;
}

const EMPTY_CHANGES: LibraryChanges = { custom: [], overrides: [], favourites: new Set(), hidden: new Set() };

let builtinCache: { pack: ExercisePack; catalog: CatalogExercise[]; byId: ReadonlyMap<string, CatalogExercise> } | null = null;
function builtinOf(pack: ExercisePack) {
  if (builtinCache?.pack !== pack) {
    const catalog = catalogFromPack(pack, PACK_FOLDER);
    builtinCache = { pack, catalog, byId: catalogById(catalog) };
  }
  return builtinCache;
}

function usePack(): { pack: ExercisePack | null; failed: boolean; retry: () => void } {
  const [state, setState] = useState<{ pack: ExercisePack | null; failed: boolean }>({ pack: null, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    exercisePackService.loadPack().then(
      (pack) => alive && setState({ pack, failed: false }),
      () => alive && setState({ pack: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ pack: null, failed: false });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}

export function useLibraryStore(): ExerciseLibraryStore {
  const { data, meta } = useServices();
  return useMemo(() => new ExerciseLibraryStore(data.repos, meta), [data, meta]);
}

/** The merged exercise catalog: bundled pack + the trainer's custom exercises and edits (live). */
export function useCatalog(): CatalogState {
  const store = useLibraryStore();
  const { pack, failed, retry } = usePack();
  const changes = useLive(() => store.changes(), [store]);

  return useMemo(() => {
    const c = changes ?? EMPTY_CHANGES;
    const builtin = pack ? builtinOf(pack) : null;
    const overrides = c.overrides.map((o) => ({ ...o, hidden: false }));
    const all = builtin && changes ? mergeCatalog(builtin.catalog, { custom: c.custom, overrides }) : [];
    const visible = c.hidden.size === 0 ? all : all.filter((e) => !c.hidden.has(e.id));
    const builtinRef = (id: string): BuiltinRef | null => {
      const e = builtin?.byId.get(id);
      if (!e) return null;
      return {
        id: e.id,
        defaultNameAr: e.nameAr,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles,
        equipment: e.equipment,
        level: e.level,
      };
    };
    return {
      status: failed ? 'error' : builtin && changes ? 'ready' : 'loading',
      all,
      visible,
      byId: catalogById(all),
      changes: c,
      pack,
      store,
      builtinRef,
      retry,
    };
  }, [changes, pack, failed, retry, store]);
}
