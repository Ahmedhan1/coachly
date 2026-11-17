import type { Attendance } from '../models/session';

export interface SessionLike {
  id: string;
  startsAt: number;
  durationMin: number;
  attendance: Attendance;
}

const MINUTE = 60_000;
const endOf = (s: SessionLike) => s.startsAt + s.durationMin * MINUTE;

/** A client's sessions for the hub: upcoming (scheduled, not over yet) and past, plus attendance counts. */
export function splitClientSessions<T extends SessionLike>(sessions: readonly T[], now: number) {
  const upcoming = sessions.filter((s) => s.attendance === 'scheduled' && endOf(s) > now).sort((a, b) => a.startsAt - b.startsAt);
  const soon = new Set<T>(upcoming);
  const past = sessions.filter((s) => !soon.has(s)).sort((a, b) => b.startsAt - a.startsAt);
  const counts = { attended: 0, missed: 0, cancelled: 0, unmarked: 0 };
  for (const s of past) {
    if (s.attendance === 'scheduled') counts.unmarked++;
    else counts[s.attendance]++;
  }
  return { upcoming, past, counts };
}

/** The booking a finished workout belongs to: today's still-scheduled session closest to now, if any. */
export function sessionForWorkout<T extends SessionLike>(sessions: readonly T[], dayStart: number, dayEnd: number, now: number): T | null {
  const today = sessions.filter((s) => s.attendance === 'scheduled' && s.startsAt >= dayStart && s.startsAt < dayEnd);
  return today.reduce<T | null>((a, b) => (!a || Math.abs(b.startsAt - now) < Math.abs(a.startsAt - now) ? b : a), null);
}
