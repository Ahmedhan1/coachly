import { bytesToHex } from '../../../shared/bytes';
import { json } from '../http';
import type { Deps, RateRule } from '../ports';
import { RULES } from '../rateLimit';

export interface Caller {
  /** better-auth user id. */
  userId: string;
  /** Account id for cloud data (backups, client pages, check-ins, files): the user id. */
  account: string;
  /** Per-sign-in device fingerprint: first 32 hex of SHA-256(session id). Never a raw id. */
  dev: string;
  /** Key for per-device rows (push): userId + ':' + dev. */
  deviceKey: string;
}

export type AuthResult = { ok: true; who: Caller } | { ok: false; response: Response };

function fail(error: string, status: number): AuthResult {
  return { ok: false, response: json({ error }, status) };
}

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest)).slice(0, 32);
}

/**
 * Account check for every cloud endpoint, then the endpoint's own per-account limit.
 * - 429 `rate_limited`: too many requests from this IP (memory) or this account (D1).
 * - 401 `invalid`: missing, unknown or expired session token.
 * - 403 `pending`: the owner has not approved the account yet. 403 `disabled`: the owner turned it off.
 */
export async function authenticate(
  request: Request,
  deps: Deps,
  clientKey: string,
  rule: RateRule,
  scope: 'account' | 'device' = 'account',
): Promise<AuthResult> {
  const now = deps.now();
  if (!(await deps.localLimiter.hit(RULES.cloudIp, clientKey, now))) return fail('rate_limited', 429);
  if (!/^Bearer\s+\S+$/.test(request.headers.get('Authorization') ?? '')) return fail('invalid', 401);

  // Only the bearer token counts here: a stray cookie on this site must never authorise a cloud call.
  const headers = new Headers({ Authorization: request.headers.get('Authorization') ?? '' });
  const session = await deps.accounts.session(headers);
  if (session === null) return fail('invalid', 401);
  if (session.account.status !== 'approved') return fail(session.account.status, 403);

  const dev = await fingerprint(session.sessionId);
  const deviceKey = `${session.userId}:${dev}`;
  if (!(await deps.limiter.hit(rule, scope === 'device' ? deviceKey : session.userId, now))) return fail('rate_limited', 429);
  return { ok: true, who: { userId: session.userId, account: session.userId, dev, deviceKey } };
}
