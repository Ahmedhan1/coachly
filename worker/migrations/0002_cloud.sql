-- Phase 9: cloud backup, Web Push, client page. No client names or contents are stored here: only sizes,
-- times, random ids, push subscriptions and generic notification text (see SECURITY.md).

-- Running total of bytes stored in R2 (backups + shares + check-ins). One row, updated with every put/delete,
-- so the Worker never has to list the bucket (ListObjects is a paid Class A operation).
CREATE TABLE storage_usage (
  id     INTEGER PRIMARY KEY CHECK (id = 1),
  bytes  INTEGER NOT NULL
);
INSERT INTO storage_usage (id, bytes) VALUES (1, 0);

-- One row per license. R2 keys are backups/<lid>/0 and backups/<lid>/1; latest_slot says which one is newest,
-- the other slot holds the previous backup when previous_size is not NULL.
CREATE TABLE backups (
  lid            TEXT PRIMARY KEY,
  latest_slot    INTEGER NOT NULL CHECK (latest_slot IN (0, 1)),
  latest_size    INTEGER NOT NULL,
  latest_at      INTEGER NOT NULL,
  previous_size  INTEGER,
  previous_at    INTEGER
);

-- At most one multipart upload in progress per license.
CREATE TABLE backup_uploads (
  upload_id     TEXT PRIMARY KEY,           -- our random id (given to the app)
  lid           TEXT NOT NULL UNIQUE,
  r2_upload_id  TEXT NOT NULL,
  slot          INTEGER NOT NULL CHECK (slot IN (0, 1)),
  size          INTEGER NOT NULL,           -- total size declared by the app
  part_size     INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

-- One push subscription per device. device_key = lid + ':' + dev (license fingerprint, no raw device id).
CREATE TABLE push_subscriptions (
  device_key  TEXT PRIMARY KEY,
  lid         TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Notification schedule. Generic text only (the app builds it from fixed templates, no client names).
CREATE TABLE push_items (
  device_key  TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  due_at      INTEGER NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_key, item_id)
);
-- The cron query reads due rows through this index (never a table scan: D1 bills rows scanned).
CREATE INDEX push_items_due ON push_items (due_at);

-- Client pages. checkin_hash = base64url(SHA-256(writeToken)); the write token is derived from the link key,
-- so the server can authorise check-ins without being able to read anything.
CREATE TABLE shares (
  share_id      TEXT PRIMARY KEY,
  lid           TEXT NOT NULL,
  size          INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0,
  checkin_hash  TEXT NOT NULL
);
CREATE INDEX shares_lid ON shares (lid);

-- Pending weekly check-ins (encrypted in the client's browser), deleted once the app has stored them.
CREATE TABLE checkins (
  id          TEXT PRIMARY KEY,
  share_id    TEXT NOT NULL,
  lid         TEXT NOT NULL,
  size        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX checkins_share ON checkins (share_id, created_at);
CREATE INDEX checkins_lid ON checkins (lid, created_at);
