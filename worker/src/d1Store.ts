import type { AuditAction, LicenseRecord, LicenseStatus, LicenseStore, RateLimiter, RateRule } from './ports';

interface LicenseRow {
  lid: string;
  code_hash: string;
  customer_name: string;
  duration_days: number | null;
  act_by: number;
  status: LicenseStatus;
  device_fp: string | null;
  created_at: number;
  activated_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
  replaced_by: string | null;
  feat: string;
}

function parseFeatures(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

function fromRow(row: LicenseRow): LicenseRecord {
  return {
    lid: row.lid,
    codeHash: row.code_hash,
    customerName: row.customer_name,
    durationDays: row.duration_days,
    actBy: row.act_by,
    status: row.status,
    deviceFp: row.device_fp,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    replacedBy: row.replaced_by,
    feat: parseFeatures(row.feat),
  };
}

export class D1LicenseStore implements LicenseStore {
  constructor(private readonly db: D1Database) {}

  async insert(r: LicenseRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO licenses (lid, code_hash, customer_name, duration_days, act_by, status, device_fp,
           created_at, activated_at, expires_at, revoked_at, replaced_by, feat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        r.lid,
        r.codeHash,
        r.customerName,
        r.durationDays,
        r.actBy,
        r.status,
        r.deviceFp,
        r.createdAt,
        r.activatedAt,
        r.expiresAt,
        r.revokedAt,
        r.replacedBy,
        JSON.stringify(r.feat),
      )
      .run();
  }

  async findByCodeHash(codeHash: string): Promise<LicenseRecord | null> {
    const row = await this.db.prepare('SELECT * FROM licenses WHERE code_hash = ?').bind(codeHash).first<LicenseRow>();
    return row === null ? null : fromRow(row);
  }

  async findById(lid: string): Promise<LicenseRecord | null> {
    const row = await this.db.prepare('SELECT * FROM licenses WHERE lid = ?').bind(lid).first<LicenseRow>();
    return row === null ? null : fromRow(row);
  }

  async markActivated(lid: string, deviceFp: string, activatedAt: number, expiresAt: number | null): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE licenses SET status = 'active', device_fp = ?, activated_at = ?, expires_at = ?
         WHERE lid = ? AND status = 'issued'`,
      )
      .bind(deviceFp, activatedAt, expiresAt, lid)
      .run();
    return result.meta.changes === 1;
  }

  async end(lid: string, status: 'revoked' | 'replaced', at: number, replacedBy: string | null): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE licenses SET status = ?, revoked_at = ?, replaced_by = ?
         WHERE lid = ? AND status IN ('issued', 'active')`,
      )
      .bind(status, at, replacedBy, lid)
      .run();
    return result.meta.changes === 1;
  }

  async list(limit: number): Promise<LicenseRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM licenses ORDER BY created_at DESC, lid LIMIT ?')
      .bind(limit)
      .all<LicenseRow>();
    return results.map(fromRow);
  }

  async audit(action: AuditAction, lid: string | null, at: number): Promise<void> {
    await this.db.prepare('INSERT INTO audit_log (at, action, lid) VALUES (?, ?, ?)').bind(at, action, lid).run();
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
