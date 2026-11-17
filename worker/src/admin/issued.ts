import type { ServerCrypto } from '../ports';
import { constantTimeEqual } from '../serverCrypto';

/**
 * Post/Redirect/Get for a freshly issued code. The code is never stored on the server (only its HMAC), so
 * the POST hands it to the owner's own browser in a short-lived, HttpOnly, MAC-protected cookie and
 * redirects to GET /admin/issued. Refreshing that page shows the same code again instead of issuing a new
 * one, and the cookie disappears after ISSUED_SECONDS.
 */
export const ISSUED_COOKIE = '__Host-ptcode';
export const ISSUED_SECONDS = 30 * 60;

export interface IssuedCode {
  code: string;
  name: string;
  actBy: number;
  durationDays: number | null;
  moved: boolean;
}

function toB64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): string | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export async function createIssuedCookie(crypto: ServerCrypto, issued: IssuedCode, now: number): Promise<string> {
  const body = toB64url(JSON.stringify({ ...issued, until: now + ISSUED_SECONDS }));
  const mac = await crypto.sessionMac(`issued|${body}`);
  return `${ISSUED_COOKIE}=${body}.${mac}; Path=/; Max-Age=${ISSUED_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function isIssued(value: unknown): value is IssuedCode & { until: number } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === 'string' &&
    typeof v.name === 'string' &&
    typeof v.actBy === 'number' &&
    (v.durationDays === null || typeof v.durationDays === 'number') &&
    typeof v.moved === 'boolean' &&
    typeof v.until === 'number'
  );
}

export async function readIssuedCookie(request: Request, crypto: ServerCrypto, now: number): Promise<IssuedCode | null> {
  const value = readCookie(request, ISSUED_COOKIE);
  if (value === null) return null;
  const [body, mac] = value.split('.');
  if (body === undefined || mac === undefined || body === '') return null;
  const expected = await crypto.sessionMac(`issued|${body}`);
  const encoder = new TextEncoder();
  if (!constantTimeEqual(encoder.encode(mac), encoder.encode(expected))) return null;
  const json = fromB64url(body);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isIssued(parsed) || parsed.until <= now) return null;
  const { code, name, actBy, durationDays, moved } = parsed;
  return { code, name, actBy, durationDays, moved };
}
