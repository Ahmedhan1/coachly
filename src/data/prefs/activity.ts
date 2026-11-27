import { addActivity, markActivitySeen, parseActivity, type ActivityEvent } from '@/domain/notifications';
import type { MetaStore } from '@/data/metaStore';

/** Device-local (`backup.` prefix → never inside a backup): what clients sent from their pages, newest first. */
export const ACTIVITY_KEY = 'backup.activity';

export async function readActivity(meta: MetaStore): Promise<ActivityEvent[]> {
  return parseActivity(await meta.get(ACTIVITY_KEY));
}

export async function recordActivity(meta: MetaStore, events: readonly ActivityEvent[]): Promise<void> {
  if (events.length === 0) return;
  await meta.set(ACTIVITY_KEY, addActivity(await readActivity(meta), events));
}

export async function seeActivity(meta: MetaStore, which: readonly string[] | 'all' | { clientId: string }): Promise<void> {
  const list = await readActivity(meta);
  const next = markActivitySeen(list, which);
  if (next.some((e, i) => e.seen !== list[i]?.seen)) await meta.set(ACTIVITY_KEY, next);
}
