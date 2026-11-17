// Small byte helpers for the push code. Imports use the `.ts` extension so `bench/push-benchmark.mjs` can load
// these files directly in Node 22 (type stripping) as well as through wrangler/vitest.
import { base64UrlDecode, base64UrlEncode } from '../../../shared/license.ts';

export { base64UrlDecode, base64UrlEncode };

export const utf8 = new TextEncoder();

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Copies into a fresh ArrayBuffer-backed array (Web Crypto's BufferSource typing wants that). */
export function own(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}
