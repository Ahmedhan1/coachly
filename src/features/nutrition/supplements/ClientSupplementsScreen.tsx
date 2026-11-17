import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import type { ClientSupplement } from '@/data/nutritionStore';
import type { Supplement } from '@/domain/models';
import { t } from '@/i18n';
import { Button, EmptyState, IconButton, ListRow, ListSection, PageHeader, Sheet, SwipeRow, TextField } from '@/ui';
import { ClientNav } from '../shared/ClientNav';
import { StoredImage } from '../shared/StoredImage';
import { useBackTo, useClient } from '../shared/useClient';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import common from '../shared/common.module.css';
import styles from './Supplements.module.css';

/** /clients/:id/supplements — products picked from the catalog, with per-client dose/timing text. */
export function ClientSupplementsScreen() {
  useStarterData();
  const { clientId = '' } = useParams();
  const navigate = useNavigate();
  const repos = useRepos();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const client = useClient(clientId);
  const back = useBackTo(`/clients/${clientId}`);
  const catalog = useLive(() => repos.supplements.list(), [repos]);
  const [version, setVersion] = useState(0);
  const assigned = useLive(() => store.getClientSupplements(clientId), [store, clientId, version]);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  if (client === undefined || catalog === undefined || assigned === undefined) return <PageHeader title="" back={{ to: back, label: t('common.back') }} />;
  if (client === null) return <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />;

  const byId = new Map<string, Supplement>(catalog.map((s) => [s.id, s]));
  const save = async (list: ClientSupplement[]) => {
    await store.saveClientSupplements(clientId, list);
    setVersion((v) => v + 1);
  };

  const add = async (s: Supplement) => {
    setPicking(false);
    await save([...assigned, { supplementId: s.id, dose: s.dose, timing: s.timing, notes: '' }]);
    showToast({ message: t('nutrition.supplements.assigned', { name: s.name }), duration: 2500 });
  };

  const remove = async (index: number) => {
    const row = assigned[index];
    if (!row) return;
    const before = assigned;
    await save(assigned.filter((_, i) => i !== index));
    showToast({
      message: t('nutrition.supplements.removed', { name: byId.get(row.supplementId)?.name ?? '' }),
      actionLabel: t('common.undo'),
      onAction: () => void save(before),
    });
  };

  const editingRow = editing !== null ? assigned[editing] : undefined;

  return (
    <div className={common.page}>
      <PageHeader
        title={t('nutrition.supplements.forClientTitle', { name: client.name })}
        back={{ to: back, label: t('common.back') }}
        actions={<IconButton icon="plus" label={t('nutrition.supplements.assign')} onClick={() => setPicking(true)} />}
      />
      <ClientNav clientId={clientId} />
      {assigned.length === 0 ? (
        <EmptyState
          icon="pill"
          title={t('nutrition.supplements.clientEmptyTitle')}
          body={t('nutrition.supplements.clientEmptyBody')}
          action={
            <Button icon="plus" onClick={() => setPicking(true)}>
              {t('nutrition.supplements.assign')}
            </Button>
          }
        />
      ) : (
        <ListSection count={assigned.length}>
          {assigned.map((row, i) => {
            const s = byId.get(row.supplementId);
            const name = s?.name ?? t('nutrition.supplements.missing');
            return (
              <SwipeRow key={`${row.supplementId}-${i}`} onDelete={() => void remove(i)} deleteLabel={t('common.delete')} deleteAccessibleLabel={t('nutrition.supplements.removeLabel', { name })}>
                <ListRow
                  leading={<StoredImage imageId={s?.imageId} alt="" className={styles.thumb} fallbackIcon="pill" />}
                  title={name}
                  subtitle={[row.dose, row.timing].filter(Boolean).join(' · ') || t('nutrition.supplements.noDose')}
                  onClick={() => setEditing(i)}
                />
              </SwipeRow>
            );
          })}
        </ListSection>
      )}

      {picking && (
        <Sheet open onClose={() => setPicking(false)} title={t('nutrition.supplements.pickTitle')} cancelLabel={t('common.cancel')}>
          {catalog.length === 0 ? (
            <div className={common.form}>
              <p className={common.muted}>{t('nutrition.supplements.catalogEmpty')}</p>
              <Button onClick={() => navigate('/more/supplements')}>{t('nutrition.supplements.openCatalog')}</Button>
            </div>
          ) : (
            <ul className={styles.pickList}>
              {catalog.map((s) => (
                <li key={s.id}>
                  <button type="button" className={styles.pickRow} disabled={assigned.some((a) => a.supplementId === s.id)} onClick={() => void add(s)}>
                    <StoredImage imageId={s.imageId} alt="" className={styles.thumb} fallbackIcon="pill" />
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}

      {editingRow && editing !== null && (
        <ClientRowSheet
          row={editingRow}
          name={byId.get(editingRow.supplementId)?.name ?? ''}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setEditing(null);
            void save(assigned.map((r, i) => (i === editing ? next : r)));
          }}
        />
      )}
    </div>
  );
}

function ClientRowSheet({ row, name, onClose, onSave }: { row: ClientSupplement; name: string; onClose: () => void; onSave: (r: ClientSupplement) => void }) {
  const [dose, setDose] = useState(row.dose);
  const [timing, setTiming] = useState(row.timing);
  const [notes, setNotes] = useState(row.notes);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ ...row, dose: dose.trim(), timing: timing.trim(), notes: notes.trim() });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('nutrition.supplements.clientEditTitle', { name })}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form="client-supp" className={common.sheetSave}>
          {t('common.save')}
        </button>
      }
    >
      <form id="client-supp" className={common.form} onSubmit={submit}>
        <p className={common.note}>{t('nutrition.supplements.noDoseNote')}</p>
        <TextField label={t('nutrition.supplements.dose')} placeholder={t('nutrition.supplements.dosePlaceholder')} value={dose} onChange={(e) => setDose(e.target.value)} />
        <TextField label={t('nutrition.supplements.timing')} placeholder={t('nutrition.supplements.timingPlaceholder')} value={timing} onChange={(e) => setTiming(e.target.value)} />
        <TextField label={t('nutrition.supplements.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Sheet>
  );
}
