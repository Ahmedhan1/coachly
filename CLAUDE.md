# PT Coach App — project rules

Commercial offline-first PWA sold once (lifetime) to private personal trainers in Egypt. One trainer, one
iPhone, non-technical, one-handed use between sessions. Full spec: `docs/SPEC.md` (Arabic). Read it before
working on a feature.

## Hard constraints

- **Zero cost.** No paid library or service. No Xcode / Expo / App Store. Cloudflare free tier only.
- **Golden rule.** After activation the app never needs the network. Every Cloudflare call sits behind an
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
- **Privacy.** Nothing leaves the device unencrypted. The server sees only: license id, device id, push
  subscription, notification time, generic text without names.
- **Secrets.** The Ed25519 private signing key never enters the repo or the site bundle.

## Layers (dependencies point downward only)

1. `src/app`, `src/features`, `src/ui` — screens and components, no calculation logic.
2. `src/domain` — pure TypeScript. No React, no DOM, no Dexie imports (ESLint enforces). Every function has a
   test written first. Time is always passed in as a parameter (`now: Date`), never read from `Date.now()`.
3. `src/data` — repositories over Dexie with versioned schema. No screen talks to Dexie directly.
4. `src/services` — calendar, files, 3D, PDF, backup, integrations; each behind an interface with a fake for tests.

`worker/` is a separate Cloudflare Worker project with its own `package.json` and tests.
`shared/` holds code used by both app and worker (license format). `tools/` holds offline owner tools.

Small files, clear names, no `any`. TypeScript strict with `noUncheckedIndexedAccess`.

## License contract (shared by app, worker, tools) — implemented in `shared/license.ts`

- **Short activation code**: 12 chars from alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789`, shown as `XXXX-XXXX-XXXX`.
- **License token**: `b64url(utf8(JSON payload)) + "." + b64url(ed25519 signature over the payload bytes)`.
- **Payload** (all times are unix seconds):
  `{ v: 1, lid: string, dev: string, name: string, iat: number, actBy: number, exp: number | null, feat: string[] }`
  - `dev` = first 32 hex chars of SHA-256(deviceId). `deviceId` is a random UUID created at install.
  - `exp: null` = lifetime. `actBy` = last moment the code may be activated.
- **Offline long code** (fallback when Cloudflare is down): `"PT1." + license token`, typed/pasted by the trainer.
- **Clock rollback**: app stores the latest time it has seen; if the clock goes back more than 24h, a
  time-limited license locks (lifetime licenses are unaffected).
- **Worker API** (JSON):
  - `POST /api/activate` `{ code, deviceId }` → `200 { license, dataKey }` | `4xx { error: 'invalid' | 'used' | 'expired' | 'rate_limited' }`
  - `GET /api/license/status` with header `Authorization: Bearer <license token>` → `{ revoked: boolean }`
  - `/admin/*` — owner-only code dashboard, protected by `ADMIN_PASSWORD` secret.
  - Signing key: Worker secret `LICENSE_PRIVATE_KEY` (hex). Public key is embedded in the app.

## Commands

- `npm run check` — typecheck + lint + unit tests + forbidden-words gate. Must pass before any phase is "done".
- `npm run dev` / `npm run build`
- Worker: `cd worker && npm test`

## Definition of done

A phase is done when all checks pass and their output plus screenshots are shown — not when the code is
written. If a check fails and cannot be fixed, say so plainly; never disable or bypass it. Anything that can
only be verified on a real iPhone goes into `docs/MANUAL_QA.md`.
