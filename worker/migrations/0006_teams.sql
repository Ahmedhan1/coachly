-- Hierarchy: owner (/admin) → gyms → trainers, and plans (limits + end date). Rules: src/team/access.ts.

-- The owner's plan for an account. No row = independent trainer without limits.
CREATE TABLE account_plans (
  user_id       TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'trainer' CHECK (kind IN ('trainer', 'gym')),
  max_clients   INTEGER,                     -- clients per trainer; NULL = no limit
  max_trainers  INTEGER,                     -- gym plans: trainers in the gym; NULL = no limit
  expires_at    INTEGER,                     -- unix seconds; NULL = no end date
  updated_at    INTEGER NOT NULL
);

-- One gym per gym-manager account (id = the manager's user id).
CREATE TABLE gyms (
  id                 TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  name               TEXT NOT NULL,
  -- SHA-256 (hex) of the current invite code; the code itself is never stored. NULL = no open invite.
  invite_hash        TEXT UNIQUE,
  invite_created_at  INTEGER,
  created_at         INTEGER NOT NULL
);

-- A trainer belongs to at most one gym. The gym manager approves ('active') or removes them.
CREATE TABLE gym_members (
  user_id     TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  gym_id      TEXT NOT NULL REFERENCES gyms ("id") ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'active', 'removed')),
  joined_at   INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX gym_members_gym ON gym_members (gym_id, status);

-- Each trainer's client summary for their gym: a PTK1 envelope sealed on the trainer's phone with the gym's team
-- key, which only travels inside the invite link fragment. The server cannot read it.
CREATE TABLE gym_rosters (
  user_id     TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  gym_id      TEXT NOT NULL REFERENCES gyms ("id") ON DELETE CASCADE,
  body        BLOB NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX gym_rosters_gym ON gym_rosters (gym_id);
