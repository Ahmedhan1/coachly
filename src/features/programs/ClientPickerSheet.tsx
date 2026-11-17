import { useState } from 'react';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { Client } from '@/domain/models';
import { searchItems } from '@/data';
import { t } from '@/i18n';
import { Avatar, Badge, Icon, SearchField, Sheet } from '@/ui';
import styles from './Shared.module.css';

export interface ClientPickerSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (client: Client) => void;
  currentId?: string | null;
  excludeId?: string | null;
  /** Several clients at once: rows toggle, the header button confirms. */
  onPickMany?: (clients: Client[]) => void;
}

export function ClientPickerSheet({ open, title, onClose, onPick, currentId, excludeId, onPickMany }: ClientPickerSheetProps) {
  const repos = useRepos();
  const clients = useLive(() => repos.clients.list(), [repos]) ?? [];
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const shown = searchItems(
    clients.filter((c) => c.id !== excludeId),
    query,
    (c) => [c.name, c.phone],
  );
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const confirm = onPickMany ? (
    <button
      type="button"
      className={styles.pickerConfirm}
      disabled={picked.size === 0}
      onClick={() => {
        onPickMany(clients.filter((c) => picked.has(c.id)));
        setPicked(new Set());
      }}
    >
      {t('hub.assignMany.confirm', { n: picked.size })}
    </button>
  ) : undefined;
  return (
    <Sheet open={open} onClose={onClose} title={title} cancelLabel={t('common.cancel')} initialFocusId="client-picker-cancel-focus" primaryAction={confirm}>
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
              <button
                type="button"
                className={styles.pickerRow}
                aria-pressed={onPickMany ? picked.has(c.id) : undefined}
                onClick={() => (onPickMany ? toggle(c.id) : onPick(c))}
              >
                <Avatar name={c.name} />
                <span className={styles.pickerText}>
                  <span className={styles.pickerName}>{c.name}</span>
                </span>
                {c.id === currentId && <Badge tone="brand">{t('training.programs.clientPicker.current')}</Badge>}
                {onPickMany && picked.has(c.id) && <Icon name="check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
