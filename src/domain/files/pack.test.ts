import { describe, expect, it } from 'vitest';
import { packFile, unpackFile } from './pack';

describe('packFile / unpackFile', () => {
  it('round-trips the content type, an optional name and the bytes', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const packed = packFile({ mime: 'image/jpeg', name: 'إيصال نوفمبر.pdf' }, bytes);
    expect(unpackFile(packed)).toEqual({ header: { mime: 'image/jpeg', name: 'إيصال نوفمبر.pdf' }, bytes });
  });

  it('works without a name and with empty content', () => {
    expect(unpackFile(packFile({ mime: 'application/pdf' }, new Uint8Array(0)))).toEqual({ header: { mime: 'application/pdf' }, bytes: new Uint8Array(0) });
  });

  it('returns null for anything that is not a packed file', () => {
    expect(unpackFile(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(unpackFile(new TextEncoder().encode('PF1\u0000\u0000\u0000\u0009{"mime":1}'))).toBeNull();
    const huge = packFile({ mime: 'image/png' }, new Uint8Array(4));
    huge[6] = 0xff; // header length runs past the end
    expect(unpackFile(huge)).toBeNull();
  });

  it('refuses content types that are not plain type/subtype', () => {
    expect(() => packFile({ mime: 'text/html; <script>' }, new Uint8Array(1))).toThrow();
  });
});
