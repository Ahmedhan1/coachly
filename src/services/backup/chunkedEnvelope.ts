import { DEFAULT_PBKDF2_ITERATIONS, MIN_PBKDF2_ITERATIONS } from '../../../shared/envelope';
import { err, ok, type Result } from '@/domain/nutrition/result';

/**
 * Chunked password envelope for device backup files ("PTB1", SECURITY.md §3). The older PTP1 envelope is one
 * AES-GCM message, so sealing a 300-photo backup needed the whole zip plus its ciphertext in JS memory at once,
 * which can kill Safari on an older iPhone. PTB1 encrypts the zip in independent chunks read from the Blob
 * one at a time and writes each ciphertext chunk into Blob storage, so peak JS memory is about two chunks.
 *
 * Layout (big-endian):
 *   header  magic "PTB1"(4) | version u8 | iterations u32 | salt(16) | chunkSize u32 | chunkCount u32 |
 *           plainSize u64 | fileId(16) | wrapIv(12) | wrappedKey(48)
 *   chunk i iv(12) | AES-256-GCM(dataKey, chunk bytes) incl. 16-byte tag
 *
 * - KEK = PBKDF2-SHA-256(password, salt, iterations); it wraps a random 256-bit data key (AAD = header up to
 *   fileId), so a wrong password fails on the 48-byte key, before any chunk is read.
 * - Each chunk's AAD = header up to fileId | index u32 | isLast u8: chunks cannot be reordered, swapped
 *   between files or dropped without detection; plainSize/chunkCount are authenticated by every chunk.
 */

export const PTB1_MAGIC = [0x50, 0x54, 0x42, 0x31];
const VERSION = 1;
const SALT = 16;
const IV = 12;
const TAG = 16;
const FILE_ID = 16;
/** Bytes authenticated by every chunk (magic … fileId). */
const AAD_HEADER = 4 + 1 + 4 + SALT + 4 + 4 + 8 + FILE_ID;
const WRAPPED_KEY = 32 + TAG;
export const PTB1_HEADER_BYTES = AAD_HEADER + IV + WRAPPED_KEY;
export const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
const MIN_CHUNK = 1024;
const MAX_CHUNK = 64 * 1024 * 1024;
const MAX_ITERATIONS = 10_000_000;

const encoder = new TextEncoder();

export type ChunkProgress = (done: number, total: number) => void;

export interface SealOptions {
  iterations?: number;
  chunkBytes?: number;
  onProgress?: ChunkProgress;
  signal?: AbortSignal;
}

async function kek(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function chunkAad(header: Uint8Array, index: number, last: boolean): Uint8Array {
  const aad = new Uint8Array(AAD_HEADER + 5);
  aad.set(header.subarray(0, AAD_HEADER));
  const view = new DataView(aad.buffer);
  view.setUint32(AAD_HEADER, index, false);
  aad[AAD_HEADER + 4] = last ? 1 : 0;
  return aad;
}

function chunkCountFor(size: number, chunk: number): number {
  return Math.max(1, Math.ceil(size / chunk));
}

/** True when the first bytes are a PTB1 header. */
export function isChunkedEnvelope(head: Uint8Array): boolean {
  return PTB1_MAGIC.every((b, i) => head[i] === b);
}

/** Encrypts `plain` chunk by chunk into a new Blob. Throws only on a programming error (bad options) or abort. */
export async function sealChunked(plain: Blob, password: string, options: SealOptions = {}): Promise<Blob> {
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_ITERATIONS) throw new RangeError('iterations');
  if (!Number.isInteger(chunkBytes) || chunkBytes < MIN_CHUNK || chunkBytes > MAX_CHUNK) throw new RangeError('chunkBytes');
  const count = chunkCountFor(plain.size, chunkBytes);
  const header = new Uint8Array(PTB1_HEADER_BYTES);
  const view = new DataView(header.buffer);
  header.set(PTB1_MAGIC, 0);
  header[4] = VERSION;
  view.setUint32(5, iterations, false);
  const salt = crypto.getRandomValues(new Uint8Array(SALT));
  header.set(salt, 9);
  view.setUint32(9 + SALT, chunkBytes, false);
  view.setUint32(13 + SALT, count, false);
  view.setUint32(17 + SALT, Math.floor(plain.size / 2 ** 32), false);
  view.setUint32(21 + SALT, plain.size >>> 0, false);
  header.set(crypto.getRandomValues(new Uint8Array(FILE_ID)), 25 + SALT);
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV));
  header.set(wrapIv, AAD_HEADER);

  const dataKeyRaw = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: wrapIv as BufferSource, additionalData: header.subarray(0, AAD_HEADER) as BufferSource },
      await kek(password, salt, iterations),
      dataKeyRaw as BufferSource,
    ),
  );
  header.set(wrapped, AAD_HEADER + IV);
  const dataKey = await aesKey(dataKeyRaw);
  dataKeyRaw.fill(0);

  const parts: Blob[] = [new Blob([header as BlobPart])];
  for (let i = 0; i < count; i++) {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const start = i * chunkBytes;
    const bytes = new Uint8Array(await plain.slice(start, Math.min(plain.size, start + chunkBytes)).arrayBuffer());
    const iv = crypto.getRandomValues(new Uint8Array(IV));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: chunkAad(header, i, i === count - 1) as BufferSource },
      dataKey,
      bytes as BufferSource,
    );
    parts.push(new Blob([iv as BlobPart, ct]));
    options.onProgress?.(i + 1, count);
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

