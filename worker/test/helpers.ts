import { env } from 'cloudflare:workers';
import { depsFromEnv, type DepsOverrides } from '../src/deps';
import { handleRequest } from '../src/app';
import type { Deps } from '../src/ports';
import { decodeLicenseToken } from '../../shared/license';
import { TEST_ADMIN_PASSWORD } from './fixtures';

export const BASE = 'https://license.example';
export const DAY = 86_400;

let ipCounter = 0;
/** A fresh client IP per test keeps rate-limit buckets independent. */
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}-${Date.now()}-${ipCounter}`;
}

export interface Harness {
  deps: Deps;
  clock: { now: number };
  ip: string;
  send(path: string, init?: RequestInit & { ip?: string }): Promise<Response>;
  login(): Promise<string>;
  issueCode(input?: { name?: string; duration?: string; window?: string }): Promise<string>;
  activate(code: string, deviceId: string, ip?: string): Promise<Response>;
  form(path: string, cookie: string, fields: Record<string, string>): Promise<Response>;
  /** Issues and activates a fresh license on a fresh device; returns the Bearer token. */
  license(name?: string): Promise<string>;
  /** Revokes the license that `token` belongs to, through the admin dashboard. */
  revoke(token: string): Promise<void>;
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

  const issueCode: Harness['issueCode'] = async (input = {}) => {
    const cookie = await login();
    const res = await form('/admin/codes', cookie, {
      name: input.name ?? 'كابتن تجربة',
      duration: input.duration ?? 'lifetime',
      window: input.window ?? '14',
    });
    return extractCode(await (await followIssued(send, res, cookie)).text());
  };

  const activate: Harness['activate'] = (code, deviceId, otherIp) =>
    send('/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceId }),
      ...(otherIp === undefined ? {} : { ip: otherIp }),
    });

  const license: Harness['license'] = async (name) => {
    const code = await issueCode(name === undefined ? {} : { name });
    const res = await activate(code, crypto.randomUUID(), freshIp());
    const body = (await res.json()) as { license?: string };
    if (typeof body.license !== 'string') throw new Error(`activation failed: ${res.status}`);
    return body.license;
  };

  const revoke: Harness['revoke'] = async (token) => {
    const lid = decodeLicenseToken(token)?.payload.lid ?? '';
    const res = await form('/admin/licenses/revoke', await login(), { lid, confirmed: 'yes' });
    if (res.status !== 303) throw new Error(`revoke failed: ${res.status}`);
  };

  const authed: Harness['authed'] = (path, token, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return send(path, { ...init, headers });
  };

  return { deps, clock, ip, send, login, issueCode, activate, form, license, revoke, authed };
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

/** Follows the dashboard's Post/Redirect/Get after a code is issued: GET /admin/issued with the one-time cookie. */
export async function followIssued(
  send: (path: string, init?: RequestInit) => Promise<Response>,
  res: Response,
  sessionCookie: string,
): Promise<Response> {
  const location = res.headers.get('Location');
  const issued = (res.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
  if (res.status !== 303 || location !== '/admin/issued' || issued === '') throw new Error(`no issued redirect: ${res.status}`);
  return send(location, { headers: { Cookie: `${sessionCookie}; ${issued}` } });
}

export function extractCode(html: string): string {
  const match = /class="code">([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})</.exec(html);
  if (match?.[1] === undefined) throw new Error('no code in page');
  return match[1];
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  const value: unknown = await res.json();
  if (typeof value !== 'object' || value === null) throw new Error('not an object');
  return value as Record<string, unknown>;
}
