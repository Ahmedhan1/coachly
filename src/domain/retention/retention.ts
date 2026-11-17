/**
 * Housekeeping for years of daily use: soft-deleted rows, the undo log and photos nothing points at any
 * more are removed once they are older than the retention window. Pure: `now` is passed in.
 */
export const RETENTION_DAYS = 180;
export const PURGE_INTERVAL_MS = 86_400_000;

const MS_PER_DAY = 86_400_000;

/** Rows deleted (or photos created) before this instant may be purged. */
export function purgeCutoffMs(now: Date, retentionDays: number = RETENTION_DAYS): number {
  return now.getTime() - retentionDays * MS_PER_DAY;
}

/** Throttle: due when never run, a day has passed, or the clock moved backwards. */
export function isPurgeDue(lastRunMs: number | null, now: Date): boolean {
  if (lastRunMs === null) return true;
  const elapsed = now.getTime() - lastRunMs;
  return elapsed < 0 || elapsed >= PURGE_INTERVAL_MS;
}

/**
 * Which of `candidates` occur as a string value anywhere inside `values` (rows of any shape, meta values
 * included). Used to keep every photo something still refers to, whatever field or key holds it.
 */
export function collectReferencedIds(values: readonly unknown[], candidates: ReadonlySet<string>): Set<string> {
  const found = new Set<string>();
  const stack: unknown[] = [...values];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === 'string') {
      if (candidates.has(v)) found.add(v);
    } else if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (typeof v === 'object' && v !== null) {
      for (const x of Object.values(v)) stack.push(x);
    }
  }
  return found;
}
