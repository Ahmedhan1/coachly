/**
 * Plain layout of a cloud file before encryption: magic "PF1\0", 4-byte big-endian header length, UTF-8 JSON
 * header ({ mime, name? }), then the file bytes. Encrypting the header too means the server never learns the
 * type or the name; the app gets both back on any device.
 */
export interface PackedHeader {
  mime: string;
  name?: string;
}

const MAGIC = [0x50, 0x46, 0x31, 0x00]; // "PF1\0"
const MIME = /^[a-z]+\/[a-z0-9.+-]+$/;
const MAX_HEADER = 4096;

export function packFile(header: PackedHeader, bytes: Uint8Array): Uint8Array {
  if (!MIME.test(header.mime)) throw new Error('bad mime');
  const json = new TextEncoder().encode(JSON.stringify(header.name === undefined ? { mime: header.mime } : { mime: header.mime, name: header.name }));
  if (json.length > MAX_HEADER) throw new Error('header too long');
  const out = new Uint8Array(8 + json.length + bytes.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, json.length);
  out.set(json, 8);
  out.set(bytes, 8 + json.length);
  return out;
}

export function unpackFile(packed: Uint8Array): { header: PackedHeader; bytes: Uint8Array } | null {
  if (packed.length < 8 || MAGIC.some((b, i) => packed[i] !== b)) return null;
  const length = new DataView(packed.buffer, packed.byteOffset, packed.byteLength).getUint32(4);
  if (length > MAX_HEADER || 8 + length > packed.length) return null;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(packed.subarray(8, 8 + length)));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { mime, name } = value as Record<string, unknown>;
  if (typeof mime !== 'string' || !MIME.test(mime) || (name !== undefined && typeof name !== 'string')) return null;
  const header: PackedHeader = name === undefined ? { mime } : { mime, name };
  return { header, bytes: packed.slice(8 + length) };
}
