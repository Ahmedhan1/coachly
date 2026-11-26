# Security and privacy

> **ملخص بالعربي:** كل بيانات العملاء (أسماء، مقاسات، صور) بتفضل على آيفون المدرب. أي حاجة بتطلع للسيرفر
> بتتشفّر على الآيفون الأول، بكلمة سر المدرب (النسخة الاحتياطية) أو بمفتاح جوه اللينك نفسه (صفحة العميل)،
> فلا صاحب التطبيق ولا Cloudflare يقدروا يقروها. السيرفر يعرف بس: حساب المدرب (الاسم، الإيميل، بصمة كلمة السر أو
> حساب جوجل، وحالة الموافقة)، اشتراك الإشعارات، ميعاد الإشعار، ونص عام من غير أسماء عملاء. الحدود بصراحة:
> مبرمج عنده حساب متوافق عليه يقدر يستخرج نسخة التطبيق، ولو المدرب نسي كلمة سر النسخة الاحتياطية النسخة
> السحابية بتضيع.

Status legend: **implemented** · **planned (phase N)** — phase numbers follow docs/PLAN.md. As of 2026-11-16
almost everything here was planned; see each section's status. Accounts replaced licenses on 2026-11-26.

## 1. What is stored where

| Where | What | Encrypted? | Who can read it |
| --- | --- | --- | --- |
| **Trainer's iPhone — IndexedDB (Dexie)** | Clients (names, phone, goals, injuries, measurements, photos), sessions, programs, payments, nutrition, settings, logo, PDF templates | Not encrypted at rest by the app (iOS device encryption + passcode protects it) | The trainer, anyone with the unlocked phone, and the app's own code |
| same | account session token (`auth.token`) and last known account (`auth.account`: id, name, email, approval status) — device-local, never inside a backup | No | same |
| same | Backup key (derived from the trainer's backup password) | Stored as a **non-extractable** `CryptoKey` so automatic backups can run without asking for the password every time — planned (phase 9); must be verified on a real iPhone that Safari persists CryptoKey objects in IndexedDB (MANUAL_QA) | the app only |
| same | Optional AI API key (trainer's own) | No (device only) — planned (phase 10) | the app; sent only to the AI provider the trainer chose |
| **Cloudflare D1** | trainer accounts (better-auth: name, email, password hash (scrypt) or Google account id, approval status, created/updated times), sessions (token, expiry, IP, user agent), short-lived verification rows (Google state, 3-minute one-time tokens) | Passwords hashed; no client data in it | the owner (admin dashboard) and Cloudflare |
| same | plans (limits, end date), gyms (name, SHA-256 of the current invite code), gym memberships, and each gym trainer's client roster as a **PTK1 envelope** | Rosters: **Yes** — AES-GCM with the gym's team key, which only exists on the gym manager's phone, in their device backup, and in the invite link fragment (never sent to a server) | Rosters: the gym manager only. The rest: owner, Cloudflare |
| same | push subscriptions (endpoint + keys), notification schedule (time slot + **generic** text with no client names, e.g. "عندك حصة بعد 30 دقيقة") | No | owner, Cloudflare |
| same | client-page index: random page id, SHA-256 of its write token, size, updated-at, revoked flag; R2 usage counters; rate-limit counters | No | owner, Cloudflare |
| **Cloudflare R2** | cloud backup (one per account) | **Yes** — AES-GCM, key from the trainer's password | only the trainer |
| same | client-page content and weekly check-ins | **Yes** — AES-GCM, key only in the link fragment | the trainer and whoever holds the link |
| **Cloudflare Pages** | app code, exercise data + 3D model, fonts | No (public content; see docs/EXERCISE_PACK.md) | public files |
| **Device backup file** (saved outside the app by the trainer: «حفظ في الملفات», WhatsApp/mail to self, any app the trainer picks) | full database + full-size photos | **Yes by default** — chunked PTB1 envelope (below). The app has no Google Drive / iCloud integration and the owner runs nothing for it | the trainer |
| **Photo archive file** («أرشفة الصور القديمة») | old client/progress photos only (full size) + their metadata | Yes when the trainer gives a password (same PTB1 envelope) | the trainer |

**What leaves the device on purpose, unencrypted, by the trainer's own action:** PDFs and WhatsApp messages the
trainer shares with a client (that is the point of them); and, only if the trainer turns them on, the AI helper
(sends the draft request to the AI provider) and webhooks (send event data to the trainer's own n8n/Make). Both
are off by default and must show a clear Arabic warning before enabling — planned (phase 10).

## 2. What the server can and cannot see

Can see: the trainer's account (name, email, approval status, sign-in method; never the password itself),
session metadata (IP, user agent), push subscription, notification time slots and generic text, encrypted blob sizes and
timestamps, request IPs (Cloudflare logs).

Also, only when the trainer chooses a logo on the install page (or asks for a "new icon" link inside the app):
the generated home-screen icon set (180 px and 512 px icons, the logo ≤ 512 px, one launch image) and the brand
colour, stored unencrypted in the app's D1 (`brands`, `brand_assets`) under a content hash, because iOS has to
fetch them itself at "Add to Home Screen". Nothing else goes with them: no name, no device id, no account. The
upload endpoint (`POST /api/brand`, deploy/app/src/brand.ts) accepts only same-origin requests with exact-size
PNGs under fixed caps, and is rate-limited per IP (12 a day) and in total (1500 a day).

Cannot see: any client name, phone, measurement, photo, program, payment, or note; the backup password; the
client-page key. A full dump of D1 + R2 gives an attacker ciphertext only.

## 3. Cryptography

### What Web Crypto offers on iOS Safari (target: iOS 16.4+)

- `crypto.subtle` exists only in a **secure context** (HTTPS or localhost) — the installed PWA is HTTPS.
- Supported in WebKit's SubtleCrypto (WebKit blog "Update on Web Cryptography",
  <https://webkit.org/blog/7790/update-on-web-cryptography>, Safari 11 era): **AES-GCM**, AES-CBC, AES-CTR, AES-KW,
  **PBKDF2**, **HKDF**, ECDH and ECDSA (P-256/P-384; not P-521), RSA-OAEP/RSA-PSS, HMAC, SHA-256/384/512.
- **Argon2 / scrypt are not in Web Crypto in any browser.** MDN's `deriveKey` lists only PBKDF2, HKDF, ECDH and
  X25519 (<https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey>). Argon2 would need a WASM
  library (memory-hungry; risky on old iPhones under memory pressure) → **not used**.
- **Ed25519** in Web Crypto: Safari/iOS **17.0+** only (caniuse data as reported in search results on 2026-11-16, <https://caniuse.com/mdn-api_subtlecrypto_generatekey_ed25519>; page not opened directly);
  X25519 enabled in WebKit in 2024. (The app used @noble/ed25519 for licenses until 2026-11-26; licenses are
  gone and nothing uses Ed25519 any more.)

### Password → key (cloud backup and local backup file) — planned (phase 4 local, phase 9 cloud)

1. `salt` = 16 random bytes (`crypto.getRandomValues`), stored in the backup header.
2. `KEK = PBKDF2-HMAC-SHA-256(password, salt, iterations)` → AES-GCM 256-bit key. Start at **600,000
   iterations** (the commonly cited OWASP figure for PBKDF2-SHA-256 — re-check before release) and **measure on the
   oldest supported iPhone**; the count is stored in the header so it can be raised later without breaking old
   backups. Target ≤ ~1 s.
3. A random 256-bit **data key (DEK)** encrypts the backup; the DEK is wrapped with the KEK (AES-GCM). Changing
   the password re-wraps the DEK only.
4. Backup is encrypted in chunks (e.g. 4 MB) with AES-GCM: fresh 12-byte random IV per chunk, and
   **additional authenticated data** = `backupId | chunkIndex | chunkCount | formatVersion` so chunks cannot be
   reordered, swapped between backups, or truncated without detection.
5. Header (plaintext, authenticated as AAD of chunk 0): magic `PTB1`, format version, KDF name + iterations +
   salt, wrapped DEK, chunk size, chunk count.
6. Minimum password: 8 characters, with a strength hint in Arabic. **Forgotten password = cloud backup is
   unrecoverable** (by design; the app says so before enabling and keeps reminding to export a local file).

### Client page link (key in the URL fragment) — planned (phase 9)

Link format: `https://<app-host>/c/<pageId>#k=<base64url(32-byte key)>`

- `pageId`: 128-bit random, unguessable. `k`: random AES-GCM-256 key made on the trainer's phone.
- Browsers **never send the fragment (`#…`) to the server** and do not include it in the `Referer` header, so
  the Worker only ever sees `pageId`.
- The trainer's app encrypts the page content (program, meals, images references) with `k` and uploads the
  ciphertext to R2 via the Worker. The client's browser downloads the ciphertext and decrypts locally.
- **Check-ins (client → trainer):** the client page derives `writeToken = HKDF(k, "pt-checkin-write")` and
  encrypts the check-in with `k` (fresh IV). The Worker stores only `SHA-256(writeToken)` and accepts uploads
  that present the matching token → the server can authorize writes without being able to read anything.
- The page must load **no third-party scripts, fonts or analytics** (any script on that origin could read the
  fragment). Strict CSP: `default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' blob: data:;
  frame-ancestors 'none'`, `Referrer-Policy: no-referrer`.
- Revocation: the trainer taps "إلغاء اللينك" → Worker marks the page revoked and deletes the blobs (free op).
  "Renew link" makes a new `pageId` + `k`.
- Honest limit: **anyone who has the link can read and post** (it is a bearer secret). A forwarded WhatsApp
  message forwards access. The app explains this in one sentence when sharing.

### Web Push payloads — planned (phase 9)

Encrypted end-to-end to the browser push service per RFC 8291 (ECDH P-256 + HKDF + AES-128-GCM) and signed with
VAPID (ES256), all with Web Crypto inside the Worker (Node's `web-push` package does not run on Workers). The
text itself is stored in D1 in plain form, so it must stay **generic** (no client names) — enforced by building
it from fixed templates in `src/i18n/ar/` with only a time/count inserted.

### Device backup file envelope "PTB1" (implemented, `src/services/backup/chunkedEnvelope.ts`)

Implements steps 1–5 above for the device file: PBKDF2-SHA-256 (600,000 iterations, stored per file) → KEK wraps a
random 256-bit data key (AAD = header); the zip is encrypted in 4 MB chunks, each with a fresh IV and AAD =
`header (incl. random fileId, chunkCount, plainSize) | chunkIndex | isLast`, so chunks cannot be reordered, swapped
between files or truncated. Sealing/opening reads one chunk at a time from the Blob (peak JS memory ≈ 2 chunks; a
300-photo / 19 MB test never hands Web Crypto more than one chunk). Older single-message PTP1 files still open.
The cloud copy keeps PTP1 (thumbnails, small).

- **Why not a server-provided key?** Any key the server hands out could be read by the owner or shared between
  trainers. Device files use the trainer's password only.
- **Remembered password.** For the one-tap weekly file the trainer may keep the file password on this phone
  (`backup.filePassword`, device-local, same treatment as `backup.cloudPassword`). It protects the copy that
  leaves the phone, not the phone itself (the IndexedDB data is already there in clear).
- **Device-local keys never travel.** Meta keys starting `auth.` or `backup.` (session token, account,
  passwords, backup status) are excluded from every backup and kept untouched by a restore (tested in
  `src/services/backup/deviceBackup.test.ts`).
- **Photo archives cannot wipe data.** Their manifest is `kind: "photos"`, `formatVersion: 2`: older app versions
  refuse them (`unsupported_format`), the full restore refuses them (`photo_archive`), and they are restored only by
  adding photos back. Originals are swapped for placeholders only after the trainer picked the saved file back and
  every checksum matched.

### Storage quota and eviction (on-device data)

- Safari gives a home-screen web app a quota relative to free disk space (not a fixed number); the value shown in
  Settings → التخزين comes from `navigator.storage.estimate()` and grows when the phone has more free space.
  Re-check WebKit's storage policy before each release.
- `navigator.storage.persist()` is requested at boot and again from a button (user gesture) in Settings → التخزين.
  Persisted storage is not evicted under storage pressure; non-persisted origins can be. Deleting the home-screen
  app still deletes everything, which is why the device file is the primary safety net.

## 4. Accounts and sessions

Contract in CLAUDE.md ("Account contract"); server in `worker/src/auth`, app in `src/services/auth`. Licenses,
activation codes and the Ed25519 key were removed on 2026-11-26.

- **Secrets** (Worker only, never in the repo or the bundle): `BETTER_AUTH_SECRET` (signs cookies/tokens and
  derives the Worker's HMAC keys for IP hashing and admin sessions), `ADMIN_PASSWORD`, `GOOGLE_CLIENT_SECRET`.
- **Passwords**: better-auth hashes them (scrypt). Minimum 8 characters. No email is ever sent, so there is no
  "forgot password" mail: the owner sets a new password in /admin, which also ends every session of the account.
- **Approval**: new accounts are `pending` (`status` cannot be set by a sign-up request); only `approved`
  accounts pass `authenticate()` for cloud endpoints. Disabling keeps sessions so the app learns "disabled".
- **Session token** is sent only as `Authorization: Bearer`. A cookie alone never authorises a cloud call (tested),
  and the app calls the Worker with `credentials: 'omit'`.
- **Google**: the OAuth flow runs entirely on the Worker's own site (first-party state cookie). The session reaches
  the app through a single-use, hashed, 3-minute one-time token in the URL fragment (never sent to a server by the
  browser); the Worker clears its cookies after the handoff. The return origin must be one of `APP_ORIGIN`.
- **Only the auth endpoints the app uses are reachable** (`worker/src/auth/routes.ts` allow-list); the rest of
  better-auth's API answers 404. better-auth telemetry is switched off.
- **Admin dashboard** (`/admin/*`): protected by `ADMIN_PASSWORD`, compared in constant time, login rate-limited,
  session cookie `HttpOnly; Secure; SameSite=Strict`, 12-hour expiry, same-origin form posts only.

### Gyms (2026-11-26)

- A gym manager sees a **summary** of each approved trainer's clients (names, package, sessions left, dates, last
  attended session, attention flag), never phones, notes, measurements, injuries or photos (`buildRoster`, tested).
  Trainers joining a gym are told the gym will see it; leaving the gym deletes their roster on the server.
- Anyone holding an invite link can read rosters uploaded with that key **if** they could also download them, which
  requires the gym manager's session. A new invite code does not change the key; a manager who suspects the key leaked
  should ask the owner to recreate the gym (new key). Known, accepted.
- Gym approval never changes a trainer's own approval by the owner; owner disable always wins (`resolveAccess`).

## 5. Rate limiting and endpoint protection — planned (phase 3, extended in phase 9)

- Every cloud endpoint requires an approved account session (or a page write token for client uploads); the
  public client-page read and the auth endpoints are the exceptions.
- Limits (starting values): sign-in / sign-up / one-time-token 20 / 10 min per IP and 600 / hour in total (D1),
  plus better-auth's own per-IP limiter; session reads 240 / hour per IP (memory); backup upload 4 / day per
  account and the per-account size cap from docs/LIMITS.md; client-page reads 120 /
  hour per pageId; check-in writes 20 / day per pageId, max 5 MB each.
- Mechanism: Cloudflare's Rate Limiting binding if it is confirmed available on the Free plan (docs/LIMITS.md says
  this is not yet verified; it is approximate and per location), otherwise a D1 counter table keyed by
  `(key, minute bucket)` with an index and daily cleanup (fits the D1 write budget in docs/LIMITS.md). **Not KV**
  (1,000 writes/day).
- A wrong email and a wrong password get the same answer (`INVALID_EMAIL_OR_PASSWORD`).
- Every Cloudflare call from the app has a short timeout and fails silently (golden rule) — rate limiting can
  never lock the trainer out of the app itself.

## 6. Threat model

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Cloudflare / server breach or a curious owner | Only ciphertext for client data; generic push text; hashed passwords | Metadata (who is a customer, sizes, times) is visible |
| Someone copies the site files | The app opens only after an approved sign-in on that device | Low |
| One account shared with a friend | Owner sees the accounts and can disable one; sessions are per device | Sharing a password works until the owner notices; accepted |
| An approved user extracts the app from their own phone (Web Inspector, backup extraction) and edits the local account state | None that is free and offline-safe | **Accepted.** They get a working copy without cloud features (the Worker still checks every cloud call). True for every offline app. |
| Stolen session token | Bearer token only in device-local storage, HTTPS only, owner can disable the account or set a new password (ends sessions) | Valid until then |
| Leaked `BETTER_AUTH_SECRET` | Worker secret only | Rotate it: every trainer signs in again; local data unaffected |
| Lost / stolen iPhone | iOS passcode + device encryption; cloud backup restorable on a new device by signing in to the same account | Thief with the passcode sees everything in the app; the app has no separate PIN yet (open question) |
| Client-page link forwarded | Bearer link; revoke + renew | Anyone with the link reads it until revoked |
| XSS in the app or client page (would expose keys and data) | No third-party scripts, strict CSP, React escaping, no `dangerouslySetInnerHTML`, Zod validation on every input and on decrypted content | Supply-chain risk of dependencies → pinned versions + license/audit review per phase |
| Guessing passwords | Min 8 characters, scrypt, per-IP + global rate limits | Weak passwords remain weak |
| Brute-forcing a stolen backup's password | PBKDF2 with high iteration count + salt; minimum length | Weak passwords remain weak — strength hint only |
| iOS evicts website storage under disk pressure | `navigator.storage.persist()` (boot + Settings button), image downscaling, photo archiving, weekly device-file reminder (Home card), optional cloud copy | Data since the last device file |
| Trainer enables AI / webhooks | Off by default, explicit Arabic warning, trainer's own keys/endpoints | Data goes to the provider the trainer chose |

## 7. Reporting

Security issues: contact the owner privately (contact to be added before release). Never open a public issue
containing a key, token, backup file or client data.

## Phase 9 (implemented)

Server side of cloud backup, Web Push and the client page, built 2026-11-16 in `worker/` (contract and owner
steps: `docs/CLOUD.md`). Sections 1, 3 and 5 above described these as planned; this is what was built and where
it differs.

- **Auth on every non-public endpoint**: an approved account's session token (better-auth session in D1;
  `worker/src/cloud/auth.ts`); per-IP memory pre-filter before the session lookup, then a per-account (or
  per-device for push) D1 rate limit. Public endpoints: `GET /api/push/vapid`, `GET /api/share/:id`,
  `POST /api/share/:id/checkins`, `GET /c/:id` — each rate-limited (per IP, plus per page id where it applies).
- **Cloud backup**: R2 stores only the PTP1 envelope; the Worker checks the 4-byte magic and the size, never the
  content. Two slots per account with a D1 pointer, so an interrupted upload can never destroy the latest copy.
  Per-trainer cap 100 MiB; global guard `storage_full` at 9 GiB (tracked in D1, no bucket listing).
- **Client page**: as planned in section 3 — key only in the fragment; `writeToken = HKDF-SHA-256(k, salt = empty,
  info = "pt-checkin-write")`; D1 stores `base64url(SHA-256(writeToken))`; check-ins are accepted only with the
  matching token (constant-time compare), so someone who sees only the page id (e.g. in Cloudflare request logs)
  can read ciphertext but cannot post. Differences from the plan: the page is served by the Worker at `/c/:id`
  with **inline script and style allowed only by a per-response nonce** (`default-src 'none'; script-src
  'nonce-…'; style-src 'nonce-…'; img-src 'self' data: blob: <app origin>; connect-src 'self'; base-uri 'none';
  form-action 'none'; frame-ancestors 'none'`) instead of `script-src 'self'`; no third-party requests; every
  decrypted value is validated and rendered with `textContent` only. Check-ins: max **3 MiB** each (not 5),
  20 pending per page, 6/hour and 20/day per IP, 10/day per page. Photos are re-encoded in the browser to JPEG
  ≤ 1200 px, which drops EXIF (including GPS). Revoke deletes the page and all its check-ins and the id is never
  reusable.
- **Web Push**: RFC 8291 + VAPID in Web Crypto (`worker/src/push/`), verified against RFC 8291 Appendix A.
  Subscription endpoints are restricted to known push services (Apple, Google FCM, Mozilla, Microsoft), https,
  default port — the Worker cannot be turned into a request proxy. Title/body ≤ 120 chars and stored in plain
  form in D1: the **app** must keep them generic (fixed templates, no names); the server cannot verify that.
  Subscriptions answering 404/410 are deleted. VAPID private key is a Worker secret only.
- **Logging**: the Worker logs nothing about requests; the cron logs counts only (`{sent, gone, retry, failed,
  stale}`). Cloudflare's own request logs still contain paths (page ids, never keys) and IPs.
- **Residual risks**: anyone with the full link can read and post (bearer link, as planned); push text is
  readable by the owner/Cloudflare; metadata (sizes, times, number of clients with pages) is visible; the
  Free-plan CPU limit for the cron is designed from a local workerd measurement and must be checked on the
  dashboard after deploy.

## Optional extras (off by default)

- **AI assistant (Groq).** The trainer's own free Groq API key is stored on the phone only (meta key
  `backup.ai.apiKey`, device-local: never inside a backup file). A request goes from the phone straight to
  `api.groq.com`; only if the browser cannot reach it (network/CORS error) does it retry through our Worker relay
  `POST /api/ai/relay`, which requires a valid license token, forwards the key in `X-Groq-Key` without logging or
  storing it, caps the body at 64 KB and rate-limits per license. Read tools send first names only, never phone
  numbers. The assistant only proposes changes: every write is shown as an approval card and runs only when the
  trainer taps «نفّذ», with undo. A filter blocks supplement doses in any AI output.
- **Webhook.** When the trainer turns it on, the phone POSTs JSON to the trainer's own HTTPS address (n8n, Make) for
  "new client" and "subscription ending". This payload includes the client's name and phone, because that is what such
  automations need; the setting says so plainly. Nothing goes through our Worker.
