// Cron sender: every run sends at most `pushBatchSize` due notifications, oldest first, then deletes them.
// Budget per run (Free plan): 10 ms CPU and 50 subrequests. Subrequests here = 1 select + N push fetches +
// 1 D1 batch, so N <= 47; CPU is the tighter bound (see docs/CLOUD.md "Push CPU budget").
import type { CloudDeps } from '../ports';
import { base64UrlDecode, utf8 } from './bytes';
import { audienceOf, signVapidJwt, vapidAuthorization } from './vapid';
import { encryptPushPayload } from './webpush';

/** Reminders that are this late (device offline, outage) are dropped instead of sent. */
export const STALE_AFTER_SECONDS = 3600;
export const RETRY_DELAY_SECONDS = 300;
export const MAX_ATTEMPTS = 3;
/** Push services keep the message this long if the phone is offline. */
export const PUSH_TTL_SECONDS = 3600;
/** Simultaneous outgoing connections allowed per invocation on Workers. */
const CONCURRENCY = 6;

export const DUE_QUERY = `SELECT i.device_key, i.item_id, i.due_at, i.title, i.body, i.attempts, s.endpoint, s.p256dh, s.auth
  FROM push_items i JOIN push_subscriptions s ON s.device_key = i.device_key
  WHERE i.due_at <= ? ORDER BY i.due_at LIMIT ?`;

interface DueRow {
  device_key: string;
  item_id: string;
  due_at: number;
  title: string;
  body: string;
  attempts: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type Outcome = 'sent' | 'gone' | 'retry' | 'failed' | 'stale';

export interface CronReport {
  sent: number;
  gone: number;
  retry: number;
  failed: number;
  stale: number;
}

/** The JSON the app's service worker receives in the `push` event (`event.data.json()`). */
export function pushMessage(row: { item_id: string; title: string; body: string }): Uint8Array {
  return utf8.encode(JSON.stringify({ v: 1, id: row.item_id, title: row.title, body: row.body }));
}

function classify(status: number): Outcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}

async function sendOne(cloud: CloudDeps, row: DueRow, auth: (aud: string) => Promise<string>): Promise<Outcome> {
  const p256dh = base64UrlDecode(row.p256dh);
  const secret = base64UrlDecode(row.auth);
  if (p256dh === null || secret === null) return 'gone';
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await encryptPushPayload(pushMessage(row), { p256dh, auth: secret });
  } catch {
    return 'gone'; // the stored subscription keys are unusable: drop it, the app re-subscribes on next open
  }
  try {
    const response = await cloud.pushFetch(row.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await auth(audienceOf(row.endpoint)),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: 'high',
      },
      body,
    });
    await response.body?.cancel();
    return classify(response.status);
  } catch {
    return 'retry';
  }
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** One cron run. Never logs titles, bodies, endpoints or ids. */
export async function runPushCron(cloud: CloudDeps, now: number): Promise<CronReport> {
  const report: CronReport = { sent: 0, gone: 0, retry: 0, failed: 0, stale: 0 };
  const keys = await cloud.vapid.keys();
  if (keys === null) return report;

  const { results } = await cloud.db.prepare(DUE_QUERY).bind(now, cloud.config.pushBatchSize).all<DueRow>();
  if (results.length === 0) return report;

  // One VAPID JWT per push service per run (almost every iPhone shares web.push.apple.com).
  const jwtCache = new Map<string, Promise<string>>();
  const auth = (aud: string): Promise<string> => {
    let header = jwtCache.get(aud);
    if (header === undefined) {
      header = signVapidJwt(keys, aud, now).then((jwt) => vapidAuthorization(jwt, keys));
      jwtCache.set(aud, header);
    }
    return header;
  };

  const goneDevices = new Set<string>();
  const outcomes = await mapLimited(results, CONCURRENCY, async (row): Promise<Outcome> => {
    if (row.due_at < now - STALE_AFTER_SECONDS) return 'stale';
    return sendOne(cloud, row, auth);
  });

  const { db } = cloud;
  const statements: D1PreparedStatement[] = [];
  results.forEach((row, i) => {
    const outcome = outcomes[i] ?? 'failed';
    report[outcome] += 1;
    if (outcome === 'gone') {
      goneDevices.add(row.device_key);
    } else if (outcome === 'retry' && row.attempts + 1 < MAX_ATTEMPTS) {
      statements.push(
        db
          .prepare('UPDATE push_items SET attempts = attempts + 1, due_at = ? WHERE device_key = ? AND item_id = ?')
          .bind(now + RETRY_DELAY_SECONDS, row.device_key, row.item_id),
      );
    } else {
      statements.push(db.prepare('DELETE FROM push_items WHERE device_key = ? AND item_id = ?').bind(row.device_key, row.item_id));
    }
  });
  for (const deviceKey of goneDevices) {
    statements.push(db.prepare('DELETE FROM push_items WHERE device_key = ?').bind(deviceKey));
    statements.push(db.prepare('DELETE FROM push_subscriptions WHERE device_key = ?').bind(deviceKey));
  }
  if (statements.length > 0) await db.batch(statements);
  return report;
}
