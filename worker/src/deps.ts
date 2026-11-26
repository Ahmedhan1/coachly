import { base64UrlEncode } from '../../shared/bytes';
import { BetterAuthAccounts, type Accounts } from './auth/accounts';
import { D1AuditLog, D1RateLimiter } from './d1Store';
import { cloudConfigFromEnv, filesDepsFromEnv } from './cloud/config';
import type { ObjectStore } from './files/objectStore';
import type { Env } from './env';
import type { CloudConfig, Deps, RateLimiter, ServerCrypto, VapidSource } from './ports';
import { importVapidKeys, type VapidKeys } from './push/vapid';
import { LayeredRateLimiter, MemoryRateLimiter } from './rateLimit';
import { ConfigError, createServerCrypto } from './serverCrypto';

export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
}

export interface DepsOverrides {
  now?: () => number;
  /** Shared per-isolate memory limiter; a fresh one is made when omitted. */
  memoryLimiter?: RateLimiter;
  cloudConfig?: Partial<CloudConfig>;
  pushFetch?: typeof fetch;
  vapid?: VapidSource;
  /** Object store for cloud files (tests pass memory; null = not configured). */
  objectStore?: ObjectStore | null;
  /** Account system (tests may pass their own). */
  accounts?: Accounts;
}

let cachedVapid: { fingerprint: string; value: Promise<VapidKeys | null> } | null = null;

/**
 * VAPID keys are optional: without them push is disabled but backup, client page and accounts keep working.
 * Malformed keys also give null (never an error page that could describe the secret).
 */
function vapidFor(env: Env): VapidSource {
  return {
    keys: () => {
      const parts = [env.VAPID_PRIVATE_KEY ?? '', env.VAPID_PUBLIC_KEY ?? '', env.VAPID_SUBJECT ?? ''] as const;
      if (parts.some((p) => p.trim() === '')) return Promise.resolve(null);
      const fingerprint = parts.join('|');
      if (cachedVapid?.fingerprint !== fingerprint) {
        cachedVapid = { fingerprint, value: importVapidKeys(...parts).catch(() => null) };
      }
      return cachedVapid.value;
    },
  };
}

function randomId(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

let cachedCrypto: { fingerprint: string; value: Promise<ServerCrypto> } | null = null;

/** Key import and hashing happen once per isolate, not per request. */
function serverCryptoFor(env: Env): Promise<ServerCrypto> {
  const secrets = {
    authSecret: env.BETTER_AUTH_SECRET ?? '',
    adminPassword: env.ADMIN_PASSWORD ?? '',
  };
  const fingerprint = JSON.stringify(secrets);
  if (cachedCrypto?.fingerprint !== fingerprint) {
    const value = createServerCrypto(secrets);
    value.catch(() => {
      cachedCrypto = null;
    });
    cachedCrypto = { fingerprint, value };
  }
  return cachedCrypto.value;
}

function googleFromEnv(env: Env): { clientId: string; clientSecret: string } | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  return clientId === '' || clientSecret === '' ? null : { clientId, clientSecret };
}

let cachedAccounts: { db: D1Database; fingerprint: string; value: Accounts } | null = null;

/**
 * One better-auth instance per isolate (building it costs CPU on every request otherwise, and the Free plan allows
 * 10 ms per request). Safe because D1 bindings may be reused across requests; rebuilt when a setting changes.
 */
function accountsFromEnv(env: Env, appOrigins: readonly string[]): Accounts {
  const baseURL = (env.BETTER_AUTH_URL ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+$/.test(baseURL)) throw new ConfigError('BETTER_AUTH_URL must be the Worker address');
  const settings = { secret: env.BETTER_AUTH_SECRET.trim(), baseURL, appOrigins, google: googleFromEnv(env) };
  const fingerprint = JSON.stringify(settings);
  if (cachedAccounts?.db !== env.DB || cachedAccounts.fingerprint !== fingerprint) {
    cachedAccounts = { db: env.DB, fingerprint, value: new BetterAuthAccounts({ database: env.DB, ...settings }) };
  }
  return cachedAccounts.value;
}

export async function depsFromEnv(env: Env, overrides: DepsOverrides = {}): Promise<{ deps: Deps; d1Limiter: D1RateLimiter }> {
  const memory = overrides.memoryLimiter ?? new MemoryRateLimiter();
  const d1Limiter = new D1RateLimiter(env.DB);
  const serverCrypto = await serverCryptoFor(env);
  const appOrigins = parseOrigins(env.APP_ORIGIN ?? '');
  const deps: Deps = {
    accounts: overrides.accounts ?? accountsFromEnv(env, appOrigins),
    audit: new D1AuditLog(env.DB),
    limiter: new LayeredRateLimiter(memory, d1Limiter),
    localLimiter: memory,
    crypto: serverCrypto,
    now: overrides.now ?? (() => Math.floor(Date.now() / 1000)),
    config: { appOrigins },
    cloud: {
      db: env.DB,
      bucket: env.BACKUPS,
      pushFetch: overrides.pushFetch ?? ((input, init) => fetch(input, init)),
      vapid: overrides.vapid ?? vapidFor(env),
      config: cloudConfigFromEnv(env, overrides.cloudConfig),
      files: filesDepsFromEnv(env, overrides.objectStore),
      newId: randomId,
    },
  };
  return { deps, d1Limiter };
}
