import { toAccountRecord, type AccountRecord } from '../auth/accounts';
import type { AccountStatus } from '../auth/auth';

/** Accounts per status, plus the ones the owner must approve (pending and not handled by a gym). */
export interface AccountCounts {
  all: number;
  pending: number;
  approved: number;
  disabled: number;
  /** Pending accounts that wait for the owner, not for a gym. */
  waiting: number;
}

export interface AccountQuery {
  status: '' | AccountStatus;
  /** Name or email text; matched case-insensitively for Latin letters. */
  q: string;
  limit: number;
  offset: number;
}

/** `LIKE` pattern for a free-text needle, with %, _ and \ escaped. */
export function likePattern(q: string): string {
  return `%${q.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

const WHERE = `WHERE (?1 = '' OR "status" = ?1) AND (?2 = '' OR lower("name") LIKE ?2 ESCAPE '\\' OR lower("email") LIKE ?2 ESCAPE '\\')`;

/**
 * Dashboard reads in one D1 round trip: status counts, the number of matches and one page of accounts
 * (newest first). Search and paging run in SQL, so the page stays fast with thousands of accounts.
 */
export async function queryAccounts(db: D1Database, query: AccountQuery): Promise<{ counts: AccountCounts; total: number; records: AccountRecord[] }> {
  const pattern = query.q === '' ? '' : likePattern(query.q);
  const [byStatus, waiting, total, page] = await db.batch([
    db.prepare('SELECT "status" AS status, COUNT(*) AS n FROM "user" GROUP BY "status"'),
    db.prepare(
      `SELECT COUNT(*) AS n FROM "user" u WHERE u."status" = 'pending'
       AND NOT EXISTS (SELECT 1 FROM gym_members m WHERE m.user_id = u."id" AND m.status <> 'removed')`,
    ),
    db.prepare(`SELECT COUNT(*) AS n FROM "user" ${WHERE}`).bind(query.status, pattern),
    db
      .prepare(`SELECT "id", "name", "email", "status", "createdAt" FROM "user" ${WHERE} ORDER BY "createdAt" DESC, "id" LIMIT ?3 OFFSET ?4`)
      .bind(query.status, pattern, query.limit, query.offset),
  ]);
  const counts: AccountCounts = { all: 0, pending: 0, approved: 0, disabled: 0, waiting: 0 };
  for (const row of (byStatus?.results ?? []) as Array<{ status: string | null; n: number }>) {
    counts.all += row.n;
    const key = row.status ?? 'pending';
    if (key === 'pending' || key === 'approved' || key === 'disabled') counts[key] += row.n;
  }
  counts.waiting = ((waiting?.results ?? [])[0] as { n?: number } | undefined)?.n ?? 0;
  const matched = ((total?.results ?? [])[0] as { n?: number } | undefined)?.n ?? 0;
  const records = ((page?.results ?? []) as Array<{ id: string; name: string; email: string; status: string; createdAt: unknown }>).map(toAccountRecord);
  return { counts, total: matched, records };
}
