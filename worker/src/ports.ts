import type { Accounts } from './auth/accounts';
import type { ObjectStore } from './files/objectStore';
import type { VapidKeys } from './push/vapid';

export type AuditAction = 'login_ok' | 'login_failed' | 'approved' | 'disabled' | 'enabled' | 'password_set';

/** Owner actions. Entries carry an account id at most: never names, emails or device ids. */
export interface AuditLog {
  audit(action: AuditAction, accountId: string | null, at: number): Promise<void>;
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
  /** HMAC of the client IP (hex), so raw IPs never reach the database. */
  hashClient(ip: string): Promise<string>;
  sessionMac(data: string): Promise<string>;
  passwordMatches(candidate: string): Promise<boolean>;
}

export interface CloudConfig {
  /** Largest cloud backup per trainer. */
  backupMaxBytes: number;
  /** Largest backup accepted in one `PUT /api/backup` (under the Free plan's 100 MB request body limit). */
  singlePutMaxBytes: number;
  /** Multipart part size (R2: every part but the last must be the same size and at least 5 MiB). */
  backupPartBytes: number;
  /** Total stored bytes above which an upload that grows storage is refused with `storage_full`. */
  storageGuardBytes: number;
  shareMaxBytes: number;
  checkinMaxBytes: number;
  maxPendingCheckins: number;
  maxSharesPerAccount: number;
  /** Largest total of client pages + pending check-ins one account may keep in R2. */
  pagesAccountMaxBytes: number;
  /** Push messages sent per cron invocation (CPU and subrequest budget, see docs/CLOUD.md). */
  pushBatchSize: number;
}

export interface VapidSource {
  /** Imported VAPID keys, or null when the secrets are not set (push is then disabled, everything else works). */
  keys(): Promise<VapidKeys | null>;
}

/** Cloud files (photos, thumbnails, invoices, PDFs) in the external object store. */
export interface FilesDeps {
  /** null when the object store is not configured: the files API answers 503 `files_unavailable`. */
  store: ObjectStore | null;
  /** Largest file from the trainer's app. */
  maxBytes: number;
  /** Largest file from a client page. */
  clientMaxBytes: number;
  /** Total stored per trainer account. */
  accountMaxBytes: number;
  /** Most `client_upload` files waiting per client page. */
  clientPendingMax: number;
}

/** Bindings and settings for phase 9 (backup, push, client page). */
export interface CloudDeps {
  db: D1Database;
  bucket: R2Bucket;
  /** Outgoing fetch for push services; tests pass a fake push service. */
  pushFetch: typeof fetch;
  vapid: VapidSource;
  config: CloudConfig;
  files: FilesDeps;
  /** Random 128-bit base64url id. */
  newId(): string;
}

export interface Deps {
  /** Trainer accounts (better-auth over D1). */
  accounts: Accounts;
  audit: AuditLog;
  /** Durable limiter (memory pre-filter + D1). */
  limiter: RateLimiter;
  /** In-isolate limiter only, for cheap requests that should not cost a D1 write (CORS preflight). */
  localLimiter: RateLimiter;
  crypto: ServerCrypto;
  /** Unix seconds. */
  now(): number;
  config: { appOrigins: readonly string[] };
  cloud: CloudDeps;
}
