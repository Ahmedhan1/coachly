// VAPID (RFC 8292): an ES256 JWT signed with the application server key, sent as
// `Authorization: vapid t=<jwt>, k=<public key>`. Web Crypto's ECDSA output is already the raw r||s form JWS wants.
import { base64UrlDecode, base64UrlEncode, utf8 } from './bytes.ts';
import { importEcPrivateKey } from './webpush.ts';

export interface VapidKeys {
  signingKey: CryptoKey;
  /** base64url of the 65-byte uncompressed public key (what the app passes to pushManager.subscribe). */
  publicKey: string;
  publicRaw: Uint8Array;
  subject: string;
}

export class VapidConfigError extends Error {}

/** JWT lifetime. RFC 8292 section 2 caps `exp` at 24 h from now; 12 h leaves room for clock skew. */
export const VAPID_TTL_SECONDS = 12 * 60 * 60;

/** Signs and verifies a probe so a public key that does not match the private key is caught at start-up. */
async function keysMatch(signingKey: CryptoKey, publicRaw: Uint8Array): Promise<boolean> {
  const verifyKey = await crypto.subtle.importKey('raw', new Uint8Array(publicRaw), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const probe = utf8.encode('vapid-key-check');
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, probe);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, sig, probe);
}

export async function importVapidKeys(privateKeyB64: string, publicKeyB64: string, subject: string): Promise<VapidKeys> {
  const d = base64UrlDecode(privateKeyB64.trim());
  const publicRaw = base64UrlDecode(publicKeyB64.trim());
  if (d === null || d.length !== 32) throw new VapidConfigError('VAPID_PRIVATE_KEY must be base64url of 32 bytes');
  if (publicRaw === null || publicRaw.length !== 65) throw new VapidConfigError('VAPID_PUBLIC_KEY must be base64url of 65 bytes');
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject.trim())) {
    throw new VapidConfigError('VAPID_SUBJECT must be a mailto: or https: URL');
  }
  let signingKey: CryptoKey;
  let matches = false;
  try {
    signingKey = await importEcPrivateKey(d, publicRaw, 'ECDSA');
    matches = await keysMatch(signingKey, publicRaw);
  } catch {
    throw new VapidConfigError('VAPID keys do not form a valid P-256 key pair');
  }
  if (!matches) throw new VapidConfigError('VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY');
  return { signingKey, publicKey: base64UrlEncode(publicRaw), publicRaw, subject: subject.trim() };
}

/** The push service origin, e.g. "https://web.push.apple.com". */
export function audienceOf(endpoint: string): string {
  return new URL(endpoint).origin;
}

export async function signVapidJwt(keys: VapidKeys, audience: string, now: number): Promise<string> {
  const header = base64UrlEncode(utf8.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64UrlEncode(utf8.encode(JSON.stringify({ aud: audience, exp: now + VAPID_TTL_SECONDS, sub: keys.subject })));
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.signingKey, utf8.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export function vapidAuthorization(jwt: string, keys: VapidKeys): string {
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}
