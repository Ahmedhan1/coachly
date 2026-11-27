# Licenses

> **ملخص بالعربي:** كل المكتبات الحالية والمخططة رخصها مسموحة (MIT / Apache / ISC / BSD / OFL). ما فيش GPL
> ولا AGPL في الكود اللي بيتشحن للمدرب. **المخاطرة الوحيدة: صور التمارين بتاعة free-exercise-db.**
> صاحب الريبو نفسه كتب إنه "مش عارف الصور جاية منين ولا لو مجانية، والاستخدام على مسؤوليتك"، والمصدر
> الأصلي كاتب إن الصور "اتسحبت من الإنترنت" وبينصح ما تستخدمهاش تجارياً. **صاحب التطبيق قرر يوم 2026-11-16
> يشحن الصور ويتحمل المخاطرة دي** (تفاصيل تحت). ده مش رأي قانوني.

Checked on **2026-11-16**. Rule (CLAUDE.md): check before adding, pin exact versions, no GPL/AGPL in shipped
code, never copy code from wger.

How each row was verified:

- **installed** = read `node_modules/<pkg>/package.json` → `license` **and** the first line of the package's
  LICENSE file in this repo.
- **npm view** = `npm view <pkg> version license` run on 2026-11-16 (package not installed yet).
- **tarball** = `npm pack <pkg>@<version>` into a scratch folder and read its LICENSE file.
- **upstream** = raw file / page in the project's own repo, fetched on 2026-11-16.

Verdicts: **OK** · **OK (dev only)** = never shipped to the trainer's phone · **YELLOW** = allowed with a
condition or risk to manage · **RED** = do not ship.

## 1. Root app — current `package.json` (all installed and verified)

| Package | Version | License | Verified | Verdict |
| --- | --- | --- | --- | --- |
| dexie | 4.4.7 | Apache-2.0 | installed (LICENSE: Apache License) | OK — keep NOTICE/attribution in "About" |
| dexie-react-hooks | 4.4.0 | Apache-2.0 | installed | OK |
| react | 19.3.1 | MIT | installed | OK |
| Material Symbols Rounded (icon path data only, copied into `src/ui/icons/paths.ts`; not an npm dependency) | @material-symbols/svg-400@0.48.2 | Apache-2.0 (© Google) | tarball (LICENSE: "Apache License Version 2.0, January 2004"), 2026-11-19 | OK — keep attribution in "About" |
| react-dom | 19.3.1 | MIT | installed | OK |
| react-router-dom | 7.18.6 | MIT | installed (LICENSE.md) | OK |
| zod | 4.6.7 | MIT | installed | OK |
| zustand | 5.1.0 | MIT | installed | OK |
| @eslint/js | 10.0.1 | MIT | installed | OK (dev only) |
| @playwright/test | 1.63.0 | Apache-2.0 | installed | OK (dev only) |
| @testing-library/react | 16.3.3 | MIT | installed | OK (dev only) |
| @types/node | 26.6.6 | MIT | installed | OK (dev only) |
| @types/react | 19.3.0 | MIT | installed | OK (dev only) |
| @types/react-dom | 19.3.0 | MIT | installed | OK (dev only) |
| @vitejs/plugin-react | 6.3.0 | MIT | installed | OK (dev only) |
| eslint | 10.15.0 | MIT | installed | OK (dev only) |
| eslint-plugin-react-hooks | 7.1.1 | MIT | installed | OK (dev only) |
| fake-indexeddb | 6.2.8 | Apache-2.0 | installed | OK (dev only) |
| globals | 17.14.0 | MIT | installed | OK (dev only) |
| jsdom | 31.0.1 | MIT | installed (LICENSE.txt) | OK (dev only) |
| typescript | 6.0.3 | Apache-2.0 | installed (LICENSE.txt) | OK (dev only; the API typescript-eslint loads) |
| typescript-native (npm alias of typescript) | 7.0.2 | Apache-2.0 | npm view | OK (dev only; native compiler used by `typecheck`/`build`) |
| typescript-eslint | 8.73.0 | MIT | installed | OK (dev only) |
| vite | 8.3.8 | MIT | installed (LICENSE.md) | OK (dev only; its bundled-deps notice is in the file) |
| vite-plugin-pwa | 2.0.0 | MIT | installed | OK (dev only; Workbox runtime code it injects is MIT) |
| vitest | 5.1.1 | MIT | installed (LICENSE.md) | OK (dev only) |

