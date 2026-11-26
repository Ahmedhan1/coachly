import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isMuscleGroupId, type CatalogExercise } from '@/domain/exercises';
import { t } from '@/i18n';
import { Button, Chip, EmptyState, Icon, IconButton, PageHeader, SearchField, Tx, cx } from '@/ui';
import { AddExerciseSheet } from './AddExerciseSheet';
import { ExerciseRow, ROW_HEIGHT } from './ExerciseRow';
import { FilterSheet } from './FilterSheet';
import { activeFilterCount, NO_FILTERS, toggleIn, useLibraryUi, type LibraryFilters } from './libraryUi';
import { equipmentName, levelName, muscleName } from '@/i18n/exerciseNames';
import { OfflinePhotosSheet } from './OfflinePhotosSheet';
import { libraryResults } from './results';
import { useCatalog } from './useCatalog';
import { useFavouriteToggle } from './useFavouriteToggle';
import { WindowList } from './WindowList';
import styles from './Exercises.module.css';

/** التمارين tab: search, filters, windowed list of the whole library. */
export function ExercisesScreen() {
  const catalog = useCatalog();
  const ui = useLibraryUi();
  const { filters, setFilters, setSheet } = ui;
  const [params, setParams] = useSearchParams();
  const query = useDeferredValue(ui.query);

  // Deep link from the muscle map: /exercises?muscle=glutes → that muscle only.
  const muscleParam = params.get('muscle');
  useEffect(() => {
    if (muscleParam === null) return;
    if (isMuscleGroupId(muscleParam)) {
      useLibraryUi.getState().setFilters({ ...NO_FILTERS, muscles: [muscleParam] });
      useLibraryUi.getState().setQuery('');
    }
    setParams({}, { replace: true });
  }, [muscleParam, setParams]);

  const { all, changes } = catalog;
  const results = useMemo(
    () => libraryResults(all, changes.hidden, changes.favourites, filters, query),
    [all, changes, filters, query],
  );
  const countFor = useCallback(
    (f: LibraryFilters) => libraryResults(all, changes.hidden, changes.favourites, f, query).length,
    [all, changes, query],
  );
  const toggleFavourite = useFavouriteToggle(catalog);
  const renderRow = useCallback(
    (e: CatalogExercise) => (
      <ExerciseRow
        exercise={e}
        favourite={changes.favourites.has(e.id)}
        hidden={changes.hidden.has(e.id)}
        onToggleFavourite={toggleFavourite}
      />
    ),
    [changes, toggleFavourite],
  );

  // Restore the scroll position when coming back from a detail screen; remember it on the way out.
  const ready = catalog.status === 'ready';
  useLayoutEffect(() => {
    if (!ready) return;
    const y = useLibraryUi.getState().scrollY;
    if (y > 0) window.scrollTo(0, y);
    return () => useLibraryUi.getState().setScrollY(window.scrollY);
  }, [ready]);

  const filterCount = activeFilterCount(filters);
  const total = catalog.visible.length;

  return (
    <>
      <PageHeader
        title={t('training.library.title')}
        subtitle={
          ready ? (
            filterCount > 0 || query ? (
              <Tx k="training.library.countFiltered" params={{ n: results.length, total }} />
            ) : (
              <Tx k="training.library.count" params={{ n: total }} />
            )
          ) : undefined
        }
        actions={
          <>
            {catalog.pack && (
              <button
                type="button"
                className={styles.round}
                aria-label={t('training.library.offline.title')}
                title={t('training.library.offline.title')}
                onClick={() => setSheet('offline', true)}
              >
                <Icon name="download" />
              </button>
            )}
            <IconButton icon="plus" label={t('training.library.addCustom')} onClick={() => setSheet('add', true)} />
          </>
        }
      />
      <div className={styles.tools}>
        <div className={styles.searchRow}>
          <SearchField
            value={ui.query}
            onChange={ui.setQuery}
            label={t('training.library.searchLabel')}
            placeholder={t('training.library.searchPlaceholder')}
            clearLabel={t('common.clearSearch')}
          />
          <button
            type="button"
            className={cx(styles.filterButton, filterCount > 0 && styles.filterOn)}
            onClick={() => setSheet('filters', true)}
            aria-label={filterCount > 0 ? t('training.library.filtersActive', { n: filterCount }) : t('training.library.filters')}
          >
            <Icon name="filter" />
            {filterCount > 0 && <span className={cx('num', styles.filterCount)}>{filterCount}</span>}
          </button>
        </div>
        <div className={styles.chips}>
          <Chip pressed={filters.favouritesOnly} onClick={() => setFilters({ ...filters, favouritesOnly: !filters.favouritesOnly })}>
            {t('training.library.favourites')}
          </Chip>
          <Chip pressed={filters.customOnly} onClick={() => setFilters({ ...filters, customOnly: !filters.customOnly })}>
            {t('training.library.customOnly')}
          </Chip>
          {filters.showHidden && (
            <ActiveChip label={t('training.library.showHidden')} onRemove={() => setFilters({ ...filters, showHidden: false })} />
          )}
          {filters.muscles.map((m) => (
            <ActiveChip key={m} label={muscleName(m)} onRemove={() => setFilters({ ...filters, muscles: toggleIn(filters.muscles, m) })} />
          ))}
          {filters.equipment.map((m) => (
            <ActiveChip key={m} label={equipmentName(m)} onRemove={() => setFilters({ ...filters, equipment: toggleIn(filters.equipment, m) })} />
          ))}
          {filters.levels.map((m) => (
            <ActiveChip key={m} label={levelName(m)} onRemove={() => setFilters({ ...filters, levels: toggleIn(filters.levels, m) })} />
          ))}
        </div>
      </div>

      {catalog.status === 'loading' && <p className={styles.loading}>{t('training.library.loading')}</p>}
      {catalog.status === 'error' && (
        <EmptyState
          icon="alert"
          title={t('training.library.loadErrorTitle')}
          body={t('training.library.loadErrorBody')}
          action={<Button icon="refresh" onClick={catalog.retry}>{t('training.library.retry')}</Button>}
        />
      )}
      {ready && results.length === 0 && <Empty filters={filters} onClear={() => setFilters(NO_FILTERS)} onAdd={() => setSheet('add', true)} />}
      {ready && results.length > 0 && (
        <WindowList
          className={styles.list}
          items={results}
          rowHeight={ROW_HEIGHT}
          getKey={(e) => e.id}
          renderRow={renderRow}
          label={t('training.library.title')}
        />
      )}

      {ui.filtersOpen && (
        <FilterSheet
          initial={filters}
          countFor={countFor}
          onClose={() => setSheet('filters', false)}
          onApply={(f) => {
            setFilters(f);
            setSheet('filters', false);
            window.scrollTo(0, 0);
          }}
        />
      )}
      {ui.addOpen && <AddExerciseSheet onClose={() => setSheet('add', false)} initialMuscle={filters.muscles[0]} />}
      {ui.offlineOpen && catalog.pack && <OfflinePhotosSheet pack={catalog.pack} onClose={() => setSheet('offline', false)} />}
    </>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className={styles.activeChip} onClick={onRemove} aria-label={t('training.library.removeFilter', { name: label })}>
      {label}
      <Icon name="close" />
    </button>
  );
}

function Empty({ filters, onClear, onAdd }: { filters: LibraryFilters; onClear: () => void; onAdd: () => void }) {
  const onlyFavourites = filters.favouritesOnly && activeFilterCount(filters) === 1;
  const onlyCustom = filters.customOnly && activeFilterCount(filters) === 1;
  if (onlyFavourites) {
    return <EmptyState icon="list" title={t('training.library.emptyFavouritesTitle')} body={t('training.library.emptyFavouritesBody')} />;
  }
  if (onlyCustom) {
    return (
      <EmptyState
        icon="dumbbell"
        title={t('training.library.emptyCustomTitle')}
        body={t('training.library.emptyCustomBody')}
        action={
          <Button icon="plus" onClick={onAdd}>
            {t('training.library.addCustom')}
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon="search"
      title={t('training.library.emptyTitle')}
      body={t('training.library.emptyBody')}
      action={
        activeFilterCount(filters) > 0 ? (
          <Button icon="close" variant="secondary" onClick={onClear}>
            {t('training.library.clearFilters')}
          </Button>
        ) : undefined
      }
    />
  );
}
