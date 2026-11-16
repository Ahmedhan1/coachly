import { useCallback } from 'react';
import { useUiStore } from '@/app/uiStore';
import type { CatalogExercise } from '@/domain/exercises';
import { t } from '@/i18n';
import type { CatalogState } from './useCatalog';

/** Star toggle with an undo toast. */
export function useFavouriteToggle(catalog: Pick<CatalogState, 'store' | 'builtinRef' | 'changes'>) {
  const showToast = useUiStore((s) => s.showToast);
  const { store, builtinRef, changes } = catalog;
  return useCallback(
    (exercise: CatalogExercise) => {
      const ref = exercise.isCustom ? null : builtinRef(exercise.id);
      const was = changes.favourites.has(exercise.id);
      void store.setFavourite(exercise.id, ref, !was).then(() =>
        showToast({
          message: t(was ? 'training.library.favouriteRemoved' : 'training.library.favouriteAdded'),
          actionLabel: t('common.undo'),
          onAction: () => void store.setFavourite(exercise.id, ref, was),
        }),
      );
    },
    [store, builtinRef, changes, showToast],
  );
}
