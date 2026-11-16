import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { ProgressEntry } from '@/domain/models';
import { workoutLogsToSets } from '@/domain/programs';
import { estimateOneRepMax, personalRecordTimeline } from '@/domain/strength';
import { t } from '@/i18n';
import { Badge, Button, EmptyState, IconButton, ListRow, ListSection, PageHeader, Tx } from '@/ui';
import { formatIsoDate, formatNumber } from '@/ui/format';
import { useExerciseCatalog } from '@/features/programs/catalog';
import { exerciseName } from '@/features/programs/names';
import { ClientNav } from '../shared/ClientNav';
import { StoredImage } from '../shared/StoredImage';
import { useBackTo, useClient } from '../shared/useClient';
import { EntrySheet } from './EntrySheet';
import { WeightChart } from './WeightChart';
import common from '../shared/common.module.css';
import styles from './Progress.module.css';

function summary(e: ProgressEntry): string {
  const m = e.measurements;
  const parts = [
    m.weightKg !== undefined ? `${formatNumber(m.weightKg)} ${t('clientDetail.kg')}` : null,
    m.bodyFatPercent !== undefined ? `${formatNumber(m.bodyFatPercent)}%` : null,
    m.waistCm !== undefined ? `${t('clientDetail.waist')} ${formatNumber(m.waistCm)}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** /clients/:id/progress — weight line, before/after photos, entries and personal records. */
export function ClientProgressScreen() {
  const { clientId = '' } = useParams();
  const repos = useRepos();
  const client = useClient(clientId);
  const back = useBackTo(`/clients/${clientId}`);
  const entries = useLive(() => repos.progress.listByClient(clientId), [repos, clientId]);
  const logs = useLive(() => repos.workoutLogs.listByClient(clientId), [repos, clientId]);
  const catalog = useExerciseCatalog();
  const [editing, setEditing] = useState<ProgressEntry | 'new' | null>(null);

  const sorted = useMemo(() => [...(entries ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [entries]);
  const records = useMemo(() => {
    const timeline = personalRecordTimeline(workoutLogsToSets(logs ?? []));
    const best = new Map<string, (typeof timeline)[number]['set']>();
    for (const r of timeline) best.set(r.set.exerciseId, r.set);
    return [...best.values()].sort((a, b) => b.performedAt - a.performedAt).slice(0, 10);
  }, [logs]);

  if (client === undefined || entries === undefined) return <PageHeader title="" back={{ to: back, label: t('common.back') }} />;
  if (client === null) return <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />;

  const weights = sorted.flatMap((e) => (e.measurements.weightKg !== undefined ? [{ date: e.date, value: e.measurements.weightKg }] : []));
  const firstW = weights[0];
  const lastW = weights[weights.length - 1];
  const delta = firstW && lastW && weights.length > 1 ? Math.round((lastW.value - firstW.value) * 10) / 10 : null;
  const withPhotos = sorted.filter((e) => e.photoIds.length > 0);
  const before = withPhotos[0];
  const after = withPhotos.length > 1 ? withPhotos[withPhotos.length - 1] : undefined;

  return (
    <div className={common.page}>
      <PageHeader
        title={t('nutrition.progress.forClientTitle', { name: client.name })}
        back={{ to: back, label: t('common.back') }}
        actions={<IconButton icon="plus" label={t('nutrition.progress.add')} onClick={() => setEditing('new')} />}
      />
      <ClientNav clientId={clientId} />

      {sorted.length === 0 ? (
        <EmptyState
          icon="chart"
          title={t('nutrition.progress.emptyTitle')}
          body={t('nutrition.progress.emptyBody')}
          action={
            <Button icon="plus" onClick={() => setEditing('new')}>
              {t('nutrition.progress.add')}
            </Button>
          }
        />
      ) : (
        <>
          <section className={common.section} aria-labelledby="w-title">
            <div className={common.tile}>
              <div className={styles.chartHead}>
                <h2 id="w-title" className={common.sectionTitle}>
                  {t('nutrition.progress.weightChart')}
                </h2>
                {delta !== null && (
                  <Badge tone={delta === 0 ? 'neutral' : 'brand'}>
                    {t('nutrition.progress.changeValue', { sign: delta > 0 ? '+' : '', n: formatNumber(delta) })}
                  </Badge>
                )}
              </div>
              {weights.length > 1 ? <WeightChart series={weights} /> : <p className={common.muted}>{t('nutrition.progress.needTwo')}</p>}
            </div>
          </section>

          <section className={common.section} aria-labelledby="ba-title">
            <h2 id="ba-title" className={common.sectionTitle}>
              {t('nutrition.progress.beforeAfter')}
            </h2>
            {before && after ? (
              <div className={styles.compare}>
                {[
                  { e: before, label: t('nutrition.progress.before') },
                  { e: after, label: t('nutrition.progress.after') },
                ].map(({ e, label }) => (
                  <figure key={e.id} className={styles.compareCell}>
                    <StoredImage imageId={e.photoIds[0]} alt={`${label} ${formatIsoDate(e.date)}`} className={styles.comparePhoto} />
                    <figcaption>
                      {label} · {formatIsoDate(e.date)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className={common.muted}>{t('nutrition.progress.needPhotos')}</p>
            )}
          </section>

          <ListSection title={t('nutrition.progress.entries')} count={sorted.length}>
            {[...sorted].reverse().map((e) => (
              <ListRow
                key={e.id}
                leading={e.photoIds[0] ? <StoredImage imageId={e.photoIds[0]} alt="" className={styles.rowThumb} lazy /> : undefined}
                title={formatIsoDate(e.date)}
                subtitle={summary(e) || e.notes}
                trailing={e.source === 'client' ? <Badge>{t('nutrition.progress.fromClient')}</Badge> : undefined}
                onClick={() => setEditing(e)}
              />
            ))}
          </ListSection>
        </>
      )}

      <ListSection title={t('nutrition.progress.records')} count={records.length || undefined}>
        {records.length === 0 ? (
          <p className={styles.none}>{t('nutrition.progress.noRecords')}</p>
        ) : (
          records.map((s) => (
            <ListRow
              key={s.exerciseId}
              title={exerciseName(catalog?.byId.get(s.exerciseId), s.exerciseId)}
              subtitle={
                <Tx
                  k="nutrition.progress.recordValue"
                  params={{ w: formatNumber(s.weightKg), r: s.reps, orm: formatNumber(Math.round(estimateOneRepMax(s.weightKg, s.reps))) }}
                />
              }
            />
          ))
        )}
      </ListSection>

      {editing && <EntrySheet clientId={clientId} entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
