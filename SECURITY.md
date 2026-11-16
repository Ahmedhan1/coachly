# Security and privacy

> **ملخص بالعربي:** كل بيانات العملاء (أسماء، مقاسات، صور) بتفضل على آيفون المدرب. أي حاجة بتطلع للسيرفر
> بتتشفّر على الآيفون الأول، بكلمة سر المدرب (النسخة الاحتياطية) أو بمفتاح جوه اللينك نفسه (صفحة العميل)،
> فلا صاحب التطبيق ولا Cloudflare يقدروا يقروها. السيرفر يعرف بس: رقم الترخيص، رقم الجهاز، اشتراك الإشعارات،
> ميعاد الإشعار، ونص عام من غير أسماء. الحدود بصراحة: مبرمج اشترى ترخيص سليم يقدر يستخرج نسخته، ولو المدرب
> نسي كلمة السر النسخة السحابية بتضيع.

Status legend: **implemented** · **planned (phase N)** — phase numbers follow docs/PLAN.md. As of 2026-11-16
almost everything here is planned; only the license token format (`shared/license.ts`) is being built now.

## 1. What is stored where

| Where | What | Encrypted? | Who can read it |
| --- | --- | --- | --- |
| **Trainer's iPhone — IndexedDB (Dexie)** | Clients (names, phone, goals, injuries, measurements, photos), sessions, programs, payments, nutrition, settings, logo, PDF templates | Not encrypted at rest by the app (iOS device encryption + passcode protects it) | The trainer, anyone with the unlocked phone, and the app's own code |
| same | `deviceId` (random UUID created at install), license token, data-bundle key (`dataKey`), latest-seen time (clock-rollback guard) | No | same |
| same | Backup key (derived from the trainer's backup password) | Stored as a **non-extractable** `CryptoKey` so automatic backups can run without asking for the password every time — planned (phase 9); must be verified on a real iPhone that Safari persists CryptoKey objects in IndexedDB (MANUAL_QA) | the app only |
| same | Optional AI API key (trainer's own) | No (device only) — planned (phase 10) | the app; sent only to the AI provider the trainer chose |
| **Cloudflare D1** | licenses (license id, SHA-256 of the activation code, buyer name = the owner's customer, issue/expiry dates, features, revoked flag), device fingerprint `dev` (first 32 hex of SHA-256(deviceId)), activation time | No (no client data in it) | the owner (admin dashboard) and Cloudflare |
| same | push subscriptions (endpoint + keys), notification schedule (time slot + **generic** text with no client names, e.g. "عندك حصة بعد 30 دقيقة") | No | owner, Cloudflare |
| same | client-page index: random page id, SHA-256 of its write token, size, updated-at, revoked flag; R2 usage counters; rate-limit counters | No | owner, Cloudflare |
| **Cloudflare R2** | cloud backup (one per license) | **Yes** — AES-GCM, key from the trainer's password | only the trainer |
| same | client-page content and weekly check-ins | **Yes** — AES-GCM, key only in the link fragment | the trainer and whoever holds the link |
| **Cloudflare Pages** | app code, encrypted data bundle (exercise data + 3D model), fonts | bundle encrypted with `dataKey` | public files; bundle needs the key from activation |
| **Local backup file** (Files / iCloud Drive) | full database + full-size photos | **Yes by default** — same password scheme. iCloud Drive is off the device, so the "nothing leaves unencrypted" rule applies — planned (phase 4) | the trainer |

**What leaves the device on purpose, unencrypted, by the trainer's own action:** PDFs and WhatsApp messages the
trainer shares with a client (that is the point of them); and, only if the trainer turns them on, the AI helper
(sends the draft request to the AI provider) and webhooks (send event data to the trainer's own n8n/Make). Both
are off by default and must show a clear Arabic warning before enabling — planned (phase 10).

## 2. What the server can and cannot see

Can see: license id, device fingerprint, activation code hash, the buyer's name and license dates (the owner
enters these), push subscription, notification time slots and generic text, encrypted blob sizes and
timestamps, request IPs (Cloudflare logs).

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
  X25519 enabled in WebKit in 2024. Since we support 16.4, the app verifies licenses with **@noble/ed25519**
  (pure JS, MIT) — no dependency on Web Crypto Ed25519.

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
it from fixed templates in `src/i18n/ar.ts` with only a time/count inserted.

## 4. License key handling

Contract in CLAUDE.md; implemented in `shared/license.ts` (phase 3, in progress by another agent).

- **Ed25519 private key**: lives only as the Worker secret `LICENSE_PRIVATE_KEY` and in the owner's offline copy
  (e.g. password manager + a USB stick). Never in the repo (`.gitignore` blocks `*.pem`, `*.key`, `keys/`,
  `.dev.vars`), never in the site bundle. The public key is embedded in the app.
- **Activation code**: 12 characters from a 30-symbol alphabet → 30¹² ≈ 5.3 × 10¹⁷ (~59 bits). D1 stores
  `SHA-256(code)` so a leaked database does not reveal unused codes. Codes expire at `actBy` and are single-use
  (bound to the first device fingerprint).
- **License token** is bound to `dev` = first 32 hex chars of SHA-256(deviceId); on another install the
  fingerprint differs and verification fails.
- **Clock rollback**: the app stores the latest time it has seen; a jump back of more than 24 h locks
  time-limited licenses (lifetime licenses unaffected).
- **Admin dashboard** (`/admin/*`): protected by the `ADMIN_PASSWORD` secret, compared in constant time, login
  rate-limited, session cookie `HttpOnly; Secure; SameSite=Strict`, short expiry — planned (phase 3).
- **Offline long code** (`PT1.<token>`) is produced by the owner's tool in `tools/` on the owner's computer,
  with the private key read from a local file outside the repo — planned (phase 3).

## 5. Rate limiting and endpoint protection — planned (phase 3, extended in phase 9)

- Every endpoint except `/api/activate` and the public client-page read requires a valid license token
  (signature + not revoked) or a page write token.
- Limits (starting values): activation 10 attempts / 10 min per IP and 5 per code; status check 60 / hour per
  license; backup upload 4 / day per license and the per-license size cap from LIMITS.md; client-page reads 120 /
  hour per pageId; check-in writes 20 / day per pageId, max 5 MB each.
- Mechanism: Cloudflare's Rate Limiting binding if it is confirmed available on the Free plan (LIMITS.md says
  this is not yet verified; it is approximate and per location), otherwise a D1 counter table keyed by
  `(key, minute bucket)` with an index and daily cleanup (fits the D1 write budget in LIMITS.md). **Not KV**
  (1,000 writes/day).
- Responses never reveal whether a code exists vs. is used beyond the contract's `invalid | used | expired |
  rate_limited`.
- Every Cloudflare call from the app has a short timeout and fails silently (golden rule) — rate limiting can
  never lock the trainer out of the app itself.

## 6. Threat model

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Cloudflare / server breach or a curious owner | Only ciphertext for client data; generic push text; hashed codes | Metadata (who is a customer, sizes, times) is visible |
| Someone copies the site files | Data bundle encrypted, key delivered only on activation | Low |
| One code shared with a friend | Code is single-use and bound to the first device | Owner can move/revoke; low |
| Paying programmer extracts the app + `dataKey` from their own phone (Web Inspector, backup extraction) | None that is free and offline-safe | **Accepted.** They get a working unlicensed copy for themselves or others. True for every offline app; not worth more complexity (owner agreed in the spec). |
| Forged license token | Ed25519 signature; private key never shipped | Private-key theft from owner's machine → rotate key, ship new public key |
| Clock set back to extend a time-limited license | Latest-seen-time guard (24 h) | A user who never lets the clock move forward can stretch it a little; lifetime licenses unaffected |
| Lost / stolen iPhone | iOS passcode + device encryption; cloud backup restorable to a new device via owner's "move device" | Thief with the passcode sees everything in the app; the app has no separate PIN yet (open question) |
| Client-page link forwarded | Bearer link; revoke + renew | Anyone with the link reads it until revoked |
| XSS in the app or client page (would expose keys and data) | No third-party scripts, strict CSP, React escaping, no `dangerouslySetInnerHTML`, Zod validation on every input and on decrypted content | Supply-chain risk of dependencies → pinned versions + license/audit review per phase |
| Brute-forcing activation codes | ~59-bit codes + rate limiting | Negligible |
| Brute-forcing a stolen backup's password | PBKDF2 with high iteration count + salt; minimum length | Weak passwords remain weak — strength hint only |
| iOS evicts website storage under disk pressure | `navigator.storage.persist()`, image downscaling, automatic encrypted cloud backup, weekly local-export reminder | Data since the last backup |
| Trainer enables AI / webhooks | Off by default, explicit Arabic warning, trainer's own keys/endpoints | Data goes to the provider the trainer chose |

## 7. Reporting

Security issues: contact the owner privately (contact to be added before release). Never open a public issue
containing a key, token, backup file or client data.

## Phase 9 (implemented)

Server side of cloud backup, Web Push and the client page, built 2026-11-16 in `worker/` (contract and owner
steps: `docs/CLOUD.md`). Sections 1, 3 and 5 above described these as planned; this is what was built and where
it differs.

- **Auth on every non-public endpoint**: license token signature + not revoked/replaced in D1 + not expired
  (`worker/src/cloud/auth.ts`); per-IP memory pre-filter before the signature check, then a per-license (or
  per-device for push) D1 rate limit. Public endpoints: `GET /api/push/vapid`, `GET /api/share/:id`,
  `POST /api/share/:id/checkins`, `GET /c/:id` — each rate-limited (per IP, plus per page id where it applies).
- **Cloud backup**: R2 stores only the PTP1 envelope; the Worker checks the 4-byte magic and the size, never the
  content. Two slots per license with a D1 pointer, so an interrupted upload can never destroy the latest copy.
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

- **AI assistant.** The trainer's own Anthropic API key is stored on the phone only (meta key `backup.ai.apiKey`,
  device-local: never inside a backup file or sent to our Worker). A draft request goes from the phone straight to
  `api.anthropic.com` and carries the client's goal, sex, age, injuries and measurements and the trainer's notes —
  never the client's name or phone. Every draft is saved as an editable program/meal day for the trainer to review.
- **Webhook.** When the trainer turns it on, the phone POSTs JSON to the trainer's own HTTPS address (n8n, Make) for
  "new client" and "subscription ending". This payload includes the client's name and phone, because that is what such
  automations need; the setting says so plainly. Nothing goes through our Worker.
