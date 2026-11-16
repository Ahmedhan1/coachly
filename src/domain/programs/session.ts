import { z } from 'zod';
import type { ProgramDay, WorkoutLog } from '../models';
import { checkPersonalRecord, estimateOneRepMax, lastTime, sessionVolume, type LoggedSet, type RecordKind } from '../strength';
import { targetReps } from './reps';
import { normalizeSupersets } from './supersets';

/**
 * Session mode ("وضع الحصة") as a pure state machine. The screen keeps a SessionState, persists it after
 * every change (so a killed app resumes), and turns it into a WorkoutLog at the end. Time always comes in
 * as `now` (epoch ms); the rest timer is computed from timestamps, never from counting intervals.
 */

const sessionSetSchema = z.object({
  weightKg: z.number().min(0).max(1000),
  reps: z.number().int().min(0).max(1000),
  done: z.boolean(),
  doneAt: z.number().int().nonnegative().nullable(),
  /** The trainer changed the weight by hand (pre-filled weights are carried forward only from edited sets). */
  touched: z.boolean(),
});

const sessionExerciseSchema = z.object({
  programItemId: z.string().min(1).max(64).nullable(),
  exerciseId: z.string().min(1).max(120),
  targetReps: z.string().max(20),
  restSec: z.number().int().min(0).max(900),
  tempo: z.string().max(12),
  rpe: z.number().nullable(),
  supersetGroup: z.string().max(4).nullable(),
  sets: z.array(sessionSetSchema).max(30),
  skipped: z.boolean(),
  note: z.string().max(200),
});

const recordSchema = z.object({
  exerciseIndex: z.number().int().nonnegative(),
  setIndex: z.number().int().nonnegative(),
  kinds: z.array(z.enum(['estimatedOneRepMax', 'weight'])),
  weightKg: z.number(),
  reps: z.number().int(),
  estimatedOneRepMax: z.number(),
});

export const sessionStateSchema = z.object({
  version: z.literal(1),
  /** The route's session id: a schedule session id or a generated one. */
  key: z.string().min(1).max(64),
  clientId: z.string().min(1).max(64),
  programId: z.string().min(1).max(64).nullable(),
  dayId: z.string().min(1).max(64).nullable(),
  scheduleSessionId: z.string().min(1).max(64).nullable(),
  startedAt: z.number().int().nonnegative(),
  exercises: z.array(sessionExerciseSchema).max(60),
  current: z.object({ exercise: z.number().int().nonnegative(), set: z.number().int().nonnegative() }).nullable(),
  rest: z.object({ startedAt: z.number().int().nonnegative(), durationSec: z.number().int().min(0).max(1800) }).nullable(),
  lastRecord: recordSchema.nullable(),
  records: z.array(recordSchema).max(200),
});

export type SessionState = z.infer<typeof sessionStateSchema>;
export type SessionExercise = SessionState['exercises'][number];
export type SessionSet = z.infer<typeof sessionSetSchema>;
export type SessionRecord = z.infer<typeof recordSchema>;
export interface SetPosition {
  exercise: number;
  set: number;
}

