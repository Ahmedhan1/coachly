# Cloud features (phase 9): backup, Web Push, client page

Server side lives in `worker/` (Cloudflare Workers Free plan + D1 + R2 + one Cron Trigger). This file is the
contract for the app (`src/services`) and the owner's setup guide (Arabic section at the end).

Everything the Worker stores is either ciphertext (PTP1/PTK1 envelopes from `shared/envelope.ts`) or metadata:
license id, device fingerprint, sizes, times, random ids, push subscription, generic notification text.
The Worker never logs names or contents (the cron logs counts only).

**Golden rule reminder for the app:** every call below sits behind an interface in `src/services`, has a short
timeout, fails silently and is queued for retry. A 4xx/5xx here must never block a screen.

## Common rules

- **Auth.** Every endpoint marked *Bearer* needs `Authorization: Bearer <license token>` (the token from
  `/api/activate`). Errors: `401 {error:"invalid"}` (missing/forged), `403 {error:"revoked"}` (revoked or moved to a
  new device), `403 {error:"expired"}` (time-limited license ended), `429 {error:"rate_limited"}`. Licenses made with
  the offline tool are accepted (same as `/api/license/status`).
- **CORS.** Allowed origins = `APP_ORIGIN` (comma list) + the Worker's own origin (the client page). Methods
  `GET HEAD POST PUT DELETE`; request headers `Authorization, Content-Type, X-Checkin-Key, X-Checkin-Token,
  If-None-Match`; exposed headers include `X-Backup-*`, `X-Created-At`, `ETag`, `Content-Length`.
- **Uploads** must send `Content-Length` (browsers do for `Uint8Array`/`Blob` bodies; not for streams) →
  otherwise `411 {error:"length_required"}`. Empty body → `400 {error:"empty"}`. Wrong magic → `400
  {error:"bad_format"}`. Too big → `413 {error:"too_large", maxBytes}`. Bodies are streamed into R2, never buffered.
- **`507 {error:"storage_full"}`**: total R2 usage (tracked in D1) would pass `STORAGE_GUARD_BYTES` (9 GiB) and
  the upload would grow this trainer's footprint. Re-uploading the same size or smaller always works. The app
  should keep the local file only and tell the trainer in plain Arabic.
- Times are unix seconds. Ids are base64url.

## 1. Cloud backup (feature 13)

Body = one PTP1 envelope (password envelope). The Worker checks the first 4 bytes (`PTP1`) and the size only.

| Endpoint | Request | Response |
| --- | --- | --- |
| `PUT /api/backup` *Bearer* | body = envelope bytes, ≤ 90 MiB (`singlePutMaxBytes`) | `201 {size, uploadedAt, previousKept}`; `413 {error:"use_multipart", maxBytes}` if 90 MiB < size ≤ cap |
| `GET /api/backup[?which=previous]` *Bearer* | — | envelope bytes, headers `Content-Length`, `X-Backup-Size`, `X-Backup-Uploaded-At`; `404` if none |
| `HEAD /api/backup` *Bearer* | — | `200` with `X-Backup-Size`, `X-Backup-Uploaded-At`, and when a previous copy exists `X-Backup-Previous-Size`, `X-Backup-Previous-At`; `404` if none. D1 only, no R2 operation. |
| `DELETE /api/backup` *Bearer* | — | `{ok:true}` (deletes latest + previous) / `404` |
| `POST /api/backup/uploads` *Bearer* | `{size}` (total bytes, ≤ cap) | `201 {uploadId, partSize, partCount}` (partSize = 10 MiB) |
| `PUT /api/backup/uploads/:uploadId/parts/:n` *Bearer* | body = part `n` (1-based), exactly `partSize` bytes except the last (remainder). Part 1 must start with `PTP1`. | `{partNumber, etag}`; `400 {error:"wrong_part_size", expected}` |
| `POST /api/backup/uploads/:uploadId/complete` *Bearer* | `{parts:[{partNumber, etag}, …]}` (all parts) | `201 {size, uploadedAt, previousKept}` |
| `DELETE /api/backup/uploads/:uploadId` *Bearer* | — | `{ok:true}` (abort) |

