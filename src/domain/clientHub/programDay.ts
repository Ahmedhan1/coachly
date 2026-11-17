import { z } from 'zod';
import { nextProgramDayId } from '../programs/session';

/**
 * Which program day a booked session is for. The session row stores the program; the day the trainer
 * attached when booking lives in a small map sessionId → dayId (meta store). Without one, the next day in
 * rotation is used (the day after the last one logged for that program).
 */
export type SessionDays = Readonly<Record<string, string>>;

/** About two years of a busy trainer's bookings; older sessions are long done. */
export const SESSION_DAYS_MAX = 3000;

const sessionDaysSchema = z.record(z.string(), z.string());

export function parseSessionDays(raw: unknown): SessionDays {
  const parsed = sessionDaysSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function setSessionDays(map: SessionDays, sessionIds: readonly string[], dayId: string | null): SessionDays {
  const next: Record<string, string> = { ...map };
  for (const id of sessionIds) {
    delete next[id];
    if (dayId !== null) next[id] = dayId;
  }
  const keys = Object.keys(next);
  if (keys.length <= SESSION_DAYS_MAX) return next;
  // Insertion order is oldest first: drop the oldest entries.
  for (const key of keys.slice(0, keys.length - SESSION_DAYS_MAX)) delete next[key];
  return next;
}

export interface PlannedDayInput<D extends { id: string }> {
  days: readonly D[];
  attachedDayId: string | null | undefined;
  logs: readonly { programId: string | null; programDayId: string | null; createdAt: number }[];
  programId: string;
}

export function plannedDay<D extends { id: string }>(input: PlannedDayInput<D>): { day: D; how: 'attached' | 'rotation' } | null {
  const attached = input.attachedDayId ? input.days.find((d) => d.id === input.attachedDayId) : undefined;
  if (attached) return { day: attached, how: 'attached' };
  const id = nextProgramDayId(input.days, input.logs, input.programId);
  const day = input.days.find((d) => d.id === id);
  return day ? { day, how: 'rotation' } : null;
}
