import { describe, expect, it } from 'vitest';
import {
  MIN_PBKDF2_ITERATIONS,
  generateRawKey,
  openWithKey,
  openWithPassword,
  sealWithKey,
  sealWithPassword,
} from './envelope';

const text = new TextEncoder().encode('بيانات العميل: نورهان عادل');

describe('key envelope', () => {
  it('round-trips', async () => {
    const key = generateRawKey();
    const sealed = await sealWithKey(key, text);
    const opened = await openWithKey(key, sealed);
    expect(opened.ok && new TextDecoder().decode(opened.data)).toBe('بيانات العميل: نورهان عادل');
  });

  it('uses a fresh IV each time', async () => {
    const key = generateRawKey();
    const a = await sealWithKey(key, text);
    const b = await sealWithKey(key, text);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('rejects the wrong key and tampering', async () => {
    const sealed = await sealWithKey(generateRawKey(), text);
    expect(await openWithKey(generateRawKey(), sealed)).toEqual({ ok: false, error: 'decrypt_failed' });
    const key = generateRawKey();
    const good = await sealWithKey(key, text);
    good[good.length - 1] = (good[good.length - 1] ?? 0) ^ 1;
    expect(await openWithKey(key, good)).toEqual({ ok: false, error: 'decrypt_failed' });
  });

  it('rejects malformed input', async () => {
    const key = generateRawKey();
    expect(await openWithKey(key, new Uint8Array(5))).toEqual({ ok: false, error: 'malformed' });
    const pw = await sealWithPassword('x', text, MIN_PBKDF2_ITERATIONS);
    expect(await openWithKey(key, pw)).toEqual({ ok: false, error: 'malformed' });
  });
});

describe('password envelope', () => {
  it('round-trips and rejects a wrong password', async () => {
    const sealed = await sealWithPassword('كلمة سر قوية', text, MIN_PBKDF2_ITERATIONS);
    const opened = await openWithPassword('كلمة سر قوية', sealed);
    expect(opened.ok && new TextDecoder().decode(opened.data)).toBe('بيانات العميل: نورهان عادل');
    expect(await openWithPassword('غلط', sealed)).toEqual({ ok: false, error: 'decrypt_failed' });
  });

  it('refuses too few iterations', async () => {
    await expect(sealWithPassword('x', text, 1000)).rejects.toThrow();
  });
});
