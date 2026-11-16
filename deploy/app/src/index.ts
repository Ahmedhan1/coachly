/**
 * Serves the installed PWA's files from D1 (table `files`). Used instead of Workers static assets because
 * the files are uploaded with the plain API token (deploy/app/upload.py). Responses are cached at the edge;
 * the service worker then keeps everything on the phone, so D1 is read rarely.
 */
export interface Env {
  APP: D1Database;
  /** Secret: lets deploy/app/upload.py write files (POST /__deploy/files, /__deploy/hashes). */
  UPLOAD_KEY?: string;
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const given = request.headers.get('X-Upload-Key') ?? '';
  if (!env.UPLOAD_KEY || given.length !== env.UPLOAD_KEY.length) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(env.UPLOAD_KEY))]);
  return new Uint8Array(a).every((x, i) => x === new Uint8Array(b)[i]);
}

/** Owner-only deploy endpoints: list current hashes, and upsert a batch of files. */
async function deploy(request: Request, env: Env, path: string): Promise<Response> {
  if (!(await authorized(request, env))) return new Response('Forbidden', { status: 403 });
  if (path === '/__deploy/hashes' && request.method === 'GET') {
    const rows = await env.APP.prepare('SELECT path, hash FROM files').all<{ path: string; hash: string }>();
    return Response.json(Object.fromEntries(rows.results.map((r) => [r.path, r.hash])));
  }
  if (path === '/__deploy/files' && request.method === 'POST') {
    const files = (await request.json()) as Array<{ path: string; type: string; body: string; hash: string }>;
    const now = Math.floor(Date.now() / 1000);
    const stmt = env.APP.prepare(
      'INSERT INTO files (path, type, body, hash, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET type = excluded.type, body = excluded.body, hash = excluded.hash, updated_at = excluded.updated_at',
    );
    await env.APP.batch(files.map((f) => stmt.bind(f.path, f.type, f.body, f.hash, now)));
    return Response.json({ ok: true, count: files.length });
  }
  return new Response('Not found', { status: 404 });
}

const NO_CACHE = new Set(['/index.html', '/sw.js', '/registerSW.js', '/push-sw.js', '/manifest.webmanifest']);

/** Only content-addressed or never-changing files are cached at the edge; everything else is read fresh. */
function edgeCacheable(path: string): boolean {
  return path.startsWith('/assets/') || path.startsWith('/exercise-pack/img/') || path.startsWith('/fonts/');
}

/** Bump to drop every edge-cached response after a change in caching rules. */
const CACHE_VERSION = 'v2';

function cacheControl(path: string): string {
  if (NO_CACHE.has(path)) return 'no-cache';
  if (path.startsWith('/assets/') || path.startsWith('/exercise-pack/img/') || path.startsWith('/fonts/')) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function lookup(env: Env, path: string): Promise<{ path: string; type: string; body: string; hash: string } | null> {
  return env.APP.prepare('SELECT path, type, body, hash FROM files WHERE path = ?').bind(path).first();
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/__deploy/')) return deploy(request, env, url.pathname);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}${path}?__c=${CACHE_VERSION}`, { method: 'GET' });
    const cached = edgeCacheable(path) ? await cache.match(cacheKey) : undefined;
    if (cached) return cached;

    let row = await lookup(env, path);
    // Client-side routes (no file extension) get the app shell.
    if (!row && !/\.[a-z0-9]+$/i.test(path)) row = await lookup(env, '/index.html');
    if (!row) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-cache' } });

    const etag = `"${row.hash}"`;
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
    const response = new Response(request.method === 'HEAD' ? null : b64ToBytes(row.body), {
      headers: {
        'Content-Type': row.type,
        'Cache-Control': cacheControl(row.path),
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
    if (edgeCacheable(row.path) && request.method === 'GET') ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
