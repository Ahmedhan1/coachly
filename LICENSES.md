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
| @anthropic-ai/sdk | 1.4.0 | Apache-2.0 | installed (LICENSE: Apache License 2.0) | OK — optional AI assistant, loaded only when used |
| @noble/ed25519 | 3.2.0 | MIT | installed (LICENSE: "The MIT License (MIT)") | OK |
| dexie | 4.4.7 | Apache-2.0 | installed (LICENSE: Apache License) | OK — keep NOTICE/attribution in "About" |
| dexie-react-hooks | 4.4.0 | Apache-2.0 | installed | OK |
| react | 19.3.1 | MIT | installed | OK |
| react-dom | 19.3.1 | MIT | installed | OK |
| react-router-dom | 7.18.5 | MIT | installed (LICENSE.md) | OK |
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
| typescript | 6.0.3 | Apache-2.0 | installed (LICENSE.txt) | OK (dev only) |
| typescript-eslint | 8.72.2 | MIT | installed | OK (dev only) |
| vite | 8.3.8 | MIT | installed (LICENSE.md) | OK (dev only; its bundled-deps notice is in the file) |
| vite-plugin-pwa | 2.0.0 | MIT | installed | OK (dev only; Workbox runtime code it injects is MIT) |
| vitest | 5.1.0 | MIT | installed (LICENSE.md) | OK (dev only) |

### Transitive scan of root `node_modules` (2026-11-16)

Walked every installed `package.json`: MIT 421, Apache-2.0 28, ISC 17, BlueOak-1.0.0 13, BSD-2-Clause 11,
BSD-3-Clause 7, MPL-2.0 3, CC-BY-4.0 1, (MIT OR CC0-1.0) 1. **No GPL, AGPL, LGPL or missing license.**

| Package | License | Verdict |
| --- | --- | --- |
| lightningcss (+ platform binaries) 1.33.0 | MPL-2.0 | OK (dev only) — build tool, not shipped; MPL is file-level copyleft and we do not modify it |
| caniuse-lite | CC-BY-4.0 | OK (dev only) — browser data used at build time |
| glob, minimatch, lru-cache, minipass, … | BlueOak-1.0.0 | OK — permissive |
| type-fest 0.16.0 | MIT OR CC0-1.0 | OK |

The production dependency tree (`npm ls --omit=dev`) is only: @noble/ed25519, dexie, dexie-react-hooks, react,
react-dom (+ scheduler), react-router-dom (+ react-router, cookie, set-cookie-parser), zod, zustand — all MIT /
Apache-2.0.

## 2. Worker — `worker/package.json` (installed by another agent; verified 2026-11-16)

| Package | Version | License | Verified | Verdict |
| --- | --- | --- | --- | --- |
| @noble/ed25519 | 3.2.0 | MIT | installed | OK |
| @cloudflare/vitest-plugin | 1.8.3 | MIT | installed | OK (dev only) |
| @cloudflare/workers-types | 5.20261116.1 | MIT OR Apache-2.0 | installed | OK (dev only) |
| typescript | 6.0.3 | Apache-2.0 | installed | OK (dev only) |
| vitest | 5.1.0 | MIT | installed | OK (dev only) |
| wrangler | 4.163.0 | MIT OR Apache-2.0 | installed | OK (dev only) |

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
| Cairo | OFL-1.1 | upstream `google/fonts/ofl/cairo/OFL.txt` ("Copyright 2009 The Cairo Project Authors") + `npm view @fontsource/cairo` → OFL-1.1 | OK |
| Tajawal | OFL-1.1 | upstream `google/fonts/ofl/tajawal/OFL.txt` ("Copyright 2018 Boutros International") + npm view @fontsource/tajawal | OK |
| IBM Plex Sans Arabic | OFL-1.1 | upstream `google/fonts/ofl/ibmplexsansarabic/OFL.txt` ("Copyright © 2017 IBM Corp. with Reserved Font Name 'Plex'") + npm view | OK — Reserved Font Name: if we subset/modify the font file we must not call it "Plex" |
| Readex Pro | OFL-1.1 | upstream `google/fonts/ofl/readexpro/OFL.txt` (Reserved Font Name "RevReading Lexend") + npm view | OK — same reserved-name note. **Bundled** (UI font, direction B) |
| Alexandria | OFL-1.1 | upstream `google/fonts/ofl/alexandria/OFL.txt` fetched 2026-11-16 ("Copyright 2022 The Alexandria Project Authors", no Reserved Font Name) | OK. **Bundled** (display + numbers, direction B) |

**Bundled in the app (Phase 2b, 2026-11-16):** `public/fonts/alexandria-{arabic,latin}.woff2` and
`public/fonts/readex-pro-{arabic,latin}.woff2` — unmodified Google Fonts woff2 subset files (copied from
`design/fonts/`, renamed only), declared in `src/ui/fonts.css` with `font-display: swap` and Arabic/Latin
`unicode-range`, precached by the service worker. License texts shipped next to them:
`public/fonts/OFL-Alexandria.txt`, `public/fonts/OFL-ReadexPro.txt` (official upstream files).

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
| Recipes / food table | our own content | OK |

## 6. To re-verify at phase end

Other agents are adding dependencies in `worker/` and the root **right now**. At the end of every phase:

1. Run the transitive scan again (script to add to `scripts/` in Phase 2: walk `node_modules` and
   `worker/node_modules`, fail on GPL/AGPL/unknown; LGPL allowed only for dev-only packages listed above).
2. Add a row here for every new direct dependency (version pinned, license read from the installed
   package.json **and** LICENSE file).
3. Re-check: `react-body-highlighter` with React 19 (Phase 5), drei helpers that fetch remote assets (Phase 6),
   Z-Anatomy NC objects excluded (Phase 6), font OFL.txt files shipped (done in Phase 2b), Rate Limiting binding plan
   availability (Phase 3, see LIMITS.md).
