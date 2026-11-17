-- "Move to new device" lineage. A move issues a new license id (lid) and replaces the old one, but the trainer's
-- cloud data (backup, client pages, check-ins) must follow them. Every license now records the license it
-- replaced (previous_lid) and the first license of its chain (root_lid). root_lid is the trainer's stable
-- account id: backups, shares and check-ins are indexed by it, so a move never copies an R2 object.
--
-- key_lid: the lid that appears in an R2 key written before this migration (backups/<lid>/<slot>,
-- shares/<lid>/<id>, checkins/<lid>/...). NULL means the key uses the row's own lid, which is true for every
-- unmoved license and for everything written from now on. R2 has no rename, so old objects keep their keys.

ALTER TABLE licenses ADD COLUMN previous_lid TEXT;
ALTER TABLE licenses ADD COLUMN root_lid TEXT;
ALTER TABLE backups ADD COLUMN key_lid TEXT;
ALTER TABLE backup_uploads ADD COLUMN key_lid TEXT;
ALTER TABLE shares ADD COLUMN key_lid TEXT;

-- Backfill (idempotent). 1) previous_lid from the existing replaced_by links.
UPDATE licenses SET previous_lid = (SELECT p.lid FROM licenses p WHERE p.replaced_by = licenses.lid LIMIT 1)
WHERE previous_lid IS NULL AND EXISTS (SELECT 1 FROM licenses p WHERE p.replaced_by = licenses.lid);

-- 2) root_lid by walking each chain from its first license.
UPDATE licenses SET root_lid = chain.root
FROM (
  WITH RECURSIVE walk (lid, root) AS (
    SELECT lid, lid FROM licenses WHERE previous_lid IS NULL
    UNION ALL
    SELECT l.lid, walk.root FROM licenses l JOIN walk ON l.previous_lid = walk.lid
  )
  SELECT lid, root FROM walk
) AS chain
WHERE licenses.lid = chain.lid AND licenses.root_lid IS NULL;

-- 3) A backup uploaded by a license that was later moved: index it under the account, keep its R2 key.
--    Only when it is the account's only backup row (otherwise the account row already wins; nothing is lost
--    in R2, the extra row just stays unreachable).
UPDATE backups SET key_lid = lid, lid = (SELECT l.root_lid FROM licenses l WHERE l.lid = backups.lid)
WHERE key_lid IS NULL
  AND EXISTS (SELECT 1 FROM licenses l WHERE l.lid = backups.lid AND l.root_lid IS NOT NULL AND l.root_lid <> l.lid)
  AND NOT EXISTS (
    SELECT 1 FROM backups b2 JOIN licenses l2 ON l2.lid = b2.lid
    WHERE b2.lid <> backups.lid AND l2.root_lid = (SELECT l.root_lid FROM licenses l WHERE l.lid = backups.lid)
  );

-- 4) Unfinished multipart uploads of moved licenses can never be completed (their device is revoked).
DELETE FROM backup_uploads
WHERE key_lid IS NULL AND lid IN (SELECT lid FROM licenses WHERE root_lid IS NOT NULL AND root_lid <> lid);

-- 5) Client pages and pending check-ins follow the account; page blobs keep their R2 key.
UPDATE shares SET key_lid = lid, lid = (SELECT l.root_lid FROM licenses l WHERE l.lid = shares.lid)
WHERE key_lid IS NULL AND lid IN (SELECT lid FROM licenses WHERE root_lid IS NOT NULL AND root_lid <> lid);

UPDATE checkins SET lid = (SELECT l.root_lid FROM licenses l WHERE l.lid = checkins.lid)
WHERE lid IN (SELECT lid FROM licenses WHERE root_lid IS NOT NULL AND root_lid <> lid);

-- 6) Push rows of revoked or moved licenses: their device can no longer be reached legitimately.
DELETE FROM push_items WHERE device_key IN (
  SELECT device_key FROM push_subscriptions WHERE lid IN (SELECT lid FROM licenses WHERE status IN ('revoked', 'replaced'))
);
DELETE FROM push_subscriptions WHERE lid IN (SELECT lid FROM licenses WHERE status IN ('revoked', 'replaced'));
