import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  deviceFingerprint,
  generateKeyPair,
  signLicense,
  wrapOfflineCode,
  type LicensePayload,
} from '../../../shared/license';
import { LicenseActivationService, META_KEYS, type LicenseServiceDeps } from './licenseActivationService';
import { memoryMetaStore } from './metaStore';
import { parsePublicKey } from './publicKey';

const DEVICE = '0b8a4f0e-2a7b-4d0e-8c43-2f2d7a3c9a10';
const OTHER_DEVICE = '9a1b7c55-3333-4c44-8d55-aaaaaaaaaaaa';
const DAY = 86_400;
const ISSUED = 1_790_000_000;
const WORKER = 'https://license.test';
const CODE = 'ABCD-EFGH-JKMN';

let keys: { privateKey: Uint8Array; publicKey: Uint8Array };

beforeAll(async () => {
  keys = await generateKeyPair();
});

async function token(over: Partial<LicensePayload> = {}, device = DEVICE): Promise<string> {
  return signLicense(
    {
      v: 1,
      lid: 'lic_1',
      dev: await deviceFingerprint(device),
      name: 'كابتن منى',
      iat: ISSUED,
      actBy: ISSUED + 14 * DAY,
      exp: ISSUED + 365 * DAY,
      feat: ['core'],
      ...over,
    },
    keys.privateKey,
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(over: Partial<LicenseServiceDeps> = {}, clockSeconds = ISSUED + DAY) {
  const store = memoryMetaStore({ [META_KEYS.deviceId]: DEVICE });
  const clock = { now: new Date(clockSeconds * 1000) };
  const fetchMock = vi.fn<typeof fetch>();
  const service = new LicenseActivationService({
    store,
    publicKey: keys.publicKey,
    workerUrl: WORKER,
    fetch: fetchMock,
    now: () => clock.now,
    newDeviceId: () => 'new-device',
    ...over,
  });
  return { service, store, clock, fetchMock };
}

describe('LicenseActivationService — device id', () => {
  it('creates a random id once and persists it in the meta store', async () => {
    const store = memoryMetaStore();
    const ids = ['first-id', 'second-id'];
    const service = new LicenseActivationService({
      store,
      publicKey: keys.publicKey,
      workerUrl: WORKER,
      fetch: vi.fn<typeof fetch>(),
      now: () => new Date(),
      newDeviceId: () => ids.shift() ?? 'x',
    });
    expect(await service.getDeviceId()).toBe('first-id');
    expect(await service.getDeviceId()).toBe('first-id');
    expect(store.dump()[META_KEYS.deviceId]).toBe('first-id');
  });
});

describe('LicenseActivationService — short code', () => {
  it('activates a valid code: posts code + device id, verifies, stores token, data key and last seen', async () => {
    const { service, store, fetchMock, clock } = setup();
    const license = await token();
    fetchMock.mockResolvedValue(json(200, { license, dataKey: 'k'.repeat(64) }));

    const result = await service.activate(CODE);

    expect(result).toEqual({
      ok: true,
      state: { status: 'active', licenseId: 'lic_1', trainerName: 'كابتن منى', expiresAt: (ISSUED + 365 * DAY) * 1000 },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${WORKER}/api/activate`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ code: 'ABCDEFGHJKMN', deviceId: DEVICE });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const saved = store.dump();
    expect(saved[META_KEYS.token]).toBe(license);
    expect(saved[META_KEYS.dataKey]).toBe('k'.repeat(64));
    expect(saved[META_KEYS.lastSeen]).toBe(clock.now.getTime());
    // and the next launch verifies offline without the network
    fetchMock.mockReset();
    expect((await service.getState()).status).toBe('active');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails quietly with "offline" when the request throws or times out', async () => {
    const { service, store, fetchMock } = setup({ activateTimeoutMs: 5 });
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'offline' });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'offline' });
    expect(store.dump()[META_KEYS.token]).toBeUndefined();
  });

  it('short code copied with invisible direction marks still activates', async () => {
    const { service, fetchMock } = setup();
    fetchMock.mockResolvedValue(json(200, { license: await token() }));
    expect(await service.activate(`\u200F${CODE}\u200E`)).toMatchObject({ ok: true });
  });

  it('gives up when the server sends headers but the body stalls past the timeout', async () => {
    const { service, fetchMock } = setup({ activateTimeoutMs: 30 });
    fetchMock.mockImplementation(async (_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"license":'));
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return new Response(body, { status: 200 });
    });
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'offline' });
  });

  it('does not touch the network when the device says it is offline', async () => {
    const { service, fetchMock } = setup({ isOnline: () => false });
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'offline' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [409, 'used'],
    [404, 'invalid'],
    [410, 'expired'],
    [429, 'rate_limited'],
  ] as const)('maps server %i {error: %s}', async (status, error) => {
    const { service, fetchMock } = setup();
    fetchMock.mockResolvedValue(json(status, { error }));
    expect(await service.activate(CODE)).toEqual({ ok: false, error });
  });

  it('maps a 5xx or garbage answer to "unavailable"', async () => {
    const { service, fetchMock } = setup();
    fetchMock.mockResolvedValue(new Response('oops', { status: 502 }));
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'unavailable' });
    fetchMock.mockResolvedValue(json(200, { nope: true }));
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'unavailable' });
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'unavailable' });
  });

  it('rejects a license the server signed with another key', async () => {
    const { service, fetchMock, store } = setup();
    const attacker = await generateKeyPair();
    const forged = await signLicense(
      { v: 1, lid: 'x', dev: await deviceFingerprint(DEVICE), name: 'x', iat: ISSUED, actBy: ISSUED + DAY, exp: null, feat: [] },
      attacker.privateKey,
    );
    fetchMock.mockResolvedValue(json(200, { license: forged, dataKey: 'k' }));
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'invalid' });
    expect(store.dump()[META_KEYS.token]).toBeUndefined();
  });

  it('rejects malformed codes without calling the server', async () => {
    const { service, fetchMock } = setup();
    expect(await service.activate('ABCD-EFGH')).toEqual({ ok: false, error: 'malformed' });
    expect(await service.activate('ABCD-EFGH-JKM0')).toEqual({ ok: false, error: 'malformed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports "unavailable" when no worker URL is configured', async () => {
    const { service } = setup({ workerUrl: undefined });
    expect(await service.activate(CODE)).toEqual({ ok: false, error: 'unavailable' });
  });
});

describe('LicenseActivationService — offline long code', () => {
  it('activates with a PT1. code pasted with line breaks, without any network call', async () => {
    const { service, fetchMock, store } = setup();
    const code = wrapOfflineCode(await token({ exp: null }));
    const pasted = `${code.slice(0, 40)}\n ${code.slice(40)}`;
    const result = await service.activate(pasted);
    expect(result).toMatchObject({ ok: true, state: { status: 'active', expiresAt: null } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.dump()[META_KEYS.dataKey]).toBeUndefined();
  });

  it('activates a long code copied from an Arabic chat with invisible direction marks', async () => {
    const { service } = setup();
    const code = wrapOfflineCode(await token({ exp: null }));
    const pasted = `\u200F\u2067${code.slice(0, 30)}\u200B${code.slice(30, 60)}\u200E\uFEFF${code.slice(60)}\u2069\u202C`;
    expect(await service.activate(pasted)).toMatchObject({ ok: true, state: { status: 'active' } });
  });

  it('accepts the PT1. prefix typed in lower case (auto-correct), keeping the token itself exact', async () => {
    const { service } = setup();
    const code = wrapOfflineCode(await token({ exp: null }));
    expect(await service.activate(`pt1.${code.slice(4)}`)).toMatchObject({ ok: true });
  });

  it('rejects a long code made for another device', async () => {
    const { service } = setup();
    const code = wrapOfflineCode(await token({}, OTHER_DEVICE));
    expect(await service.activate(code)).toEqual({ ok: false, error: 'wrong_device' });
  });

  it('rejects a long code after its activation window', async () => {
    const { service } = setup({}, ISSUED + 20 * DAY);
    expect(await service.activate(wrapOfflineCode(await token()))).toEqual({ ok: false, error: 'expired' });
  });

  it('rejects garbage after the prefix', async () => {
    const { service } = setup();
    expect(await service.activate('PT1.abc.def')).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects everything while the public key is the placeholder', async () => {
    const { service } = setup({ publicKey: parsePublicKey('REPLACE_WITH_PUBLIC_KEY_HEX') });
    expect(await service.activate(wrapOfflineCode(await token()))).toEqual({ ok: false, error: 'invalid' });
    expect(await service.getState()).toEqual({ status: 'inactive' });
  });
});

describe('LicenseActivationService — launch', () => {
  it('is inactive before any activation', async () => {
    expect(await setup().service.getState()).toEqual({ status: 'inactive' });
  });

  it('treats a stored token from another device (restored backup) as inactive', async () => {
    const { service, store } = setup();
    await store.set(META_KEYS.token, await token({}, OTHER_DEVICE));
    expect(await service.getState()).toEqual({ status: 'inactive' });
  });

  it('locks a time-limited license when the clock goes back more than 24h, and stays locked', async () => {
    const { service, clock } = setup();
    await service.activate(wrapOfflineCode(await token()));
    clock.now = new Date((ISSUED + 30 * DAY) * 1000);
    expect((await service.getState()).status).toBe('active');
    clock.now = new Date((ISSUED + 10 * DAY) * 1000);
    expect(await service.getState()).toEqual({ status: 'locked', reason: 'clock_rollback' });
    // lastSeen never moved backwards
    clock.now = new Date((ISSUED + 12 * DAY) * 1000);
    expect(await service.getState()).toEqual({ status: 'locked', reason: 'clock_rollback' });
  });

  it('keeps a lifetime license working with a rolled-back clock', async () => {
    const { service, clock } = setup();
    await service.activate(wrapOfflineCode(await token({ exp: null })));
    clock.now = new Date((ISSUED + 300 * DAY) * 1000);
    await service.getState();
    clock.now = new Date((ISSUED + 2 * DAY) * 1000);
    expect((await service.getState()).status).toBe('active');
  });

  it('locks an expired license', async () => {
    const { service, clock } = setup();
    await service.activate(wrapOfflineCode(await token()));
    clock.now = new Date((ISSUED + 366 * DAY) * 1000);
    expect(await service.getState()).toEqual({ status: 'locked', reason: 'expired' });
  });
});

describe('LicenseActivationService — revocation check', () => {
  async function activated() {
    const ctx = setup();
    const license = await token({ exp: null });
    await ctx.service.activate(wrapOfflineCode(license));
    return { ...ctx, license };
  }

  it('locks only on an explicit revoked: true, sending the token as bearer', async () => {
    const { service, fetchMock, license } = await activated();
    fetchMock.mockResolvedValue(json(200, { revoked: true }));
    expect(await service.checkRevocation()).toEqual({ status: 'locked', reason: 'revoked' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${WORKER}/api/license/status`);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${license}`);
    expect(await service.getState()).toEqual({ status: 'locked', reason: 'revoked' });
  });

  it.each([
    ['network error', () => Promise.reject(new TypeError('offline'))],
    ['server error', () => Promise.resolve(new Response('x', { status: 500 }))],
    ['rate limited', () => Promise.resolve(json(429, { error: 'rate_limited' }))],
    ['not revoked', () => Promise.resolve(json(200, { revoked: false }))],
    ['odd body', () => Promise.resolve(json(200, { revoked: 'yes' }))],
  ])('keeps working on %s', async (_name, answer) => {
    const { service, fetchMock } = await activated();
    fetchMock.mockImplementation(answer);
    expect(await service.checkRevocation()).toBeNull();
    expect((await service.getState()).status).toBe('active');
  });

  it('skips the check offline, without a worker URL or without a license', async () => {
    const offline = setup({ isOnline: () => false });
    await offline.service.activate(wrapOfflineCode(await token({ exp: null })));
    expect(await offline.service.checkRevocation()).toBeNull();
    expect(offline.fetchMock).not.toHaveBeenCalled();
    const none = setup();
    expect(await none.service.checkRevocation()).toBeNull();
    expect(none.fetchMock).not.toHaveBeenCalled();
  });

  it('unlocks again if the owner reverses a revocation', async () => {
    const { service, fetchMock } = await activated();
    fetchMock.mockResolvedValue(json(200, { revoked: true }));
    await service.checkRevocation();
    fetchMock.mockResolvedValue(json(200, { revoked: false }));
    expect((await service.checkRevocation())?.status).toBe('active');
  });
});
