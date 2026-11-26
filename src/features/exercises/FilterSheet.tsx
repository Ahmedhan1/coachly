import { useMemo, useState } from 'react';
import {
  EQUIPMENT_IDS,
  LEVEL_IDS,
  MUSCLE_GROUPS,
} from '@/domain/exercises';
import { t } from '@/i18n';
import { Button, Chip, ChipGroup, Sheet } from '@/ui';
import { NO_FILTERS, toggleIn, type LibraryFilters } from './libraryUi';
import { equipmentName, levelName, muscleName } from './localized';
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
            <Chip key={g.id} pressed={draft.muscles.includes(g.id)} onClick={() => set({ muscles: toggleIn(draft.muscles, g.id) })}>
              {muscleName(g.id)}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup label={t('training.library.filterSheet.equipment')}>
          {EQUIPMENT_IDS.map((id) => (
            <Chip key={id} pressed={draft.equipment.includes(id)} onClick={() => set({ equipment: toggleIn(draft.equipment, id) })}>
              {equipmentName(id)}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup label={t('training.library.filterSheet.level')}>
          {LEVEL_IDS.map((id) => (
            <Chip key={id} pressed={draft.levels.includes(id)} onClick={() => set({ levels: toggleIn(draft.levels, id) })}>
              {levelName(id)}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup label={t('training.library.filterSheet.more')}>
          <Chip pressed={draft.favouritesOnly} onClick={() => set({ favouritesOnly: !draft.favouritesOnly })}>
            {t('training.library.favourites')}
          </Chip>
          <Chip pressed={draft.customOnly} onClick={() => set({ customOnly: !draft.customOnly })}>
            {t('training.library.customOnly')}
          </Chip>
          <Chip pressed={draft.showHidden} onClick={() => set({ showHidden: !draft.showHidden })}>
            {t('training.library.showHidden')}
          </Chip>
        </ChipGroup>
      </div>
      <div className={styles.footer}>
        <Button icon="check" block size="large" onClick={() => onApply(draft)}>
          {t('training.library.filterSheet.apply', { n: count })}
        </Button>
      </div>
    </Sheet>
  );
}