/** Restores a persisted state; null when it is missing or not valid (e.g. from an older app version). */
export function parseSessionState(value: unknown): SessionState | null {
  const parsed = sessionStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const DEFAULT_REPS = 10;

/** Pre-fill for set `i`: last time's weight for that set (or its last set), reps from the target. */
function prefillSets(count: number, reps: string, previous: readonly LoggedSet[]): SessionSet[] {
  const target = targetReps(reps);
  return Array.from({ length: count }, (_, i) => {
    const last = previous[i] ?? previous[previous.length - 1];
    return {
      weightKg: last?.weightKg ?? 0,
      reps: target ?? last?.reps ?? DEFAULT_REPS,
      done: false,
      doneAt: null,
      touched: false,
    };
  });
}

export interface CreateSessionInput {
  key: string;
  clientId: string;
  programId: string | null;
  day: ProgramDay | null;
  scheduleSessionId: string | null;
  /** Earlier working sets of this client (see workoutLogsToSets). */
  history: readonly LoggedSet[];
  now: number;
}

export function createSession(input: CreateSessionInput): SessionState {
  const items = input.day ? normalizeSupersets(input.day.items) : [];
  const exercises: SessionExercise[] = items.map((item) => {
    const previous = lastTime(input.history, item.exerciseId, input.key, input.now)?.sets ?? [];
    return {
      programItemId: item.id,
      exerciseId: item.exerciseId,
      targetReps: item.reps,
      restSec: item.restSec,
      tempo: item.tempo,
      rpe: item.rpe,
      supersetGroup: item.supersetGroup,
      sets: prefillSets(item.sets, item.reps, previous),
      skipped: false,
      note: '',
    };
  });
  const state: SessionState = {
    version: 1,
    key: input.key,
    clientId: input.clientId,
    programId: input.programId,
    dayId: input.day?.id ?? null,
    scheduleSessionId: input.scheduleSessionId,
    startedAt: input.now,
    exercises,
    current: null,
    rest: null,
    lastRecord: null,
    records: [],
  };
  return { ...state, current: nextPosition(state) };
}

/** Index ranges [start, end) of superset runs and single exercises, in order. */
function blocks(exercises: readonly SessionExercise[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  while (i < exercises.length) {
    const group = (exercises[i] as SessionExercise).supersetGroup;
    let end = i + 1;
    if (group !== null) while (end < exercises.length && (exercises[end] as SessionExercise).supersetGroup === group) end++;
    out.push([i, end]);
    i = end;
  }
  return out;
}

/** The order sets are performed in: straight sets for singles, rounds (A1, A2, A1, A2…) inside a superset. */
export function setOrder(exercises: readonly SessionExercise[]): SetPosition[] {
  const order: SetPosition[] = [];
  for (const [start, end] of blocks(exercises)) {
    const rounds = Math.max(0, ...exercises.slice(start, end).map((e) => e.sets.length));
    if (end - start === 1) {
      for (let s = 0; s < rounds; s++) order.push({ exercise: start, set: s });
      continue;
    }
    for (let s = 0; s < rounds; s++) {
      for (let e = start; e < end; e++) if (s < (exercises[e] as SessionExercise).sets.length) order.push({ exercise: e, set: s });
    }
  }
  return order;
}

const isOpen = (state: Pick<SessionState, 'exercises'>, p: SetPosition): boolean => {
  const ex = state.exercises[p.exercise];
  return !!ex && !ex.skipped && ex.sets[p.set]?.done === false;
};

/** First set still to do (skipped exercises are passed over); null when everything is done. */
export function nextPosition(state: Pick<SessionState, 'exercises'>, after?: SetPosition): SetPosition | null {
  const order = setOrder(state.exercises);
  const from = after ? order.findIndex((p) => p.exercise === after.exercise && p.set === after.set) + 1 : 0;
  return order.slice(from).find((p) => isOpen(state, p)) ?? order.find((p) => isOpen(state, p)) ?? null;
}

/** Rest after a set: none between superset members of the same round; the round's last member rests. */
export function restAfter(exercises: readonly SessionExercise[], p: SetPosition): number {
  const ex = exercises[p.exercise];
  if (!ex) return 0;
  if (ex.supersetGroup === null) return ex.restSec;
  const order = setOrder(exercises);
  const i = order.findIndex((q) => q.exercise === p.exercise && q.set === p.set);
  const next = order[i + 1];
  const sameRound = next !== undefined && next.set === p.set && exercises[next.exercise]?.supersetGroup === ex.supersetGroup;
  return sameRound ? 0 : ex.restSec;
}

const replaceExercise = (state: SessionState, index: number, fn: (e: SessionExercise) => SessionExercise): SessionState => ({
  ...state,
  exercises: state.exercises.map((e, i) => (i === index ? fn(e) : e)),
});

/** Edits the values of a set that is not done yet (the steppers). */
export function editSet(state: SessionState, p: SetPosition, values: { weightKg?: number; reps?: number }): SessionState {
  return replaceExercise(state, p.exercise, (e) => ({
    ...e,
    sets: e.sets.map((s, i) =>
      i === p.set
        ? {
            ...s,
            weightKg: values.weightKg === undefined ? s.weightKg : clamp(round2(values.weightKg), 0, 1000),
            touched: s.touched || values.weightKg !== undefined,
            reps: values.reps === undefined ? s.reps : clamp(Math.round(values.reps), 0, 1000),
          }
        : s,
    ),
  }));
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** This session's done sets plus earlier history, as strength sets (for PR checks and "last time"). */
export function sessionSets(state: SessionState): LoggedSet[] {
  return state.exercises.flatMap((e) =>
    e.sets
      .filter((s) => s.done && s.doneAt !== null)
      .map((s) => ({ exerciseId: e.exerciseId, sessionId: state.key, performedAt: s.doneAt as number, weightKg: s.weightKg, reps: s.reps })),
  );
}

/**
 * Marks the current set done with its entered values, checks for a personal record against `history`
 * (earlier sessions) and this session's earlier sets, carries a hand-edited weight to the next untouched sets,
 * starts the rest timer when one is due, and moves to the next set.
 */
export function completeSet(state: SessionState, history: readonly LoggedSet[], now: number, p: SetPosition | null = state.current): SessionState {
  if (!p) return state;
  const ex = state.exercises[p.exercise];
  const set = ex?.sets[p.set];
  if (!ex || !set || set.done) return state;
  const candidate: LoggedSet = { exerciseId: ex.exerciseId, sessionId: state.key, performedAt: now, weightKg: set.weightKg, reps: set.reps };
  const check = checkPersonalRecord([...history, ...sessionSets(state)], candidate);
  const record: SessionRecord | null = check.isRecord
    ? {
        exerciseIndex: p.exercise,
        setIndex: p.set,
        kinds: check.kinds,
        weightKg: set.weightKg,
        reps: set.reps,
        estimatedOneRepMax: Math.round(estimateOneRepMax(set.weightKg, set.reps) * 10) / 10,
      }
    : null;
  let next = replaceExercise(state, p.exercise, (e) => ({
    ...e,
    skipped: false,
    sets: e.sets.map((s, i) => {
      if (i === p.set) return { ...s, done: true, doneAt: now };
      if (set.touched && i > p.set && !s.done && !s.touched) return { ...s, weightKg: set.weightKg };
      return s;
    }),
  }));
  const restSec = restAfter(next.exercises, p);
  const position = nextPosition(next, p);
  next = {
    ...next,
    current: position,
    rest: restSec > 0 && position !== null ? { startedAt: now, durationSec: restSec } : null,
    lastRecord: record,
    records: record ? [...next.records, record] : next.records,
  };
  return next;
}

/** Undo "done" on a set (tapped by mistake). */
export function reopenSet(state: SessionState, p: SetPosition): SessionState {
  const next = replaceExercise(state, p.exercise, (e) => ({
    ...e,
    sets: e.sets.map((s, i) => (i === p.set ? { ...s, done: false, doneAt: null } : s)),
  }));
  return {
    ...next,
    current: p,
    rest: null,
    lastRecord: null,
    records: next.records.filter((r) => !(r.exerciseIndex === p.exercise && r.setIndex === p.set)),
  };
}

/** Seconds of rest left (rounded up); 0 when there is no rest or it is over. */
export function restRemaining(state: Pick<SessionState, 'rest'>, now: number): number {
  if (!state.rest) return 0;
  const endsAt = state.rest.startedAt + state.rest.durationSec * 1000;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function adjustRest(state: SessionState, deltaSec: number, now: number): SessionState {
  if (!state.rest) return state;
  const elapsed = Math.floor((now - state.rest.startedAt) / 1000);
  const durationSec = clamp(state.rest.durationSec + deltaSec, Math.max(0, elapsed), 1800);
  return { ...state, rest: { ...state.rest, durationSec } };
}

export function endRest(state: SessionState): SessionState {
  return state.rest ? { ...state, rest: null } : state;
}

/** Jump to an exercise: its first open set becomes current (un-skips it). */
export function goToExercise(state: SessionState, index: number): SessionState {
  const ex = state.exercises[index];
  if (!ex) return state;
  const unskipped = ex.skipped ? replaceExercise(state, index, (e) => ({ ...e, skipped: false })) : state;
  const set = ex.sets.findIndex((s) => !s.done);
  return { ...unskipped, current: set >= 0 ? { exercise: index, set } : unskipped.current, rest: null };
}

export function skipExercise(state: SessionState, index: number): SessionState {
  const next = replaceExercise(state, index, (e) => ({ ...e, skipped: true }));
  const position = state.current?.exercise === index ? nextPosition(next, state.current ?? undefined) : nextPosition(next);
  return { ...next, current: position, rest: null };
}

/** Swaps the exercise (e.g. machine taken); open sets get the new exercise's last-time weights. */
export function swapExercise(state: SessionState, index: number, exerciseId: string, history: readonly LoggedSet[], now: number): SessionState {
  const ex = state.exercises[index];
  if (!ex) return state;
  const previous = lastTime(history, exerciseId, state.key, now)?.sets ?? [];
  const fresh = prefillSets(ex.sets.length, ex.targetReps, previous);
  return replaceExercise(state, index, (e) => ({
    ...e,
    exerciseId,
    skipped: false,
    sets: e.sets.map((s, i) => (s.done ? s : (fresh[i] ?? s))),
  }));
}

export function addSet(state: SessionState, index: number): SessionState {
  const next = replaceExercise(state, index, (e) => {
    if (e.sets.length >= 30) return e;
    const last = e.sets[e.sets.length - 1];
    return { ...e, sets: [...e.sets, { weightKg: last?.weightKg ?? 0, reps: last?.reps ?? DEFAULT_REPS, done: false, doneAt: null, touched: false }] };
  });
  return next.current ? next : { ...next, current: nextPosition(next) };
}

export function setNote(state: SessionState, index: number, note: string): SessionState {
  return replaceExercise(state, index, (e) => ({ ...e, note: note.slice(0, 200) }));
}

export interface SessionSummary {
  doneSets: number;
  totalSets: number;
  exercisesDone: number;
  volumeKg: number;
  records: number;
}

export function summarizeSession(state: SessionState): SessionSummary {
  const all = state.exercises.flatMap((e) => (e.skipped ? e.sets.filter((s) => s.done) : e.sets));
  const done = sessionSets(state);
  return {
    doneSets: done.length,
    totalSets: all.length,
    exercisesDone: state.exercises.filter((e) => e.sets.some((s) => s.done)).length,
    volumeKg: Math.round(sessionVolume(done) * 10) / 10,
    records: state.records.length,
  };
}

/** The log to save: exercises with at least one done set (or a note); only done sets are kept. */
export function toWorkoutLogInput(
  state: SessionState,
  date: WorkoutLog['date'],
): Pick<WorkoutLog, 'clientId' | 'date' | 'programId' | 'programDayId' | 'sessionId' | 'exercises'> {
  return {
    clientId: state.clientId as WorkoutLog['clientId'],
    date,
    programId: state.programId as WorkoutLog['programId'],
    programDayId: state.dayId as WorkoutLog['programDayId'],
    sessionId: state.scheduleSessionId as WorkoutLog['sessionId'],
    exercises: state.exercises
      .filter((e) => e.sets.some((s) => s.done) || e.note.trim() !== '')
      .map((e) => ({
        exerciseId: e.exerciseId as WorkoutLog['exercises'][number]['exerciseId'],
        programItemId: e.programItemId as WorkoutLog['exercises'][number]['programItemId'],
        sets: e.sets.filter((s) => s.done).map((s) => ({ reps: s.reps, weightKg: s.weightKg, rpe: null, done: true })),
        note: e.note.trim(),
      })),
  };
}

/**
 * Saved workout logs as strength sets. Logs have no per-set time, so sets are ordered inside the log's
 * creation time (createdAt + index ms), which keeps "last time" and PR checks in the right order.
 */
export function workoutLogsToSets(logs: readonly Pick<WorkoutLog, 'id' | 'createdAt' | 'exercises'>[]): LoggedSet[] {
  return logs.flatMap((log) => {
    let n = 0;
    return log.exercises.flatMap((e) =>
      e.sets
        .filter((s) => s.done)
        .map((s) => ({ exerciseId: e.exerciseId, sessionId: log.id, performedAt: log.createdAt + n++, weightKg: s.weightKg, reps: s.reps })),
    );
  });
}

/** Which program day to run next: the day after the one logged most recently for this program (wraps). */
export function nextProgramDayId(
  days: readonly { id: string }[],
  logs: readonly { programId: string | null; programDayId: string | null; createdAt: number }[],
  programId: string,
): string | null {
  if (days.length === 0) return null;
  const last = logs
    .filter((l) => l.programId === programId && l.programDayId !== null)
    .reduce<{ programDayId: string | null; createdAt: number } | null>((a, b) => (!a || b.createdAt > a.createdAt ? b : a), null);
  const index = last ? days.findIndex((d) => d.id === last.programDayId) : -1;
  return (days[(index + 1) % days.length] ?? days[0])?.id ?? null;
}

/** Display ↔ storage for the trainer's weight unit. Storage is always kg. */
export const LB_PER_KG = 2.2046226218;
export function kgToUnit(kg: number, unit: 'kg' | 'lb'): number {
  return unit === 'kg' ? kg : Math.round(kg * LB_PER_KG * 10) / 10;
}
export function unitToKg(value: number, unit: 'kg' | 'lb'): number {
  return unit === 'kg' ? value : Math.round((value / LB_PER_KG) * 100) / 100;
}
export const WEIGHT_STEP: Readonly<Record<'kg' | 'lb', number>> = { kg: 2.5, lb: 5 };

export type { RecordKind };
