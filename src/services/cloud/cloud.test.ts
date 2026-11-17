import { describe, expect, it } from 'vitest';
import { errorFromResponse, HttpCloudBackupClient, transferTimeoutMs, type FetchFn } from './httpCloudBackupClient';
import { FakeNetworkStatus, metaTokenProvider } from './networkStatus';

function fetchReturning(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn: FetchFn = async (url, init = {}) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fn, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HttpCloudBackupClient', () => {
  it('PUTs the envelope with the bearer token', async () => {
    const { fn, calls } = fetchReturning(() => new Response(null, { status: 200 }));
    const client = new HttpCloudBackupClient({ baseUrl: 'https://w.example/', fetchFn: fn });
    const r = await client.upload('tok', new Uint8Array([1, 2, 3]));
    expect(r).toEqual({ ok: true, value: { bytes: 3, updatedAt: null } });
    expect(calls[0]?.url).toBe('https://w.example/api/backup');
    expect(calls[0]?.init.method).toBe('PUT');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('maps storage_full, unauthorized, rate limit and server errors', async () => {
    for (const [res, expected] of [
      [json(507, { error: 'storage_full' }), 'storage_full'],
      [json(413, { error: 'storage_full' }), 'storage_full'],
      [json(401, { error: 'invalid' }), 'unauthorized'],
      [json(429, { error: 'rate_limited' }), 'rate_limited'],
      [new Response('oops', { status: 500 }), 'server'],
    ] as const) {
      const client = new HttpCloudBackupClient({ fetchFn: async () => res });
      expect(await client.upload('t', new Uint8Array(1))).toEqual({ ok: false, error: expected });
    }
  });

  it('does not call the network when offline', async () => {
    const { fn, calls } = fetchReturning(() => new Response(null));
    const net = new FakeNetworkStatus(false);
    const client = new HttpCloudBackupClient({ fetchFn: fn, network: net });
    expect(await client.head('t')).toEqual({ ok: false, error: 'offline' });
    expect(calls).toHaveLength(0);
  });

  it('times out quietly', async () => {
    const hang: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const client = new HttpCloudBackupClient({ fetchFn: hang, shortTimeoutMs: 20 });
    expect(await client.head('t')).toEqual({ ok: false, error: 'timeout' });
  });

  it('network failure → network', async () => {
    const client = new HttpCloudBackupClient({ fetchFn: async () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(await client.download('t')).toEqual({ ok: false, error: 'network' });
  });

  it('HEAD 404 means no backup; download returns bytes', async () => {
    const none = new HttpCloudBackupClient({ fetchFn: async () => new Response(null, { status: 404 }) });
    expect(await none.head('t')).toEqual({ ok: true, value: null });
    expect(await none.download('t')).toEqual({ ok: false, error: 'not_found' });
    const { fn } = fetchReturning((_u, init) =>
      init.method === 'HEAD'
        ? new Response(null, { status: 200, headers: { 'content-length': '3', 'last-modified': 'Mon, 16 Nov 2026 10:00:00 GMT' } })
        : new Response(new Uint8Array([7, 8, 9]), { status: 200 }),
    );
    const client = new HttpCloudBackupClient({ fetchFn: fn });
    expect(await client.head('t')).toEqual({ ok: true, value: { bytes: 3, updatedAt: Date.parse('2026-11-16T10:00:00Z') } });
    const d = await client.download('t');
    expect(d.ok && Array.from(d.value)).toEqual([7, 8, 9]);
  });

  it('reads the live Worker headers: X-Backup-Size and X-Backup-Uploaded-At (unix seconds)', async () => {
    const client = new HttpCloudBackupClient({
      fetchFn: async () =>
        new Response(null, { status: 200, headers: { 'X-Backup-Size': '2048', 'X-Backup-Uploaded-At': '1795000000', 'Cache-Control': 'no-store' } }),
    });
    expect(await client.head('t')).toEqual({ ok: true, value: { bytes: 2048, updatedAt: 1_795_000_000_000 } });
  });

  it('PUT 201 { size, uploadedAt } gives the server time in ms', async () => {
    const client = new HttpCloudBackupClient({ fetchFn: async () => json(201, { size: 3, uploadedAt: 1_795_000_000, previousKept: true }) });
    expect(await client.upload('t', new Uint8Array(3))).toEqual({ ok: true, value: { bytes: 3, updatedAt: 1_795_000_000_000 } });
  });

  it('503 storage_unavailable (R2 not enabled yet) is its own error, also on a body-less HEAD', async () => {
    const put = new HttpCloudBackupClient({ fetchFn: async () => json(503, { error: 'storage_unavailable' }) });
    expect(await put.upload('t', new Uint8Array(1))).toEqual({ ok: false, error: 'storage_unavailable' });
    const head = new HttpCloudBackupClient({ fetchFn: async () => new Response(null, { status: 503 }) });
    expect(await head.head('t')).toEqual({ ok: false, error: 'storage_unavailable' });
    expect(await head.download('t')).toEqual({ ok: false, error: 'storage_unavailable' });
    expect(errorFromResponse(503, 'server_not_configured')).toBe('server');
  });

  it('transfer timeout scales with size and is capped', () => {
    expect(transferTimeoutMs(0)).toBe(15_000);
    expect(transferTimeoutMs(1_500_000)).toBe(25_000);
    expect(transferTimeoutMs(500_000_000)).toBe(120_000);
    expect(errorFromResponse(404, null)).toBe('not_found');
  });

  it('reads the license token from meta', async () => {
    expect(await metaTokenProvider({ get: async () => 'abc' }).getToken()).toBe('abc');
    expect(await metaTokenProvider({ get: async () => undefined }).getToken()).toBeNull();
    expect(await metaTokenProvider({ get: async () => Promise.reject(new Error('x')) }).getToken()).toBeNull();
  });
});
