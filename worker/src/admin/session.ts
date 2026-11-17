import type { ServerCrypto } from '../ports';
import { constantTimeEqual } from '../serverCrypto';

export const SESSION_COOKIE = '__Host-ptadmin';
export const SESSION_SECONDS = 12 * 60 * 60;

/** Stateless session: `<expiry>.<HMAC(expiry)>`. Changing ADMIN_PASSWORD invalidates every session. */
export async function createSessionCookie(crypto: ServerCrypto, now: number): Promise<string> {
  const expiry = now + SESSION_SECONDS;
  const value = `${expiry}.${await crypto.sessionMac(`admin|${expiry}`)}`;
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export async function hasValidSession(request: Request, crypto: ServerCrypto, now: number): Promise<boolean> {
  const value = readCookie(request, SESSION_COOKIE);
  if (value === null) return false;
  const [expiryText, mac] = value.split('.');
  if (expiryText === undefined || mac === undefined || !/^\d{1,12}$/.test(expiryText)) return false;
  const expiry = Number(expiryText);
  if (expiry <= now || expiry > now + SESSION_SECONDS) return false;
  const expected = await crypto.sessionMac(`admin|${expiry}`);
  const encoder = new TextEncoder();
  return constantTimeEqual(encoder.encode(mac), encoder.encode(expected));
}
