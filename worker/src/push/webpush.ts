// RFC 8291 (Message Encryption for Web Push) with the RFC 8188 "aes128gcm" content coding, using only Web
// Crypto: ECDH P-256, HKDF-SHA-256 and AES-128-GCM. Node's `web-push` package does not run on Workers.
import { base64UrlEncode, concatBytes, own, utf8 } from './bytes.ts';

/** Record size written in the header. One record is enough: push services cap bodies at 4096 bytes. */
export const RECORD_SIZE = 4096;
const HEADER_LENGTH = 16 + 4 + 1 + 65;
const TAG_LENGTH = 16;
/** Largest plaintext that still fits one 4096-byte push body (header + delimiter + tag). */
export const MAX_PLAINTEXT = RECORD_SIZE - HEADER_LENGTH - 1 - TAG_LENGTH;

export interface SubscriptionKeys {
  /** User agent public key: 65-byte uncompressed P-256 point. */
  p256dh: Uint8Array;
  /** 16-byte authentication secret. */
  auth: Uint8Array;
}

/** Fixed inputs so the RFC 8291 Appendix A vectors can be reproduced. Production code leaves them out. */
export interface EncryptionInputs {
  serverKeys?: { privateKey: CryptoKey; publicRaw: Uint8Array };
  salt?: Uint8Array;
}

export class PushKeyError extends Error {}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bits: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', own(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: own(salt), info: own(info) }, key, bits));
}

/**
 * ECDH parameters. The Web Crypto spec (and workerd at runtime) use `public`; @cloudflare/workers-types names
 * the member `$public` because `public` is reserved, so the standard object is cast here.
 */
export function ecdhParams(publicKey: CryptoKey): SubtleCryptoDeriveKeyAlgorithm {
  return { name: 'ECDH', public: publicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
}

export function validateKeys(keys: SubscriptionKeys): void {
  if (keys.p256dh.length !== 65 || keys.p256dh[0] !== 0x04) throw new PushKeyError('p256dh must be a 65-byte uncompressed point');
  if (keys.auth.length !== 16) throw new PushKeyError('auth must be 16 bytes');
}

/** Imports an ECDH P-256 private key from its 32-byte scalar and 65-byte public point (via JWK). */
export async function importEcPrivateKey(d: Uint8Array, publicRaw: Uint8Array, algorithm: 'ECDH' | 'ECDSA'): Promise<CryptoKey> {
  if (d.length !== 32 || publicRaw.length !== 65 || publicRaw[0] !== 0x04) throw new PushKeyError('bad P-256 key');
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: base64UrlEncode(d),
    x: base64UrlEncode(publicRaw.subarray(1, 33)),
    y: base64UrlEncode(publicRaw.subarray(33, 65)),
    ext: false,
  };
  const usages: string[] = algorithm === 'ECDH' ? ['deriveBits'] : ['sign'];
  return crypto.subtle.importKey('jwk', jwk, { name: algorithm, namedCurve: 'P-256' }, false, usages);
}

async function freshServerKeys(): Promise<{ privateKey: CryptoKey; publicRaw: Uint8Array }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return { privateKey: pair.privateKey, publicRaw };
}

export interface DerivedSecrets {
  ecdhSecret: Uint8Array;
  ikm: Uint8Array;
  cek: Uint8Array;
  nonce: Uint8Array;
}

/** Key schedule of RFC 8291 section 3.4 + RFC 8188 section 2.2. Exposed for the test vectors. */
export async function deriveSecrets(
  keys: SubscriptionKeys,
  server: { privateKey: CryptoKey; publicRaw: Uint8Array },
  salt: Uint8Array,
): Promise<DerivedSecrets> {
  validateKeys(keys);
  const uaPublic = await crypto.subtle.importKey('raw', own(keys.p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams(uaPublic), server.privateKey, 256));
  const keyInfo = concatBytes(utf8.encode('WebPush: info\0'), keys.p256dh, server.publicRaw);
  const ikm = await hkdf(ecdhSecret, keys.auth, keyInfo, 256);
  const cek = await hkdf(ikm, salt, utf8.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(ikm, salt, utf8.encode('Content-Encoding: nonce\0'), 96);
  return { ecdhSecret, ikm, cek, nonce };
}

/** Encrypts one push message body: header(salt | rs | idlen | as_public) || AES-GCM(plaintext || 0x02). */
export async function encryptPushPayload(plaintext: Uint8Array, keys: SubscriptionKeys, inputs: EncryptionInputs = {}): Promise<Uint8Array<ArrayBuffer>> {
  if (plaintext.length > MAX_PLAINTEXT) throw new PushKeyError('payload too large');
  const server = inputs.serverKeys ?? (await freshServerKeys());
  const salt = inputs.salt ?? crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new PushKeyError('salt must be 16 bytes');
  const { cek, nonce } = await deriveSecrets(keys, server, salt);

  const aesKey = await crypto.subtle.importKey('raw', own(cek), 'AES-GCM', false, ['encrypt']);
  const padded = concatBytes(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: own(nonce) }, aesKey, padded));

  const header = new Uint8Array(HEADER_LENGTH);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE, false);
  header[20] = 65;
  header.set(server.publicRaw, 21);
  return concatBytes(header, ciphertext);
}