- **Cap**: `BACKUP_MAX_BYTES` (default 100 MiB) per backup. Why multipart: the Free plan refuses request bodies
  over 100 MB (docs/LIMITS.md), and smaller parts are friendlier to a phone on mobile data. Use `PUT /api/backup` for
  anything ≤ 90 MiB (typical backups are ~10 MB); use parts above that, or always, if the app wants resumable uploads.
  One multipart upload per license at a time; starting a new one (or a single PUT) aborts the old one.
- **Storage layout**: two slots, `backups/<lid>/0` and `backups/<lid>/1`; D1 (`backups` table) says which is
  latest. A new upload always writes into the *other* slot, so a failed or interrupted upload never touches the
  latest backup. (R2's Workers API has no rename/copy, so this replaces the `latest`/`previous` key names.)
- **Previous-copy policy**: after a successful upload the old latest becomes `previous` only if
  `new size + old size ≤ BACKUP_MAX_BYTES` **and** total usage stays under `STORAGE_GUARD_BYTES`; otherwise it is
  deleted. So one trainer never holds more than the cap (plus one in-flight upload), and nobody gets a second copy
  once R2 is nearly full. The oldest copy is always replaced.
- Rate limits per license: 24 uploads/day (PUT + multipart starts + deletes), 300 parts/day, 120 reads/day.

## 2. Web Push (feature 3)

Encryption is RFC 8291 (`aes128gcm`, ECDH P-256 + HKDF + AES-128-GCM) and VAPID (RFC 8292, ES256 JWT), both done
with Web Crypto in the Worker (`worker/src/push/`); verified against RFC 8291 Appendix A in the Workers pool.

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/push/vapid` (public) | — | `{publicKey}` (base64url, pass to `pushManager.subscribe({applicationServerKey})`); `503 {error:"push_not_configured"}` without the secrets |
| `POST /api/push/subscribe` *Bearer* | `{subscription: PushSubscription.toJSON()}` = `{endpoint, keys:{p256dh, auth}}` | `{ok:true}`. One per device (key = license id + device fingerprint); subscribing again replaces it. |
| `PUT /api/push/schedule` *Bearer* | `{items:[{id, at, title, body}]}` — replaces the whole schedule of this device | `{ok:true, count}`; `409 {error:"no_subscription"}`; `400 {error:"text_too_long" \| "too_many_items" \| "invalid"}` |
| `DELETE /api/push` *Bearer* | — | `{ok:true}` (subscription + schedule of this device) |

- `id`: `[A-Za-z0-9_-]{1,64}`, unique in the list. `at`: integer unix seconds, from now − 1 h to now + 40 days.
  `title` 1–120 chars, `body` 0–120 chars, ≤ 100 items.
- **Generic text only.** D1 stores the text in plain form. Build it from fixed templates in `src/i18n/ar/` with
  only a time or count inserted (e.g. "عندك حصة بعد 30 دقيقة") — never a client name. The server cannot check this.
- Endpoints are restricted to real push services (`web.push.apple.com`, `*.push.apple.com`, `fcm.googleapis.com`,
  `updates.push.services.mozilla.com`, `*.notify.windows.com`, https, default port) so the Worker cannot be used to
  POST to arbitrary URLs.
- **What the service worker receives** (`event.data.json()`): `{v:1, id, title, body}`. The app's service worker
  shows `self.registration.showNotification(title, {body, tag: id})`.
- **Cron** (`* * * * *`): each run sends at most `PUSH_BATCH_SIZE` = 20 due items, oldest first (indexed query on
  `push_items(due_at)`, checked with `EXPLAIN QUERY PLAN` in tests), then deletes them. Push service answers:
  2xx → done; 404/410 → subscription and all its items deleted; 429/5xx/network → retried in 5 min, up to 3
  attempts; other 4xx → dropped. Items more than 1 h late are dropped unsent. `TTL: 3600`, `Urgency: high`.
  One VAPID JWT is signed per push-service origin per run (12 h expiry).
- Rate limits per device: subscribe/delete 20/hour, schedule 60/hour.

### Push CPU budget (measured)

| Where | One payload encryption | One VAPID signature |
| --- | --- | --- |
| Node 22 (`npm run bench:push`, includes libuv thread-pool overhead per Web Crypto call) | ~0.93 ms CPU | ~0.12 ms |
| workerd (Workers pool; clock advanced by a D1 round trip around 1,000 iterations) | ~0.17 ms | ~0.035 ms |

Batch 20 ≈ 20 × 0.17 + 0.035 ≈ **3.5 ms of crypto** in workerd, about a third of the 10 ms Free-plan CPU limit,
plus D1/fetch bookkeeping. Subrequests per run: 1 select + ≤ 20 pushes + 1 D1 batch (+1 hourly prune) ≪ 50.
The workerd figure is from local workerd on the build machine, not Cloudflare's edge: after deploying, check the
Worker's CPU time for cron invocations in the Cloudflare dashboard and lower `PUSH_BATCH_SIZE`
(`worker/src/cloud/config.ts`) if it approaches 10 ms.

**Capacity**: every minute × 20 = 1,200/hour = **28,800/day**, the design docs/LIMITS.md assumed and well above its
*heavy* 12,500/day; a backlog is sent on the following runs (1 min late each). The cron costs 1,440 Worker
requests/day (fits). If even that is not enough, raise `PUSH_BATCH_SIZE` only after checking cron CPU time on the dashboard.

## 3. Client page and weekly check-ins (feature 12)

**Link** given to the client: `https://<worker host>/c/<shareId>#k=<base64url of the 32-byte key>`.

- `shareId`: ≥ 128-bit random, base64url, 22–64 chars, generated by the app.
- `k`: `generateRawKey()` from `shared/envelope.ts`; lives only in the fragment, which browsers never send.
- `writeToken` = HKDF-SHA-256(ikm = k, salt = empty, info = `"pt-checkin-write"`, 32 bytes).
- `X-Checkin-Key` = base64url(SHA-256(writeToken)) — sent by the app when publishing, so the server can
  authorise check-ins without being able to read anything.

| Endpoint | Request | Response |
| --- | --- | --- |
| `PUT /api/share/:shareId` *Bearer* | body = PTK1 envelope of the share document (≤ 5 MiB); header `X-Checkin-Key` | `{shareId, size, updatedAt}`; `403 {error:"forbidden"}` (another license's page); `410 {error:"revoked"}`; `409 {error:"too_many_shares"}` (200 active per license) |
| `DELETE /api/share/:shareId` *Bearer* | — | `{ok:true}`: revoked, page + all its check-ins deleted from R2. The id can never be reused (renew = new id + new key). |
| `GET /api/share/:shareId` (public) | optional `If-None-Match` | envelope bytes (`ETag`, `Cache-Control: private, no-cache`), `304`, or `404` (unknown or revoked) |
| `POST /api/share/:shareId/checkins` (public) | body = PTK1 envelope of a check-in (≤ 3 MiB); header `X-Checkin-Token: base64url(writeToken)` | `201 {id}`; `403 {error:"forbidden"}` (wrong token); `429 {error:"too_many_pending"}` (20 waiting) or `rate_limited` |
| `GET /api/share/:shareId/checkins` *Bearer, owner* | — | `{checkins:[{id, shareId, createdAt, size}]}` |
| `GET /api/checkins` *Bearer* | — | same shape, all pending check-ins of this license (≤ 500), oldest first |
| `GET /api/share/:shareId/checkins/:id` *Bearer, owner* | — | envelope bytes (`X-Created-At`) |
| `DELETE /api/share/:shareId/checkins/:id` *Bearer, owner* | — | `{ok:true}` — call it after the app has stored the check-in |
| `GET /c/:shareId` (public) | — | the viewer page (HTML) |

Rate limits: page reads 120/hour per page and 300/hour per IP; check-ins 6/hour and 20/day per IP and 10/day
per page; owner check-in calls 600/hour per license; publishes 300/day per license.

### Share document (version 1)

Defined in `worker/src/share/document.ts` (`ShareDocumentV1`, guard `parseShareDocument`). The app encrypts
`JSON.stringify(doc)` with `sealWithKey(k, utf8)`.

```ts
interface ShareDocumentV1 {
  v: 1;
  updatedAt: number;                 // unix s, trainer's last change
  brand: {
    name: string;                    // ≤ 80
    color: string;                   // "#RRGGBB"
    logo?: string;                   // data:image/(png|jpeg|webp);base64,… ≤ 100,000 chars
  };
  client: { firstName: string };     // first name only, ≤ 40
  programTitle?: string;             // ≤ 80
  days: Array<{                      // ≤ 14
    title: string;                   // ≤ 80, e.g. "اليوم 1 — بوش"
    exercises: Array<{               // ≤ 40 per day
      name: string;                  // Arabic (transliterated) name as in the app, ≤ 120
      sets?: number;                 // 1–100
      reps?: string;                 // ≤ 20, e.g. "8-10"
      restSec?: number;              // 0–3600
      tempo?: string;                // ≤ 20, e.g. "3-1-1"
      rpe?: number;                  // 1–10
      image?: string;                // file name inside the app origin's /exercise-pack/img/, no slashes
      notes?: string;                // ≤ 500
    }>;
  }>;
  meals: Array<{ title: string; time?: string; items: string[]; notes?: string }>; // ≤ 12 meals, ≤ 30 items of ≤ 200
  supplements: Array<{ name: string; text: string }>;  // trainer-written text only (≤ 500); the app never suggests doses
  notes: string;                     // ≤ 4000
  checkinsEnabled: boolean;          // show the weekly check-in form
}
```

Images load from the **first** origin in `APP_ORIGIN` + `/exercise-pack/img/` (that origin is in the page's CSP
`img-src`). Trainer-only custom exercise photos are not on that path, so leave `image` out for them.

### Check-in document (version 1)

What the client page encrypts with the same `k` (guard `parseCheckinDocument`; the app should run it after
decrypting and before storing):

```ts
interface CheckinDocumentV1 {
  v: 1; kind: 'checkin';
  createdAt: number;                 // unix s from the client's phone
  weightKg?: number;                 // 20–400
  waistCm?: number;                  // 30–300
  notes?: string;                    // ≤ 1000
  photo?: string;                    // data:image/jpeg;base64,… downscaled in the browser to ≤ 1200 px, EXIF dropped
  photos?: string[];                 // ≤ 2 more, same format
  hipCm?, chestCm?, armCm?, thighCm?, neckCm?: number;   // neck 20–100 (for the Navy body-fat estimate)
  sleepHours?: number; energy?: number /* 1–5 */; adherence?: number /* 0–100 */;
  mealPicks?: Array<{ id: string; o: number }>;          // ≤ 84; meal id from the share document, o 0–3 (0 = as planned)
}
```

Meals in the share document carry `id` (the app's random meal id, `[A-Za-z0-9_-]{1,64}`, never a name) so the
client's pick on the page can travel back inside this encrypted document. The app keeps the newest picks per
client and shows them on the client's nutrition tab; with neck + waist (+ hip for women) and the client's height
on file, it also stores a Navy body-fat estimate on the imported entry (marked as an estimate).

App flow: `GET /api/checkins` → for each: `GET …/checkins/:id` → `openWithKey(k, bytes)` → `parseCheckinDocument`
→ store → `DELETE …/checkins/:id`.

### The viewer page

`GET /c/:shareId` returns one self-contained Arabic RTL page (inline CSS + JS with a fresh nonce per response,
no framework, no fonts or scripts from anywhere). Headers: `Content-Security-Policy: default-src 'none';
script-src 'nonce-…'; style-src 'nonce-…'; img-src 'self' data: blob: <app origin>; connect-src 'self';
base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Cache-Control:
no-store`, `X-Robots-Tag: noindex`. It reads `#k=`, fetches and decrypts the envelope with Web Crypto (an inline port
of the PTK1 format; byte compatibility with `shared/envelope.ts` is tested both ways in Chromium), validates
the document, renders it with `textContent` only, applies the trainer's colour, and offers the check-in form
(weight, waist, notes, one photo; Arabic-Indic digits are accepted and converted). Mobile first, 44 px targets,
light and dark, Western digits, system fonts, styled after design direction B.
**Deferred:** the 3D muscle model on the client page.

## Configuration (`worker/wrangler.toml`)

| Name | Kind | Default / note |
| --- | --- | --- |
| `BACKUPS` | R2 binding | bucket `pt-coach-backups` |
| `[triggers] crons` | cron | `* * * * *` (1 of the account's 5) |
| `BACKUP_MAX_BYTES` | var | `104857600` (100 MiB) |
| `STORAGE_GUARD_BYTES` | var | `9663676416` (9 GiB) |
| `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | secrets | from `npm run vapid:keys`; push is off until all three exist |

D1 migration `worker/migrations/0002_cloud.sql` adds `storage_usage`, `backups`, `backup_uploads`,
`push_subscriptions`, `push_items`, `shares`, `checkins`.

## Tests

- `cd worker && npm test` — Workers-runtime pool: auth/revoked on every Bearer endpoint, caps, `storage_full`,
  multipart, RFC 8291 vectors, VAPID verify, cron batching / 410 cleanup / retries with a fake push service,
  query plan, share revoke → 404, check-in token and rate limits, viewer headers.
- `npm run test:viewer` — Chromium: the viewer page decrypts a document sealed by `shared/envelope.ts`; its
  check-in opens with `shared/envelope.ts`; no CSP violations; screenshots light/dark.
- `npm run test:e2e` — the bundled Worker in `wrangler dev` (local D1/R2): activation → 3 MB backup round trip →
  publish → Chromium opens `/c/…` from the Worker → check-in → trainer decrypts → revoke.
- `npm run bench:push` — CPU per push in Node.

## Not done / limits

- Not deployed and not run against real Cloudflare (no credentials here); real push delivery to an iPhone is a
  MANUAL_QA item (needs the installed PWA on iOS 16.4+).
- docs/LIMITS.md's 70–90 % tier (lower per-trainer cap) and "delete backups of revoked licenses after 30 days" are not
  implemented; only the 9 GiB guard is. Usage per trainer is visible in D1 (`backups`, `shares`, `checkins`).
- Unfinished multipart uploads are aborted when the trainer starts a new one; abandoned ones rely on R2's own
  cleanup of incomplete multipart uploads (R2 docs describe a default 7-day rule; not re-verified here).
- The client page reads are not cached at the edge (each view = 1 Worker request + 1 R2 read; `ETag` saves bandwidth only).

---

## للمالك: الحاجات اللي محتاج تعملها بإيدك (مرة واحدة)

كل الأوامر دي من جوه فولدر `worker` على الكمبيوتر بتاعك، بعد ما تكون عامل `npx wrangler login`.

1. **اعمل مخزن R2 للنسخ الاحتياطية:**
   `npx wrangler r2 bucket create pt-coach-backups`
   (الاسم لازم يبقى زي اللي في `wrangler.toml` بالظبط. لو Cloudflare طلب منك تفعّل R2 الأول، فعّله من لوحة
   Cloudflare، الباقة المجانية 10 جيجا.)
2. **حدّث قاعدة البيانات بالجداول الجديدة:**
   `npm run db:migrate:remote`
3. **اعمل مفاتيح الإشعارات (VAPID):**
   `npm run vapid:keys` — هيطبع سطرين. بعدها:
   - `npx wrangler secret put VAPID_PRIVATE_KEY` والصق السطر الأول (ده سر، ما تحطوش في أي ملف ولا تبعته لحد).
   - `npx wrangler secret put VAPID_PUBLIC_KEY` والصق السطر التاني.
   - `npx wrangler secret put VAPID_SUBJECT` واكتب `mailto:` وبعدها إيميلك، مثلاً `mailto:you@example.com`.
   احتفظ بنسخة من المفتاحين عندك. لو غيّرتهم بعدين، كل الأجهزة لازم تشترك في الإشعارات من جديد.
4. **ارفع الـ Worker:** `npm run deploy`. الجدولة (كل 5 دقايق) بتتفعّل لوحدها مع الرفع، وممكن تاخد لحد ربع ساعة.
5. **اتأكد:** افتح `https://<عنوان الـ Worker>/api/push/vapid` في المتصفح، لازم يظهر `publicKey`.
6. **بعد أسبوع:** من لوحة Cloudflare ← Workers ← الـ Worker ← Metrics، بص على CPU time للـ Cron. لو قرّب من 10
   مللي ثانية قولّي ونقلّل عدد الإشعارات في الدفعة.

حاجات تعرفها:
- لو مجموع التخزين في R2 عدّى 9 جيجا، الرفع اللي بيكبّر المساحة بيترفض، والتطبيق بيكمل بالنسخة المحلية بس.
  تقدر تغيّر الرقم من `STORAGE_GUARD_BYTES` في `wrangler.toml`.
- لو المدربين كتروا والإشعارات اتأخرت، غيّر سطر الجدولة لـ `* * * * *` (كل دقيقة) وارفع تاني.
- إنت ولا Cloudflare مش هتقدروا تقروا النسخ الاحتياطية ولا صفحات العملاء: كلها متشفّرة على الآيفون.
