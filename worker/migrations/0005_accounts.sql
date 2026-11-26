-- Licenses are gone: trainers sign in with an account (better-auth: email + password or Google) and the owner
-- approves each account in /admin. Clean break (decided 2026-11-26, no trainers were activated yet): the license
-- table goes, and push rows of old licenses go with it (their devices can never authenticate again).
--
-- From here on the `lid` / `account` columns of the cloud tables (backups, shares, checkins, push_subscriptions,
-- cloud_files) hold the account's user id. audit_log.lid holds a user id (or NULL).
--
-- Tables below are better-auth's schema for the options in src/auth/auth.ts (generated with better-auth's own
-- getMigrations for SQLite, then `status` given its default). test/accounts-schema.test.ts checks they match.

DELETE FROM push_items;
DELETE FROM push_subscriptions;
DROP TABLE IF EXISTS licenses;

CREATE TABLE "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  -- Owner approval: 'pending' (new), 'approved', 'disabled'. Only /admin changes it.
  "status" TEXT DEFAULT 'pending'
);

CREATE TABLE "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX "user_createdAt_idx" ON "user" ("createdAt");
