import { json } from '../http';
import type { Deps, RateRule } from '../ports';
import { RULES } from '../rateLimit';

export interface Licensee {
  lid: string;
  /** License device fingerprint (first 32 hex of SHA-256(deviceId)); never the raw device id. */
  dev: string;
  /** Key for per-device rows (push): lid + ':' + dev. */
  deviceKey: string;
}

export type AuthResult = { ok: true; who: Licensee } | { ok: false; response: Response };

function fail(error: string, status: number): AuthResult {
  return { ok: false, response: json({ error }, status) };
}

/**
 * Bearer license check for every phase-9 endpoint, then the endpoint's own per-license limit.
 * - 429 `rate_limited`: too many requests from this IP (memory) or this license (D1).
 * - 401 `invalid`: missing token or bad signature.
 * - 403 `revoked`: revoked or moved to another device. 403 `expired`: a time-limited license has ended.
 * Licenses issued with the offline tool are not in D1 and are accepted, like `/api/license/status` does.
 */
export async function authenticate(
  request: Request,
  deps: Deps,
  clientKey: string,
  rule: RateRule,
  scope: 'license' | 'device' = 'license',
): Promise<AuthResult> {
  const now = deps.now();
  if (!(await deps.localLimiter.hit(RULES.cloudIp, clientKey, now))) return fail('rate_limited', 429);

  const match = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') ?? '');
  const token = match?.[1];
  if (token === undefined) return fail('invalid', 401);
  const verified = await deps.crypto.verifyLicense(token);
  if (!verified.ok) return fail('invalid', 401);
  const { lid, dev, exp } = verified.payload;

  const record = await deps.store.findById(lid);
  if (record !== null && (record.status === 'revoked' || record.status === 'replaced')) return fail('revoked', 403);
  if (exp !== null && now >= exp) return fail('expired', 403);

  const deviceKey = `${lid}:${dev}`;
  if (!(await deps.limiter.hit(rule, scope === 'device' ? deviceKey : lid, now))) return fail('rate_limited', 429);
  return { ok: true, who: { lid, dev, deviceKey } };
}
