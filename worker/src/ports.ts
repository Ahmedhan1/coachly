import type { LicensePayload, VerifyResult } from '../../shared/license';

export type LicenseStatus = 'issued' | 'active' | 'revoked' | 'replaced';

export interface LicenseRecord {
  lid: string;
  codeHash: string;
  customerName: string;
  /** null = lifetime. */
  durationDays: number | null;
  actBy: number;
  status: LicenseStatus;
  deviceFp: string | null;
  createdAt: number;
  activatedAt: number | null;
  /** Fixed expiry (set on activation, or carried over by "move to new device"). */
  expiresAt: number | null;
  revokedAt: number | null;
  replacedBy: string | null;
  feat: string[];
}

export type AuditAction = 'code_issued' | 'activated' | 'reactivated' | 'revoked' | 'moved' | 'login_ok' | 'login_failed';

export interface LicenseStore {
  insert(record: LicenseRecord): Promise<void>;
  findByCodeHash(codeHash: string): Promise<LicenseRecord | null>;
  findById(lid: string): Promise<LicenseRecord | null>;
  /** Moves an `issued` record to `active`. Returns false if it was not `issued` any more (race). */
  markActivated(lid: string, deviceFp: string, activatedAt: number, expiresAt: number | null): Promise<boolean>;
  /** Ends an `issued`/`active` record. Returns false if it was already ended. */
  end(lid: string, status: 'revoked' | 'replaced', at: number, replacedBy: string | null): Promise<boolean>;
  list(limit: number): Promise<LicenseRecord[]>;
  /** Audit entries carry no names and no device ids by design. */
  audit(action: AuditAction, lid: string | null, at: number): Promise<void>;
}

export interface RateRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimiter {
  /** Counts one hit; resolves true when the request is allowed. */
  hit(rule: RateRule, key: string, now: number): Promise<boolean>;
}

/** Everything that needs a secret. Built once per isolate. */
export interface ServerCrypto {
  signLicense(payload: LicensePayload): Promise<string>;
  verifyLicense(token: string): Promise<VerifyResult>;
  /** HMAC of a normalised short code (hex). The code itself is never stored. */
  hashCode(normalizedCode: string): Promise<string>;
  /** HMAC of the client IP (hex), so raw IPs never reach the database. */
  hashClient(ip: string): Promise<string>;
  sessionMac(data: string): Promise<string>;
  passwordMatches(candidate: string): Promise<boolean>;
}

export interface Deps {
  store: LicenseStore;
  /** Durable limiter (memory pre-filter + D1). */
  limiter: RateLimiter;
  /** In-isolate limiter only, for cheap requests that should not cost a D1 write (CORS preflight). */
  localLimiter: RateLimiter;
  crypto: ServerCrypto;
  /** Unix seconds. */
  now(): number;
  newCode(): string;
  newId(): string;
  config: { appOrigins: readonly string[]; dataKey: string };
}
