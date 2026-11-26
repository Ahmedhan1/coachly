import { env } from 'cloudflare:workers';
import { depsFromEnv, type DepsOverrides } from '../src/deps';
import { handleRequest } from '../src/app';
import type { Deps } from '../src/ports';
import { TEST_ADMIN_PASSWORD, TEST_APP_ORIGIN } from './fixtures';

export const BASE = 'https://license.example';
export const TEST_PASSWORD = 'correct horse battery';
export const DAY = 86_400;

let ipCounter = Math.floor(Math.random() * 0xffffff);
/** A fresh (valid IPv4) client IP per call keeps rate-limit buckets independent, ours and better-auth's. */
export function freshIp(): string {
  ipCounter = (ipCounter + 1) % 0xffffff;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export interface Harness {
  deps: Deps;
  clock: { now: number };
  ip: string;
  send(path: string, init?: RequestInit & { ip?: string }): Promise<Response>;
  login(): Promise<string>;
  form(path: string, cookie: string, fields: Record<string, string>): Promise<Response>;
  /** Signs up through better-auth (as the app does); returns the session token and user id. Not approved. */
  signUp(input?: { name?: string; email?: string; password?: string; ip?: string }): Promise<{ token: string; userId: string; email: string }>;
  /** Signs up a fresh account and approves it in /admin; returns the Bearer session token. */
  account(name?: string): Promise<string>;
  /** User id behind a session token (GET /api/account). */
  accountId(token: string): Promise<string>;
  /** Runs an /admin account action (approve | disable | enable) for the account behind `token`. */
  adminAction(token: string, action: 'approve' | 'disable' | 'enable'): Promise<void>;
  /** Disables the account that `token` belongs to, through the admin dashboard. */
  disable(token: string): Promise<void>;
  /** Sends with `Authorization: Bearer <token>`. */
  authed(path: string, token: string, init?: RequestInit & { ip?: string }): Promise<Response>;
}

let harnessCount = 0;

/**
 * Each harness gets its own clock hour so global (all-clients) rate-limit windows in D1 do not leak
 * between tests in the same file.
 */
export async function harness(overrides: Omit<DepsOverrides, 'now'> = {}): Promise<Harness> {
  harnessCount += 1;
  const clock = { now: 1_790_000_000 + harnessCount * 7200 };
  const { deps } = await depsFromEnv(env, { ...overrides, now: () => clock.now });
  const ip = freshIp();

  const send: Harness['send'] = (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('CF-Connecting-IP', init.ip ?? ip);
    return handleRequest(new Request(BASE + path, { ...init, headers }), deps);
  };

  const form: Harness['form'] = (path, cookie, fields) =>
    send(path, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE },
      body: new URLSearchParams(fields).toString(),
    });

  let cachedCookie: string | null = null;
  const login: Harness['login'] = async () => {
    if (cachedCookie !== null) return cachedCookie;
    const res = await send('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE },
      body: new URLSearchParams({ password: TEST_ADMIN_PASSWORD }).toString(),
    });
    const cookie = res.headers.get('Set-Cookie');
    if (res.status !== 303 || cookie === null) throw new Error(`login failed: ${res.status}`);
    cachedCookie = cookie.split(';')[0] ?? '';
    return cachedCookie;
  };

  const signUp: Harness['signUp'] = async (input = {}) => {
    const email = input.email ?? `trainer-${crypto.randomUUID()}@example.com`;
    const res = await send('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: TEST_APP_ORIGIN },
      body: JSON.stringify({ name: input.name ?? 'كابتن تجربة', email, password: input.password ?? TEST_PASSWORD }),
      ip: input.ip ?? freshIp(),
    });
    const body = (await res.json()) as { token?: string; user?: { id?: string } };
    if (typeof body.token !== 'string' || typeof body.user?.id !== 'string') throw new Error(`sign-up failed: ${res.status}`);
    return { token: body.token, userId: body.user.id, email };
  };

  const accountId: Harness['accountId'] = async (token) => {
    const res = await authed('/api/account', token, { ip: freshIp() });
    const body = (await res.json()) as { account?: { id?: string } };
    if (typeof body.account?.id !== 'string') throw new Error(`no account: ${res.status}`);
    return body.account.id;
  };

  const adminAction: Harness['adminAction'] = async (token, action) => {
    const id = await accountId(token);
    const res = await form(`/admin/accounts/${action}`, await login(), { id, confirmed: 'yes' });
    if (res.status !== 303) throw new Error(`${action} failed: ${res.status}`);
  };

  const account: Harness['account'] = async (name) => {
    const { token } = await signUp(name === undefined ? {} : { name });
    await adminAction(token, 'approve');
    return token;
  };

  const disable: Harness['disable'] = (token) => adminAction(token, 'disable');

  function authed(path: string, token: string, init: RequestInit & { ip?: string } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return send(path, { ...init, headers });
  }

  return { deps, clock, ip, send, login, form, signUp, account, accountId, adminAction, disable, authed };
}

/** A body that starts with the given 4-byte magic, then `size - 4` filler bytes. */
export function envelopeBytes(magic: 'PTP1' | 'PTK1', size: number, fill = 7): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size).fill(fill);
  out.set(new TextEncoder().encode(magic), 0);
  return out;
}

export async function storedBytes(): Promise<number> {
  const row = await env.DB.prepare('SELECT bytes FROM storage_usage WHERE id = 1').first<{ bytes: number }>();
  return row?.bytes ?? 0;
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  const value: unknown = await res.json();
  if (typeof value !== 'object' || value === null) throw new Error('not an object');
  return value as Record<string, unknown>;
}
