import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { toIsoDate, type Client, type Program, type WorkoutLog } from '@/domain/models';
import {
  addSet,
  adjustRest,
  completeSet,
  createSession,
  editSet,
  endRest,
  goToExercise,
  kgToUnit,
  nextPosition,
  nextProgramDayId,
  parseSessionState,
  reopenSet,
  restRemaining,
  skipExercise,
  summarizeSession,
  toWorkoutLogInput,
  unitToKg,
  workoutLogsToSets,
  type SessionState,
} from '@/domain/programs';
import { lastTime, type LoggedSet } from '@/domain/strength';
import { t } from '@/i18n';
import { Button, EmptyState, Icon, IconButton, Num, PageHeader, Sheet, Tx, cx } from '@/ui';
import { useExerciseCatalog } from '@/features/programs/catalog';
import { ExerciseThumb } from '@/features/programs/ExerciseThumb';
import { exerciseName } from '@/features/programs/names';
import { Stepper } from '@/features/programs/Stepper';
import { usePushedScreen } from '@/features/programs/usePushedScreen';
import { useWhatsappLinkBuilder } from '@/features/whatsapp/useWhatsappLink';
import styles from './Session.module.css';

/** Meta key of the running session: one at a time, survives the app being killed. */
export const ACTIVE_SESSION_KEY = 'session.active';

interface Loaded {
  client: Client;
  program: Program | null;
  history: LoggedSet[];
  logs: WorkoutLog[];
  unit: 'kg' | 'lb';
  saved: SessionState | null;
}

/** وضع الحصة: /session/:key?client=&program=&day= (key "new" starts a fresh session). */
export function SessionScreen() {
  usePushedScreen('full');
  const { key = 'new' } = useParams();
  const [params] = useSearchParams();
  const { data, meta } = useServices();
  const clientId = params.get('client') ?? '';
  const programId = params.get('program');

  const loaded = useLive<Loaded | null>(async () => {
    const client = await data.repos.clients.get(clientId);
    if (!client) return null;
    const program = programId ? ((await data.repos.programs.get(programId)) ?? null) : null;
    const logs = await data.repos.workoutLogs.listByClient(clientId);
    const settings = await data.repos.settings.get();
    const saved = parseSessionState(await meta.get(ACTIVE_SESSION_KEY));
    return { client, program, history: workoutLogsToSets(logs), unit: settings.units.weight, saved, logs };
  }, [data, meta, clientId, programId]);

  if (loaded === undefined) return <PageHeader title={t('training.session.loading')} back={{ to: '/', label: t('training.session.backHome') }} />;
  if (loaded === null) {
    return (
      <>
        <PageHeader title="" back={{ to: '/', label: t('training.session.backHome') }} />
        <EmptyState icon="timer" title={t('training.session.notFoundTitle')} body={t('training.session.notFoundBody')} />
      </>
    );
  }
  return <SessionRunner key={key} routeKey={key} dayParam={params.get('day')} scheduleId={params.get('schedule')} {...loaded} />;
}

interface RunnerProps extends Loaded {
  routeKey: string;
  dayParam: string | null;
  scheduleId: string | null;
}

function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [active]);
  return active ? now : Date.now();
}

