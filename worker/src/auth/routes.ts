import { json } from '../http';
import type { Deps } from '../ports';
import { RULES } from '../rateLimit';
import { clearAuthCookies } from './accounts';
import { AUTH_BASE_PATH } from './auth';

/**
 * Account routes.
 * - `/api/auth/*`: better-auth (sign-up/sign-in with email, get-session, sign-out, one-time-token/verify, Google
 *   callback). Called from the app with `Authorization: Bearer` (never cookies: the app is another site).
 * - `GET /api/auth-config`: `{ google: boolean }`, so the app shows the Google button only when it works.
 * - `GET /api/account`: the caller's account and approval status. Works for pending/disabled accounts too, so
 *   the app can show "waiting for approval" or lock. 401 `invalid` without a valid session.
 * - `GET /auth/google?return=<app origin>`: top-level navigation that starts Google sign-in on this site.
 * - `GET /auth/handoff?return=<app origin>`: where Google sign-in ends. Turns the (first-party) session cookie
 *   into a 3-minute one-time token, clears the cookie, and sends the browser back to the app with `#auth=<token>`.
 *   The app trades it for the session at /api/auth/one-time-token/verify.
 */
export const GOOGLE_START_PATH = '/auth/google';
export const HANDOFF_PATH = '/auth/handoff';

/** Paths that change state or try credentials: the durable (D1) limiter. Everything else: memory only. */
const WRITE_PATHS = new Set([
  `${AUTH_BASE_PATH}/sign-in/email`,
  `${AUTH_BASE_PATH}/sign-up/email`,
  `${AUTH_BASE_PATH}/sign-in/social`,
  `${AUTH_BASE_PATH}/one-time-token/verify`,
  `${AUTH_BASE_PATH}/change-password`,
  `${AUTH_BASE_PATH}/update-user`,
]);

/** Endpoints the app is allowed to reach. Everything else in better-auth's API answers 404 here. */
const ALLOWED = new Set([
  ...WRITE_PATHS,
  `${AUTH_BASE_PATH}/get-session`,
  `${AUTH_BASE_PATH}/sign-out`,
  `${AUTH_BASE_PATH}/callback/google`,
  `${AUTH_BASE_PATH}/error`,
]);

async function writeAllowed(deps: Deps, clientKey: string): Promise<boolean> {
  const now = deps.now();
  return (await deps.limiter.hit(RULES.authWrite, clientKey, now)) && (await deps.limiter.hit(RULES.authWriteGlobal, 'all', now));
}

export async function routeAuthApi(request: Request, path: string, deps: Deps, clientKey: string): Promise<Response | null> {
  if (path === '/api/account' && request.method === 'GET') return accountStatus(request, deps, clientKey);
  if (path === '/api/auth-config' && request.method === 'GET') {
    if (!(await deps.localLimiter.hit(RULES.authRead, clientKey, deps.now()))) return json({ error: 'rate_limited' }, 429);
    return json({ google: deps.accounts.googleEnabled });
  }
  if (path !== AUTH_BASE_PATH && !path.startsWith(`${AUTH_BASE_PATH}/`)) return null;
  if (!ALLOWED.has(path)) return json({ error: 'not_found' }, 404);
  const allowed = WRITE_PATHS.has(path)
    ? await writeAllowed(deps, clientKey)
    : await deps.localLimiter.hit(RULES.authRead, clientKey, deps.now());
  if (!allowed) return json({ error: 'rate_limited' }, 429);
  return deps.accounts.handle(request);
}

async function accountStatus(request: Request, deps: Deps, clientKey: string): Promise<Response> {
  if (!(await deps.localLimiter.hit(RULES.authRead, clientKey, deps.now()))) return json({ error: 'rate_limited' }, 429);
  if (!/^Bearer\s+\S+$/.test(request.headers.get('Authorization') ?? '')) return json({ error: 'invalid' }, 401);
  const session = await deps.accounts.session(new Headers({ Authorization: request.headers.get('Authorization') ?? '' }));
  if (session === null) return json({ error: 'invalid' }, 401);
  const { id, name, email, status } = session.account;
  return json({ account: { id, name, email, status } });
}

/** The app origin to return to: the requested one when it is an allowed app origin, else the first one. */
export function returnOrigin(url: URL, appOrigins: readonly string[]): string | null {
  const wanted = url.searchParams.get('return');
  if (wanted !== null && appOrigins.includes(wanted)) return wanted;
  return appOrigins[0] ?? null;
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

function backToApp(origin: string, fragment: Record<string, string>): string {
  return `${origin}/#${new URLSearchParams(fragment).toString()}`;
}

export async function routeAuthPages(request: Request, url: URL, deps: Deps, clientKey: string): Promise<Response | null> {
  if (url.pathname !== GOOGLE_START_PATH && url.pathname !== HANDOFF_PATH) return null;
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!(await writeAllowed(deps, clientKey))) return json({ error: 'rate_limited' }, 429);
  const origin = returnOrigin(url, deps.config.appOrigins);
  if (origin === null) return json({ error: 'server_not_configured' }, 503);

  if (url.pathname === GOOGLE_START_PATH) {
    const handoff = new URL(HANDOFF_PATH, url.origin);
    handoff.searchParams.set('return', origin);
    const failed = new URL(handoff);
    failed.searchParams.set('failed', '1');
    const started = await deps.accounts.startGoogle(handoff.toString(), failed.toString());
    return started ?? redirect(backToApp(origin, { auth_error: 'google_unavailable' }));
  }

  if (url.searchParams.get('failed') === '1' || url.searchParams.has('error')) {
    return redirect(backToApp(origin, { auth_error: 'google_failed' }), clearAuthCookies());
  }
  const token = await deps.accounts.oneTimeToken(request.headers);
  return redirect(backToApp(origin, token === null ? { auth_error: 'google_failed' } : { auth: token }), clearAuthCookies());
}