### Transitive scan of root `node_modules` (2026-11-16)

Walked every installed `package.json`: MIT 421, Apache-2.0 28, ISC 17, BlueOak-1.0.0 13, BSD-2-Clause 11,
BSD-3-Clause 7, MPL-2.0 3, CC-BY-4.0 1, (MIT OR CC0-1.0) 1. **No GPL, AGPL, LGPL or missing license.**

| Package | License | Verdict |
| --- | --- | --- |
| lightningcss (+ platform binaries) 1.33.0 | MPL-2.0 | OK (dev only) — build tool, not shipped; MPL is file-level copyleft and we do not modify it |
| caniuse-lite | CC-BY-4.0 | OK (dev only) — browser data used at build time |
| glob, minimatch, lru-cache, minipass, … | BlueOak-1.0.0 | OK — permissive |
| type-fest 0.16.0 | MIT OR CC0-1.0 | OK |

The production dependency tree (`npm ls --omit=dev`) is only: dexie, dexie-react-hooks, react,
react-dom (+ scheduler), react-router-dom (+ react-router, cookie, set-cookie-parser), zod, zustand — all MIT /
Apache-2.0.

## 2. Worker — `worker/package.json` (installed by another agent; verified 2026-11-16)

| Package | Version | License | Verified | Verdict |
| --- | --- | --- | --- | --- |
| better-auth | 1.7.28 | MIT | installed 2026-11-26 (LICENSE: "The MIT License (MIT)") | OK — trainer accounts. Telemetry switched off in `worker/src/auth/auth.ts` |
| aws4fetch | 1.0.20 | MIT | installed | OK |
| @cloudflare/vitest-plugin | 1.8.5 | MIT | installed | OK (dev only) |
| @cloudflare/workers-types | 5.20261119.1 | MIT OR Apache-2.0 | installed | OK (dev only) |
| typescript | 7.0.2 | Apache-2.0 | installed | OK (dev only) |
| vitest | 5.1.1 | MIT | installed | OK (dev only) |
| wrangler | 4.165.0 | MIT OR Apache-2.0 | installed | OK (dev only) |

better-auth's production tree (added 2026-11-26, each read from `worker/node_modules/<pkg>/package.json` and its
LICENSE file): @better-auth/core, @better-auth/kysely-adapter (and the other unused adapters it ships),
@better-auth/utils, @better-auth/telemetry (not enabled), @better-fetch/fetch, better-call, kysely 0.29.9,
jose 6.2.18, defu, nanostores, rou3, zod 4.6.6, @standard-schema/spec — **all MIT**. Whole non-dev tree of
`worker/package-lock.json` on 2026-11-26: MIT 50, Apache-2.0 2, ISC 1, BSD-3-Clause 1, and lightningcss (MPL-2.0),
which is dev-only (vitest → vite). No GPL/AGPL. `@noble/ed25519` was removed from app and Worker with the
license system.

Transitive scan of `worker/node_modules`: MIT 49, Apache-2.0 7, MIT OR Apache-2.0 4, ISC 1, 0BSD 1, CC0-1.0 1,
and **2 LGPL packages**:

| Package | License | Verdict |
| --- | --- | --- |
| @img/sharp-libvips-linux-x64 1.3.4 | LGPL-3.0-or-later | **YELLOW, dev only** — pulled in by wrangler's local simulator (miniflare → sharp) for image handling during `wrangler dev`. Runs on the developer's machine, never bundled into the Worker or the app. Acceptable; do not import `sharp` in Worker or app code. |
| @img/sharp-wasm32 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | same as above |

## 3. Planned dependencies (checked with `npm view`, not installed yet)

