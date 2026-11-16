import { useMemo, useState } from 'react';
import {
  EQUIPMENT_IDS,
  EQUIPMENT_LABELS_AR,
  LEVEL_IDS,
  LEVEL_LABELS_AR,
  MUSCLE_GROUPS,
} from '@/domain/exercises';
import { t } from '@/i18n';
import { Button, Sheet } from '@/ui';
import { ChipGroup, ChipToggle } from './ChipToggle';
import { NO_FILTERS, toggleIn, type LibraryFilters } from './libraryUi';
import styles from './Sheets.module.css';

interface FilterSheetProps {
  initial: LibraryFilters;
  /** Result count for a draft, shown on the apply button. */
  countFor: (filters: LibraryFilters) => number;
  onApply: (filters: LibraryFilters) => void;
  onClose: () => void;
}

/** Bottom sheet with every filter facet; changes apply on "show N exercises". */
export function FilterSheet({ initial, countFor, onApply, onClose }: FilterSheetProps) {
  const [draft, setDraft] = useState(initial);
  const count = useMemo(() => countFor(draft), [countFor, draft]);
  const set = (patch: Partial<LibraryFilters>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('training.library.filterSheet.title')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="button" className={styles.headerAction} onClick={() => setDraft(NO_FILTERS)}>
          {t('training.library.filterSheet.clear')}
        </button>
      }
    >
      <div className={styles.form}>
        <ChipGroup label={t('training.library.filterSheet.muscles')}>
          {MUSCLE_GROUPS.map((g) => (
            <ChipToggle key={g.id} pressed={draft.muscles.includes(g.id)} onToggle={() => set({ muscles: toggleIn(draft.muscles, g.id) })}>
              {g.labelAr}
            </ChipToggle>
          ))}
        </ChipGroup>
        <ChipGroup label={t('training.library.filterSheet.equipment')}>
          {EQUIPMENT_IDS.map((id) => (
            <ChipToggle key={id} pressed={draft.equipment.includes(id)} onToggle={() => set({ equipment: toggleIn(draft.equipment, id) })}>
              {EQUIPMENT_LABELS_AR[id]}
            </ChipToggle>
          ))}
        </ChipGroup>
        <ChipGroup label={t('training.library.filterSheet.level')}>
          {LEVEL_IDS.map((id) => (
            <ChipToggle key={id} pressed={draft.levels.includes(id)} onToggle={() => set({ levels: toggleIn(draft.levels, id) })}>
              {LEVEL_LABELS_AR[id]}
            </ChipToggle>
          ))}
        </ChipGroup>
        <ChipGroup label={t('training.library.filterSheet.more')}>
          <ChipToggle pressed={draft.favouritesOnly} onToggle={() => set({ favouritesOnly: !draft.favouritesOnly })}>
            {t('training.library.favourites')}
          </ChipToggle>
          <ChipToggle pressed={draft.customOnly} onToggle={() => set({ customOnly: !draft.customOnly })}>
            {t('training.library.customOnly')}
          </ChipToggle>
          <ChipToggle pressed={draft.showHidden} onToggle={() => set({ showHidden: !draft.showHidden })}>
            {t('training.library.showHidden')}
          </ChipToggle>
        </ChipGroup>
      </div>
      <div className={styles.footer}>
        <Button block size="large" onClick={() => onApply(draft)}>
          {t('training.library.filterSheet.apply', { n: count })}
        </Button>
      </div>
    </Sheet>
  );
}
