// Web Push endpoints (feature 3). The server stores the subscription and a schedule of generic texts; the app is
// responsible for building texts from fixed templates with no client names (SECURITY.md).
import { authenticate } from '../cloud/auth';
import { json, readLimitedText } from '../http';
import type { Deps } from '../ports';
import { RULES } from '../rateLimit';
import { base64UrlDecode } from './bytes';

export const MAX_TEXT_LENGTH = 120;
export const MAX_SCHEDULE_ITEMS = 100;
/** Items may be scheduled up to this far ahead (the app re-syncs whenever the calendar changes). */
export const MAX_SCHEDULE_AHEAD = 40 * 86_400;
const MAX_SUBSCRIBE_BODY = 4096;
const MAX_SCHEDULE_BODY = 64 * 1024;
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Only real browser push services are accepted, so the Worker can never be used to POST to arbitrary URLs.
 * Safari/iOS uses web.push.apple.com; the others are for testing on desktop browsers.
 */
const PUSH_HOSTS: readonly RegExp[] = [
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isAllowedEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1024) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.port === '' && url.username === '' && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Accepts the browser's `PushSubscription.toJSON()` shape: {endpoint, keys: {p256dh, auth}}. */
export function parseSubscription(value: unknown): Subscription | null {
  if (typeof value !== 'object' || value === null) return null;
  const sub = (value as { subscription?: unknown }).subscription;
  if (typeof sub !== 'object' || sub === null) return null;
  const { endpoint, keys } = sub as { endpoint?: unknown; keys?: unknown };
  if (typeof endpoint !== 'string' || !isAllowedEndpoint(endpoint) || typeof keys !== 'object' || keys === null) return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  const pub = base64UrlDecode(p256dh.replace(/=+$/, ''));
  const secret = base64UrlDecode(auth.replace(/=+$/, ''));
  if (pub === null || pub.length !== 65 || pub[0] !== 0x04 || secret === null || secret.length !== 16) return null;
  return { endpoint, p256dh: p256dh.replace(/=+$/, ''), auth: auth.replace(/=+$/, '') };
}

export interface ScheduleItem {
  id: string;
  at: number;
  title: string;
  body: string;
}

export type ScheduleParse = { ok: true; items: ScheduleItem[] } | { ok: false; error: 'invalid' | 'text_too_long' | 'too_many_items' };

export function parseSchedule(value: unknown, now: number): ScheduleParse {
  if (typeof value !== 'object' || value === null) return { ok: false, error: 'invalid' };
  const raw = (value as { items?: unknown }).items;
  if (!Array.isArray(raw)) return { ok: false, error: 'invalid' };
  if (raw.length > MAX_SCHEDULE_ITEMS) return { ok: false, error: 'too_many_items' };
  const items: ScheduleItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return { ok: false, error: 'invalid' };
    const { id, at, title, body } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !ITEM_ID.test(id) || seen.has(id)) return { ok: false, error: 'invalid' };
    if (typeof at !== 'number' || !Number.isInteger(at) || at < now - 3600 || at > now + MAX_SCHEDULE_AHEAD) {
      return { ok: false, error: 'invalid' };
    }
    if (typeof title !== 'string' || title.trim() === '' || typeof body !== 'string') return { ok: false, error: 'invalid' };
    if (title.length > MAX_TEXT_LENGTH || body.length > MAX_TEXT_LENGTH) return { ok: false, error: 'text_too_long' };
    seen.add(id);
    items.push({ id, at, title, body });
  }
  return { ok: true, items };
}

async function subscribe(request: Request, deps: Deps, lid: string, deviceKey: string): Promise<Response> {
  const sub = parseSubscription(parseJson(await readLimitedText(request, MAX_SUBSCRIBE_BODY)));
  if (sub === null) return json({ error: 'invalid' }, 400);
  await deps.cloud.db
    .prepare(
      `INSERT INTO push_subscriptions (device_key, lid, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (device_key) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh,
         auth = excluded.auth, created_at = excluded.created_at`,
    )
    .bind(deviceKey, lid, sub.endpoint, sub.p256dh, sub.auth, deps.now())
    .run();
  return json({ ok: true });
}

