import type { AuditAction, AuditLog, RateLimiter, RateRule } from './ports';

export class D1AuditLog implements AuditLog {
  constructor(private readonly db: D1Database) {}

  async audit(action: AuditAction, accountId: string | null, at: number): Promise<void> {
    await this.db.prepare('INSERT INTO audit_log (at, action, lid) VALUES (?, ?, ?)').bind(at, action, accountId).run();
  }
}


/**
 * Fixed-window counter in D1: one upsert (one row write) per counted request. Chosen over the Workers
 * Rate Limiting binding because it is plain D1 (certainly inside the free tier), exact across all
 * Cloudflare locations, and testable locally. Old windows are deleted by `prune`.
 */
export class D1RateLimiter implements RateLimiter {
  constructor(private readonly db: D1Database) {}

  async hit(rule: RateRule, key: string, now: number): Promise<boolean> {
    const windowStart = now - (now % rule.windowSeconds);
    const row = await this.db
      .prepare(
        `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT (bucket, window_start) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .bind(`${rule.name}:${key}`, windowStart)
      .first<{ count: number }>();
    return (row?.count ?? Number.POSITIVE_INFINITY) <= rule.limit;
  }

  async prune(before: number): Promise<void> {
    await this.db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(before).run();
  }
}
