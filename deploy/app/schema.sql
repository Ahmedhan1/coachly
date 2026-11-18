-- D1 `pt-coach-app`. `files` holds the built PWA (deploy/app/upload.py). The brand tables hold the
-- home-screen icon sets uploaded from the install page (src/brand.ts): generated pictures and a colour only.

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  body TEXT NOT NULL,
  hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  startup_w INTEGER,
  startup_h INTEGER,
  startup_ratio INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS brand_assets (
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body BLOB NOT NULL,
  PRIMARY KEY (id, kind)
);

CREATE TABLE IF NOT EXISTS brand_rate (
  key TEXT PRIMARY KEY,
  day INTEGER NOT NULL,
  n INTEGER NOT NULL
);
