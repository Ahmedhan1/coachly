// Instant notifications for things a client does on his page (check-in, photo, file). The Worker only knows the
// account, never which client: the text is generic and fixed here (SECURITY.md), and the app shows the name and
// time once it pulls the item. The row joins the push queue due now; the minute cron sends it.
import { MAX_TEXT_LENGTH } from './routes';

export type ClientEvent = 'checkin' | 'client_photo' | 'client_upload';

/** Item ids of client events. The app's schedule PUT never deletes these (see scheduleDiff). */
export const EVENT_ITEM_PREFIX = 'evt-';

const TEXTS: Record<ClientEvent, { title: string; body: string }> = {
  checkin: { title: 'متابعة جديدة من عميل', body: 'عميل بعت متابعته من صفحته. افتح التطبيق تشوفها.' },
  client_photo: { title: 'صورة جديدة من عميل', body: 'عميل بعت صورته من صفحته. افتح التطبيق تشوفها.' },
  client_upload: { title: 'ملف جديد من عميل', body: 'عميل بعت ملف من صفحته. افتح التطبيق تشوفه.' },
};

export function eventItemId(event: ClientEvent, id: string): string {
  return `${EVENT_ITEM_PREFIX}${event === 'checkin' ? 'chk' : event === 'client_photo' ? 'pho' : 'upl'}-${id.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
}

/** One statement: a due-now push for every device of the account that turned notifications on. */
export function clientEventStatement(db: D1Database, account: string, event: ClientEvent, id: string, now: number): D1PreparedStatement {
  const text = TEXTS[event];
  return db
    .prepare(
      `INSERT INTO push_items (device_key, item_id, due_at, title, body)
       SELECT device_key, ?, ?, ?, ? FROM push_subscriptions WHERE lid = ?
       ON CONFLICT (device_key, item_id) DO NOTHING`,
    )
    .bind(eventItemId(event, id), now, text.title.slice(0, MAX_TEXT_LENGTH), text.body.slice(0, MAX_TEXT_LENGTH), account);
}

/** Best effort: a failed queue insert never fails the client's upload. */
export async function notifyClientEvent(db: D1Database, account: string, event: ClientEvent, id: string, now: number): Promise<void> {
  try {
    await clientEventStatement(db, account, event, id, now).run();
  } catch {
    // ignore
  }
}
