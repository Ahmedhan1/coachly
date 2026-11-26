// deploy/app: the PWA's files are Workers Static Assets (headers from dist/_headers, tested in
// shared/appHeaders.test.ts). The Worker only handles the brand routes and hands everything else to ASSETS.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import appWorker from '../../deploy/app/src/index';

const ORIGIN = 'https://app.example';
const seen: string[] = [];
const ASSETS = {
  fetch: async (input: RequestInfo | URL) => {
    seen.push(new URL(input instanceof Request ? input.url : String(input)).pathname);
    return new Response('static file', { status: 200 });
  },
} as unknown as Fetcher;

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await appWorker.fetch(new Request(ORIGIN + path, init), { APP: env.DB, ASSETS }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('deploy/app Worker', () => {
  it('hands every non-brand path to the static assets', async () => {
    for (const path of ['/', '/clients', '/assets/app-1.js', '/sw.js']) {
      expect(await (await call(path)).text()).toBe('static file');
    }
    expect(seen).toEqual(['/', '/clients', '/assets/app-1.js', '/sw.js']);
  });

  it('brand routes answer with the strict app headers, never an exception', async () => {
    const missing = await call('/b/not-a-valid-id/icon-180.png');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(missing.headers.get('X-Frame-Options')).toBe('DENY');
    expect((await call('/api/brand', { method: 'GET' })).status).toBe(405);
  });

  it('the old D1 upload endpoint is gone', async () => {
    const res = await call('/__deploy/hashes');
    expect(await res.text()).toBe('static file');
  });
});
