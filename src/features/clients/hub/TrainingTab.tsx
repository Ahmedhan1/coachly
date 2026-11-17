import { useState } from 'react';
import { trainedExercises, type Trend } from '@/domain/clientHub';
import type { Client, Program } from '@/domain/models';
import { displayReps, kgToUnit } from '@/domain/programs';
import { t } from '@/i18n';
import { Badge, Button, Icon, ListRow, ListSection, Num, Tx, cx } from '@/ui';
import { formatNumber } from '@/ui/format';
import { useExerciseCatalog } from '@/features/programs/catalog';
import { exerciseName, programDayName } from '@/features/programs/names';
import { programUrl, sessionUrl } from './links';
import type { HubData } from './useHubData';
import styles from './Hub.module.css';

export interface TrainingTabProps {
  client: Client;
  hub: HubData;
  scheduleId: string | null;
  go: (to: string) => void;
  onChooseProgram: () => void;
  onNewProgram: () => void;
  onMakeActive: (program: Program) => void;
  onOpenExercise: (exerciseId: string) => void;
}

const HISTORY_STEP = 12;

const daysLabel = (n: number) => (n === 1 ? t('training.programs.oneDay') : t('training.programs.days', { n }));

function TrendText({ trend }: { trend: Trend | null }) {
  if (!trend) return null;
  return <span className={cx(styles.trend, trend === 'up' && styles.upTrend, trend === 'down' && styles.downTrend)}>{t(`hub.training.trend.${trend}`)}</span>;
}

export function TrainingTab({ client, hub, scheduleId, go, onChooseProgram, onNewProgram, onMakeActive, onOpenExercise }: TrainingTabProps) {
  const program = hub.programs.active;
  // The exercise pack is big: it is read only when this tab opens, not with the client screen.
  const catalog = useExerciseCatalog();
  const byId = catalog?.byId;
  const name = (id: string) => exerciseName(byId?.get(id), id);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(hub.nextDay ? [hub.nextDay.dayId] : []));
  const [historyShown, setHistoryShown] = useState(HISTORY_STEP);
  const history = trainedExercises(hub.logs);
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const unit = hub.unit;
  const unitLabel = t(`training.session.units.${unit}`);

  return (
    <>
      {program ? (
        <ListSection
          title={t('hub.training.active')}
          action={
            <Button size="small" variant="plain" icon="list" onClick={onChooseProgram}>
              {t('hub.training.choose')}
            </Button>
          }
        >
          <ListRow
            leading={<Icon name="list" />}
            title={program.name}
            subtitle={daysLabel(program.days.length)}
            to={programUrl(program.id)}
          />
          <ol className={styles.dayItems} aria-label={t('hub.training.days')}>
            {program.days.map((day) => {
              const label = programDayName(program.days, day.id);
              const isNext = hub.nextDay?.dayId === day.id;
              const expanded = open.has(day.id);
              return (
                <li key={day.id} className={styles.day}>
                  <div className={styles.dayHead}>
                    <button type="button" className={styles.daySummary} aria-expanded={expanded} aria-label={t('hub.training.expandDay', { day: label })} onClick={() => toggle(day.id)}>
                      <span className={styles.dayName}>
                        {label} {isNext && <Badge tone="brand">{t('hub.training.nextDay')}</Badge>}
                      </span>
                      <span className={styles.daySub}>
                        <Tx k="hub.training.dayExercises" params={{ n: day.items.length }} />
                      </span>
                    </button>
                    {day.items.length > 0 && (
                      <Button
                        size="small"
                        variant={isNext ? 'primary' : 'secondary'}
                        className={styles.startBtn}
                        aria-label={t('hub.training.startDay', { day: label })}
                        onClick={() => go(sessionUrl({ clientId: client.id, programId: program.id, dayId: day.id, scheduleId }))}
                      >
                        {t('hub.training.startShort')}
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <ul className={styles.dayItems}>
                      {day.items.map((item) => (
                        <li key={item.id}>
                          <button type="button" className={styles.exRow} onClick={() => onOpenExercise(item.exerciseId)}>
                            <span className={styles.exName}>{name(item.exerciseId)}</span>
                            <span className={styles.exSpec}>
                              <Num>{t('hub.training.sets', { sets: item.sets, reps: displayReps(item.reps) })}</Num>
                            </span>
                            <Icon name="chevronForward" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </ListSection>
      ) : (
        <ListSection title={t('hub.training.active')}>
          <div className={styles.emptyTile}>
            <p className={styles.emptyTitle}>{t('hub.training.none')}</p>
            <p className={styles.emptyBody}>{t('hub.training.noneBody')}</p>
            <div className={styles.actionsRow}>
              <Button icon="list" onClick={onChooseProgram}>
                {t('hub.training.choose')}
              </Button>
              <Button variant="secondary" icon="plus" onClick={onNewProgram}>
                {t('hub.training.build')}
              </Button>
            </div>
          </div>
        </ListSection>
      )}

      {hub.programs.past.length > 0 && (
        <ListSection title={t('hub.training.past')} count={hub.programs.past.length}>
          {hub.programs.past.map((p) => (
            <div key={p.id} className={styles.splitRow}>
              <ListRow leading={<Icon name="list" />} title={p.name} subtitle={daysLabel(p.days.length)} to={programUrl(p.id)} className={styles.splitMain} />
              <Button size="small" variant="secondary" className={styles.splitAction} aria-label={t('hub.training.makeActiveFor', { name: p.name })} onClick={() => onMakeActive(p)}>
                {t('hub.training.makeActive')}
              </Button>
            </div>
          ))}
        </ListSection>
      )}

      <ListSection title={t('hub.training.history')} count={history.length || undefined}>
        {history.length === 0 ? (
          <p className={styles.emptyTile}>{t('hub.training.historyEmpty')}</p>
        ) : (
          history.slice(0, historyShown).map((h) => (
            <ListRow
              key={h.exerciseId}
              leading={<Icon name="dumbbell" />}
              title={name(h.exerciseId)}
              subtitle={
                <>
                  <Tx k="hub.training.sessionsCount" params={{ n: h.sessions }} />
                  {' · '}
                  <Tx k="hub.training.lastBest" params={{ set: <Num>{`${kgToUnit(h.lastBest.weightKg, unit)}×${h.lastBest.reps}`}</Num> }} />
                </>
              }
              trailing={
                <span>
                  {h.bestE1rm > 0 && (
                    <>
                      <Num>{formatNumber(Math.round(kgToUnit(h.bestE1rm, unit)))}</Num> {unitLabel}{' '}
                    </>
                  )}
                  <TrendText trend={h.trend} />
                </span>
              }
              onClick={() => onOpenExercise(h.exerciseId)}
            />
          ))
        )}
        {history.length > historyShown && (
          <div className={styles.more}>
            <Button size="small" variant="plain" onClick={() => setHistoryShown((n) => n + HISTORY_STEP)}>
              {t('hub.training.showMore', { n: history.length - historyShown })}
            </Button>
          </div>
        )}
      </ListSection>
    </>
  );
}
