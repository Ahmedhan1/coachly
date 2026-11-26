import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode, bytesToHex, hexToBytes } from './bytes';

describe('base64url', () => {
  it('round-trips arbitrary bytes of every length mod 3', () => {
    for (let len = 0; len < 20; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + len) & 255);
      const s = base64UrlEncode(bytes);
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64UrlDecode(s)).toEqual(bytes);
    }
  });

  it('matches the RFC 4648 alphabet', () => {
    expect(base64UrlEncode(Uint8Array.from([0xfb, 0xff, 0xbf]))).toBe('-_-_');
    expect(base64UrlEncode(new TextEncoder().encode('foobar'))).toBe('Zm9vYmFy');
    expect(base64UrlEncode(new TextEncoder().encode('fo'))).toBe('Zm8');
  });

  it('rejects padding, foreign characters, impossible lengths and non-canonical tails', () => {
    expect(base64UrlDecode('Zm8=')).toBeNull();
    expect(base64UrlDecode('Zm+v')).toBeNull();
    expect(base64UrlDecode('Z')).toBeNull();
    expect(base64UrlDecode('Zm9')).toBeNull(); // "Zm8" is canonical for "fo"
  });
});

describe('hex', () => {
  it('round-trips and rejects bad input', () => {
    expect(bytesToHex(Uint8Array.from([0, 15, 255]))).toBe('000fff');
    expect(hexToBytes('000FFF')).toEqual(Uint8Array.from([0, 15, 255]));
    expect(hexToBytes('abc')).toBeNull();
    expect(hexToBytes('zz')).toBeNull();
  });
});

