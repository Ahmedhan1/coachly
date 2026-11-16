import { env } from 'cloudflare:workers';
import { depsFromEnv } from '../src/deps';
import { handleRequest } from '../src/app';
import type { Deps } from '../src/ports';
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
}

let harnessCount = 0;

/**
 * Each harness gets its own clock hour so global (all-clients) rate-limit windows in D1 do not leak
 * between tests in the same file.
 */
export async function harness(): Promise<Harness> {
  harnessCount += 1;
  const clock = { now: 1_790_000_000 + harnessCount * 7200 };
  const { deps } = await depsFromEnv(env, { now: () => clock.now });
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
    return extractCode(await res.text());
  };

  const activate: Harness['activate'] = (code, deviceId, otherIp) =>
    send('/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceId }),
      ...(otherIp === undefined ? {} : { ip: otherIp }),
    });

  return { deps, clock, ip, send, login, issueCode, activate, form };
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
