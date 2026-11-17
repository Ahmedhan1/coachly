import type { SessionState } from './session';

/** A saved session older than this is not resumed silently: the trainer is asked first. */
export const STALE_SESSION_MS = 12 * 60 * 60 * 1000;

export type ResumeDecision = 'resume' | 'ask' | 'fresh';

export interface SessionRequest {
  /** Route key: 'new' or a session/schedule id. */
  routeKey: string;
  clientId: string;
  /** Day the trainer asked for, or null for "the next day". */
  dayId: string | null;
}

/**
 * What to do with the persisted (unsaved) session when a session screen opens:
 * resume it, ask before replacing it (it has work in it), or start fresh (nothing to lose).
 */
export function resumeDecision(saved: SessionState | null, request: SessionRequest, now: number): ResumeDecision {
  if (!saved) return 'fresh';
  if (request.routeKey !== 'new' && saved.key === request.routeKey) return 'resume';
  const sameClient = saved.clientId === request.clientId;
  const sameDay = request.dayId === null || request.dayId === saved.dayId;
  const recent = now - saved.startedAt <= STALE_SESSION_MS;
  if (request.routeKey === 'new' && sameClient && sameDay && recent) return 'resume';
  const hasWork = saved.exercises.some((e) => e.sets.some((s) => s.done));
  return hasWork ? 'ask' : 'fresh';
}
