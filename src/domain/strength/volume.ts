import { DEFAULT_EPLEY_DIVISOR, estimateOneRepMax } from './oneRepMax';
import type { LoggedSet } from './types';

/** Σ weight × reps over working sets (warm-ups excluded). */
export function sessionVolume(sets: readonly LoggedSet[]): number {
  return sets.reduce((sum, s) => (s.isWarmup ? sum : sum + s.weightKg * s.reps), 0);
}

export interface ExerciseSummary {
  sessionId: string;
  performedAt: number;
  sets: LoggedSet[];
  volume: number;
  topWeightKg: number;
  bestEstimatedOneRepMax: number;
  totalReps: number;
}

export interface Comparison {
  previous: ExerciseSummary;
  current: ExerciseSummary;
  volumeDelta: number;
  topWeightDelta: number;
  estimatedOneRepMaxDelta: number;
  totalRepsDelta: number;
}

function summarize(sets: LoggedSet[], divisor: number): ExerciseSummary | null {
  const working = sets.filter((s) => !s.isWarmup);
  const first = working[0];
  if (!first) return null;
  return {
    sessionId: first.sessionId,
    performedAt: Math.min(...working.map((s) => s.performedAt)),
    sets: working,
    volume: sessionVolume(working),
    topWeightKg: Math.max(...working.map((s) => s.weightKg)),
    bestEstimatedOneRepMax: Math.max(...working.map((s) => estimateOneRepMax(s.weightKg, s.reps, divisor))),
    totalReps: working.reduce((n, s) => n + s.reps, 0),
  };
}

/** Latest earlier session's working sets for `exerciseId`, i.e. the "last time" shown in session mode. */
export function lastTime(
  history: readonly LoggedSet[],
  exerciseId: string,
  currentSessionId: string,
  before: number,
  divisor: number = DEFAULT_EPLEY_DIVISOR,
): ExerciseSummary | null {
  const prior = history.filter(
    (s) => s.exerciseId === exerciseId && s.sessionId !== currentSessionId && s.performedAt < before && !s.isWarmup,
  );
  if (prior.length === 0) return null;
  const latest = prior.reduce((a, b) => (b.performedAt > a.performedAt ? b : a));
  return summarize(
    prior.filter((s) => s.sessionId === latest.sessionId),
    divisor,
  );
}

/**
 * Compare the current session's sets of one exercise with the previous session that had it.
 * Returns null when there is no current working set or no earlier session.
 */
export function compareToLastTime(
  history: readonly LoggedSet[],
  currentSets: readonly LoggedSet[],
  exerciseId: string,
  divisor: number = DEFAULT_EPLEY_DIVISOR,
): Comparison | null {
  const current = summarize(
    currentSets.filter((s) => s.exerciseId === exerciseId),
    divisor,
  );
  if (!current) return null;
  const previous = lastTime(history, exerciseId, current.sessionId, current.performedAt, divisor);
  if (!previous) return null;
  return {
    previous,
    current,
    volumeDelta: current.volume - previous.volume,
    topWeightDelta: current.topWeightKg - previous.topWeightKg,
    estimatedOneRepMaxDelta: current.bestEstimatedOneRepMax - previous.bestEstimatedOneRepMax,
    totalRepsDelta: current.totalReps - previous.totalReps,
  };
}
