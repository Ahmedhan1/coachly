import { base64UrlDecode, base64UrlEncode } from '../../../shared/bytes';
import { constantTimeEqual } from '../serverCrypto';

/**
 * Password hashing that fits the Workers Free plan (10 ms CPU per request). better-auth's default scrypt (pure JS)
 * measured ~80 ms per hash in workerd (docs/LIMITS.md); Web Crypto PBKDF2-SHA-256 runs natively at ~1.5 ms per
 * 10,000 iterations. Format: `pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>`, so the cost can be raised
 * later without breaking existing hashes (verify reads the iterations from the stored value).
 */
export const PASSWORD_ITERATIONS = 30_000;
const PREFIX = 'pbkdf2-sha256';
const SALT_BYTES = 16;
const HASH_BITS = 256;
/** Web Crypto in Workers refuses more than 100,000 PBKDF2 iterations. */
const MAX_ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS));
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return [PREFIX, String(iterations), base64UrlEncode(salt), base64UrlEncode(hash)].join('$');
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [prefix, iterText, saltText, hashText, extra] = hash.split('$');
  if (prefix !== PREFIX || extra !== undefined || !/^\d{1,6}$/.test(iterText ?? '')) return false;
  const iterations = Number(iterText);
  const salt = base64UrlDecode(saltText ?? '');
  const expected = base64UrlDecode(hashText ?? '');
  if (iterations < 1 || iterations > MAX_ITERATIONS || salt === null || expected === null || expected.length !== HASH_BITS / 8) return false;
  return constantTimeEqual(await derive(password, salt, iterations), expected);
}
