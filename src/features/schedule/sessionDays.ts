import { parseSessionDays, setSessionDays, type SessionDays } from '@/domain/clientHub';
import type { MetaStore } from '@/services/meta/metaStore';

/** Meta key (inside backups): the program day the trainer attached to a booked session. */
export const SESSION_DAYS_KEY = 'schedule.sessionDays';

export async function readSessionDays(meta: MetaStore): Promise<SessionDays> {
  return parseSessionDays(await meta.get(SESSION_DAYS_KEY));
}

export async function attachSessionDay(meta: MetaStore, sessionIds: readonly string[], dayId: string | null): Promise<void> {
  if (sessionIds.length === 0) return;
  await meta.set(SESSION_DAYS_KEY, setSessionDays(await readSessionDays(meta), sessionIds, dayId));
}
