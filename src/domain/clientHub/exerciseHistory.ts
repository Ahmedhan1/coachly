import { DEFAULT_EPLEY_DIVISOR, estimateOneRepMax } from '../strength/oneRepMax';

/** One client's history of one exercise, from their saved workout logs (only done sets count). */
export interface LogLike {
  id: string;
  date: string;
  createdAt: number;
  exercises: ReadonlyArray<{ exerciseId: string; sets: ReadonlyArray<{ weightKg: number; reps: number; done: boolean }> }>;
}

export interface SetValue {
  weightKg: number;
  reps: number;
}

export interface ExerciseSessionEntry {
  logId: string;
  date: string;
  sets: SetValue[];
  best: SetValue;
  bestE1rm: number;
  volumeKg: number;
}

export interface ExerciseHistory {
  /** Newest first. */
  entries: ExerciseSessionEntry[];
  bestE1rm: number;
  bestWeightKg: number;
  /** Best estimated 1RM per session, oldest first (chart order). */
  series: Array<{ date: string; value: number }>;
}

export type Trend = 'up' | 'down' | 'flat';

export interface TrainedExercise {
  exerciseId: string;
  sessions: number;
  lastDate: string;
  lastBest: SetValue;
  bestE1rm: number;
  /** Last session's best 1RM against the one before; null with a single session. */
  trend: Trend | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function bestOf(sets: readonly SetValue[], divisor: number): { best: SetValue; e1rm: number } {
  let best = sets[0] ?? { weightKg: 0, reps: 0 };
  let e1rm = estimateOneRepMax(best.weightKg, best.reps, divisor);
  for (const s of sets.slice(1)) {
    const v = estimateOneRepMax(s.weightKg, s.reps, divisor);
    const better = v > e1rm || (v === e1rm && (s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)));
    if (better) {
      best = s;
      e1rm = v;
    }
  }
  return { best, e1rm };
}

function entriesFor(logs: readonly LogLike[], exerciseId: string, divisor: number): ExerciseSessionEntry[] {
  const out: Array<ExerciseSessionEntry & { at: number }> = [];
  for (const log of logs) {
    const sets = log.exercises
      .filter((e) => e.exerciseId === exerciseId)
      .flatMap((e) => e.sets.filter((s) => s.done).map((s) => ({ weightKg: s.weightKg, reps: s.reps })));
    if (sets.length === 0) continue;
    const { best, e1rm } = bestOf(sets, divisor);
    out.push({
      logId: log.id,
      date: log.date,
      sets,
      best: { ...best },
      bestE1rm: e1rm,
      volumeKg: round1(sets.reduce((n, s) => n + s.weightKg * s.reps, 0)),
      at: log.createdAt,
    });
  }
  out.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  return out.map(({ at: _at, ...entry }) => entry);
}

export function exerciseHistory(logs: readonly LogLike[], exerciseId: string, divisor: number = DEFAULT_EPLEY_DIVISOR): ExerciseHistory {
  const entries = entriesFor(logs, exerciseId, divisor);
  return {
    entries,
    bestE1rm: entries.reduce((n, e) => Math.max(n, e.bestE1rm), 0),
    bestWeightKg: entries.reduce((n, e) => Math.max(n, ...e.sets.map((s) => s.weightKg)), 0),
    series: [...entries].reverse().map((e) => ({ date: e.date, value: round1(e.bestE1rm) })),
  };
}

function trendOf(last: number, before: number | undefined): Trend | null {
  if (before === undefined) return null;
  if (before === 0 && last === 0) return 'flat';
  const change = before === 0 ? 1 : (last - before) / before;
  return change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat';
}

export function trainedExercises(logs: readonly LogLike[], divisor: number = DEFAULT_EPLEY_DIVISOR): TrainedExercise[] {
  const ids = new Set(logs.flatMap((l) => l.exercises.filter((e) => e.sets.some((s) => s.done)).map((e) => e.exerciseId)));
  const out: TrainedExercise[] = [];
  for (const exerciseId of ids) {
    const entries = entriesFor(logs, exerciseId, divisor);
    const last = entries[0];
    if (!last) continue;
    out.push({
      exerciseId,
      sessions: entries.length,
      lastDate: last.date,
      lastBest: last.best,
      bestE1rm: entries.reduce((n, e) => Math.max(n, e.bestE1rm), 0),
      trend: trendOf(last.bestE1rm, entries[1]?.bestE1rm),
    });
  }
  return out.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.sessions - a.sessions);
}
