import { useState } from 'react';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { Client } from '@/domain/models';
import { searchItems } from '@/data';
import { t } from '@/i18n';
import { Avatar, Badge, SearchField, Sheet } from '@/ui';
import styles from './Shared.module.css';

export interface ClientPickerSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (client: Client) => void;
  currentId?: string | null;
  excludeId?: string | null;
}

export function ClientPickerSheet({ open, title, onClose, onPick, currentId, excludeId }: ClientPickerSheetProps) {
  const repos = useRepos();
  const clients = useLive(() => repos.clients.list(), [repos]) ?? [];
  const [query, setQuery] = useState('');
  const shown = searchItems(
    clients.filter((c) => c.id !== excludeId),
    query,
    (c) => [c.name, c.phone],
  );
  return (
    <Sheet open={open} onClose={onClose} title={title} cancelLabel={t('common.cancel')} initialFocusId="client-picker-cancel-focus">
      <span id="client-picker-cancel-focus" tabIndex={-1} />
      {clients.length > 6 && (
        <SearchField
          value={query}
          onChange={setQuery}
          label={t('training.programs.clientPicker.searchLabel')}
          placeholder={t('training.programs.clientPicker.searchLabel')}
          clearLabel={t('common.clearSearch')}
        />
      )}
      {shown.length === 0 ? (
        <p className={styles.pickerEmpty}>{t('training.programs.clientPicker.empty')}</p>
      ) : (
        <ul className={styles.pickerList}>
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" className={styles.pickerRow} onClick={() => onPick(c)}>
                <Avatar name={c.name} />
                <span className={styles.pickerText}>
                  <span className={styles.pickerName}>{c.name}</span>
                </span>
                {c.id === currentId && <Badge tone="brand">{t('training.programs.clientPicker.current')}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
