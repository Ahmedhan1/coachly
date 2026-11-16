import { beforeAll, describe, expect, it } from 'vitest';
import {
  base64UrlEncode,
  deviceFingerprint,
  generateKeyPair,
  signLicense,
  type LicensePayload,
} from '../../../shared/license';
import { CLOCK_ROLLBACK_TOLERANCE_SECONDS, evaluateLicense, nextLastSeen } from './evaluateLicense';

const DEVICE = '0b8a4f0e-2a7b-4d0e-8c43-2f2d7a3c9a10';
const OTHER_DEVICE = '9a1b7c55-3333-4c44-8d55-aaaaaaaaaaaa';
const DAY = 86_400;
const ISSUED = 1_790_000_000; // unix seconds
const at = (seconds: number): Date => new Date(seconds * 1000);

let keys: { privateKey: Uint8Array; publicKey: Uint8Array };
let dev: string;

beforeAll(async () => {
  keys = await generateKeyPair();
  dev = await deviceFingerprint(DEVICE);
});

async function token(over: Partial<LicensePayload> = {}): Promise<string> {
  const payload: LicensePayload = {
    v: 1,
    lid: 'lic_1',
    dev,
    name: 'كابتن منى',
    iat: ISSUED,
    actBy: ISSUED + 14 * DAY,
    exp: ISSUED + 365 * DAY,
    feat: ['core'],
    ...over,
  };
  return signLicense(payload, keys.privateKey);
}

describe('evaluateLicense', () => {
  it('accepts a valid time-limited code on the right device', async () => {
    const result = await evaluateLicense({
      token: await token(),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED + DAY),
      lastSeen: null,
      phase: 'activation',
    });
    expect(result).toMatchObject({ status: 'valid', kind: 'until', until: at(ISSUED + 365 * DAY) });
  });

  it('accepts a lifetime license', async () => {
    const result = await evaluateLicense({
      token: await token({ exp: null }),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED + 3000 * DAY),
      lastSeen: at(ISSUED + 2999 * DAY),
    });
    expect(result).toMatchObject({ status: 'valid', kind: 'lifetime' });
    if (result.status === 'valid') expect(result.payload.name).toBe('كابتن منى');
  });

  it('rejects a forged signature (signed by another key)', async () => {
    const attacker = await generateKeyPair();
    const forged = await signLicense(
      { v: 1, lid: 'x', dev, name: 'x', iat: ISSUED, actBy: ISSUED + DAY, exp: null, feat: [] },
      attacker.privateKey,
    );
    const result = await evaluateLicense({ token: forged, publicKey: keys.publicKey, deviceId: DEVICE, now: at(ISSUED), lastSeen: null });
    expect(result).toEqual({ status: 'invalid', reason: 'bad_signature' });
  });

  it('rejects a tampered payload (expiry removed, old signature kept)', async () => {
    const original = await token();
    const sig = original.split('.')[1] ?? '';
    const tamperedPayload = { v: 1, lid: 'lic_1', dev, name: 'كابتن منى', iat: ISSUED, actBy: ISSUED + 14 * DAY, exp: null, feat: ['core'] };
    const tampered = `${base64UrlEncode(new TextEncoder().encode(JSON.stringify(tamperedPayload)))}.${sig}`;
    const result = await evaluateLicense({ token: tampered, publicKey: keys.publicKey, deviceId: DEVICE, now: at(ISSUED), lastSeen: null });
    expect(result).toEqual({ status: 'invalid', reason: 'bad_signature' });
  });

  it('reports garbage as malformed', async () => {
    const result = await evaluateLicense({ token: 'not-a-token', publicKey: keys.publicKey, deviceId: DEVICE, now: at(ISSUED), lastSeen: null });
    expect(result).toEqual({ status: 'invalid', reason: 'malformed' });
  });

  it('rejects the license on a different device', async () => {
    const result = await evaluateLicense({ token: await token(), publicKey: keys.publicKey, deviceId: OTHER_DEVICE, now: at(ISSUED), lastSeen: null });
    expect(result).toEqual({ status: 'invalid', reason: 'wrong_device' });
  });

  it('rejects activation after the activation window', async () => {
    const result = await evaluateLicense({
      token: await token(),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED + 15 * DAY),
      lastSeen: null,
      phase: 'activation',
    });
    expect(result).toEqual({ status: 'invalid', reason: 'activation_window_passed' });
  });

  it('ignores the activation window on later launches', async () => {
    const result = await evaluateLicense({
      token: await token(),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED + 100 * DAY),
      lastSeen: at(ISSUED + 99 * DAY),
    });
    expect(result.status).toBe('valid');
  });

  it('rejects an expired license', async () => {
    const result = await evaluateLicense({
      token: await token(),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED + 366 * DAY),
      lastSeen: at(ISSUED + 365 * DAY - 10),
    });
    expect(result).toEqual({ status: 'invalid', reason: 'expired' });
  });

  it('locks a time-limited license when the clock went back more than 24h', async () => {
    const result = await evaluateLicense({
      token: await token(),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED + 100 * DAY),
      lastSeen: at(ISSUED + 102 * DAY),
    });
    expect(result).toEqual({ status: 'invalid', reason: 'clock_rollback' });
  });

  it('tolerates small clock corrections (up to 24h back)', async () => {
    const result = await evaluateLicense({
      token: await token(),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED + 100 * DAY),
      lastSeen: at(ISSUED + 100 * DAY + CLOCK_ROLLBACK_TOLERANCE_SECONDS),
    });
    expect(result.status).toBe('valid');
  });

  it('locks a time-limited license when the clock is set to before its issue date', async () => {
    const result = await evaluateLicense({
      token: await token(),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED - 3 * DAY),
      lastSeen: null,
    });
    expect(result).toEqual({ status: 'invalid', reason: 'clock_rollback' });
  });

  it('keeps a lifetime license valid even with a rolled-back clock', async () => {
    const result = await evaluateLicense({
      token: await token({ exp: null }),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED - 30 * DAY),
      lastSeen: at(ISSUED + 200 * DAY),
    });
    expect(result).toMatchObject({ status: 'valid', kind: 'lifetime' });
  });

  it('reports a revoked license (flag from the last successful server check)', async () => {
    const result = await evaluateLicense({
      token: await token({ exp: null }),
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: at(ISSUED),
      lastSeen: null,
      revoked: true,
    });
    expect(result).toEqual({ status: 'invalid', reason: 'revoked' });
  });
});

describe('nextLastSeen', () => {
  it('never moves backwards', () => {
    expect(nextLastSeen(at(100), at(50))).toEqual(at(100));
    expect(nextLastSeen(at(100), at(150))).toEqual(at(150));
    expect(nextLastSeen(null, at(7))).toEqual(at(7));
  });
});