| Package | Latest version seen | License | Verified | Verdict / notes |
| --- | --- | --- | --- | --- |
| three | 0.187.0 | MIT | npm view + tarball (LICENSE: "The MIT License, Copyright © 2010-2026 three.js authors") | OK |
| @types/three | 0.187.0 | MIT | npm view | OK (dev only) |
| @react-three/fiber | 9.8.2 | MIT | npm view | OK |
| @react-three/drei | 10.7.9 | MIT | npm view | OK — import only the helpers we use (tree-shaking); some drei helpers fetch remote assets (HDRI presets, fonts from CDNs) → do **not** use those (offline rule) |
| react-body-highlighter | 2.0.5 | MIT | npm view + tarball (LICENSE: "MIT License, Copyright (c) 2020 GV79") | **YELLOW (maintenance)** — last npm publish 2022-05-14, peer `react >=16`. React 19 compatibility untested (no `defaultProps` found in its dist, which is the usual React 19 break). If it breaks, vendor its SVG paths under MIT with attribution. |
| html-to-image | 1.11.13 | MIT | npm view + tarball (LICENSE: "Copyright (c) 2017-2025 W.Y.") | OK |
| jspdf | 4.2.1 | MIT | npm view + tarball | OK. Deps: @babel/runtime (MIT), fflate (MIT), fast-png (MIT). Optional deps installed by default: canvg (MIT), core-js (MIT), html2canvas (MIT), dompurify (**MPL-2.0 OR Apache-2.0** → we use it under Apache-2.0). |
| fflate | 0.8.3 | MIT | npm view | OK — zip for the backup file |
| hono | 4.13.19 | MIT | npm view | OK if the Worker wants a router |
| idb-keyval | 6.3.0 | Apache-2.0 | npm view | OK (only if needed; Dexie already covers it) |
| workbox-window | 7.4.1 | MIT | npm view | OK |
| @dnd-kit/core / @dnd-kit/sortable | 6.3.1 / 10.0.0 | MIT | npm view | OK — drag-and-drop in program builder |
| recharts | 3.10.1 | MIT | npm view | OK — progress charts (or hand-written SVG) |
| @cloudflare/vitest-pool-workers | 0.23.0 | MIT | npm view | OK (dev only) |

## 4. Fonts (SIL Open Font License 1.1)

