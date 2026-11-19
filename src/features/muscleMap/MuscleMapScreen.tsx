import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { filterExercises, MUSCLE_GROUPS, type MuscleGroupId } from '@/domain/exercises';
import { muscleName } from '@/features/exercises/localized';
import { useCatalog } from '@/features/exercises/useCatalog';
import { t } from '@/i18n';
import { Button, ListRow, ListSection, PageHeader, SegmentedControl, Tx, Icon } from '@/ui';
import { MuscleMap } from '@/ui/MuscleMap';
import styles from './MuscleMap.module.css';

const MuscleViewer3D = lazy(() => import('./MuscleViewer3D'));

type Tab = '2d' | '3d';
const TABS = [
  { value: '2d' as const, label: t('training.library.muscleMap.tab2d') },
  { value: '3d' as const, label: t('training.library.muscleMap.tab3d') },
];

const exercisesLink = (id: MuscleGroupId) => `/exercises?muscle=${id}`;

/** More → خريطة العضلات: tap a muscle (2D map or 3D model) → its exercises. */
export function MuscleMapScreen() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('view') === '3d' ? '3d' : '2d';
  const navigate = useNavigate();
  const catalog = useCatalog();
  const [selected, setSelected] = useState<MuscleGroupId | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const counts = useMemo(() => {
    const map = new Map<MuscleGroupId, number>();
    for (const g of MUSCLE_GROUPS) map.set(g.id, filterExercises(catalog.visible, { muscles: [g.id] }).length);
    return map;
  }, [catalog.visible]);
  const intensities = useMemo(() => (selected ? { [selected]: 1 } : {}), [selected]);

  return (
    <>
      <PageHeader title={t('training.library.muscleMap.title')} subtitle={t('training.library.muscleMap.lead')} back={{ to: '/more', label: t('common.back') }} />
      <div className={styles.body}>
        <SegmentedControl
          label={t('training.library.muscleMap.tabs')}
          options={TABS}
          value={tab}
          onChange={(v) => setParams(v === '3d' ? { view: '3d' } : {}, { replace: true })}
        />
        {tab === '2d' ? (
          <div className={styles.mapTile}>
            <MuscleMap view="both" size={320} onSelect={(id) => navigate(exercisesLink(id))} captions />
          </div>
        ) : (
          <>
            <Suspense fallback={<div className={styles.stage}><p className={styles.loading}>{t('training.muscles3d.loading')}</p></div>}>
              <MuscleViewer3D intensities={intensities} selected={selected} onSelect={setSelected} resetKey={resetKey} />
            </Suspense>
            <div className={styles.selection} aria-live="polite">
              {selected ? (
                <>
                  <p className={styles.selectedName}>{t('training.muscles3d.selected', { name: muscleName(selected) })}</p>
                  <Button block icon="dumbbell" onClick={() => navigate(exercisesLink(selected))}>
                    {t('training.muscles3d.openExercises', { name: muscleName(selected) })}
                  </Button>
                </>
              ) : (
                <p className={styles.hint}>{t('training.muscles3d.hint')}</p>
              )}
              <Button variant="plain" icon="undo" onClick={() => setResetKey((k) => k + 1)}>
                {t('training.muscles3d.resetView')}
              </Button>
            </div>
            <details className={styles.about}>
              <summary>{t('training.muscles3d.aboutTitle')}</summary>
              <p>{t('training.muscles3d.aboutShort')}</p>
              <p>{t('training.muscles3d.aboutLong')}</p>
            </details>
          </>
        )}
      </div>
      <ListSection icon="dumbbell" title={t('training.library.muscleMap.list')}>
        {MUSCLE_GROUPS.map((g) => (
          <ListRow leading={<Icon name="body" />}
            key={g.id}
            to={exercisesLink(g.id)}
            title={muscleName(g.id)}
            trailing={catalog.status === 'ready' ? <Tx k="training.library.muscleMap.exerciseCount" params={{ n: counts.get(g.id) ?? 0 }} /> : undefined}
          />
        ))}
      </ListSection>
    </>
  );
}

