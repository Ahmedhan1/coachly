import { describe, expect, it, vi } from 'vitest';
import type { FetchFn } from './httpCloudBackupClient';
import { WorkerApi } from './workerApi';

const tokens = { getToken: async () => 'tok' };

function stalledBody(init?: RequestInit): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"count":'));
      init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
    },
  });
  return new Response(body, { status: 200 });
}

describe('WorkerApi', () => {
  it('sends the bearer token and parses JSON', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => new Response('{"count":3}', { status: 200 }));
    const api = new WorkerApi({ baseUrl: 'https://w.test/', tokens, fetchFn });
    expect(await api.json<{ count: number }>({ method: 'GET', path: '/api/x' })).toEqual({ ok: true, value: { count: 3 } });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://w.test/api/x');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('maps a garbage JSON body to "server"', async () => {
    const api = new WorkerApi({ baseUrl: 'https://w.test', tokens, fetchFn: async () => new Response('<html>', { status: 200 }) });
    expect(await api.json({ method: 'GET', path: '/api/x' })).toEqual({ ok: false, error: 'server' });
  });

  it('times out when the body stalls after the headers arrived (json and bytes)', async () => {
    const api = new WorkerApi({ baseUrl: 'https://w.test', tokens, timeoutMs: 30, fetchFn: async (_u, init) => stalledBody(init) });
    expect(await api.json({ method: 'GET', path: '/api/x' })).toEqual({ ok: false, error: 'timeout' });
    expect(await api.bytes({ method: 'GET', path: '/api/x' })).toEqual({ ok: false, error: 'timeout' });
  });

  it('never calls the network offline or without a license', async () => {
    const fetchFn = vi.fn<FetchFn>();
    expect(await new WorkerApi({ baseUrl: 'https://w.test', tokens, fetchFn, network: { isOnline: () => false, onOnline: () => () => undefined } }).send({ method: 'GET', path: '/' })).toEqual({ ok: false, error: 'offline' });
    expect(await new WorkerApi({ baseUrl: 'https://w.test', tokens: { getToken: async () => null }, fetchFn }).send({ method: 'GET', path: '/' })).toEqual({ ok: false, error: 'not_activated' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
