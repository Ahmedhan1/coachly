import { z } from 'zod';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { MetaStore } from '@/services/license/metaStore';

/**
 * Schedule preferences and small schedule state, kept in the meta table (travels inside backups).
 * Trainer settings has no schedule fields yet, so they live here with defaults.
 */
export const SCHEDULE_PREFS_KEY = 'schedule.prefs';
/** Session ids whose "missed" status is a late cancellation (اعتذر متأخر). */
export const LATE_CANCEL_KEY = 'schedule.lateCancelIds';
/** About four years of late cancellations at a busy trainer's pace; older sessions never change status again. */
export const LATE_CANCEL_MAX = 1000;
/** Set once the one-time reminders explanation was shown after the first booking. */
export const REMINDERS_PROMPT_KEY = 'schedule.remindersPromptShownAt';

export const schedulePrefsSchema = z.object({
  defaultDurationMin: z.number().int().min(5).max(480),
  /** Minutes before the session for the calendar alarm; null = no alarm. */
  alarmMinutesBefore: z.number().int().min(0).max(24 * 60).nullable(),
});
export type SchedulePrefs = z.infer<typeof schedulePrefsSchema>;

export const DEFAULT_SCHEDULE_PREFS: SchedulePrefs = { defaultDurationMin: 60, alarmMinutesBefore: 60 };

export function parsePrefs(raw: unknown): SchedulePrefs {
  const parsed = schedulePrefsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SCHEDULE_PREFS;
}

export function parseIdList(raw: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export async function readPrefs(meta: MetaStore): Promise<SchedulePrefs> {
  return parsePrefs(await meta.get(SCHEDULE_PREFS_KEY));
}

export async function savePrefs(meta: MetaStore, prefs: SchedulePrefs): Promise<void> {
  await meta.set(SCHEDULE_PREFS_KEY, schedulePrefsSchema.parse(prefs));
}

export async function setLateCancel(meta: MetaStore, sessionId: string, on: boolean): Promise<void> {
  const ids = new Set(parseIdList(await meta.get(LATE_CANCEL_KEY)));
  if (on === ids.has(sessionId)) return;
  if (on) ids.add(sessionId);
  else ids.delete(sessionId);
  const list = [...ids];
  // Insertion order = oldest first. Only recent sessions can still change status, so keep the newest ids.
  await meta.set(LATE_CANCEL_KEY, list.length > LATE_CANCEL_MAX ? list.slice(list.length - LATE_CANCEL_MAX) : list);
}

export function useSchedulePrefs(): SchedulePrefs | undefined {
  const { meta } = useServices();
  return useLive(() => readPrefs(meta), [meta]);
}

export function useLateCancelIds(): ReadonlySet<string> {
  const { meta } = useServices();
  const ids = useLive(async () => parseIdList(await meta.get(LATE_CANCEL_KEY)), [meta]);
  return new Set(ids ?? []);
}
