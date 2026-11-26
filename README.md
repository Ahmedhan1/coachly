# PT Coach

Offline-first PWA for private personal trainers (Arabic, RTL, iPhone home screen). Project rules: `CLAUDE.md`.
Full spec (Arabic): `docs/SPEC.md`.

## Layout

```
src/                 the app
  app/               App root, services provider, app-wide hooks (live queries, catalog, device zone, stored images)
    pwa/             service worker updates, install prompt, boot splash, standalone detection
    shell/           tab shell, router, route tables, nav helpers
  features/          one folder per screen area (clients, schedule, programs, nutrition, pdf, settings…);
                     code two areas share moves down to app/, data/ or i18n/, not into another feature
  ui/                the only components and design tokens (Button, Sheet, Chip, Stepper, FileButton…)
  domain/            pure TypeScript logic (no React / DOM / Dexie), each area behind an index.ts
    meals/           calculator/, foods/, plan/, diet/, grams/ (+ cross-area tests at the root)
  data/              Dexie schema, migrations, repositories, seeds, key/value store (metaStore) and prefs/
  services/          calendar, files, 3D, PDF, backup, cloud — each behind an interface with a fake
  i18n/              ar/ and en/ (core.ts + one file per feature), localized names, fitness-terms.ts
shared/              code shared by app and worker (license, envelope, brand icon, headers)
worker/              Cloudflare Worker (activation, push, backup, client page, admin) with its own tests
deploy/app/          Worker that serves the installed app's files from D1
e2e/                 Playwright scenarios
public/              static files shipped with the app (exercise pack, food photos, fonts, 3D model)
assets-src/          raw sources, not shipped as-is
  exercises/         exercise dataset, Arabic/English names and cues, extras and fixes
  model3d/           Blender export scripts and the public model repo template
scripts/             build and check scripts (exercise pack, forbidden words)
tools/               offline owner tools (key generation, offline activation codes, promo video)
docs/                SPEC, PLAN, DESIGN, LIMITS, MANUAL_QA, deployment and feature notes
```

Layer boundaries are lint errors (`eslint.config.js`): `domain` imports nothing app-side; `ui` never imports
`app`/`features`/`data`/`services`; `data` and `services` never import screens; `i18n` only reads `domain` types.

## Commands

```bash
npm run check        # typecheck + lint + unit tests + forbidden words
npm run dev
npm run build
cd worker && npm test
```
