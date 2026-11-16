import { useState } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import type { Supplement } from '@/domain/models';
import { t } from '@/i18n';
import { Button, EmptyState, IconButton, ListRow, ListSection, Money, PageHeader, SwipeRow } from '@/ui';
import { StoredImage } from '../shared/StoredImage';
import { useNutritionStore, useStarterData } from '../shared/useNutritionStore';
import { SupplementSheet } from './SupplementSheet';
import common from '../shared/common.module.css';
import styles from './Supplements.module.css';

/** More → المكملات والمنتجات: the trainer's own catalog. */
export function SupplementsScreen() {
  const ready = useStarterData();
  const repos = useRepos();
  const store = useNutritionStore();
  const showToast = useUiStore((s) => s.showToast);
  const settings = useLive(() => repos.settings.get(), [repos]);
  const list = useLive(() => repos.supplements.list(), [repos]);
  const starter = useLive(() => store.getStarterSupplementIds(), [store]);
  const [editing, setEditing] = useState<Supplement | 'new' | null>(null);
  const currency = settings?.currency ?? 'EGP';
  const sorted = [...(list ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const hasStarter = (starter ?? []).some((id) => sorted.some((s) => s.id === id));

  const remove = async (s: Supplement) => {
    await repos.supplements.softDelete(s.id);
    showToast({ message: t('nutrition.supplements.deleted', { name: s.name }), actionLabel: t('common.undo'), onAction: () => void repos.supplements.restore(s.id) });
  };

  const removeStarter = async () => {
    const ids = await store.removeStarterSupplements();
    showToast({
      message: t('nutrition.supplements.starterRemoved'),
      actionLabel: t('common.undo'),
      onAction: () => void Promise.all(ids.map((id) => repos.supplements.restore(id))),
    });
  };

  return (
    <>
      <PageHeader
        title={t('nutrition.supplements.title')}
        back={{ to: '/more', label: t('nutrition.supplements.back') }}
        actions={<IconButton icon="plus" label={t('nutrition.supplements.add')} onClick={() => setEditing('new')} />}
        subtitle={t('nutrition.supplements.noDoseNote')}
      />
      {ready && list && sorted.length === 0 && (
        <EmptyState
          icon="pill"
          title={t('nutrition.supplements.emptyTitle')}
          body={t('nutrition.supplements.emptyBody')}
          action={
            <Button icon="plus" onClick={() => setEditing('new')}>
              {t('nutrition.supplements.add')}
            </Button>
          }
        />
      )}
      {sorted.length > 0 && (
        <ListSection count={sorted.length}>
          {sorted.map((s) => (
            <SwipeRow key={s.id} onDelete={() => void remove(s)} deleteLabel={t('common.delete')} deleteAccessibleLabel={t('nutrition.supplements.deleteLabel', { name: s.name })}>
              <ListRow
                leading={<StoredImage imageId={s.imageId} alt="" className={styles.thumb} fallbackIcon="pill" lazy />}
                title={s.name}
                subtitle={[s.dose, s.timing].filter(Boolean).join(' · ') || t('nutrition.supplements.noDose')}
                trailing={s.priceMinor ? <Money minor={s.priceMinor} currency={s.currency} /> : undefined}
                onClick={() => setEditing(s)}
              />
            </SwipeRow>
          ))}
        </ListSection>
      )}
      {hasStarter && (
        <div className={common.actions}>
          <Button variant="plain" icon="trash" onClick={() => void removeStarter()}>
            {t('nutrition.supplements.removeStarter')}
          </Button>
        </div>
      )}
      {editing && <SupplementSheet supplement={editing === 'new' ? null : editing} currency={currency} onClose={() => setEditing(null)} />}
    </>
  );
}
