import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { ProgressEntry, WorkoutLog } from '@/domain/models';
import { workoutLogsToSets } from '@/domain/programs';
import { estimateOneRepMax, personalRecordTimeline } from '@/domain/strength';
import { t } from '@/i18n';
import { Badge, Button, EmptyState, IconButton, ListRow, ListSection, Num, PageHeader, SegmentedControl, Sheet, Tx, Icon, TitleIcon } from '@/ui';
import { formatIsoDate, formatNumber } from '@/ui/format';
import { useExerciseCatalog } from '@/app/catalog';
import { exerciseName } from '@/i18n/programNames';
import { ClientNav } from '../shared/ClientNav';
import { StoredImage } from '../shared/StoredImage';
import { useBackTo, useClient } from '../shared/useClient';
import { EntrySheet } from './EntrySheet';
import { useThumbs } from './useThumbs';
import { WeightChart } from './WeightChart';
import common from '../shared/common.module.css';
import styles from './Progress.module.css';

/** Best estimated 1RM per workout date for one exercise (for the history chart). */
function exerciseHistory(logs: readonly WorkoutLog[], exerciseId: string): { date: string; value: number }[] {
  const best = new Map<string, number>();
  for (const log of logs) {
    for (const e of log.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      for (const set of e.sets) {
        if (!set.done || set.weightKg <= 0) continue;
        const v = Math.round(estimateOneRepMax(set.weightKg, set.reps) * 10) / 10;
        best.set(log.date, Math.max(best.get(log.date) ?? 0, v));
      }
    }
  }
  return [...best].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

const METRICS = ['weightKg', 'bodyFatPercent', 'waistCm', 'neckCm', 'hipCm', 'chestCm', 'armCm', 'thighCm'] as const;
type Metric = (typeof METRICS)[number];

const metricUnit = (m: Metric) =>
  m === 'weightKg' ? t('nutrition.progress.metricUnits.weightKg') : m === 'bodyFatPercent' ? t('nutrition.progress.metricUnits.bodyFatPercent') : t('nutrition.progress.metricUnits.cm');

function summary(e: ProgressEntry): string {
  const m = e.measurements;
  const parts = [
    m.weightKg !== undefined ? `${formatNumber(m.weightKg)} ${t('clientDetail.kg')}` : null,
    m.bodyFatPercent !== undefined ? `${formatNumber(m.bodyFatPercent)}%${e.bodyFatSource === 'navy' ? ` (${t('nutrition.progress.navyBadge')})` : ''}` : null,
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
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('weightKg');
  const [picked, setPicked] = useState<{ before?: string; after?: string }>({});
  const [picking, setPicking] = useState<'before' | 'after' | null>(null);
  const thumbs = useThumbs(entries);

  const sorted = useMemo(() => [...(entries ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [entries]);
  const records = useMemo(() => {
    const timeline = personalRecordTimeline(workoutLogsToSets(logs ?? []));
    const best = new Map<string, (typeof timeline)[number]['set']>();
    for (const r of timeline) best.set(r.set.exerciseId, r.set);
    return [...best.values()].sort((a, b) => b.performedAt - a.performedAt).slice(0, 10);
  }, [logs]);

  if (client === undefined || entries === undefined) return <PageHeader title="" back={{ to: back, label: t('common.back') }} />;
  if (client === null) return <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />;

  const available = METRICS.filter((m) => sorted.some((e) => e.measurements[m] !== undefined));
  const shown: Metric = available.includes(metric) ? metric : (available[0] ?? 'weightKg');
  const series = sorted.flatMap((e) => {
    const v = e.measurements[shown];
    return v !== undefined ? [{ date: e.date, value: v }] : [];
  });
  const firstV = series[0];
  const lastV = series[series.length - 1];
  const delta = firstV && lastV && series.length > 1 ? Math.round((lastV.value - firstV.value) * 10) / 10 : null;
  const withPhotos = sorted.filter((e) => e.photoIds.length > 0);
  const before = withPhotos.find((e) => e.id === picked.before) ?? withPhotos[0];
  const after = withPhotos.find((e) => e.id === picked.after) ?? (withPhotos.length > 1 ? withPhotos[withPhotos.length - 1] : undefined);
  const thumbOf = (id: string | undefined) => (id ? (thumbs.get(id) ?? id) : id);

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
                <h2 id="w-title" className={common.sectionTitle}><TitleIcon name="chart" />
                  {t('nutrition.progress.chartTitle')}
                </h2>
                {delta !== null && (
                  <Badge tone={delta === 0 ? 'neutral' : 'brand'}>
                    <Tx k="nutrition.progress.metricChange" params={{ n: <Num>{`${delta > 0 ? '+' : ''}${formatNumber(delta)}`}</Num>, unit: metricUnit(shown) }} />
                  </Badge>
                )}
              </div>
              {available.length > 1 && (
                <SegmentedControl
                  label={t('nutrition.progress.metricPick')}
                  value={shown}
                  onChange={setMetric}
                  wrap
                  options={available.map((m) => ({ value: m, label: t(`nutrition.progress.metrics.${m}`) }))}
                />
              )}
              {series.length > 1 && firstV && lastV ? (
                <WeightChart
                  series={series}
                  label={t('nutrition.progress.metricChartLabel', { metric: t(`nutrition.progress.metrics.${shown}`), from: formatIsoDate(firstV.date), to: formatIsoDate(lastV.date) })}
                />
              ) : (
                <p className={common.muted}>{t('nutrition.progress.needTwo')}</p>
              )}
            </div>
          </section>

          <section className={common.section} aria-labelledby="ba-title">
            <h2 id="ba-title" className={common.sectionTitle}><TitleIcon name="image" />
              {t('nutrition.progress.beforeAfter')}
            </h2>
            {before && after ? (
              <>
                <div className={styles.compare}>
                  {[
                    { e: before, label: t('nutrition.progress.before'), side: 'before' as const },
                    { e: after, label: t('nutrition.progress.after'), side: 'after' as const },
                  ].map(({ e, label, side }) => (
                    <button
                      key={side}
                      type="button"
                      className={styles.compareCell}
                      onClick={() => setPicking(side)}
                      aria-label={t('nutrition.progress.pickPhotoLabel', { label })}
                    >
                      <StoredImage imageId={e.photoIds[0]} alt={`${label} ${formatIsoDate(e.date)}`} className={styles.comparePhoto} />
                      <span className={styles.compareCaption}>
                        {label} · {formatIsoDate(e.date)}
                      </span>
                    </button>
                  ))}
                </div>
                {withPhotos.length > 2 && <p className={common.caption}>{t('nutrition.progress.compareHint')}</p>}
              </>
            ) : (
              <p className={common.muted}>{t('nutrition.progress.needPhotos')}</p>
            )}
          </section>

          <ListSection icon="ruler" title={t('nutrition.progress.entries')} count={sorted.length}>
            {[...sorted].reverse().map((e) => (
              <ListRow
                key={e.id}
                leading={e.photoIds[0] ? <StoredImage imageId={thumbOf(e.photoIds[0])} alt="" className={styles.rowThumb} lazy /> : undefined}
                title={formatIsoDate(e.date)}
                subtitle={summary(e) || e.notes}
                trailing={e.source === 'client' ? <Badge>{t('nutrition.progress.fromClient')}</Badge> : undefined}
                onClick={() => setEditing(e)}
              />
            ))}
          </ListSection>
        </>
      )}

      <ListSection icon="award" title={t('nutrition.progress.records')} count={records.length || undefined}>
        {records.length === 0 ? (
          <p className={styles.none}>{t('nutrition.progress.noRecords')}</p>
        ) : (
          records.map((s) => (
            <ListRow leading={<Icon name="award" />}
              key={s.exerciseId}
              onClick={() => setHistoryOf(s.exerciseId)}
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

      {historyOf && (
        <Sheet open onClose={() => setHistoryOf(null)} title={exerciseName(catalog?.byId.get(historyOf), historyOf)} cancelLabel={t('common.close')}>
          {(() => {
            const series = exerciseHistory(logs ?? [], historyOf);
            return series.length > 1 ? (
              <>
                <p className={common.caption}>{t('nutrition.progress.historyHint')}</p>
                <WeightChart series={series} label={t('nutrition.progress.historyHint')} />
              </>
            ) : (
              <p className={common.muted}>{t('nutrition.progress.historyNeedTwo')}</p>
            );
          })()}
        </Sheet>
      )}
      {picking && (
        <Sheet
          open
          onClose={() => setPicking(null)}
          title={picking === 'before' ? t('nutrition.progress.pickBefore') : t('nutrition.progress.pickAfter')}
          cancelLabel={t('common.close')}
        >
          <div className={styles.pickGrid}>
            {[...withPhotos].reverse().map((e) => (
              <button
                key={e.id}
                type="button"
                className={styles.pickCell}
                aria-pressed={(picking === 'before' ? before : after)?.id === e.id}
                onClick={() => {
                  setPicked((p) => ({ ...p, [picking]: e.id }));
                  setPicking(null);
                }}
              >
                <StoredImage imageId={thumbOf(e.photoIds[0])} alt={formatIsoDate(e.date)} className={styles.pickPhoto} lazy />
                <span className={styles.compareCaption}>{formatIsoDate(e.date)}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {editing && <EntrySheet clientId={clientId} entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