interface StoredItem {
  item_id: string;
  due_at: number;
  title: string;
  body: string;
}

/**
 * Replaces the device's schedule as a whole, but writes only the difference: the app re-sends the full list on
 * every calendar change, and rewriting up to 100 rows (plus their index) each time would dominate the D1
 * write budget. Unchanged items keep their row (and their retry state).
 */
function scheduleDiff(db: D1Database, deviceKey: string, stored: readonly StoredItem[], items: readonly ScheduleItem[]): D1PreparedStatement[] {
  const before = new Map(stored.map((row) => [row.item_id, row]));
  const wanted = new Set(items.map((item) => item.id));
  const statements: D1PreparedStatement[] = [];
  for (const row of stored) {
    if (!wanted.has(row.item_id)) {
      statements.push(db.prepare('DELETE FROM push_items WHERE device_key = ? AND item_id = ?').bind(deviceKey, row.item_id));
    }
  }
  for (const item of items) {
    const old = before.get(item.id);
    if (old !== undefined && old.due_at === item.at && old.title === item.title && old.body === item.body) continue;
    statements.push(
      db
        .prepare(
          `INSERT INTO push_items (device_key, item_id, due_at, title, body) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (device_key, item_id) DO UPDATE SET due_at = excluded.due_at, title = excluded.title,
             body = excluded.body, attempts = 0`,
        )
        .bind(deviceKey, item.id, item.at, item.title, item.body),
    );
  }
  return statements;
}

async function schedule(request: Request, deps: Deps, deviceKey: string): Promise<Response> {
  const parsed = parseSchedule(parseJson(await readLimitedText(request, MAX_SCHEDULE_BODY)), deps.now());
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { db } = deps.cloud;
  const sub = await db.prepare('SELECT 1 AS one FROM push_subscriptions WHERE device_key = ?').bind(deviceKey).first();
  if (sub === null) return json({ error: 'no_subscription' }, 409);
  const { results } = await db
    .prepare('SELECT item_id, due_at, title, body FROM push_items WHERE device_key = ?')
    .bind(deviceKey)
    .all<StoredItem>();
  const statements = scheduleDiff(db, deviceKey, results, parsed.items);
  if (statements.length > 0) await db.batch(statements);
  return json({ ok: true, count: parsed.items.length });
}

async function unsubscribe(deps: Deps, deviceKey: string): Promise<Response> {
  const { db } = deps.cloud;
  await db.batch([
    db.prepare('DELETE FROM push_items WHERE device_key = ?').bind(deviceKey),
    db.prepare('DELETE FROM push_subscriptions WHERE device_key = ?').bind(deviceKey),
  ]);
  return json({ ok: true });
}

export async function routePush(request: Request, path: string, deps: Deps, clientKey: string): Promise<Response | null> {
  const method = request.method;
  if (path === '/api/push/vapid' && method === 'GET') {
    if (!(await deps.localLimiter.hit(RULES.vapidKey, clientKey, deps.now()))) return json({ error: 'rate_limited' }, 429);
    const keys = await deps.cloud.vapid.keys();
    return keys === null ? json({ error: 'push_not_configured' }, 503) : json({ publicKey: keys.publicKey });
  }
  if (path === '/api/push/subscribe' && method === 'POST') {
    const auth = await authenticate(request, deps, clientKey, RULES.pushSubscribe, 'device');
    return auth.ok ? subscribe(request, deps, auth.who.lid, auth.who.deviceKey) : auth.response;
  }
  if (path === '/api/push/schedule' && method === 'PUT') {
    const auth = await authenticate(request, deps, clientKey, RULES.pushSchedule, 'device');
    return auth.ok ? schedule(request, deps, auth.who.deviceKey) : auth.response;
  }
  if (path === '/api/push' && method === 'DELETE') {
    const auth = await authenticate(request, deps, clientKey, RULES.pushSubscribe, 'device');
    return auth.ok ? unsubscribe(deps, auth.who.deviceKey) : auth.response;
  }
  return null;
}