function SessionRunner({ client, program, history, logs, unit, saved, routeKey, dayParam, scheduleId }: RunnerProps) {
  const { data, meta } = useServices();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const catalog = useExerciseCatalog();
  const prLink = useWhatsappLinkBuilder('record');
  const byId = catalog?.byId ?? new Map();
  const [phase, setPhase] = useState<'run' | 'summary' | 'saved'>('run');
  const [saving, setSaving] = useState(false);
  const announcedResume = useRef(false);

  const [state, setState] = useState<SessionState | null>(() => {
    if (saved && saved.clientId === client.id && (routeKey === 'new' || saved.key === routeKey)) return saved;
    if (!program) return null;
    const dayId = dayParam ?? nextProgramDayId(program.days, logs, program.id);
    const day = program.days.find((d) => d.id === dayId) ?? program.days[0] ?? null;
    return createSession({
      key: routeKey === 'new' ? crypto.randomUUID() : routeKey,
      clientId: client.id,
      programId: program.id,
      day,
      scheduleSessionId: scheduleId,
      history,
      now: Date.now(),
    });
  });

  useEffect(() => {
    if (saved && state === saved && !announcedResume.current) {
      announcedResume.current = true;
      showToast({ message: t('training.session.resumed'), duration: 2500 });
    }
  }, [saved, state, showToast]);

  // Persist after every change so a killed app resumes where it was.
  useEffect(() => {
    if (state && phase !== 'saved') void meta.set(ACTIVE_SESSION_KEY, state);
  }, [state, meta, phase]);

  const resting = state ? restRemaining(state, Date.now()) > 0 : false;
  const now = useTick(resting);

  const back = { to: `/clients/${client.id}`, label: client.name };
  if (!state) {
    return (
      <>
        <PageHeader title={t('training.session.title')} back={back} />
        <EmptyState
          icon="list"
          title={t('training.session.noProgramTitle')}
          body={t('training.session.noProgramBody')}
          action={<Button onClick={() => navigate(`/more/programs?client=${client.id}`)}>{t('training.session.buildProgram')}</Button>}
        />
      </>
    );
  }
  if (state.exercises.length === 0) {
    return (
      <>
        <PageHeader title={t('training.session.title')} back={back} />
        <EmptyState
          icon="dumbbell"
          title={t('training.session.emptyDayTitle')}
          body={t('training.session.emptyDayBody')}
          action={program ? <Button onClick={() => navigate(`/programs/${program.id}`)}>{t('training.session.openProgram')}</Button> : undefined}
        />
      </>
    );
  }

  const update = (fn: (s: SessionState) => SessionState) => setState((s) => (s ? fn(s) : s));
  const cur = state.current;
  const ex = cur ? state.exercises[cur.exercise] : undefined;
  const set = cur && ex ? ex.sets[cur.set] : undefined;
  const exercise = ex ? byId.get(ex.exerciseId) : undefined;
  const name = ex ? exerciseName(exercise, ex.exerciseId) : '';
  const prev = ex ? lastTime(history, ex.exerciseId, state.key, state.startedAt) : null;
  const left = restRemaining(state, now);
  const upNext = cur ? nextPosition(state, cur) : null;
  const upNextEx = upNext ? state.exercises[upNext.exercise] : undefined;
  const summary = summarizeSession(state);
  const step = unit === 'kg' ? 2.5 : 5;

  const onDone = () => {
    const next = completeSet(state, history, Date.now());
    setState(next);
    if (next.lastRecord && next.lastRecord !== state.lastRecord) {
      showToast({ message: `${t('training.session.pr')} · ${name}`, duration: 3500 });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await data.repos.workoutLogs.create(toWorkoutLogInput(state, toIsoDate(new Date())));
      await meta.set(ACTIVE_SESSION_KEY, null);
      setPhase('saved');
    } catch {
      showToast({ message: t('training.session.saveError') });
    } finally {
      setSaving(false);
    }
  };

  if (phase === 'saved') {
    return (
      <div className={styles.done}>
        <Icon name="check" />
        <h1>{t('training.session.savedTitle')}</h1>
        <p>{t('training.session.savedBody')}</p>
        {summary.records > 0 && client.phone && (
          <a className={styles.waLink} href={prLink(client)} target="_blank" rel="noreferrer">
            <Icon name="chat" />
            {t('training.session.whatsappPr')}
          </a>
        )}
        <Button block onClick={() => navigate(`/clients/${client.id}`, { replace: true })}>
          {client.name}
        </Button>
        <Button block variant="plain" onClick={() => navigate('/', { replace: true })}>
          {t('training.session.backHome')}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <IconButton icon="close" label={t('training.session.close')} onClick={() => navigate(back.to)} />
        <div className={styles.topText}>
          <p className={styles.client}>{client.name}</p>
          <p className={styles.progress}>
            <Tx k="training.session.summarySets" params={{ done: summary.doneSets, total: summary.totalSets }} />
          </p>
        </div>
        <Button size="small" variant="secondary" onClick={() => setPhase('summary')}>
          {t('training.session.finish')}
        </Button>
      </header>

      {ex && set && cur ? (
        <section className={styles.current} aria-label={name}>
          <div className={styles.exHead}>
            <ExerciseThumb exercise={exercise} size="md" />
            <div className={styles.exText}>
              <p className={styles.counter}>
                <Tx k="training.session.exerciseOf" params={{ n: cur.exercise + 1, total: state.exercises.length }} />
              </p>
              <h1 className={styles.exName}>{name}</h1>
              <p className={styles.counter}>
                <Tx k="training.session.setOf" params={{ n: cur.set + 1, total: ex.sets.length }} />
                {ex.targetReps && (
                  <>
                    {' · '}
                    <Tx k="training.session.target" params={{ reps: ex.targetReps }} />
                  </>
                )}
              </p>
            </div>
          </div>

          <p className={styles.last}>
            {prev ? (
              <>
                {t('training.session.lastTime')}:{' '}
                {prev.sets.map((s, i) => (
                  <span key={i} className={styles.lastSet}>
                    <Num>{`${kgToUnit(s.weightKg, unit)}×${s.reps}`}</Num>
                  </span>
                ))}
              </>
            ) : (
              t('training.session.firstTime')
            )}
          </p>

          <div className={styles.steppers}>
            <Stepper
              size="big"
              label={t('training.session.weight')}
              unit={t(`training.session.units.${unit}`)}
              value={kgToUnit(set.weightKg, unit)}
              step={step}
              decimals
              max={unit === 'kg' ? 500 : 1100}
              decreaseLabel={t('training.session.decreaseWeight')}
              increaseLabel={t('training.session.increaseWeight')}
              onChange={(v) => update((s) => editSet(s, cur, { weightKg: unitToKg(v, unit) }))}
              testId="weight"
            />
            <Stepper
              size="big"
              label={t('training.session.reps')}
              value={set.reps}
              step={1}
              max={100}
              decreaseLabel={t('training.session.decreaseReps')}
              increaseLabel={t('training.session.increaseReps')}
              onChange={(v) => update((s) => editSet(s, cur, { reps: v }))}
              testId="reps"
            />
          </div>

          <Button size="large" block icon="check" onClick={onDone}>
            {t('training.session.doneSet')}
          </Button>
          {upNextEx && (
            <p className={styles.upNext}>{t('training.session.upNext', { name: exerciseName(byId.get(upNextEx.exerciseId), upNextEx.exerciseId) })}</p>
          )}
        </section>
      ) : (
        <section className={styles.allDone}>
          <Icon name="check" />
          <h1>{t('training.session.allDone')}</h1>
          <p>{t('training.session.allDoneBody')}</p>
          <Button size="large" block onClick={() => setPhase('summary')}>
            {t('training.session.finish')}
          </Button>
        </section>
      )}

      <section className={styles.list} aria-labelledby="ex-list">
        <h2 id="ex-list" className={styles.listTitle}>
          {t('training.session.exercises')}
        </h2>
        <ol className={styles.exList}>
          {state.exercises.map((e, i) => {
            const en = exerciseName(byId.get(e.exerciseId), e.exerciseId);
            const finished = e.sets.every((s) => s.done);
            return (
              <li key={`${e.programItemId ?? e.exerciseId}-${i}`} className={cx(styles.exRow, cur?.exercise === i && styles.exRowOn)}>
                <button type="button" className={styles.exRowMain} onClick={() => update((s) => goToExercise(s, i))}>
                  <span className={styles.exRowName}>{en}</span>
                  {e.skipped && <span className={styles.badge}>{t('training.session.skipped')}</span>}
                  {finished && !e.skipped && <span className={styles.badge}>{t('training.session.exerciseDoneBadge')}</span>}
                </button>
                <span className={styles.chips}>
                  {e.sets.map((s, j) => (
                    <button
                      key={j}
                      type="button"
                      className={cx(styles.setChip, s.done && styles.setChipDone)}
                      disabled={!s.done}
                      aria-label={s.done ? t('training.session.reopenSet', { n: j + 1, name: en }) : t('training.session.setChip', { n: j + 1 })}
                      onClick={() => update((st) => reopenSet(st, { exercise: i, set: j }))}
                    >
                      <Num>{s.done ? `${kgToUnit(s.weightKg, unit)}×${s.reps}` : j + 1}</Num>
                    </button>
                  ))}
                </span>
                <span className={styles.rowActions}>
                  <Button size="small" variant="plain" onClick={() => update((s) => addSet(s, i))}>
                    {t('training.session.addSet')}
                  </Button>
                  {!finished && !e.skipped && (
                    <Button size="small" variant="plain" onClick={() => update((s) => skipExercise(s, i))}>
                      {t('training.session.skip')}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {left > 0 && (
        <div className={styles.rest} role="timer" aria-label={t('training.session.restLabel')}>
          <p className={styles.restTitle}>{t('training.session.rest')}</p>
          <p className={styles.restClock}>
            <Num>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</Num>
          </p>
          <div className={styles.restRow}>
            <Button variant="secondary" onClick={() => update((s) => adjustRest(s, -15, Date.now()))} aria-label={t('training.session.restMinus')}>
              −15
            </Button>
            <Button variant="secondary" onClick={() => update((s) => adjustRest(s, 15, Date.now()))} aria-label={t('training.session.restPlus')}>
              +15
            </Button>
          </div>
          {ex && <p className={styles.restNext}>{t('training.session.upNext', { name })}</p>}
          <Button size="large" block onClick={() => update(endRest)}>
            {t('training.session.skipRest')}
          </Button>
        </div>
      )}

      {phase === 'summary' && (
        <Sheet open onClose={() => setPhase('run')} title={t('training.session.summaryTitle')} cancelLabel={t('training.session.keepGoing')}>
          <dl className={styles.summary}>
            <div>
              <dt>{t('training.session.exercises')}</dt>
              <dd>
                <Tx k="training.session.summarySets" params={{ done: summary.doneSets, total: summary.totalSets }} />
              </dd>
            </div>
            <div>
              <dt>{t('training.session.weight')}</dt>
              <dd>
                <Tx k="training.session.summaryVolume" params={{ n: `${kgToUnit(summary.volumeKg, unit)} ${t(`training.session.units.${unit}`)}` }} />
              </dd>
            </div>
            {summary.records > 0 && (
              <div>
                <dt>{t('training.session.pr')}</dt>
                <dd>
                  <Tx k="training.session.summaryRecords" params={{ n: summary.records }} />
                </dd>
              </div>
            )}
          </dl>
          <Button size="large" block disabled={saving || summary.doneSets === 0} onClick={() => void save()}>
            {t('training.session.save')}
          </Button>
        </Sheet>
      )}
    </div>
  );
}

export function useActiveSession(): SessionState | null | undefined {
  const { meta } = useServices();
  return useLive(async () => parseSessionState(await meta.get(ACTIVE_SESSION_KEY)), [meta]);
}

