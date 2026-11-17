import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { toIsoDate, type Client, type Program, type WorkoutLog } from '@/domain/models';
import { overloadHint, plannedDay, splitClientPrograms } from '@/domain/clientHub';
import { useGo } from '@/app/nav';
import { readActivePrograms } from '@/features/programs/activePrograms';
import { readSessionDays } from '@/features/schedule/sessionDays';
import { useScheduleWriter } from '@/features/schedule/hooks';
import { deviceZone } from '@/features/schedule/zone';
import { saveWorkout } from './saveWorkout';
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
  parseSessionState,
  reopenSet,
  restRemaining,
  resumeDecision,
  skipExercise,
  swapExercise,
  summarizeSession,
  toWorkoutLogInput,
  unitToKg,
  workoutLogsToSets,
  type SessionState,
} from '@/domain/programs';
import { lastTime, type LoggedSet } from '@/domain/strength';
import { alternativesFor } from '@/domain/exercises';
import { t } from '@/i18n';
import { Button, EmptyState, Icon, IconButton, Num, PageHeader, Sheet, Tx, cx } from '@/ui';
import { useExerciseCatalog } from '@/features/programs/catalog';
import { ExerciseThumb } from '@/features/programs/ExerciseThumb';
import { exerciseName } from '@/features/programs/names';
import { Stepper } from '@/features/programs/Stepper';
import { usePushedScreen } from '@/features/programs/usePushedScreen';
import { useWhatsappLinkBuilder } from '@/features/whatsapp/useWhatsappLink';
import { useRestEndCue, useScreenWakeLock } from './useSessionDevice';
import styles from './Session.module.css';

import { ACTIVE_SESSION_KEY } from './sessionKey';

export { ACTIVE_SESSION_KEY };

interface Loaded {
  client: Client;
  program: Program | null;
  /** The program day this session runs (resolved from the URL, the booking, or the rotation). */
  dayId: string | null;
  history: LoggedSet[];
  logs: WorkoutLog[];
  unit: 'kg' | 'lb';
  saved: SessionState | null;
  /** Name of the client of the saved session (when it is someone else). */
  savedClientName: string | null;
}

/** وضع الحصة: /session/:key?client=&program=&day= (key "new" starts a fresh session). */
export function SessionScreen() {
  usePushedScreen('full');
  const { key = 'new' } = useParams();
  const [params] = useSearchParams();
  const { data, meta } = useServices();
  const clientId = params.get('client') ?? '';
  const programParam = params.get('program');
  const scheduleId = params.get('schedule');
  const dayParam = params.get('day');

  const loaded = useLive<Loaded | null>(async () => {
    const client = await data.repos.clients.get(clientId);
    if (!client) return null;
    // Program: the one asked for, else the booking's, else the client's active program.
    const booking = scheduleId ? await data.repos.sessions.get(scheduleId) : undefined;
    let program = programParam ? ((await data.repos.programs.get(programParam)) ?? null) : null;
    if (!program && booking?.programId) program = (await data.repos.programs.get(booking.programId)) ?? null;
    if (!program && !programParam) {
      const own = await data.repos.programs.listByClient(clientId);
      program = splitClientPrograms(own, clientId, (await readActivePrograms(meta))[clientId]).active;
    }
    const logs = await data.repos.workoutLogs.listByClient(clientId);
    // Day: the one asked for, else the one attached to the booking, else the next in rotation.
    const attached = dayParam ?? (scheduleId ? ((await readSessionDays(meta))[scheduleId] ?? null) : null);
    const dayId = program ? (plannedDay({ days: program.days, attachedDayId: attached, logs, programId: program.id })?.day.id ?? null) : null;
    const settings = await data.repos.settings.get();
    const saved = parseSessionState(await meta.get(ACTIVE_SESSION_KEY));
    const savedClient = saved && saved.clientId !== client.id ? await data.repos.clients.get(saved.clientId) : null;
    const savedClientName = savedClient ? savedClient.name : saved ? client.name : null;
    return { client, program, dayId, history: workoutLogsToSets(logs), unit: settings.units.weight, saved, savedClientName, logs };
  }, [data, meta, clientId, programParam, scheduleId, dayParam]);

  if (loaded === undefined) return <PageHeader title={t('training.session.loading')} back={{ to: '/', label: t('training.session.backHome') }} />;
  if (loaded === null) {
    return (
      <>
        <PageHeader title="" back={{ to: '/', label: t('training.session.backHome') }} />
        <EmptyState icon="timer" title={t('training.session.notFoundTitle')} body={t('training.session.notFoundBody')} />
      </>
    );
  }
  return <SessionRunner key={key} routeKey={key} dayParam={dayParam} scheduleId={scheduleId} {...loaded} />;
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
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [active]);
  return now;
}

