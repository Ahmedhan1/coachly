/**
 * Deletes every push subscription and scheduled reminder of one account. Called when the owner disables the
 * account: its devices must stop getting reminders. (Column `lid` holds the user id since migration 0005.)
 */
export async function dropAccountPush(db: D1Database, lid: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM push_items WHERE device_key IN (SELECT device_key FROM push_subscriptions WHERE lid = ?)').bind(lid),
    db.prepare('DELETE FROM push_subscriptions WHERE lid = ?').bind(lid),
  ]);
}
