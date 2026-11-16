import { useState } from 'react';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { OUTBOX_KINDS, type OutboxKind } from '@/domain/outbox';
import { t } from '@/i18n';
import { EmptyState, IconButton, ListSection, PageHeader, Sheet } from '@/ui';
import { OutboxList } from './OutboxList';
import { readKinds, saveKinds, useOutbox } from './useOutbox';
import styles from './Outbox.module.css';

/** More → رسايل النهارده: the full list, plus which kinds the app prepares. */
export function OutboxScreen() {
  const outbox = useOutbox();
  const [settings, setSettings] = useState(false);
  return (
    <>
      <PageHeader
        title={t('outbox.title')}
        back={{ to: '/', label: t('tabs.home') }}
        subtitle={t('outbox.hint')}
        actions={<IconButton icon="settings" label={t('outbox.settings')} onClick={() => setSettings(true)} />}
      />
      {outbox &&
        (outbox.items.length === 0 ? (
          <EmptyState icon="chat" title={t('outbox.empty')} body={t('outbox.emptyBody')} />
        ) : (
          <ListSection count={outbox.items.length}>
            <OutboxList items={outbox.items} clients={outbox.clients} onChange={outbox.refresh} />
          </ListSection>
        ))}
      {settings && (
        <KindsSheet
          onClose={() => {
            setSettings(false);
            outbox?.refresh();
          }}
        />
      )}
    </>
  );
}

function KindsSheet({ onClose }: { onClose: () => void }) {
  const { meta } = useServices();
  const [version, setVersion] = useState(0);
  const kinds = useLive(() => readKinds(meta), [meta, version]);
  const toggle = async (k: OutboxKind) => {
    if (!kinds) return;
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    await saveKinds(meta, next);
    setVersion((v) => v + 1);
  };
  return (
    <Sheet open onClose={onClose} title={t('outbox.settings')} cancelLabel={t('common.close')}>
      <div className={styles.kinds}>
        <p className={styles.empty}>{t('outbox.settingsHint')}</p>
        {OUTBOX_KINDS.map((k) => (
          <label key={k} className={styles.kind}>
            <input type="checkbox" checked={kinds?.has(k) ?? true} onChange={() => void toggle(k)} />
            <span>{t(`outbox.kinds.${k}`)}</span>
          </label>
        ))}
      </div>
    </Sheet>
  );
}
