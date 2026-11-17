# Cloudflare free-tier limits and the 500-trainer budget

> **ملخص بالعربي:** كل الأرقام دي اتقرت من توثيق Cloudflare الرسمي يوم 2026-11-16. مع 500 مدرب، كل الحدود
> بعيدة جداً **ما عدا مساحة R2 (10 جيجا)**: دي الحد الأضيق، وبتكفي حوالي 450–900 مدرب حسب حجم النسخة
> الاحتياطية الفعلي، وحوالي 90 بس لو كل مدرب وصل للحد الأقصى 100 ميجا. السياسة لما تتملى مكتوبة في آخر الملف.
> الحدود بتتغير: **راجع الملف ده يوم الرفع.**

All numbers below were read from the official Cloudflare docs on **2026-11-16** (fetched pages, not memory).
"Not stated on the page" means the page I fetched does not give the number — it is not a guess.

## 1. Limits (Workers Free plan)

### Workers — <https://developers.cloudflare.com/workers/platform/limits/> and <https://developers.cloudflare.com/workers/platform/pricing/> (read 2026-11-16)

| Limit | Free plan | Notes |
| --- | --- | --- |
| Requests | **100,000 / day** | Resets at midnight UTC. Over the cap: **Error 1027**; per route you can choose fail-open (Worker bypassed) or fail-closed. |
| CPU time | **10 ms per invocation** | Same 10 ms for a Cron Trigger invocation. Wall-clock waiting on fetch/D1 does not count as CPU. |
| Subrequests | **50 per invocation** | D1 queries also count here (see D1). Every Web Push send is one subrequest. |
| Simultaneous outgoing connections | 6 per invocation | |
| Memory | 128 MB per isolate | Never buffer a 100 MB backup in memory: stream it. |
| Duration | No hard limit for HTTP; **15 min** for Cron Triggers | |
| Worker size | 64 MiB uncompressed (no compressed limit) | |
| Workers per account | 100 | |
| Env vars + secrets | 64 per Worker | |
| Cron Triggers | **5 per account** | We need 1. |
| Request body size | **100 MB** (depends on the *domain's* plan; Free domain = 100 MB) | Backup upload must stay under this per request → chunked upload. |
| Static assets | "Requests to static assets are free and unlimited." (pricing page) | |

### Cron Triggers — <https://developers.cloudflare.com/workers/configuration/cron-triggers/> (read 2026-11-16)

- Count per account: 5 (from the Workers limits page above). Minimum interval: **not stated on the page**; its most frequent
  example is every minute (`* * * * *`).
- Changes take up to **15 minutes** to propagate; scheduled runs can be missed during propagation.
- CPU per scheduled run: 10 ms on Free (Workers limits page).

### D1 — <https://developers.cloudflare.com/d1/platform/pricing/> and <https://developers.cloudflare.com/d1/platform/limits/> (read 2026-11-16)

| Limit | Free plan | Notes |
| --- | --- | --- |
| Rows read | **5 million / day** | Counts rows *scanned*, not rows returned → every query must hit an index. |
| Rows written | **100,000 / day** | Resets 00:00 UTC. Over the limit: queries return errors until reset. |
| Storage | **5 GB total per account** | |
| Max database size | **500 MB** | |
| Databases per account | 10 | |
| Queries per Worker invocation | **50** | Counts against the 50-subrequest budget. |

(The D1 *limits* page did not list rows/day; the D1 *pricing* page did.)

### R2 — <https://developers.cloudflare.com/r2/pricing/> and <https://developers.cloudflare.com/r2/platform/limits/> (read 2026-11-16)

| Limit | Free tier | Notes |
| --- | --- | --- |
| Storage | **10 GB-month / month** | Standard storage class only (not Infrequent Access). |
| Class A operations | **1 million / month** | Includes `PutObject`, `ListObjects`, multipart create/upload-part/complete. |
| Class B operations | **10 million / month** | Includes `GetObject`, `HeadObject`. |
| Delete | free | `DeleteObject`, `DeleteBucket`, `AbortMultipartUpload` are free operations. |
| Egress | free | |
| Max single-part upload | 5 GiB | Practical cap for us is the Worker 100 MB body limit. |
| Writes to the same key | 1 per second | |
| Buckets | default limit 100,000 | |

### Pages — <https://developers.cloudflare.com/pages/platform/limits/> (read 2026-11-16)

| Limit | Free plan |
| --- | --- |
| Builds | **500 / month**, 1 concurrent build |
| Files per site | **20,000** |
| Max single asset | **25 MiB** (the compressed 3D model must stay below this; target is < 10 MB anyway) |
| Projects | 100 per account |
| Custom domains | 100 per project |
| Pages Functions | count against the Workers request quota (no separate number on the page) |

20,000 files is enough for the app, but **not** if each exercise image becomes a separate file *and* we add
many sizes: 876 exercises × 2 images = 1,752 files at one size. Keep one size (or pack images into a few
bundles).

### Workers KV — <https://developers.cloudflare.com/kv/platform/limits/> (read 2026-11-16)

| Limit | Free plan |
| --- | --- |
| Reads | 100,000 / day |
| Writes | **1,000 / day** (different keys); 1 write/second to the same key |
| Storage | 1 GB |
| Value size | 25 MiB |
| Deletes / lists per day | not stated on the page |

**Decision: do not use KV.** 1,000 writes/day is far too small for rate-limit counters or push state. D1 covers
everything.

### Optional services (only if needed)

- **Queues** — <https://developers.cloudflare.com/queues/platform/pricing/> (read 2026-11-16): available on Free,
  **10,000 operations/day**, retention 24 h (not configurable). One message costs ~3 operations (write, read,
  delete), so batch pushes (e.g. 20 per message) if we ever use it.
- **Rate Limiting binding** — <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/> (read
  2026-11-16): period must be 10 or 60 s; counts are approximate and per Cloudflare location. **Free-plan
  availability is not stated on the page** → verify in Phase 3 before relying on it (fallback in SECURITY.md).

## 2. Budget for 500 trainers

### Assumptions (owner can change)

| Item | Typical | Heavy | Why |
| --- | --- | --- | --- |
| Clients per trainer | 20 | 40 | Private trainers in Egypt |
| Trainer → Worker requests / day | 15 | 40 | license status check on open (≤ 4), push-schedule sync (≤ 5), backup upload chunks (≤ 12 at 10 MB parts, at most once per 6 h), client-page publish (≤ 5) |
| Client page requests / day per trainer | 10 | 40 | 1 encrypted-blob fetch per view; app shell + exercise images are static on Pages (free, unlimited) |
| Weekly check-in requests / day per trainer | 3 | 8 | clients upload weight/photos |
| Notifications / trainer / day | 10 | 25 | session reminders + subscription-ending reminders |
| Cron | every 1 min = 1,440 runs / day | same | |

### Daily budget

| Resource | Limit | Typical (500) | Heavy (500) | Heavy % of limit |
| --- | --- | --- | --- | --- |
| Worker requests / day | 100,000 | 500 × (15+10+3) + 1,440 = **15,440** | 500 × (40+40+8) + 1,440 = **45,440** | 45% |
| Push sends / day (subrequests, spread over 1,440 cron runs) | 50 per run → 72,000 / day | 5,000 | 12,500 | 17% of capacity |
| D1 rows written / day | 100,000 | ≈ 500 × 25 = 12,500 | ≈ 500 × 60 = 30,000 | 30% |
| D1 rows read / day | 5,000,000 | ≈ 40,000 (indexed) | ≈ 150,000 (indexed) | 3% |
| D1 storage | 500 MB per DB | < 50 MB (licenses, devices, push subs, schedule rows; no client data) | < 100 MB | 20% |

D1 rows-read warning: a cron query that **scans** a 50,000-row notification table every minute = 72 million
rows/day → 14× over the limit. The due-notification query must use an index on `(slot_minute)` and delete or
mark sent rows. Write a test that runs `EXPLAIN QUERY PLAN` on it (Phase 9).

Heavy case is under half of every daily limit. The client page is the largest consumer of Worker requests; if
it grows, the next lever is browser caching of the encrypted blob (`Cache-Control` + versioned URL so a repeat
view makes no request at all).

### Monthly R2 operations

| Operation | Limit / month | Typical (500) | Heavy (500) |
| --- | --- | --- | --- |
| Class A (puts) | 1,000,000 | backup ≤ 4/day → mostly 1 PUT (small backups) ≈ 60,000; client-page publish 500×3×30 = 45,000; check-ins 500×20÷7×3 objects×30 ≈ 129,000 → **≈ 234,000 (23%)** | backups (12 parts + create + complete) × 1/day × 500 × 30 = 210,000; publish 500×10×30 = 150,000; check-ins 500×40÷7×3×30 ≈ 257,000 → **≈ 620,000 (62%)** |
| Class B (gets) | 10,000,000 | 500 × 10 × 30 = 150,000 (blob views) + restores ≈ **0.2 M (2%)** | 500 × 40 × 30 = 600,000 (**6%**) |

Heavy Class A at 62 % is the closest monthly number. Lever: pack each weekly check-in (numbers + photos) into
**one** encrypted object (1 PUT instead of 3) → heavy check-ins ≈ 86,000 and heavy total ≈ 446,000 (45 %).

Rules that keep this true: never call `ListObjects` (Class A) — keep the object index in D1; serve the 3D model
and exercise images from **Pages static assets**, not R2 (free and unlimited); overwrite backups in place.

### CPU 10 ms per invocation

Not measured yet — measured for real in Phase 3 (Ed25519 signing on activation) and Phase 9 (Web Push:
ECDH P-256 + HKDF + AES-GCM payload encryption + ES256 VAPID JWT per message). Design that does not depend on
the measurement: the cron run sends at most **N pushes per run** (start with N = 20, tune after measuring) and
reminders are booked into **minute slots with a per-slot capacity** when they are scheduled, so a peak
(everyone's session at 18:00) is spread over the minutes before it instead of piling into one run. Slot
capacity 20 × 1,440 runs = 28,800 pushes/day ≫ 12,500 heavy.

## 3. R2 storage — the tightest limit

10 GB total. Reserve **1 GB** for client-page blobs and check-in photos (encrypted). The 3D model and exercise
images live on Pages, not R2. Usable for cloud backups ≈ **9 GB**. One backup generation per trainer
(overwritten), capped at 100 MB.

| Average cloud backup size per trainer | Trainers that fit in 9 GB |
| --- | --- |
| 5 MB (data + thumbnails, few photos) | ~1,800 |
| 10 MB | ~900 |
| 20 MB | ~450 |
| 50 MB | ~180 |
| 100 MB (everyone at the cap) | ~90 |

Realistic size: the database itself (clients, sessions, programs, payments) is text — a few MB even for 200
clients. Photos dominate: a 1,200 px JPEG ≈ 150–250 KB, so 200 progress photos ≈ 40 MB. With **photos stored in
the cloud backup as ~400 px thumbnails (~30 KB)** the same 200 photos ≈ 6 MB → a typical backup of **≈ 10 MB**,
i.e. **~900 trainers fit**. Full-size photos always stay in the device backup file the trainer saves outside the app.

**So 500 trainers fit only if the average cloud backup stays ≤ ~18 MB.** The 100 MB per-trainer cap alone does
not guarantee it.

### Policy when R2 fills (proposed — owner decides)

1. The Worker keeps a running total of stored bytes in D1 (updated on each put/delete; no listing).
2. **Under 70 %:** normal — per-trainer cap 100 MB, cloud backup = data + photo thumbnails.
3. **70 % → 90 %:** new uploads get a lower cap (e.g. 30 MB). The app drops the oldest photo thumbnails from the
   *cloud* copy first (data is never dropped) and tells the trainer in plain Arabic that full photos are in the
   local backup file. The owner sees a warning on the admin dashboard.
4. **Over 90 %:** cloud backup = data only (no photos). Client-page photo uploads are refused politely.
5. Never delete a trainer's existing backup to make room. Revoked or moved-device licenses: delete their backup
   after 30 days (deletes are free).
6. If the business outgrows this, options are the owner's call: a second free Cloudflare account for new
   trainers, or paid R2 — both outside the zero-cost rule today.

### D1 writes and storage rules from the 2026-11-17 worker audit

- **D1 rows written is the tightest daily number once client pages are used.** Every durable rate-limit hit is
  one row write (plus check-in posts: 3 limiter rows + insert + usage). Measures taken: public client-page reads
  (`GET /api/share/:id`) and anonymous `/admin` page views are limited **in memory only** (0 D1 writes; before:
  2 per page view = up to 80/trainer/day heavy). `PUT /api/push/schedule` writes only the **difference** from
  the stored schedule (before: delete + re-insert up to 100 rows, plus index rows, on every calendar change).
- **Push backlog:** each cron run first deletes reminders more than 1 h late (one indexed `DELETE`, one extra
  subrequest), so a backlog never fills the 20-message batch with stale rows. Capacity stays 20/minute =
  28,800/day; if many trainers book the same minute, the app's slot spreading still matters.
- **Client pages per license:** pages + pending check-ins are capped at **200 MiB per license**
  (`pagesLicenseMaxBytes`); above it publishing answers `507 storage_full` and a client check-in answers
  `429 too_many_pending`. Without it one license could hold ~13 GB (200 pages × 5 MiB + 200 × 20 × 3 MiB) and
  push the whole bucket over the global guard for every trainer.
- Known, accepted: the global activation limit (300/h) and global login limit (30/h) can be exhausted on
  purpose by a few IPs (temporary lock-out, not a breach; the offline long code still activates). Revoked
  `shares` rows are kept forever so an id is never reused (tiny rows).

## 3b. On-device storage (not Cloudflare)

The app works fully without Cloudflare; the cloud copy is an optional extra. On the phone:

- **Quota.** Safari (iOS 17+) gives a home-screen web app a quota relative to free disk; older iOS used a smaller
  fixed-ish budget. A trainer seeing "2 GB" sees the browser's current grant, not the phone's disk. It grows with
  free space. Settings → التخزين shows `storage.estimate()` with photos vs data and "room for about N more clients".
- **Eviction.** Persisted storage (`navigator.storage.persist()`) is not evicted under pressure; the app asks at
  boot and from a button. Uninstalling the home-screen app deletes everything → the weekly device file matters.
- **Growth control.** Photos are downscaled when saved (1200 px, JPEG q 0.82; WebP is not used because Safari 16
  cannot encode it and silently falls back to PNG). Tools in Settings → التخزين: shrink old oversized photos,
  delete unreferenced photos, and «أرشفة الصور القديمة» (client/progress photos older than 3/6/12 months → device
  file, 320 px placeholders kept). Each destructive step needs a device file saved today and an explicit confirm.
- **Rough capacity.** ~3 MB per client with 12 progress photos → 1 GB ≈ 300 clients before archiving.

## 4. Re-verify

These numbers change. Re-read every URL above on release day and update this file and the budget if anything
moved. Items still unverified: Rate Limiting binding availability on Free; minimum cron interval (docs only show
every-minute examples); real CPU cost of signing and Web Push (Phases 3 and 9).