function SessionRunner({ client, program, dayId: resolvedDayId, history, unit, saved, savedClientName, routeKey, dayParam, scheduleId }: RunnerProps) {
  const { data, meta } = useServices();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const catalog = useExerciseCatalog();
  const prLink = useWhatsappLinkBuilder('record');
  const writer = useScheduleWriter();
  const go = useGo();
  const [attendance, setAttendance] = useState<{ left: number; total: number } | null | 'none'>(null);
  const byId = catalog?.byId ?? new Map();
  const [phase, setPhase] = useState<'run' | 'summary' | 'saved'>('run');
  const [saving, setSaving] = useState(false);
  const announcedResume = useRef(false);
  const [swapping, setSwapping] = useState<number | null>(null);

  const fresh = (): SessionState | null => {
    if (!program) return null;
    const dayId = resolvedDayId;
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
  };
  const [decision] = useState(() => resumeDecision(saved, { routeKey, clientId: client.id, dayId: dayParam }, Date.now()));
  // An unsaved session with work in it is never overwritten silently.
  const [pending, setPending] = useState<SessionState | null>(() => (decision === 'ask' ? saved : null));
  const [state, setState] = useState<SessionState | null>(() => (decision === 'resume' ? saved : decision === 'ask' ? null : fresh()));

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

  const now = useTick(state?.rest != null);
  const restLeft = state ? restRemaining(state, now) : 0;
  useScreenWakeLock(state !== null && phase === 'run');
  useRestEndCue(restLeft);

  const back = { to: `/clients/${client.id}`, label: client.name };
  if (pending) {
    const done = pending.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
    const startNew = () => {
      setPending(null);
      setState(fresh());
    };
    return (
      <>
        <PageHeader title={t('training.session.title')} back={back} />
        <EmptyState
          icon="timer"
          title={t('training.session.pendingTitle', { name: savedClientName ?? '' })}
          body={t('training.session.pendingBody', { n: done })}
          action={
            <div className={styles.pendingActions}>
              <Button
                block
                onClick={() =>
                  navigate(
                    `/session/${encodeURIComponent(pending.key)}?client=${pending.clientId}${pending.programId ? `&program=${pending.programId}` : ''}`,
                    { replace: true },
                  )
                }
              >
                {t('training.session.pendingResume')}
              </Button>
              <Button
                block
                variant="secondary"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await data.repos.workoutLogs.create(toWorkoutLogInput(pending, toIsoDate(new Date(pending.startedAt))));
                    showToast({ message: t('training.session.pendingSaved'), duration: 2500 });
                    startNew();
                  } catch {
                    showToast({ message: t('training.session.saveError') });
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {t('training.session.pendingSaveAndNew')}
              </Button>
              <Button block variant="plain" onClick={startNew}>
                {t('training.session.pendingDiscard')}
              </Button>
            </div>
          }
        />
      </>
    );
  }
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
  const hint = ex && prev ? overloadHint(prev.sets, ex.targetReps, unitToKg(unit === 'kg' ? 2.5 : 5, unit)) : null;
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
      const result = await saveWorkout({ repos: data.repos, writer, clock: deviceZone().clock }, state, toIsoDate(new Date()), new Date());
      await meta.set(ACTIVE_SESSION_KEY, null);
      const pkg = result.client?.package;
      setAttendance(pkg && pkg.totalSessions > 0 && result.client ? { left: result.client.remainingSessions, total: pkg.totalSessions } : 'none');
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
        {attendance !== null && (
          <p data-testid="attendance-saved">
            {t('hub.session.attendanceSaved', { name: client.name })}
            {attendance !== 'none' && (
              <>
                {' · '}
                <Tx k="hub.session.leftOf" params={{ left: attendance.left, total: attendance.total }} />
              </>
            )}
          </p>
        )}
        {summary.records > 0 && client.phone && (
          <a className={styles.waLink} href={prLink(client)} target="_blank" rel="noreferrer">
            <Icon name="chat" />
            {t('training.session.whatsappPr')}
          </a>
        )}
        <Button block onClick={() => navigate(`/clients/${client.id}?tab=training`, { replace: true })}>
          {t('hub.session.openClient', { name: client.name })}
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
          <button type="button" className={styles.client} onClick={() => go(`/clients/${client.id}`)}>
            {client.name}
          </button>
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
          {hint && (
            <p className={styles.last} data-testid="overload-hint">
              {t('hub.session.suggestion')}:{' '}
              {hint.kind === 'add_weight' ? (
                <Tx k="hub.session.suggestAddWeight" params={{ w: <Num>{kgToUnit(hint.weightKg, unit)}</Num> }} />
              ) : (
                <Tx k="hub.session.suggestAddReps" params={{ w: <Num>{`${kgToUnit(hint.weightKg, unit)}×${hint.reps}`}</Num> }} />
              )}
            </p>
          )}

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
                  {!finished && catalog && (
                    <Button size="small" variant="plain" onClick={() => setSwapping(i)}>
                      {t('training.session.swap')}
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

      {swapping !== null && catalog && state.exercises[swapping] && (
        <Sheet open onClose={() => setSwapping(null)} title={t('training.programs.picker.swapTitle')} cancelLabel={t('common.cancel')}>
          <ul className={styles.altList}>
            {(() => {
              const cur = byId.get(state.exercises[swapping]?.exerciseId ?? '');
              return cur ? alternativesFor(cur, catalog.list, { limit: 8 }) : [];
            })().map((alt) => (
              <li key={alt.id}>
                <button
                  type="button"
                  className={styles.altRow}
                  onClick={() => {
                    const index = swapping;
                    setSwapping(null);
                    update((s) => swapExercise(s, index, alt.id, history, Date.now()));
                  }}
                >
                  <ExerciseThumb exercise={alt} size="sm" />
                  <span>{exerciseName(alt, alt.id)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
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

