// Byte helpers shared by the app and the Worker (base64url without padding, hex).

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_INDEX: ReadonlyMap<string, number> = new Map([...B64URL].map((c, i) => [c, i]));

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63) + B64URL.charAt((n >>> 6) & 63) + B64URL.charAt(n & 63);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63);
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64URL.charAt(n >>> 18) + B64URL.charAt((n >>> 12) & 63) + B64URL.charAt((n >>> 6) & 63);
  }
  return out;
}

/** Strict decoder: no padding, base64url alphabet only, canonical encoding only. Returns null on error. */
export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> | null {
  if (text.length % 4 === 1) return null;
  const values: number[] = [];
  for (const ch of text) {
    const v = B64URL_INDEX.get(ch);
    if (v === undefined) return null;
    values.push(v);
  }
  const out = new Uint8Array(Math.floor((values.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const v of values) {
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >>> bits) & 255;
    }
  }
  // Leftover bits must be zero, otherwise two strings would decode to the same bytes.
  if ((buffer & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
