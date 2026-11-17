import { describe, expect, it } from 'vitest';
import {
  OFFLINE_CODE_PREFIX,
  SHORT_CODE_ALPHABET,
  base64UrlDecode,
  base64UrlEncode,
  bytesToHex,
  decodeLicenseToken,
  deviceFingerprint,
  formatShortCode,
  generateKeyPair,
  generateShortCode,
  hexToBytes,
  normalizeShortCode,
  parseLicensePayload,
  publicKeyFromPrivate,
  signLicense,
  unwrapOfflineCode,
  verifyLicenseToken,
  wrapOfflineCode,
  type LicensePayload,
} from './license';

const DEVICE_ID = '6f1c2a1e-6d3b-4b0a-9a51-7f0f6a9f3c11';

async function samplePayload(over: Partial<LicensePayload> = {}): Promise<LicensePayload> {
  return {
    v: 1,
    lid: 'lic_123',
    dev: await deviceFingerprint(DEVICE_ID),
    name: 'كابتن أحمد',
    iat: 1_790_000_000,
    actBy: 1_791_209_600,
    exp: null,
    feat: ['core'],
    ...over,
  };
}

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

describe('short code', () => {
  it('uses only the contract alphabet and has 12 chars', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(12);
      for (const ch of code) expect(SHORT_CODE_ALPHABET).toContain(ch);
    }
  });

  it('is unbiased enough: every alphabet char appears', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) for (const ch of generateShortCode()) seen.add(ch);
    expect(seen.size).toBe(SHORT_CODE_ALPHABET.length);
  });

  it('formats as XXXX-XXXX-XXXX', () => {
    expect(formatShortCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });

  it('normalises case, dashes, spaces and Arabic-Indic digits', () => {
    expect(normalizeShortCode(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
    expect(normalizeShortCode('abcd–efgh—٢٣٤٥')).toBe('ABCDEFGH2345');
  });

  it('rejects wrong length or characters outside the alphabet', () => {
    expect(normalizeShortCode('ABCD-EFGH-JKM')).toBeNull();
    expect(normalizeShortCode('ABCD-EFGH-JKMO')).toBeNull(); // O is excluded
    expect(normalizeShortCode('ABCD-EFGH-JKM1')).toBeNull(); // 1 is excluded
  });
});

describe('device fingerprint', () => {
  it('is the first 32 hex chars of SHA-256(deviceId)', async () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(await deviceFingerprint('abc')).toBe('ba7816bf8f01cfea414140de5dae2223');
  });

  it('ignores surrounding spaces and letter case of a hand-copied device id', async () => {
    const id = '6f1c2a1e-6d3b-4b0a-9a51-7f0f6a9f3c11';
    expect(await deviceFingerprint(` ${id.toUpperCase()}\n`)).toBe(await deviceFingerprint(id));
  });
});

describe('payload validation', () => {
  it('accepts a well-formed payload', async () => {
    const p = await samplePayload({ exp: 1_800_000_000 });
    expect(parseLicensePayload(p)).toEqual(p);
  });

  it.each([
    ['wrong version', { v: 2 }],
    ['empty lid', { lid: '' }],
    ['dev not 32 hex', { dev: 'xyz' }],
    ['iat not integer', { iat: 1.5 }],
    ['exp string', { exp: '2030' }],
    ['feat not strings', { feat: [1] }],
    ['name not string', { name: 7 }],
  ])('rejects %s', async (_label, over) => {
    const p = { ...(await samplePayload()), ...over };
    expect(parseLicensePayload(p)).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(parseLicensePayload(null)).toBeNull();
    expect(parseLicensePayload([])).toBeNull();
    expect(parseLicensePayload('x')).toBeNull();
  });
});

describe('token sign / verify', () => {
  it('signs and verifies per the contract format', async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const payload = await samplePayload();
    const token = await signLicense(payload, privateKey);
    const [p, s] = token.split('.');
    expect(p).toBeDefined();
    expect(s).toBeDefined();
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(p ?? '') ?? new Uint8Array()))).toEqual(payload);
    expect(base64UrlDecode(s ?? '')).toHaveLength(64);
    expect(await verifyLicenseToken(token, publicKey)).toEqual({ ok: true, payload });
  });

  it('derives the public key from the private key', async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    expect(await publicKeyFromPrivate(privateKey)).toEqual(publicKey);
  });

  it('rejects a signature from another key', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const token = await signLicense(await samplePayload(), b.privateKey);
    expect(await verifyLicenseToken(token, a.publicKey)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a tampered payload', async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const token = await signLicense(await samplePayload(), privateKey);
    const sig = token.split('.')[1] ?? '';
    const forged = await samplePayload({ exp: null, name: 'someone else' });
    const tampered = `${base64UrlEncode(new TextEncoder().encode(JSON.stringify(forged)))}.${sig}`;
    expect(await verifyLicenseToken(tampered, publicKey)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('reports malformed tokens', async () => {
    const { publicKey } = await generateKeyPair();
    for (const t of ['', 'abc', 'a.b.c', 'Zm9v.AAAA', `${base64UrlEncode(new TextEncoder().encode('{"v":1}'))}.${'A'.repeat(86)}`]) {
      expect(await verifyLicenseToken(t, publicKey)).toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('decodes without verifying (used by the worker to read lid)', async () => {
    const { privateKey } = await generateKeyPair();
    const payload = await samplePayload();
    const decoded = decodeLicenseToken(await signLicense(payload, privateKey));
    expect(decoded?.payload).toEqual(payload);
  });

  it('refuses to sign an invalid payload', async () => {
    const { privateKey } = await generateKeyPair();
    const bad = { ...(await samplePayload()), dev: 'nope' };
    await expect(signLicense(bad, privateKey)).rejects.toThrow();
  });
});

describe('offline long code', () => {
  it('wraps and unwraps, tolerating whitespace and line breaks from chat apps', async () => {
    const { privateKey } = await generateKeyPair();
    const token = await signLicense(await samplePayload(), privateKey);
    const code = wrapOfflineCode(token);
    expect(code.startsWith(OFFLINE_CODE_PREFIX)).toBe(true);
    const messy = ` ${code.slice(0, 20)}\n${code.slice(20, 60)} \n${code.slice(60)}  `;
    expect(unwrapOfflineCode(messy)).toBe(token);
  });

  it('rejects text without the PT1. prefix', () => {
    expect(unwrapOfflineCode('PT2.abc.def')).toBeNull();
    expect(unwrapOfflineCode('ABCD-EFGH-JKMN')).toBeNull();
  });
});
