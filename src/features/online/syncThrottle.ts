/**
 * How often the background online sync may run. Every run costs several Worker requests (and D1 writes for the
 * rate limiter), and on iPhone the app returns to the foreground dozens of times a day (WhatsApp, calls), so a
 * foreground return only syncs when the last run is old enough. The network coming back always syncs.
 */
export type SyncReason = 'start' | 'online' | 'visible' | 'timer';

/** Minimum gap between runs started by a foreground return or the timer. */
export const SYNC_MIN_GAP_MS = 10 * 60_000;
/** The timer while the app stays open. */
export const SYNC_EVERY_MS = 30 * 60_000;

export function shouldRunSync(reason: SyncReason, lastRunAt: number | null, now: number): boolean {
  if (reason === 'start' || reason === 'online' || lastRunAt === null) return true;
  return now - lastRunAt >= SYNC_MIN_GAP_MS;
}

/** The push schedule is re-sent only when it changed, or at least this often (the server keeps it otherwise). */
export const PUSH_RESEND_MS = 12 * 60 * 60_000;

export function shouldSendPushSchedule(input: { fingerprint: string; last: { fingerprint: string; at: number } | null; now: number }): boolean {
  if (input.last === null || input.last.fingerprint !== input.fingerprint) return true;
  return input.now - input.last.at >= PUSH_RESEND_MS;
}
