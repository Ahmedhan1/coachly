/**
 * The "already sent" log behind the outbox (stored under one meta key). Ids embed their occasion (date,
 * week), so old entries are useless after a while: the log is pruned by age AND capped by size, otherwise
 * years of daily use with hundreds of clients would grow it without bound.
 */
export interface SentEntry {
  id: string;
  /** Epoch ms when it was marked. */
  at: number;
}

export const SENT_LOG_MAX_AGE_MS = 120 * 86_400_000;
/** Well below any storage-side schema limit so a full log still parses. */
export const SENT_LOG_MAX_ENTRIES = 3000;

/** Marks (`sent = true`) or unmarks `id` at `now`, then prunes (oldest-inserted first). Pure; `now` is passed in. */
export function updateSentLog(log: readonly SentEntry[], id: string, sent: boolean, now: number): SentEntry[] {
  const kept = log.filter((e) => e.id !== id && now - e.at < SENT_LOG_MAX_AGE_MS);
  if (sent) kept.push({ id, at: now });
  return kept.length > SENT_LOG_MAX_ENTRIES ? kept.slice(kept.length - SENT_LOG_MAX_ENTRIES) : kept;
}
