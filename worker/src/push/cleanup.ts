/**
 * Deletes every push subscription and scheduled reminder of one license. Called when the license is revoked or
 * moved to a new device: the old install must stop getting reminders, and the new device subscribes again with
 * its own license.
 */
export async function dropLicensePush(db: D1Database, lid: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM push_items WHERE device_key IN (SELECT device_key FROM push_subscriptions WHERE lid = ?)').bind(lid),
    db.prepare('DELETE FROM push_subscriptions WHERE lid = ?').bind(lid),
  ]);
}
