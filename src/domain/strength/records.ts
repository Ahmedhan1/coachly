import { DEFAULT_EPLEY_DIVISOR, estimateOneRepMax } from './oneRepMax';
import type { LoggedSet } from './types';

export type RecordKind = 'estimatedOneRepMax' | 'weight';

export interface PersonalRecordCheck {
  isRecord: boolean;
  kinds: RecordKind[];
  /** Best values for this exercise before the candidate; null when there is no history. */
  previousBest: { estimatedOneRepMax: number; weightKg: number } | null;
}

function counts(s: LoggedSet): boolean {
  return !s.isWarmup && s.reps >= 1 && Number.isFinite(s.weightKg) && s.weightKg > 0;
}

/**
 * Does `candidate` beat every earlier working set of the same exercise?
 * Only sets strictly before the candidate (by performedAt) count as history.
 * The very first working set of an exercise is not reported as a record.
 */
export function checkPersonalRecord(
  history: readonly LoggedSet[],
  candidate: LoggedSet,
  divisor: number = DEFAULT_EPLEY_DIVISOR,
): PersonalRecordCheck {
  const prior = history.filter(
    (s) => s.exerciseId === candidate.exerciseId && s.performedAt < candidate.performedAt && counts(s),
  );
  if (prior.length === 0) return { isRecord: false, kinds: [], previousBest: null };
  const best = {
    estimatedOneRepMax: Math.max(...prior.map((s) => estimateOneRepMax(s.weightKg, s.reps, divisor))),
    weightKg: Math.max(...prior.map((s) => s.weightKg)),
  };
  if (!counts(candidate)) return { isRecord: false, kinds: [], previousBest: best };
  const kinds: RecordKind[] = [];
  if (estimateOneRepMax(candidate.weightKg, candidate.reps, divisor) > best.estimatedOneRepMax) {
    kinds.push('estimatedOneRepMax');
  }
  if (candidate.weightKg > best.weightKg) kinds.push('weight');
  return { isRecord: kinds.length > 0, kinds, previousBest: best };
}

/** Every set (in chronological order) that set a new record at the time it was performed. */
export function personalRecordTimeline(
  sets: readonly LoggedSet[],
  divisor: number = DEFAULT_EPLEY_DIVISOR,
): { set: LoggedSet; kinds: RecordKind[] }[] {
  const sorted = [...sets].sort((a, b) => a.performedAt - b.performedAt);
  const out: { set: LoggedSet; kinds: RecordKind[] }[] = [];
  for (const s of sorted) {
    const r = checkPersonalRecord(sorted, s, divisor);
    if (r.isRecord) out.push({ set: s, kinds: r.kinds });
  }
  return out;
}
