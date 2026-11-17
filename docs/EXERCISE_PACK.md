# Exercise pack

The built-in exercise library: 876 exercises from
[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db), each with default Arabic names and
the dataset photos, resized for the phone. Owner decision: the app **bundles these photos** and accepts the
licensing risk described in `LICENSES.md`; the trainer can replace any photo with their own.

## What is in `public/exercise-pack/`

| File | Content |
| --- | --- |
| `exercises.json` | Manifest (one exercise per line). Format = `ExercisePack` in `src/domain/exercises/pack.ts`. |
| `img/<id>-<n>.webp` | Photos, max 480 px on the long side, WebP quality 60. Usually 2 per exercise (start / end position). |

Each manifest entry has: `id` (dataset id, stable), `en`, `ar` (default Arabic name from
`data-src/exercise-names.ar.json` — machine transliteration, needs review by a trainer), `primary` /
`secondary` (app muscle-group ids), `equipment`, `level`, `category`, `force`, `mechanic`, `images` (file names
relative to `image.base`). The header also carries `image` settings and `imageBytes` (total size of all
photos, for the "download all" button).

**Not shipped:** the dataset's English `instructions` text (origin undocumented, see `LICENSES.md`). Phase 5
writes our own short Arabic cues.

Last build (2026-11-16): **876 exercises, 1746 / 1746 images, 0 missing** (3 exercises have no image in the
dataset at all), `exercises.json` 288 KB + images 21.1 MB = **21.4 MB** total. A sample photo goes from
850×567 JPEG, 61 KB to 480×320 WebP, 10 KB.

## Building it

```sh
node scripts/build-exercise-pack.mjs            # download (resumable) + encode + manifest
node scripts/build-exercise-pack.mjs --offline  # rebuild from the local cache only, no network
node scripts/build-exercise-pack.mjs --manifest-only  # rewrite exercises.json only (names, cues, English)
```

`--manifest-only` rebuilds `exercises.json` from the `data-src/` files and keeps the image list, image settings
and `imageBytes` of the existing manifest. It never downloads, encodes or deletes images, so image paths and
sizes stay exactly the same. Use it after editing names or cues.

English data (shown when the app language is English): `en` is the dataset name cleaned by
`cleanEnglishName()` (src/domain/exercises/pack.ts), overridden by `data-src/exercise-names.en.json`;
`cuesEn` comes from `data-src/exercise-cues.en.json` (same count as the Arabic cues). Flags: `--names-en`,
`--cues-en`.

Options: `--size 480 --quality 60 --format webp|jpeg --concurrency 8 --retries 3 --limit N --budget-mb 40`.

- **Download:** `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/<n>.jpg` into
  `data-src/free-exercise-db/images/` (git-ignored by `data-src/.gitignore`, ~101 MB). 8 requests in flight,
  3 retries with exponential backoff, HTTP 404 is not retried, files are written atomically (`.part` +
  rename), files already cached are skipped — re-running after an interruption resumes. A full download took
  about 70 s here.
- **Encode:** ImageMagick `convert` (6.9, libwebp 1.3.2) — `-auto-orient -strip -resize 480x480> -quality 60
  -define webp:method=6`. The script picks `magick`, then `convert`, then `ffmpeg` (libwebp), whichever
  actually lists the output format; it needs no npm dependency. If none is installed it stops with a clear
  error (use `--format jpeg` if only JPEG support exists). Outputs are re-encoded only when the source is newer
  or the size/quality/format changed; stale files in `img/` are deleted.
- **Report:** exercise count, images in pack / downloaded / encoded / missing, sizes; exit code 1 when over
  `--budget-mb` (default 40). Missing images are fine: the manifest lists only images that exist.
- Safari on iOS 16.4+ decodes WebP natively.

Tests: `npx vitest run src/domain/exercises scripts/build-exercise-pack.test.ts` (mapping, manifest, pool,
retry, and an offline end-to-end build with a tiny fixture JPEG). `npm run check:words` scans the generated
`exercises.json` (it is under `public/`).

**Git:** `public/exercise-pack/` is not ignored (≈1750 files, 21 MB) so the deploy can ship it without network.
If the repo should stay small, ignore `public/exercise-pack/img/` instead and run the script before every build.

## Loading strategy (for the app agent)

The pack must **not** be in the service-worker precache: 21 MB on first install is too slow on mobile data and
risks the install failing half-way.

1. **`exercises.json` is precached.** The current `vite.config.ts` glob (`**/*.{js,css,…,json,…}`) already
   includes it (288 KB raw, ~40 KB gzipped). Images are `.webp`, which the glob does not match — keep it that
   way, and add `globIgnores: ['exercise-pack/img/**']` as a guard in case someone adds `webp`/`jpg` later.
2. **Images on demand, stored in Cache Storage.** A Workbox runtime route for `/exercise-pack/img/` with
   `CacheFirst`, cache name e.g. `exercise-img-v1`, no expiration (the set is fixed and small per file). An
   exercise shown once is then available offline forever.
3. **"Download all for offline"** in settings: shows `imageBytes` from the manifest (≈21 MB) before starting;
   fetches every `images[]` URL with ~6 in flight, skips ones already in the cache (`caches.match`), shows
   progress as files done / total and MB done / total, can be cancelled and resumed, and calls
   `navigator.storage.persist()` first. Show the cached size afterwards (`navigator.storage.estimate()`).
4. **Graceful fallback:** when an image is missing (no network and not cached, 404, or the exercise has no
   image), show the 2D muscle map coloured with `muscleLoadForExercise()` instead — never a broken image.
5. **Trainer photos win:** `mergeCatalog()` turns an override with `imageIds` into `{ kind: 'stored' }` images
   (Blobs in the data layer); those never touch the network.
6. Bump the cache name when the pack is rebuilt with new settings (`image` header changes), and delete the
   old cache on activate.

Domain API: `src/domain/exercises` — `catalogFromPack(pack, 'exercise-pack/')` → `mergeCatalog(builtin,
{ custom, overrides })` → `filterExercises` / `searchExercises` / favourites helpers; `muscleLoad(day.items,
catalogById(catalog))` colours the 2D/3D map for a program day. Muscle-group ids (`MUSCLE_GROUP_IDS`) are the
shared ids for the 2D map regions and the 3D mesh groups; Arabic labels come from `MUSCLE_GROUPS`.

## Encrypting the pack with the activation `dataKey`?

The spec suggests the activation response returns a `dataKey` that decrypts the data pack (exercises + 3D
model). **Recommendation: do not encrypt the exercise pack.**

- The content is not secret: the dataset and its photos are public on GitHub; anyone can download them
  directly. Encryption would protect only our Arabic names (288 KB of text).
- It would not stop a buyer: the key sits on the activated phone, and the decrypted images end up in memory.
- It costs real complexity and failure modes: images could no longer be plain `<img src>` / Cache Storage
  responses (each would need fetch → AES-GCM decrypt → Blob URL, with URL lifetime management), the "download
  all" path gets harder, the PDF builder needs decrypted Blobs, and a lost or mismatched `dataKey` means an
  empty library offline — against the golden rule.
- The owner asked not to over-engineer protection. The real protection is the signed license that gates the app.

If protection is ever wanted, the cheap version is to encrypt **only** `exercises.json` (one AES-GCM
`crypto.subtle.decrypt` at startup, ~1 ms) and, if needed, the 3D model file — never the 1746 photos.
