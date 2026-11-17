import { generateShortCode } from '../../shared/license';
import { D1LicenseStore, D1RateLimiter } from './d1Store';
import { base64UrlEncode } from '../../shared/license';
import { cloudConfigFromEnv } from './cloud/config';
import type { Env } from './env';
import type { CloudConfig, Deps, RateLimiter, ServerCrypto, VapidSource } from './ports';
import { importVapidKeys, type VapidKeys } from './push/vapid';
import { LayeredRateLimiter, MemoryRateLimiter } from './rateLimit';
import { createServerCrypto } from './serverCrypto';

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
}

let cachedVapid: { fingerprint: string; value: Promise<VapidKeys | null> } | null = null;

/**
 * VAPID keys are optional: without them push is disabled but backup, client page and licenses keep working.
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
    privateKeyHex: env.LICENSE_PRIVATE_KEY ?? '',
    publicKeyHex: env.LICENSE_PUBLIC_KEY ?? '',
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

export async function depsFromEnv(env: Env, overrides: DepsOverrides = {}): Promise<{ deps: Deps; d1Limiter: D1RateLimiter }> {
  const memory = overrides.memoryLimiter ?? new MemoryRateLimiter();
  const d1Limiter = new D1RateLimiter(env.DB);
  const deps: Deps = {
    store: new D1LicenseStore(env.DB),
    limiter: new LayeredRateLimiter(memory, d1Limiter),
    localLimiter: memory,
    crypto: await serverCryptoFor(env),
    now: overrides.now ?? (() => Math.floor(Date.now() / 1000)),
    newCode: () => generateShortCode(),
    newId: () => crypto.randomUUID(),
    config: { appOrigins: parseOrigins(env.APP_ORIGIN ?? ''), dataKey: env.DATA_KEY ?? '' },
    cloud: {
      db: env.DB,
      bucket: env.BACKUPS,
      pushFetch: overrides.pushFetch ?? ((input, init) => fetch(input, init)),
      vapid: overrides.vapid ?? vapidFor(env),
      config: cloudConfigFromEnv(env, overrides.cloudConfig),
      newId: randomId,
    },
  };
  return { deps, d1Limiter };
}
