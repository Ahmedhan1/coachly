/**
 * Serves the installed PWA's files from D1 (table `files`), uploaded by deploy/app/upload.py (`npm run deploy`).
 * With wrangler.assets.toml the same Worker runs in Workers Static Assets mode instead (faster; needs a deploy
 * from a computer whose API token is not swapped by a proxy, see docs/DEPLOYMENT.md). Responses are cached at the edge;
 * the service worker then keeps everything on the phone, so D1 is read rarely.
 */
import { APP_SECURITY_HEADERS } from '../../../shared/appHeaders';
import { brandRoute } from './brand';

export interface Env {
  APP: D1Database;
  /** Set only by wrangler.assets.toml (Workers Static Assets mode): files come from the edge, not D1. */
  ASSETS?: Fetcher;
  /** Secret: lets deploy/app/upload.py write files (POST /__deploy/files, /__deploy/hashes). */
  UPLOAD_KEY?: string;
}

/** Largest upload batch (upload.py sends at most ~3 MB of base64 per call). */
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Constant-time over the SHA-256 digests, so neither the key's bytes nor its length leak through timing. */
async function authorized(request: Request, env: Env): Promise<boolean> {
  const given = request.headers.get('X-Upload-Key') ?? '';
  if (!env.UPLOAD_KEY || given === '') return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(env.UPLOAD_KEY))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

interface UploadFile {
  path: string;
  type: string;
  body: string;
  hash: string;
}

function isUploadFile(value: unknown): value is UploadFile {
  if (typeof value !== 'object' || value === null) return false;
  const { path, type, body, hash } = value as Record<string, unknown>;
  return (
    typeof path === 'string' && path.startsWith('/') && path.length <= 512 && !path.startsWith('/__deploy/') &&
    typeof type === 'string' && type.length > 0 && type.length <= 100 &&
    typeof body === 'string' && body.length % 4 === 0 && BASE64.test(body) &&
    typeof hash === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(hash)
  );
}

/** Parses an upload batch; null when it is not a well-formed array of files. */
async function readBatch(request: Request): Promise<UploadFile[] | null | 'too_large'> {
  if (Number(request.headers.get('Content-Length') ?? '0') > MAX_BATCH_BYTES) return 'too_large';
  const text = await request.text();
  if (text.length > MAX_BATCH_BYTES) return 'too_large';
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return Array.isArray(value) && value.every(isUploadFile) ? value : null;
}

/** Owner-only deploy endpoints: list current hashes, and upsert a batch of files. */
async function deploy(request: Request, env: Env, path: string): Promise<Response> {
  if (!(await authorized(request, env))) return new Response('Forbidden', { status: 403 });
  if (path === '/__deploy/hashes' && request.method === 'GET') {
    const rows = await env.APP.prepare('SELECT path, hash FROM files').all<{ path: string; hash: string }>();
    return Response.json(Object.fromEntries(rows.results.map((r) => [r.path, r.hash])));
  }
  if (path === '/__deploy/files' && request.method === 'POST') {
    const files = await readBatch(request);
    if (files === 'too_large') return new Response('Too large', { status: 413 });
    if (files === null) return new Response('Bad batch', { status: 400 });
    if (files.length === 0) return Response.json({ ok: true, count: 0 });
    const now = Math.floor(Date.now() / 1000);
    const stmt = env.APP.prepare(
      'INSERT INTO files (path, type, body, hash, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET type = excluded.type, body = excluded.body, hash = excluded.hash, updated_at = excluded.updated_at',
    );
    await env.APP.batch(files.map((f) => stmt.bind(f.path, f.type, f.body, f.hash, now)));
    return Response.json({ ok: true, count: files.length });
  }
  return new Response('Not found', { status: 404 });
}

/** On every response: strict CSP, no framing (clickjacking of the trainer's data screens), HSTS. */
const SECURITY_HEADERS = APP_SECURITY_HEADERS;

const NO_CACHE = new Set(['/index.html', '/sw.js', '/registerSW.js', '/push-sw.js', '/manifest.webmanifest']);

/** Only content-addressed or never-changing files are cached at the edge; everything else is read fresh. */
function edgeCacheable(path: string): boolean {
  return path.startsWith('/assets/') || path.startsWith('/exercise-pack/img/') || path.startsWith('/fonts/');
}

/** Bump to drop every edge-cached response after a change in caching rules. */
const CACHE_VERSION = 'v4';

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
    const brand = await brandRoute(request, env, url, ctx, SECURITY_HEADERS);
    if (brand) return brand;
    // Static Assets mode (wrangler.assets.toml): Cloudflare serves files itself; this only runs for unknown paths.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400, headers: { 'Cache-Control': 'no-cache', ...SECURITY_HEADERS } });
    }
    if (path.endsWith('/')) path += 'index.html';

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}${path}?__c=${CACHE_VERSION}`, { method: 'GET' });
    const cached = edgeCacheable(path) ? await cache.match(cacheKey) : undefined;
    if (cached) return cached;

    let row = await lookup(env, path);
    // Client-side routes (no file extension) get the app shell.
    if (!row && !/\.[a-z0-9]+$/i.test(path)) row = await lookup(env, '/index.html');
    if (!row) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-cache', ...SECURITY_HEADERS } });

    const etag = `"${row.hash}"`;
    if (request.headers.get('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl(row.path) } });
    }
    const response = new Response(request.method === 'HEAD' ? null : b64ToBytes(row.body), {
      headers: {
        'Content-Type': row.type,
        'Cache-Control': cacheControl(row.path),
        ETag: etag,
        ...SECURITY_HEADERS,
      },
    });
    if (edgeCacheable(row.path) && request.method === 'GET') ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
