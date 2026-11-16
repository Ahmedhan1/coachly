import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode } from '../../shared/license';
import { audienceOf, importVapidKeys, signVapidJwt, vapidAuthorization, VapidConfigError } from '../src/push/vapid';
import { deriveSecrets, ecdhParams, encryptPushPayload, importEcPrivateKey, MAX_PLAINTEXT, PushKeyError } from '../src/push/webpush';
import { TEST_VAPID_PRIVATE, TEST_VAPID_PUBLIC } from './fixtures';

const b = (text: string): Uint8Array => {
  const bytes = base64UrlDecode(text.replace(/\s+/g, ''));
  if (bytes === null) throw new Error(`bad base64url: ${text}`);
  return bytes;
};

// RFC 8291, section 5 and Appendix A (copied from https://www.rfc-editor.org/rfc/rfc8291.txt, whitespace removed).
const V = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  ecdhSecret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

async function vectorServerKeys() {
  return { privateKey: await importEcPrivateKey(b(V.asPrivate), b(V.asPublic), 'ECDH'), publicRaw: b(V.asPublic) };
}

describe('RFC 8291 Appendix A test vectors', () => {
  it('reproduces every intermediate value', async () => {
    const s = await deriveSecrets({ p256dh: b(V.uaPublic), auth: b(V.auth) }, await vectorServerKeys(), b(V.salt));
    expect(base64UrlEncode(s.ecdhSecret)).toBe(V.ecdhSecret);
    expect(base64UrlEncode(s.ikm)).toBe(V.ikm);
    expect(base64UrlEncode(s.cek)).toBe(V.cek);
    expect(base64UrlEncode(s.nonce)).toBe(V.nonce);
  });

  it('produces the exact encrypted message of section 5', async () => {
    const body = await encryptPushPayload(b(V.plaintext), { p256dh: b(V.uaPublic), auth: b(V.auth) }, {
      serverKeys: await vectorServerKeys(),
      salt: b(V.salt),
    });
    expect(new TextDecoder().decode(b(V.plaintext))).toBe('When I grow up, I want to be a watermelon');
    expect(base64UrlEncode(body.subarray(0, 86))).toBe(V.header);
    expect(base64UrlEncode(body.subarray(86))).toBe(V.ciphertext);
  });

  it('can be decrypted by the user agent (ua_private) with a fresh server key and salt', async () => {
    // Decrypt as the browser would, using the RFC's ua_private, to prove the random path is also correct.
    const uaPrivate = await importEcPrivateKey(b('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'), b(V.uaPublic), 'ECDH');
    const keys = { p256dh: b(V.uaPublic), auth: b(V.auth) };
    const message = new TextEncoder().encode('{"title":"تذكير","body":"عندك حصة بعد 30 دقيقة"}');
    const body = await encryptPushPayload(message, keys);
    const salt = body.subarray(0, 16);
    const asPublic = body.subarray(21, 86);
    const asKey = await crypto.subtle.importKey('raw', new Uint8Array(asPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams(asKey), uaPrivate, 256));
    const hk = async (ikm: Uint8Array, salt2: Uint8Array, info: Uint8Array, bits: number) =>
      new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt2), info: new Uint8Array(info) },
          await crypto.subtle.importKey('raw', new Uint8Array(ikm), 'HKDF', false, ['deriveBits']),
          bits,
        ),
      );
    const enc = new TextEncoder();
    const keyInfo = new Uint8Array([...enc.encode('WebPush: info\0'), ...keys.p256dh, ...asPublic]);
    const ikm = await hk(ecdh, keys.auth, keyInfo, 256);
    const cek = await hk(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 128);
    const nonce = await hk(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 96);
    const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, new Uint8Array(body.subarray(86))));
    expect(plain[plain.length - 1]).toBe(0x02);
    expect(new TextDecoder().decode(plain.subarray(0, -1))).toContain('عندك حصة');
  });

  it('rejects bad subscription keys and oversized payloads', async () => {
    await expect(encryptPushPayload(new Uint8Array(1), { p256dh: new Uint8Array(64), auth: new Uint8Array(16) })).rejects.toBeInstanceOf(PushKeyError);
    await expect(encryptPushPayload(new Uint8Array(1), { p256dh: b(V.uaPublic), auth: new Uint8Array(8) })).rejects.toBeInstanceOf(PushKeyError);
    await expect(encryptPushPayload(new Uint8Array(MAX_PLAINTEXT + 1), { p256dh: b(V.uaPublic), auth: b(V.auth) })).rejects.toBeInstanceOf(PushKeyError);
  });
});

describe('VAPID', () => {
  it('signs an ES256 JWT that verifies with the public key', async () => {
    const keys = await importVapidKeys(TEST_VAPID_PRIVATE, TEST_VAPID_PUBLIC, 'mailto:owner@example.com');
    const now = 1_790_000_000;
    const jwt = await signVapidJwt(keys, audienceOf('https://web.push.apple.com/QGuQyavXutnMH-abc'), now);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(b(h ?? '')))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(b(c ?? '')))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: now + 12 * 3600,
      sub: 'mailto:owner@example.com',
    });
    const signature = b(s ?? '');
    expect(signature.length).toBe(64);
    const verifyKey = await crypto.subtle.importKey('raw', new Uint8Array(b(TEST_VAPID_PUBLIC)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, new Uint8Array(signature), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
    expect(vapidAuthorization(jwt, keys)).toBe(`vapid t=${jwt}, k=${TEST_VAPID_PUBLIC}`);
  });

  it('refuses malformed or mismatched keys and subjects', async () => {
    await expect(importVapidKeys('abc', TEST_VAPID_PUBLIC, 'mailto:a@b.c')).rejects.toBeInstanceOf(VapidConfigError);
    await expect(importVapidKeys(TEST_VAPID_PRIVATE, TEST_VAPID_PUBLIC, 'owner')).rejects.toBeInstanceOf(VapidConfigError);
    await expect(importVapidKeys(TEST_VAPID_PRIVATE, V.asPublic, 'mailto:a@b.c')).rejects.toBeInstanceOf(VapidConfigError);
  });
});
