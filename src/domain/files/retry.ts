/** Longest wait between two attempts to upload or delete a cloud file. */
export const MAX_BACKOFF_MS = 6 * 3600_000;

/** When to try again after `attempts` failures: 1 min, then doubling, capped at 6 h. */
export function nextAttemptAt(attempts: number, now: Date): number {
  if (attempts <= 0) return now.getTime();
  const wait = Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** Math.min(attempts - 1, 30));
  return now.getTime() + wait;
}
