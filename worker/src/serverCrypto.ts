import { base64UrlEncode, bytesToHex, hexToBytes, KEY_LENGTH, signLicense, verifyLicenseToken } from '../../shared/license';
import type { ServerCrypto } from './ports';

export interface Secrets {
  privateKeyHex: string;
  publicKeyHex: string;
  adminPassword: string;
}

const encoder = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
}

/** Separate HMAC key per purpose, derived from the signing key (one secret less for the owner to manage). */
async function hmacKey(purpose: string, ...material: Uint8Array[]): Promise<CryptoKey> {
  const raw = await sha256(concat(encoder.encode(`pt-coach/${purpose}/v1`), ...material));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function hmacHex(key: CryptoKey, data: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new Uint8Array(encoder.encode(data)))));
}

/** Compares two byte arrays without an early exit. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export class ConfigError extends Error {}

export async function createServerCrypto(secrets: Secrets): Promise<ServerCrypto> {
  const privateKey = hexToBytes(secrets.privateKeyHex.trim());
  const publicKey = hexToBytes(secrets.publicKeyHex.trim());
  if (privateKey === null || privateKey.length !== KEY_LENGTH) throw new ConfigError('LICENSE_PRIVATE_KEY must be 64 hex chars');
  if (publicKey === null || publicKey.length !== KEY_LENGTH) throw new ConfigError('LICENSE_PUBLIC_KEY must be 64 hex chars');
  if (secrets.adminPassword.length < 12) throw new ConfigError('ADMIN_PASSWORD must be at least 12 characters');

  const passwordDigest = await sha256(encoder.encode(secrets.adminPassword));
  const [codeKey, clientKey, sessionKey] = await Promise.all([
    hmacKey('code-hash', privateKey),
    hmacKey('client-hash', privateKey),
    // Changing ADMIN_PASSWORD logs every session out.
    hmacKey('admin-session', privateKey, passwordDigest),
  ]);

  return {
    signLicense: (payload) => signLicense(payload, privateKey),
    verifyLicense: (token) => verifyLicenseToken(token, publicKey),
    hashCode: (code) => hmacHex(codeKey, code),
    hashClient: async (ip) => (await hmacHex(clientKey, ip)).slice(0, 32),
    sessionMac: async (data) =>
      base64UrlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', sessionKey, new Uint8Array(encoder.encode(data))))),
    passwordMatches: async (candidate) => constantTimeEqual(await sha256(encoder.encode(candidate)), passwordDigest),
  };
}
