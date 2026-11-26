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
`assets-src/exercises/exercise-names.ar.json` — machine transliteration, needs review by a trainer), `primary` /
`secondary` (app muscle-group ids), `equipment`, `level`, `category`, `force`, `mechanic`, `images` (file names
relative to `image.base`). The header also carries `image` settings and `imageBytes` (total size of all
photos, for the "download all" button).

**Not shipped:** the dataset's English `instructions` text (origin undocumented, see `LICENSES.md`). Phase 5
writes our own short Arabic cues.

Last build (2026-11-16): **876 exercises, 1746 / 1746 images, 0 missing** (3 exercises have no image in the
dataset at all), `exercises.json` 288 KB + images 21.1 MB = **21.4 MB** total.

Wave 5 (2026-11-18, `--manifest-only`, no image changes): **1082 exercises** (876 dataset + 206 built-in extras),
894 with photos (17 extras reuse dataset photos via `imagesFrom`, 4 use Everkinetic drawings), 188 shown with the labelled muscle picture,
`exercises.json` 524 KB. Every exercise carries `jointStress` and `homeFriendly`. A sample photo goes from
850×567 JPEG, 61 KB to 480×320 WebP, 10 KB.

## Visual audit and hand fixes (`assets-src/exercises/exercise-fixes.json`)

All 873 photo exercises were checked on contact sheets (40 per sheet, both photos, id + muscles + equipment) plus an
automatic pass (corrupt / blank / tiny / over 40 KB / byte-identical photos across exercises). Result: no corrupt,
blank or oversized file; one small subject (Heavy Bag Thrust, 275 px, kept). Byte-identical photos are mostly a
shared start position of stretches (fine); where a photo showed a *different* exercise or no person it is dropped.
`exercise-fixes.json` maps an id to `{ keepImages?, primary?, secondary?, equipment?, jointStress?, homeFriendly?,
reason }`; `keepImages` are 0-based photo indexes. Current fixes: 5 photo fixes (Quad Stretch, Intermediate Hip
Flexor and Quad Stretch, Lower Back SMR, Bicycling, Skating), 18 muscle fixes (e.g. Cable Hip Adduction → adductors,
bench-press variants → chest, Box Jump → quads, Reverse Hyperextension → glutes), 2 equipment fixes (→ bands).
`--manifest-only` rebuilds the image list from the files on disk, so removing a fix brings the photo back.

Extras with dataset photos (`imagesFrom`, same movement): Bicycle Crunch ← Air Bike, Toes to Bar ← Hanging Pike,
V-Up ← Jackknife Sit-Up, Medicine Ball Slam ← Overhead Slam, Chest-Supported Machine Row ← Leverage Iso Row, Spin
Bike ← Stationary Bike, Incline Treadmill Walk ← Walking Treadmill, Treadmill Sprint ← Running Treadmill, Skater
Jump ← Lateral Bound, Standing Cable Glute Kickback ← One-Legged Cable Kickback, Single-Arm Cable Lateral Raise ←
Standing Low-Pulley Deltoid Raise, Cable Bar Curl ← Standing Biceps Cable Curl, Foam Roll Glutes ← Piriformis SMR,
Foam Roll Upper Back ← Rhomboids SMR, Band Shoulder Dislocate ← Round the World Shoulder Stretch (stick),
Dumbbell Bulgarian Split Squat ← Split Squat with Dumbbells (rear foot elevated), Cable Pullover ← Straight-Arm
Pulldown. The upstream dataset has nothing else that matches the remaining extras.

## Everkinetic drawings and the photo credit

Extras can carry their own image files: `ownImages: ["pt_X-0.webp", "pt_X-1.webp"]` plus `imageCredit` in
`assets-src/exercises/exercise-extras.json` (the build keeps these files in `img/` and lists them; `ownImages` wins over
`imagesFrom`). Four extras use Everkinetic drawings (CC BY-SA 4.0, list and sources in `LICENSES.md`): Barbell Reverse
Lunge, Band Biceps Curl, Glute Bridge Hold, Lying Leg Raise. Made with `python3 -I scripts/everkinetic-to-pack.py
<everkinetic clone> public/exercise-pack/img 0128=pt_Barbell_Reverse_Lunge …` (480×320 white canvas, WebP, 6–10 KB).
`imageCredit` reaches `CatalogExercise.imageCredit`; the detail screen shows «صورة: {credit}» under the photos, and it
is dropped when the trainer replaces the photos with their own. Open item: the PDF exercise table does not print it.

## Suspension (TRX)

Equipment id `suspension` (labels «TRX» / "Suspension (TRX)", dictionary key `suspension`). The 9 `pt_TRX_*` extras
and the dataset's Suspended Fallout / Push-Up / Reverse Crunch / Row / Split Squat and Inverted Row with Straps (via
`exercise-fixes.json`) use it; all are `homeFriendly` (a door anchor). Client tailoring offers it as home equipment.