| Font | License | Verified | Verdict |
| --- | --- | --- | --- |
| Cairo | OFL-1.1 | upstream `google/fonts/ofl/cairo/OFL.txt` ("Copyright 2009 The Cairo Project Authors") + `npm view @fontsource/cairo` → OFL-1.1; LICENSE in `@fontsource-variable/cairo@5.3.0` checked 2026-11-26, no Reserved Font Name | OK. **Bundled** (second PDF font the trainer can pick) |
| Rubik | OFL-1.1 | LICENSE in `@fontsource-variable/rubik@5.3.0` ("Copyright 2015 The Rubik Project Authors", no Reserved Font Name) + `npm view @fontsource/rubik` → OFL-1.1, checked 2026-11-26 | OK. **Bundled** (the app's only UI font, Pebble design) |
| Tajawal | OFL-1.1 | upstream `google/fonts/ofl/tajawal/OFL.txt` ("Copyright 2018 Boutros International") + npm view @fontsource/tajawal | OK |
| IBM Plex Sans Arabic | OFL-1.1 | upstream `google/fonts/ofl/ibmplexsansarabic/OFL.txt` ("Copyright © 2017 IBM Corp. with Reserved Font Name 'Plex'") + npm view | OK — Reserved Font Name: if we subset/modify the font file we must not call it "Plex" |
| Readex Pro | OFL-1.1 | upstream `google/fonts/ofl/readexpro/OFL.txt` (Reserved Font Name "RevReading Lexend") + npm view | OK. No longer bundled (removed 2026-11-26) |
| Alexandria | OFL-1.1 | upstream `google/fonts/ofl/alexandria/OFL.txt` fetched 2026-11-16 ("Copyright 2022 The Alexandria Project Authors", no Reserved Font Name) | OK. No longer bundled (removed 2026-11-26) |

**Bundled in the app (2026-11-26, replaces Alexandria + Readex Pro):** `public/fonts/rubik-{arabic,latin}.woff2` and
`public/fonts/cairo-{arabic,latin}.woff2` — the unmodified variable-weight woff2 subset files from
`@fontsource-variable/rubik@5.3.0` and `@fontsource-variable/cairo@5.3.0` (renamed only; the npm packages are not
dependencies). Rubik is declared in `src/ui/fonts.css` (`font-display: swap`, Arabic/Latin `unicode-range`); both
are embedded by the PDF renderer (`src/services/pdf/fonts.ts`); all are precached by the service worker. Rubik is also served to
clients by the Worker's client page (`worker/src/share/viewerFonts.ts`, generated from the same files), with the same licence. License texts
shipped next to them: `public/fonts/OFL-Rubik.txt`, `public/fonts/OFL-Cairo.txt` (the packages' LICENSE files).

OFL obligations: ship the OFL.txt next to the font files (e.g. `public/fonts/<font>/OFL.txt`), do not sell the
font on its own (embedding in an app is fine), subsetted/modified copies must not use a Reserved Font Name.

## 5. Data and 3D assets

### yuhonas/free-exercise-db — <https://github.com/yuhonas/free-exercise-db>

- **Repository license:** Unlicense (public domain dedication). Verified: README badge + `LICENSE.md` upstream
  ("This is free and unencumbered software released into the public domain."). The README does **not** give a
  separate license for the images.
- **Where the data came from:** the README says it restructures [wrkout/exercises.json](https://github.com/wrkout/exercises.json).
- **Issue #12** (<https://github.com/yuhonas/free-exercise-db/issues/12>, read 2026-11-16): "Enquiry regarding
  the license status of the images in your dataset", opened 2024-03-31 by a user planning a commercial fitness
  app. The maintainer replied (2024-04-14) only that it had "come up before" in **issue #2** and that he "still"
  needed to add it to the README. The asker thanked him and closed it. **Issue #12 itself gives no license for
  the images and no permission for commercial use.**
- **Issue #2** (<https://github.com/yuhonas/free-exercise-db/issues/2>, the one #12 points to): the maintainer
  wrote (2023-06-27) that he has **"no idea where the images are from or if they are royalty free so usage would
  be at your own risk"**. A 2025 comment adds "It seems that the images aren't royalty free sadly", linking to
  the upstream repo.
- **Upstream** wrkout/exercises.json `CONTRIBUTING.md` (read 2026-11-16), section "Exercise Images":
  *"Currently all exercises have two images, these have been scrapped off the internet, therefore l do not own
  the copy right for these images and would advise against using them in comercial projects."* Upstream issue
  #305 (same question) has a commenter pointing to that text; no one there grants a license.

| Part | Verdict | Reason |
| --- | --- | --- |
| Exercise **names, muscles, equipment, level, category** | **OK** | Unlicense; short factual labels. Our Arabic names are our own work. |
| Exercise **instructions** (English text) | **YELLOW** | Unlicense on the repo, but their origin is not documented and upstream admits the images were scraped, so the text may be too. Do not ship the English text verbatim; write our own short Arabic cues (Phase 5) — and keep the trainer able to edit them. |
| Exercise **images** (re-encoded to WebP in `public/exercise-pack/img/`) | **YELLOW — shipped by owner decision (2026-11-16), risk accepted** | Both maintainers say they do not own them / do not know their source; upstream advises against commercial use. The Unlicense cannot grant rights the author does not have. Residual risk: a copyright holder (likely the original fitness site) could send takedown notices to Cloudflare Pages / GitHub, and the owner, as seller, is the exposed party. |

**Owner decision (2026-11-16):** bundle the photos in the exercise pack (`public/exercise-pack/`, see
docs/EXERCISE_PACK.md) and **accept the licensing risk** described above. Mitigations kept in place: the photos
are not precached by the service worker (cached on first view only), every exercise image can be replaced by
the trainer's own photo in the app, and the pack can be rebuilt without photos if a takedown notice arrives.
The earlier recommendation (ship without these photos, or commission a royalty-free set) remains the
lower-risk alternative.

### Z-Anatomy — <https://github.com/Z-Anatomy/Models-of-human-anatomy>

- License: **CC BY-SA 4.0** — README: "All the code and content shared by 'Z-Anatomy' is under Creative Commons
  Attribution-ShareAlike 4.0 International License" (read 2026-11-16).
- The README asks that derived content be attributed as:
  - "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan"
  - "Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0"
  - Definitions: "Wikipedia - CC-BY-SA 3.0" (only if we use their text definitions — we do not plan to).
- **Some models inside Z-Anatomy are NOT commercial-friendly**: the README lists e.g. "Anatomy of the Inner Ear
  … CC-BY-NC-SA 4.0" and "Kidney … CC-BY-NC 4.0". **The Blender script must keep only the superficial skeletal
  muscle meshes** and the build must fail if any NC-licensed object name is present (Phase 6 check).

Obligations (verdict **YELLOW = OK with obligations**):

1. **Attribution** in the app's "About" screen and in the public model repo: title, authors (Z-Anatomy,
   BodyParts3D / DBCLS), license name + link, and a note that the model was modified (muscle grouping,
   decimation, GLB export).
2. **Share-alike on the modified model file:** publish the exported GLB (and the Blender script that made it)
   in a **public** GitHub repo under CC BY-SA 4.0. No extra restrictions on that file (no DRM on the *published*
   copy). The prevailing reading is that ShareAlike covers the model, not the app code that displays it; this is
   not legal advice.
3. The app may ship the same GLB encrypted inside its data bundle, as long as the identical file is publicly
   available under CC BY-SA from the public repo.

### Other assets mentioned in the spec

| Asset | License | Verdict |
| --- | --- | --- |
| AnatomyTool Open 3D Model (<https://anatomytool.org/node/63903>) | CC BY-SA (per spec; page not re-read today) | YELLOW — re-verify if we use it as the fallback |
| wger (<https://github.com/wger-project/wger>) | AGPL-3.0 | **RED** — ideas only, never copy code |
| hasaneyldrm/exercises-dataset | images marked © Gym visual | **RED** — do not use |
| Recipes / food table | our own content (values: USDA FoodData Central / FAO-INFOODS family, approximated) | OK |
| Twemoji SVG illustrations in `public/food/` (npm `@twemoji/svg` 15.0.0, copied, not a dependency) | Graphics CC-BY 4.0 (code MIT); attribution in app About screen and `public/food/ATTRIBUTION.txt` | GREEN with attribution |
| Food photos in `public/food-img/photos/` (Wikimedia Commons, 320×240 WebP, cropped/resized) | CC0 / public domain / CC BY / CC BY-SA, per file; author, title, license and link for every file in **docs/FOOD_PHOTOS.md** (+ `public/food-img/photos/ATTRIBUTION.txt`); app credit line "صور الأكل: Wikimedia Commons" on the recipe book screen | GREEN with attribution (BY-SA covers the adapted photos only) |

## 6. To re-verify at phase end

Other agents are adding dependencies in `worker/` and the root **right now**. At the end of every phase:

1. Run the transitive scan again (script to add to `scripts/` in Phase 2: walk `node_modules` and
   `worker/node_modules`, fail on GPL/AGPL/unknown; LGPL allowed only for dev-only packages listed above).
2. Add a row here for every new direct dependency (version pinned, license read from the installed
   package.json **and** LICENSE file).
3. Re-check: `react-body-highlighter` with React 19 (Phase 5), drei helpers that fetch remote assets (Phase 6),
   Z-Anatomy NC objects excluded (Phase 6), font OFL.txt files shipped (done in Phase 2b), Rate Limiting binding plan
   availability (Phase 3, see docs/LIMITS.md).

## Nutrition data, wave 4 (cookbook + English names)

- `src/data/seeds/ingredients.ar.json` (v4) and `recipes.ar.json` (v3): 4 new foods, 104 new original recipes
  (214 in total), English names for every food and recipe and short English steps. Values per 100 g are rounded
  approximations entered by us from general knowledge of USDA FoodData Central (public domain) and the
  Egyptian/Middle-East food composition tables (nothing copied wholesale). No new dependencies, no new images
  (new foods reuse the bundled Twemoji illustrations, CC BY 4.0).

### Exercise pack — wave 5 additions (2026-11-18)

- **108 new built-in exercises** (`assets-src/exercises/exercise-extras.json`, ids `pt_*`): names, muscles, Arabic and English
  cues are our own work. They ship with **no new photos** — no new image source was added. Without a photo the app
  shows our own muscle picture (rendered from our 3D model), labelled «العضلات المستهدفة».
- **17 existing extras now reuse free-exercise-db photos** (`imagesFrom`) of the same movement, after a visual check;
  same source and same YELLOW status as the rest of the pack photos above — no new files, no new risk.
- **free-exercise-db upstream checked again (2026-11-18):** `dist/exercises.json` still has 876 exercises, the same
  ids as our copy; its 3 entries without photos (Kettlebell Halo ×2, Kettlebell Overhead Triceps Extension) still
  have none upstream.
- Not used: wger images (the project rule says never copy from wger).

### Everkinetic drawings — <https://github.com/everkinetic/data> (CC BY-SA 4.0)

- **License:** Creative Commons Attribution-ShareAlike 4.0 (repo `LICENSE.md`, read 2026-11-18). "Open data project
  based on everkinetic.com created by Greg Priday." Owner decision (wave 5): photos with attribution are fine.
- **Used (8 files, 4 exercises), each checked by eye on a contact sheet:** converted with
  `scripts/everkinetic-to-pack.py` (trimmed, centred on a white 480×320 canvas, WebP q70, 6–10 KB each). Our
  conversion is an adaptation; it stays under CC BY-SA 4.0 (share-alike applies to these image files only).

| Pack files | Everkinetic source | Exercise |
| --- | --- | --- |
| `pt_Barbell_Reverse_Lunge-0/1.webp` | `dist/png/0128-relaxation/tension.png` "Lunges: Barbell (Rear)" | Barbell Reverse Lunge |
| `pt_Band_Biceps_Curl-0/1.webp` | `dist/png/0261-relaxation/tension.png` "Quick Alternating Biceps Curls with Band" | Band Biceps Curl |
| `pt_Glute_Bridge_Hold-0/1.webp` | `dist/png/0109-relaxation/tension.png` "Bridging" | Glute Bridge Hold |
| `pt_Lying_Leg_Raise-0/1.webp` | `dist/png/0021-relaxation/tension.png` "Flat Bench Leg Raises" (drawn on the floor) | Lying Leg Raise |

- **Credit shown in the app:** the exercise detail shows «صورة: Everkinetic, CC BY-SA 4.0» under these images
  (`imageCredit` in the pack). The PDF does not print the credit yet (see docs/EXERCISE_PACK.md).
- **Why only 4:** Everkinetic's 289 exercises are almost all the same classic gym moves free-exercise-db already has
  with photos; the other candidates for our photo-less exercises were cropped badly (walking lunge, Smith hack squat,
  band squat) or showed a different variant (straight bar vs EZ bar, pullover along the bench vs across it).
- Wave 5 food data: `ingredients.ar.json` v5 (13 new foods, 315 in total) and `recipes.ar.json` v4 (128 new original
  recipes, 342 in total, each with prep time and cuisine). Food photos: Wikimedia Commons only, each checked by eye,
  listed with author / license / source in `docs/FOOD_PHOTOS.md`; files cached at run time (not precached).

## App logo (Coachly mark)

The app icon, launch image, sign-in / install mark and admin mark use the logo of **UI Skills**
(`public/uiskills-logo-light.webp`, `public/uiskills-logo-dark.webp` from https://github.com/ibelick/ui-skills),
redrawn at larger sizes in `public/icons/*.png` and `public/brand/coachly-mark.png`.

```text
MIT License

Copyright (c) 2026 Julien Thibeaut

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Note: the MIT license covers copyright only; it grants no trademark rights to the UI Skills name or mark.
