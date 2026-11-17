// Per-license cap on client-page storage (pages + pending check-ins). Without it one license could hold
// 200 pages x 5 MiB plus 200 x 20 pending check-ins x 3 MiB (~13 GB): the whole free R2 bucket, after which
// the global guard refuses every trainer's growing backup. LIMITS.md, "R2 storage".

/** Bytes this license currently holds in R2 for client pages and their pending check-ins (two indexed sums). */
export async function pagesBytes(db: D1Database, lid: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT (SELECT COALESCE(SUM(size), 0) FROM shares WHERE lid = ? AND revoked = 0)
            + (SELECT COALESCE(SUM(size), 0) FROM checkins WHERE lid = ?) AS n`,
    )
    .bind(lid, lid)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** True when writing `newSize` bytes in place of `replacedSize` would take the license over `maxBytes`. */
export async function overPagesQuota(db: D1Database, lid: string, newSize: number, replacedSize: number, maxBytes: number): Promise<boolean> {
  const growth = newSize - replacedSize;
  if (growth <= 0) return false;
  return (await pagesBytes(db, lid)) + growth > maxBytes;
}
