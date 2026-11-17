import { sessionEndMs, type Session } from './types';

export type Interval = Pick<Session, 'id' | 'startMs' | 'durationMinutes'>;

/** Half-open intervals [start, end): touching ends (10:00–11:00 and 11:00–12:00) do not conflict. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.startMs < sessionEndMs(b) && b.startMs < sessionEndMs(a);
}

/** Existing sessions that clash with `candidate` (a session never clashes with itself, matched by id). */
export function conflictsWith<T extends Interval>(candidate: Interval, existing: readonly T[]): T[] {
  return existing.filter((s) => s.id !== candidate.id && overlaps(candidate, s));
}

/** Every clashing pair, each pair once, ordered by start. Sweep line, O(n log n + pairs). */
export function findConflicts<T extends Interval>(sessions: readonly T[]): [T, T][] {
  const sorted = [...sessions].sort((a, b) => a.startMs - b.startMs || sessionEndMs(a) - sessionEndMs(b));
  const pairs: [T, T][] = [];
  let active: T[] = [];
  for (const s of sorted) {
    active = active.filter((a) => sessionEndMs(a) > s.startMs);
    for (const a of active) if (a.id !== s.id && s.durationMinutes > 0) pairs.push([a, s]);
    if (s.durationMinutes > 0) active.push(s);
  }
  return pairs;
}
