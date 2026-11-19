-- Cloud files: client photos (set by the trainer or uploaded by the client), the trainer's photo, thumbnails,
-- invoices and PDFs. The bytes live in the external object store (iDrive e2, S3 API) under
-- files/<account>/<id>; this table is the index. Every object is a PTK1 envelope encrypted on the device, so
-- nothing here or in the bucket can name or show a person: kind is a category, ref is an opaque app id.

CREATE TABLE cloud_files (
  id          TEXT PRIMARY KEY,            -- random, made by the Worker
  account     TEXT NOT NULL,               -- trainer account (root license id, follows "move to new device")
  kind        TEXT NOT NULL CHECK (kind IN ('client_photo', 'trainer_photo', 'thumbnail', 'invoice', 'pdf', 'client_upload')),
  ref         TEXT,                        -- opaque app id (client id, payment id, ...), or NULL
  source      TEXT NOT NULL CHECK (source IN ('trainer', 'client')),
  share_id    TEXT,                        -- client page the file came from (source = 'client')
  size        INTEGER NOT NULL CHECK (size > 0),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Listing and per-account quota (SUM(size)) read through this index, never a table scan.
CREATE INDEX cloud_files_account ON cloud_files (account, updated_at);
CREATE INDEX cloud_files_account_kind ON cloud_files (account, kind, ref);
CREATE INDEX cloud_files_share ON cloud_files (share_id, kind);