## Joint stress and home-friendly (`jointStress`, `homeFriendly`)

Every pack entry has `jointStress: { knee, shoulder, lowerBack }` (`'low' | 'medium' | 'high'`) and
`homeFriendly: boolean`, for tailoring programs to a client's injuries and to training at home. Built by
`deriveJointStress` / `deriveHomeFriendly` in `src/domain/exercises/jointStress.ts`; hand-set values (in
`exercise-extras.json` per extra, `exercise-fixes.json` per dataset id) win per joint. Catalog exercises from an
older pack and custom exercises get the rule values at runtime. The rules (conservative — unsure means medium):

- **Every stretch** is low on all three joints (except shoulder for named high-risk positions).
- **Knee:** high for plyometrics on the legs, jumps/hops/bounds/sprints, olympic and strongman lifts, deep or shear-heavy
  bends (pistol, sissy, front/full/overhead/hack squat, Jefferson, Nordic) and any barbell squat/lunge/split/step-up
  (box squat = medium); low for carries, sleds and drags, hinges, leg curls, bridges, hip thrusts, calves, abduction,
  bikes, elliptical, walking; medium for other squats, lunges, leg press, leg extension, step-ups, running, rope,
  quad-led compounds; low otherwise.
- **Shoulder:** high for overhead barbell/kettlebell pressing (military, push press, Arnold), behind-the-neck, dips,
  upright rows, snatch/jerk, overhead squat, handstand, kipping, muscle-up, guillotine press, iron cross, Turkish
  get-up; low for rotator-cuff and scapular work, rows on a cable/machine, shrugs, carries, curls and forearm work;
  medium for presses, push-ups, flies, raises, pull-ups/pulldowns, pullovers, triceps extensions, hanging core,
  throws, swings, planks and crawls; low otherwise.
- **Lower back:** high for barbell deadlifts, good mornings, unsupported barbell rows, strongman and olympic lifts,
  barbell squats/lunges/standing presses (medium when the same hinge uses a machine, dumbbell, kettlebell, band, cable
  or one leg; carries and sleds medium); low for machines, seated/lying/supported moves, core stability (bird dog, dead
  bug, plank, McGill, Pallof), bridges, pulldowns, bikes; medium for swings, free-standing rows, sit-ups and leg
  raises, back extensions, overhead presses, thrusters, running and jumps, and loaded squats/lunges.
- **homeFriendly:** equipment is body weight, bands, dumbbell, kettlebell, a ball or a foam roller (or "other" for a
  stretch, TRX, towel or wall) and the name needs no station (machine, cable, Smith, bench press, incline/decline,
  bar, pull-up/dip station, treadmill, sled, …).

Hand review: 105 of the 108 wave-5 extras carry hand-set joint values (rehab moves are low on all three; the other 3 are barbell moves where the rules are right); the rule output
for the whole library was reviewed on samples and the rules corrected where wrong. `fitsJointLimits(stress, limits)`
and `maxJointStress()` are the helpers for the client-tailoring code. Tests: `src/domain/exercises/jointStress.test.ts`,
`scripts/exercise-pack-data.test.ts` (shipped pack: no duplicate ids/names, ar + en names, every photo on disk and
≤ 40 KB, joint data on every exercise).

## Building it

```sh
node scripts/build-exercise-pack.mjs            # download (resumable) + encode + manifest
node scripts/build-exercise-pack.mjs --offline  # rebuild from the local cache only, no network
node scripts/build-exercise-pack.mjs --manifest-only  # rewrite exercises.json only (names, cues, English)
```

`--manifest-only` rebuilds `exercises.json` from the `assets-src/exercises/` files and keeps the image list, image settings
and `imageBytes` of the existing manifest. It never downloads, encodes or deletes images, so image paths and
sizes stay exactly the same. Use it after editing names or cues.

English data (shown when the app language is English): `en` is the dataset name cleaned by
`cleanEnglishName()` (src/domain/exercises/pack.ts), overridden by `assets-src/exercises/exercise-names.en.json`;
`cuesEn` comes from `assets-src/exercises/exercise-cues.en.json` (same count as the Arabic cues). Flags: `--names-en`,
`--cues-en`.

Options: `--size 480 --quality 60 --format webp|jpeg --concurrency 8 --retries 3 --limit N --budget-mb 40`.

- **Download:** `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/<n>.jpg` into
  `assets-src/exercises/free-exercise-db/images/` (git-ignored by `assets-src/exercises/.gitignore`, ~101 MB). 8 requests in flight,
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

> 2026-11-26: activation and `dataKey` no longer exist (accounts replaced licenses). The pack stays unencrypted.

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
