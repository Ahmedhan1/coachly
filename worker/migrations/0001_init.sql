-- Activation codes / licenses. The short code itself is never stored: only an HMAC of it.
CREATE TABLE licenses (
  lid            TEXT PRIMARY KEY,
  code_hash      TEXT NOT NULL UNIQUE,
  customer_name  TEXT NOT NULL,
  duration_days  INTEGER,                    -- NULL = lifetime
  act_by         INTEGER NOT NULL,           -- unix seconds: last moment the code may be activated
  status         TEXT NOT NULL CHECK (status IN ('issued', 'active', 'revoked', 'replaced')),
  device_fp      TEXT,                       -- first 32 hex of SHA-256(deviceId), set on activation
  created_at     INTEGER NOT NULL,
  activated_at   INTEGER,
  expires_at     INTEGER,                    -- set on activation (or carried over by "move to new device")
  revoked_at     INTEGER,
  replaced_by    TEXT,                       -- lid of the new license after "move to new device"
  feat           TEXT NOT NULL DEFAULT '["core"]'
);
CREATE INDEX licenses_created_at ON licenses (created_at DESC);

-- Audit log: what happened to which license id. Never names, never device ids.
CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  action  TEXT NOT NULL,
  lid     TEXT
);
CREATE INDEX audit_log_at ON audit_log (at DESC);

-- Fixed-window rate-limit counters. bucket = route + HMAC(client IP), never the raw IP.
CREATE TABLE rate_limits (
  bucket        TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
