import { bytesToHex } from '../../../shared/bytes';
import type { AccountRecord } from '../auth/accounts';
import { json } from '../http';
import type { Deps, RateRule } from '../ports';
import { RULES } from '../rateLimit';
import type { Access } from '../team/access';
import type { Membership } from '../team/store';

export interface Caller {
  /** better-auth user id. */
  userId: string;
  /** Account id for cloud data (backups, client pages, check-ins, files): the user id. */
  account: string;
  /** Per-sign-in device fingerprint: first 32 hex of SHA-256(session id). Never a raw id. */
  dev: string;
  /** Key for per-device rows (push): userId + ':' + dev. */
  deviceKey: string;
  /** The account as better-auth stores it (own approval by the owner). */
  record: AccountRecord;
  /** Effective access: owner approval, gym approval and plan end date combined (src/team/access.ts). */
  access: Access;
  membership: Membership | null;
}

export type AuthResult = { ok: true; who: Caller } | { ok: false; response: Response };

function fail(error: string, status: number): AuthResult {
  return { ok: false, response: json({ error }, status) };
}

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest)).slice(0, 32);
}

export interface AuthOptions {
  /** 'device': rate limit per device (push). Default: per account. */
  scope?: 'account' | 'device';
  /** 'signedIn': any valid session, approved or not (joining a gym, account status). Default: approved only. */
  allow?: 'approved' | 'signedIn';
}

/**
 * Account check for every cloud endpoint, then the endpoint's own per-account limit.
 * - 429 `rate_limited`: too many requests from this IP (memory) or this account (D1).
 * - 401 `invalid`: missing, unknown or expired session token.
 * - 403 `pending` / `disabled` / `expired`: not approved (by the owner or the gym), or the plan has ended.
 */
export async function authenticate(
  request: Request,
  deps: Deps,
  clientKey: string,
  rule: RateRule,
  options: AuthOptions | 'account' | 'device' = {},
): Promise<AuthResult> {
  const { scope = 'account', allow = 'approved' } = typeof options === 'string' ? { scope: options } : options;
  const now = deps.now();
  if (!(await deps.localLimiter.hit(RULES.cloudIp, clientKey, now))) return fail('rate_limited', 429);
  if (!/^Bearer\s+\S+$/.test(request.headers.get('Authorization') ?? '')) return fail('invalid', 401);

  // Only the bearer token counts here: a stray cookie on this site must never authorise a cloud call.
  const headers = new Headers({ Authorization: request.headers.get('Authorization') ?? '' });
  const session = await deps.accounts.session(headers);
  if (session === null) return fail('invalid', 401);
  const { access, membership } = await deps.team.access(session.userId, session.account.status, now);
  if (allow === 'approved' && access.status !== 'approved') return fail(access.status, 403);

  const dev = await fingerprint(session.sessionId);
  const deviceKey = `${session.userId}:${dev}`;
  if (!(await deps.limiter.hit(rule, scope === 'device' ? deviceKey : session.userId, now))) return fail('rate_limited', 429);
  return { ok: true, who: { userId: session.userId, account: session.userId, dev, deviceKey, record: session.account, access, membership } };
}