export type OpenChunkedError = 'wrong_password' | 'malformed' | 'cancelled';

export interface OpenOptions {
  onProgress?: ChunkProgress;
  signal?: AbortSignal;
}

/** Decrypts a PTB1 file chunk by chunk into a Blob. Never throws. */
export async function openChunked(file: Blob, password: string, options: OpenOptions = {}): Promise<Result<Blob, OpenChunkedError>> {
  try {
    if (file.size < PTB1_HEADER_BYTES) return err('malformed');
    const header = new Uint8Array(await file.slice(0, PTB1_HEADER_BYTES).arrayBuffer());
    const view = new DataView(header.buffer);
    if (!isChunkedEnvelope(header) || header[4] !== VERSION) return err('malformed');
    const iterations = view.getUint32(5, false);
    const salt = header.slice(9, 9 + SALT);
    const chunkBytes = view.getUint32(9 + SALT, false);
    const count = view.getUint32(13 + SALT, false);
    const plainSize = view.getUint32(17 + SALT, false) * 2 ** 32 + view.getUint32(21 + SALT, false);
    if (iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_ITERATIONS) return err('malformed');
    if (chunkBytes < MIN_CHUNK || chunkBytes > MAX_CHUNK || count !== chunkCountFor(plainSize, chunkBytes)) return err('malformed');
    if (file.size !== PTB1_HEADER_BYTES + plainSize + count * (IV + TAG)) return err('malformed');

    let dataKey: CryptoKey;
    try {
      const raw = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: header.slice(AAD_HEADER, AAD_HEADER + IV) as BufferSource, additionalData: header.subarray(0, AAD_HEADER) as BufferSource },
          await kek(password, salt, iterations),
          header.slice(AAD_HEADER + IV) as BufferSource,
        ),
      );
      dataKey = await aesKey(raw);
      raw.fill(0);
    } catch {
      return err('wrong_password');
    }

    const parts: Blob[] = [];
    let offset = PTB1_HEADER_BYTES;
    for (let i = 0; i < count; i++) {
      if (options.signal?.aborted) return err('cancelled');
      const plainLen = i === count - 1 ? plainSize - chunkBytes * (count - 1) : chunkBytes;
      const sealed = new Uint8Array(await file.slice(offset, offset + IV + plainLen + TAG).arrayBuffer());
      offset += IV + plainLen + TAG;
      let plain: ArrayBuffer;
      try {
        plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: sealed.subarray(0, IV) as BufferSource, additionalData: chunkAad(header, i, i === count - 1) as BufferSource },
          dataKey,
          sealed.subarray(IV) as BufferSource,
        );
      } catch {
        return err('malformed');
      }
      parts.push(new Blob([plain]));
      options.onProgress?.(i + 1, count);
    }
    return ok(new Blob(parts, { type: 'application/zip' }));
  } catch {
    return err('malformed');
  }
}
