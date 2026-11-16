import { generateShortCode } from '../../shared/license';
import { D1LicenseStore, D1RateLimiter } from './d1Store';
import type { Env } from './env';
import type { Deps, RateLimiter, ServerCrypto } from './ports';
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
  };
  return { deps, d1Limiter };
}
