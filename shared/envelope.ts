// Encrypted envelope format shared by the app, the Worker's client page and tests.
// Everything that leaves the trainer's device (cloud backup, client page, check-ins) is wrapped in one of
// these. The server only ever stores the opaque bytes.
//
// Key envelope  ("PTK1"): magic(4) | iv(12) | AES-256-GCM ciphertext+tag
// Password env. ("PTP1"): magic(4) | salt(16) | iterations u32 BE (4) | iv(12) | AES-256-GCM ciphertext+tag
//   key = PBKDF2-SHA-256(password, salt, iterations) -> 256-bit AES-GCM key
//
// Only Web Crypto primitives available in iOS Safari 16.4+, Cloudflare Workers and Node 22 are used.

const KEY_MAGIC = 'PTK1';
const PASSWORD_MAGIC = 'PTP1';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
export const DEFAULT_PBKDF2_ITERATIONS = 310_000;
export const MIN_PBKDF2_ITERATIONS = 100_000;

export type EnvelopeError = 'malformed' | 'decrypt_failed';
export type OpenResult = { ok: true; data: Uint8Array } | { ok: false; error: EnvelopeError };

const encoder = new TextEncoder();

function magicBytes(magic: string): Uint8Array {
  return encoder.encode(magic);
}

function hasMagic(bytes: Uint8Array, magic: string): boolean {
  const m = magicBytes(magic);
  if (bytes.length < m.length) return false;
  return m.every((b, i) => bytes[i] === b);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** A fresh random 256-bit key, e.g. for a client-page link (lives only in the URL fragment). */
export function generateRawKey(): Uint8Array {
  return randomBytes(32);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error('AES key must be 32 bytes');
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function aesEncrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource),
  );
}

async function aesDecrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource),
    );
  } catch {
    return null;
  }
}

export async function sealWithKey(rawKey: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(IV_LENGTH);
  const ct = await aesEncrypt(await importAesKey(rawKey), iv, data);
  return concat([magicBytes(KEY_MAGIC), iv, ct]);
}

export async function openWithKey(rawKey: Uint8Array, envelope: Uint8Array): Promise<OpenResult> {
  const header = 4 + IV_LENGTH;
  if (!hasMagic(envelope, KEY_MAGIC) || envelope.length < header + 16 || rawKey.length !== 32) {
    return { ok: false, error: 'malformed' };
  }
  const iv = envelope.subarray(4, header);
  const data = await aesDecrypt(await importAesKey(rawKey), iv, envelope.subarray(header));
  return data ? { ok: true, data } : { ok: false, error: 'decrypt_failed' };
}

export async function sealWithPassword(
  password: string,
  data: Uint8Array,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<Uint8Array> {
  if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS) throw new Error('iterations too low');
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const ct = await aesEncrypt(await derivePasswordKey(password, salt, iterations), iv, data);
  const iter = new Uint8Array(4);
  new DataView(iter.buffer).setUint32(0, iterations, false);
  return concat([magicBytes(PASSWORD_MAGIC), salt, iter, iv, ct]);
}

export async function openWithPassword(password: string, envelope: Uint8Array): Promise<OpenResult> {
  const header = 4 + SALT_LENGTH + 4 + IV_LENGTH;
  if (!hasMagic(envelope, PASSWORD_MAGIC) || envelope.length < header + 16) return { ok: false, error: 'malformed' };
  const salt = envelope.subarray(4, 4 + SALT_LENGTH);
  const iterations = new DataView(envelope.buffer, envelope.byteOffset + 4 + SALT_LENGTH, 4).getUint32(0, false);
  if (iterations < MIN_PBKDF2_ITERATIONS || iterations > 10_000_000) return { ok: false, error: 'malformed' };
  const iv = envelope.subarray(4 + SALT_LENGTH + 4, header);
  const key = await derivePasswordKey(password, salt, iterations);
  const data = await aesDecrypt(key, iv, envelope.subarray(header));
  return data ? { ok: true, data } : { ok: false, error: 'decrypt_failed' };
}
