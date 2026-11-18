/**
 * Trainer logo on the home-screen icon. The install page (Safari, before "Add to Home Screen") uploads the icon
 * set it built on the phone; this serves it back at stable, content-addressed URLs that iOS fetches when the
 * app is added, plus a per-brand manifest whose start URL hands the brand id to the installed app.
 * Only generated pictures and a colour are stored: no names, no client data. Schema: deploy/app/schema.sql.
 */
import { BRAND_ID, brandManifest, parseBrandUpload } from '../../../shared/brandIcon';

export interface BrandEnv {
  APP: D1Database;
}

/** Upload body cap: the four base64 PNGs together. */
const MAX_BODY = 4 * 1024 * 1024;
/** Uploads per IP per day, and for the whole service per day (abuse brake for a public endpoint). */
const PER_IP_PER_DAY = 12;
const ALL_PER_DAY = 1500;

const FILES: Record<string, { kind: string; type: string }> = {
  'icon-180.png': { kind: 'icon180', type: 'image/png' },
  'icon-512.png': { kind: 'icon512', type: 'image/png' },
  'logo.png': { kind: 'logo', type: 'image/png' },
  'startup.png': { kind: 'startup', type: 'image/png' },
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

async function sha256Hex(parts: Uint8Array[]): Promise<string> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const all = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readLimited(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return new TextDecoder().decode(all);
}

/** Counts this upload against the per-IP and global daily budgets. False when over budget. */
async function withinBudget(env: BrandEnv, request: Request): Promise<boolean> {
  const day = Math.floor(Date.now() / 86_400_000);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = (await sha256Hex([new TextEncoder().encode(`${day}|${ip}`)])).slice(0, 32);
  const all = await env.APP.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM brand_rate WHERE day = ?').bind(day).first<{ n: number }>();
  if ((all?.n ?? 0) >= ALL_PER_DAY) return false;
  const row = await env.APP.prepare(
    'INSERT INTO brand_rate (key, day, n) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n',
  )
    .bind(key, day)
    .first<{ n: number }>();
  // Old counters are useless after their day.
  await env.APP.prepare('DELETE FROM brand_rate WHERE day < ?').bind(day - 1).run();
  return (row?.n ?? 0) <= PER_IP_PER_DAY;
}

async function upload(request: Request, env: BrandEnv, origin: string): Promise<Response> {
  const from = request.headers.get('Origin');
  if (from !== null && from !== origin) return json({ error: 'origin' }, 403);
  const text = await readLimited(request);
  if (text === null) return json({ error: 'too_large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const parsed = parseBrandUpload(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const b = parsed.value;
  const id = (await sha256Hex([new TextEncoder().encode(b.color), b.icon512, b.logo, b.startup?.png ?? new Uint8Array(0)])).slice(0, 24);
  const exists = await env.APP.prepare('SELECT id FROM brands WHERE id = ?').bind(id).first();
  if (exists) return json({ id });
  if (!(await withinBudget(env, request))) return json({ error: 'rate_limited' }, 429);
  const now = Math.floor(Date.now() / 1000);
  const asset = env.APP.prepare('INSERT OR REPLACE INTO brand_assets (id, kind, body) VALUES (?, ?, ?)');
  const statements = [
    env.APP.prepare('INSERT OR IGNORE INTO brands (id, color, startup_w, startup_h, startup_ratio, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      id,
      b.color,
      b.startup?.width ?? null,
      b.startup?.height ?? null,
      b.startup?.ratio ?? null,
      now,
    ),
    asset.bind(id, 'icon180', b.icon180),
    asset.bind(id, 'icon512', b.icon512),
    asset.bind(id, 'logo', b.logo),
  ];
  if (b.startup) statements.push(asset.bind(id, 'startup', b.startup.png));
  await env.APP.batch(statements);
  return json({ id });
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

async function serve(env: BrandEnv, id: string, file: string, headers: Record<string, string>): Promise<Response> {
  const brand = await env.APP.prepare('SELECT color, startup_w, startup_h, startup_ratio FROM brands WHERE id = ?')
    .bind(id)
    .first<{ color: string; startup_w: number | null; startup_h: number | null; startup_ratio: number | null }>();
  if (!brand) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-cache', ...headers } });
  if (file === 'manifest.webmanifest') {
    return new Response(JSON.stringify(brandManifest(id, brand.color)), {
      headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': IMMUTABLE, ...headers },
    });
  }
  if (file === 'brand.json') {
    const startup = brand.startup_w && brand.startup_h && brand.startup_ratio ? { width: brand.startup_w, height: brand.startup_h, ratio: brand.startup_ratio } : null;
    return new Response(JSON.stringify({ id, color: brand.color, startup }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': IMMUTABLE, ...headers },
    });
  }
  const f = FILES[file];
  if (!f) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-cache', ...headers } });
  const row = await env.APP.prepare('SELECT body FROM brand_assets WHERE id = ? AND kind = ?').bind(id, f.kind).first<{ body: ArrayBuffer | number[] }>();
  if (!row) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-cache', ...headers } });
  const bytes = row.body instanceof ArrayBuffer ? new Uint8Array(row.body) : new Uint8Array(row.body);
  return new Response(bytes, { headers: { 'Content-Type': f.type, 'Cache-Control': IMMUTABLE, ...headers } });
}

/** Handles `/api/brand` and `/b/<id>/<file>`; null for every other path. */
export async function brandRoute(request: Request, env: BrandEnv, url: URL, ctx: ExecutionContext, headers: Record<string, string>): Promise<Response | null> {
  if (url.pathname === '/api/brand') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    return upload(request, env, url.origin);
  }
  const m = /^\/b\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (!m) return null;
  const [, id = '', file = ''] = m;
  if (!BRAND_ID.test(id)) return new Response('Not found', { status: 404, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers });
  const cache = caches.default;
  const key = new Request(`${url.origin}/b/${id}/${file}`, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await serve(env, id, file, headers);
  if (res.ok && request.method === 'GET') ctx.waitUntil(cache.put(key, res.clone()));
  return request.method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res;
}
