# PT Coach App — project rules

Commercial offline-first PWA for private personal trainers in Egypt; each trainer's account is approved by the owner. One trainer, one
iPhone, non-technical, one-handed use between sessions. Full spec: `docs/SPEC.md` (Arabic). Read it before
working on a feature.

## Hard constraints

- **Zero cost.** No paid library or service. No Xcode / Expo / App Store. Cloudflare free tier only.
- **Golden rule.** After the first sign-in the app never needs the network. Every Cloudflare call sits behind an
  interface in `src/services`, has a short timeout, fails silently, and queues a retry. Test with and
  without network.
- **Target.** Safari on iOS 16.4+, installed to the home screen (standalone PWA).
- **Arabic, RTL.** Every user-visible string comes from `src/i18n/ar/`. No hard-coded UI text in components.
  Digits are Western (0-9). Use CSS logical properties (`margin-inline-start`, never `margin-left`).
- **Fitness terms are transliterated, never translated**: Glutes → جلوتس, Biceps Curl → بايسبس كيرل,
  Quads → كوادز, Hamstrings → هامسترينج, Deadlift → ديدليفت. Dictionary: `src/i18n/fitness-terms.ts`.
  `npm run check:words` fails on any forbidden word.
- **Trainer controls everything**: logo, colors, font, PDF background, formulas and coefficients, exercise
  names, recipes, supplements. Never hard-code these; they are settings with defaults.
- **The app never suggests supplement doses.**
- **Licenses.** Check every dependency's license before adding and record it in `LICENSES.md`. No GPL/AGPL.
  Never copy code from wger. Pin exact versions (`npm i -E`).
- **Privacy.** Nothing leaves the device unencrypted. The server sees only: the trainer's account (name, email,
  password hash or Google id, approval status), session tokens, push subscription, notification time, generic
  text without client names.
- **Secrets.** `BETTER_AUTH_SECRET`, `ADMIN_PASSWORD` and `GOOGLE_CLIENT_SECRET` are Worker secrets: never in the
  repo or the site bundle.

## Layers (dependencies point downward only)

1. `src/app`, `src/features`, `src/ui` — screens and components, no calculation logic.
2. `src/domain` — pure TypeScript. No React, no DOM, no Dexie imports (ESLint enforces). Every function has a
   test written first. Time is always passed in as a parameter (`now: Date`), never read from `Date.now()`.
3. `src/data` — repositories over Dexie with versioned schema. No screen talks to Dexie directly.
4. `src/services` — calendar, files, 3D, PDF, backup, integrations; each behind an interface with a fake for tests.

`worker/` is a separate Cloudflare Worker project with its own `package.json` and tests.
`shared/` holds code used by both app and worker (byte helpers, envelopes, headers). `tools/` holds offline owner tools.

Small files, clear names, no `any`. TypeScript strict with `noUncheckedIndexedAccess`.

## Account contract (app ↔ worker) — server in `worker/src/auth`, app in `src/services/auth`, rules in `src/domain/account`

Licenses and activation codes were removed on 2026-11-26. Trainers have accounts (better-auth on the Worker,
tables in D1, `worker/migrations/0005_accounts.sql`).

- **Sign-in methods**: email + password (min 8 chars, no emails are ever sent) and Google (only when
  `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set). Phone/WhatsApp OTP is not built: every provider costs
  money (zero-cost rule).
- **Approval**: every new account is `pending`; the owner approves, disables or re-enables it, and sets new
  passwords, in `/admin` (protected by `ADMIN_PASSWORD`). Only `approved` accounts may use cloud endpoints.
- **Session**: the app keeps the session token in Dexie meta (`auth.token`, device-local, never in a backup) and
  sends `Authorization: Bearer <token>`. Never cookies (the Worker is another site). Sessions last a year and
  refresh daily while used.
- **Offline**: the last known account (`auth.account`) lives on the device; the app opens offline. A background
  `GET /api/account` updates the status; 401 = session ended → sign in again (data stays).
- **Google**: top-level `GET /auth/google?return=<app origin>` on the Worker → Google → `/api/auth/callback/google`
  → `/auth/handoff` turns the first-party cookie into a 3-minute one-time token and redirects to
  `<app>/#auth=<token>` (or `#auth_error=…`); the app trades it at `POST /api/auth/one-time-token/verify`.
- **Worker API**: `/api/auth/*` (better-auth, allow-listed paths only), `GET /api/account` →
  `{ account: { id, name, email, status, role, plan, gym } }`, `GET /api/auth-config` → `{ google }`. Cloud endpoints answer
  401 `invalid`, 403 `pending` / `disabled` / `expired`.
- **Whose data is on the phone**: device-local `auth.dataOwner` = the user id the local data belongs to
  (`dataOwnership`). Another account signing in on a phone with someone else's clients gets "sign out" or
  "erase this phone's data" (`eraseLocalData`, also drops the previous `backup.*` keys); it never sees them.
- **New phone**: first sign-in of an account on an empty phone with a cloud backup offers "restore your data"
  (backup password, once per account per phone). After any cloud restore, `recoverPhotosIfPending` brings
  full-size client/trainer photos back from the encrypted copies in the bucket (`recoverPhotos`).
- **Guest**: "continue as guest" exists only in `npm run dev` and the e2e build (`guestAllowedIn`); never in
  production.

## Hierarchy and plans (owner → gyms → trainers) — server `worker/src/team`, app `src/domain/team`, `src/features/team`

- **Owner** (`/admin`) approves independent trainers and gym managers, and sets each account's **plan**
  (`account_plans`): kind `trainer` | `gym` (+ gym name), `maxClients` per trainer, `maxTrainers` (gyms),
  `expiresAt` (last Cairo day). Migration `worker/migrations/0006_teams.sql`.
- **Gym manager** (Team screen, `/more/team`) makes an invite link `<app>/#join=<code>.<team key>`; a trainer who
  opens it joins as `pending`, and the manager approves or removes them (`/api/team*`). Gym approval never changes
  the trainer's own `user.status`; access rules are in `worker/src/team/access.ts` (`resolveAccess`): owner
  disable wins; an active gym trainer gets the gym's status, end date and per-trainer client limit.
- **Status** values: `pending | approved | disabled | expired`. The app also expires a plan offline from
  `plan.expiresAt` (`effectiveStatus`), and blocks adding a client at `maxClients` (`reachedClientLimit`).
- **Gym sees clients without the server reading them**: each trainer's app uploads a roster (`buildRoster`: names,
  package, sessions left, dates, last attended session, attention; never phones, notes, measurements or photos)
  sealed with the team key (PTK1). The key exists only on the manager's phone and inside the invite link fragment.

## Commands

- `npm run check` — typecheck + lint + unit tests + forbidden-words gate. Must pass before any phase is "done".
- `npm run dev` / `npm run build`
- Worker: `cd worker && npm test`
- `npm run deploy` — production (Cloudflare): all checks, build with guards, D1 migrations, both Workers, changed app
  files only. Needs `CLOUDFLARE_API_TOKEN`. State and the optional Static Assets mode: `docs/DEPLOYMENT.md`.
- `npm run test:integration` — real stack (app build + `wrangler dev` with local D1/R2): sign-up, approval,
  cloud backup on one phone, restore on another.

## Definition of done

A phase is done when all checks pass and their output plus screenshots are shown — not when the code is
written. If a check fails and cannot be fixed, say so plainly; never disable or bypass it. Anything that can
only be verified on a real iPhone goes into `docs/MANUAL_QA.md`.
