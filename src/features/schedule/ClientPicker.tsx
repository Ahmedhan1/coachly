import { ClientAvatar } from '@/features/clients/ClientAvatar';
import { useState } from 'react';
import { useUiStore } from '@/app/uiStore';
import { matchesQuery } from '@/data';
import type { Client } from '@/domain/models';
import { t } from '@/i18n';
import { Button, SearchField, cx } from '@/ui';
import styles from './Schedule.module.css';

export interface ClientPickerProps {
  clients: readonly Client[];
  value: string | null;
  error: string | null;
  onChange: (clientId: string) => void;
}

const MAX_SHOWN = 6;

/** Search-as-you-type client choice; once picked it collapses to one row with «غيّر». */
export function ClientPicker({ clients, value, error, onChange }: ClientPickerProps) {
  const openAddClient = useUiStore((s) => s.openAddClient);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(value === null);
  const selected = clients.find((c) => c.id === value) ?? null;

  if (clients.length === 0) {
    return (
      <div className={styles.pickerEmpty}>
        <p className={styles.fieldLabel}>{t('schedule.sheet.client')}</p>
        <p>{t('schedule.noClientsBody')}</p>
        <Button size="small" icon="plus" onClick={openAddClient}>
          {t('schedule.addClient')}
        </Button>
      </div>
    );
  }

  if (selected && !picking) {
    return (
      <div className={styles.picker}>
        <p className={styles.fieldLabel}>{t('schedule.sheet.client')}</p>
        <div className={styles.picked}>
          <ClientAvatar client={selected} />
          <span className={styles.pickedName}>{selected.name}</span>
          <button type="button" className={styles.change} onClick={() => setPicking(true)}>
            {t('schedule.sheet.change')}
          </button>
        </div>
      </div>
    );
  }

  const matches = clients.filter((c) => matchesQuery([c.name, c.phone], query)).slice(0, MAX_SHOWN);
  return (
    <fieldset className={styles.picker}>
      <legend className={styles.fieldLabel}>{t('schedule.sheet.pickClient')}</legend>
      <SearchField
        value={query}
        onChange={setQuery}
        label={t('schedule.sheet.clientSearch')}
        placeholder={t('schedule.sheet.clientSearch')}
        clearLabel={t('common.clearSearch')}
      />
      <ul className={styles.clientList}>
        {matches.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={cx(styles.clientOption, c.id === value && styles.clientOptionOn)}
              aria-pressed={c.id === value}
              onClick={() => {
                onChange(c.id);
                setPicking(false);
                setQuery('');
              }}
            >
              <ClientAvatar client={c} />
              <span>{c.name}</span>
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className={styles.noMatch}>{t('schedule.sheet.noClientMatch')}</li>}
      </ul>
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
