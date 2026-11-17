// deploy/app (the Worker that serves the installed PWA from D1). Uses this package's D1 binding as `APP`.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import appWorker from '../../deploy/app/src/index';

const ORIGIN = 'https://app.example';
const KEY = 'k'.repeat(40);

async function call(path: string, init: RequestInit = {}, uploadKey: string | null = KEY): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await appWorker.fetch(new Request(ORIGIN + path, init), { APP: env.DB, ...(uploadKey === null ? {} : { UPLOAD_KEY: uploadKey }) }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function upload(files: unknown, key = KEY): Promise<Response> {
  return call('/__deploy/files', { method: 'POST', headers: { 'X-Upload-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(files) });
}

beforeAll(async () => {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, type TEXT NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  ).run();
  const res = await upload([
    { path: '/index.html', type: 'text/html; charset=utf-8', body: btoa('<!doctype html><title>x</title>'), hash: 'h1' },
    { path: '/assets/app-1.js', type: 'text/javascript; charset=utf-8', body: btoa('1'), hash: 'h2' },
  ]);
  expect(res.status).toBe(200);
});

describe('deploy/app serving', () => {
  it('serves the shell with anti-framing headers', async () => {
    const res = await call('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('answers 400 (not an exception) for a malformed percent-encoded path', async () => {
    const res = await call('/assets/%E0%A4%A');
    expect(res.status).toBe(400);
  });

  it('keeps Cache-Control on 304 answers', async () => {
    const res = await call('/index.html', { headers: { 'If-None-Match': '"h1"' } });
    expect(res.status).toBe(304);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });
});

describe('deploy/app upload endpoint', () => {
  it('refuses a missing, wrong or wrong-length key, and refuses everything when UPLOAD_KEY is not set', async () => {
    expect((await call('/__deploy/hashes')).status).toBe(403);
    expect((await call('/__deploy/hashes', { headers: { 'X-Upload-Key': 'x' } })).status).toBe(403);
    expect((await call('/__deploy/hashes', { headers: { 'X-Upload-Key': 'j'.repeat(40) } })).status).toBe(403);
    expect((await call('/__deploy/hashes', { headers: { 'X-Upload-Key': '' } }, '')).status).toBe(403);
    expect((await call('/__deploy/hashes', { headers: { 'X-Upload-Key': KEY } }, null)).status).toBe(403);
    const ok = await call('/__deploy/hashes', { headers: { 'X-Upload-Key': KEY } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ '/index.html': 'h1' });
  });

  it('validates the upload batch instead of throwing or storing junk', async () => {
    const bad = await call('/__deploy/files', { method: 'POST', headers: { 'X-Upload-Key': KEY }, body: '{not json' });
    expect(bad.status).toBe(400);
    expect((await upload({ path: '/a' })).status).toBe(400);
    expect((await upload([{ path: 'no-slash.js', type: 't', body: '', hash: 'h' }])).status).toBe(400);
    expect((await upload([{ path: '/a.js', type: 't', body: 42, hash: 'h' }])).status).toBe(400);
    expect((await upload([{ path: '/a.js', type: 'text/plain', body: 'not base64!', hash: 'h' }])).status).toBe(400);
  });

  it('refuses an oversized batch before parsing it', async () => {
    const res = await call('/__deploy/files', {
      method: 'POST',
      headers: { 'X-Upload-Key': KEY, 'Content-Length': String(64 * 1024 * 1024) },
      body: '[]',
    });
    expect(res.status).toBe(413);
  });
});
