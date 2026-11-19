# DESIGN.md — PT Coach visual system

> **Status: OWNER CHOSE DIRECTION B «الحديد» (Iron) on 2026-11-16.** The app adopts `design/direction-b/tokens.css`; direction A is kept for reference only. Two directions are proposed: **A «الدفتر» (The Ledger)** and
> **B «الحديد» (Iron)**. The owner picks one from `design/compare.html` / `design/screenshots/compare.png`.
> Until then, Phase 2 builds components against the shared token *names* below; the chosen direction's
> `design/direction-*/tokens.css` becomes `src/ui/tokens.css`. Nothing else should need to change.

Files:

| Path | What |
| --- | --- |
| `design/direction-a/`, `design/direction-b/` | `tokens.css` (swappable), `ui.css` (component reference), 3 static screens |
| `design/fonts/` | Locally bundled woff2 (Arabic + Latin subsets, OFL-1.1) + `fonts.css` |
| `design/icons.svg` | Hand-drawn stroke icon sprite + exercise pictograms (photo-slot stand-ins) |
| `design/build.mjs` | Injects the sprite, generated front/back muscle maps and the mock status bar into each screen |
| `design/brand-derive.mjs` | Reference algorithm: one brand hex → all brand tokens (port to `src/domain` with tests) |
| `design/capture.mjs` | Playwright screenshots (SE 375×667, Pro Max 430×932, light/dark, @2x) |

Regenerate: `node design/build.mjs && node design/capture.mjs`.

---

## 1. Shared principles (both directions)

1. **One brand color, everything else neutral.** The trainer picks one color; the app derives every
   brand token from it (§2). No second accent, no gradients between hues.
2. **Arabic first, RTL always.** `dir="rtl"`, CSS logical properties only (`inset-inline-start`,
   `margin-inline-end`, `padding-inline`). Icons with direction (chevrons, back, send) are drawn for RTL:
   "forward" chevron points left, "back" points right.
3. **Western digits, isolated.** Digits 0-9. Every number sits in `.num`:
   `font-variant-numeric: tabular-nums; unicode-bidi: isolate; direction: ltr;` so `8–10`, `3110`,
   `2,400`, `5:00` keep their order inside Arabic text. Units/currency stay *outside* the isolate
   (`<span class="num">2,400</span> ج.م`) so they fall on the correct side.
4. **Fitness terms transliterated**: جلوتس، كوادز، هامسترينج، بنش برس، ديدليفت، هيب ثرست، سوبر سيت، تمبو، RPE.
5. **iOS-familiar**: bottom tab bar, pushed screens with a back affordance on the right, bottom sheets
   with grabber, leading/trailing swipe actions, toasts with Undo. Every hit target ≥ 44×44pt
   (small buttons extend their hit area with a transparent `::after`).
6. **Thumb zone first.** The primary action of every screen lives at the bottom: Home has quick-add at
   the bottom; pushed screens (client, program builder) hide the tab bar and show a bottom action bar.
7. **Safe areas.** Real app: `padding-top: env(safe-area-inset-top)`, bottom bars add
   `env(safe-area-inset-bottom)`. Mockups simulate 59/34px (Pro Max) and 20/0px (SE).
8. **Photos and the body are the imagery.** No decorative illustration. Exercise photo slots and the
   muscle map (2D now, 3D model later) are the only pictures.
9. **Numbers must mean something.** Big numerals only for the next session time, remaining sessions,
   body weight. No dashboards of identical stat cards.
10. **Copy is plain Egyptian Arabic, short, actionable** ("فكّرها"، "جدّد"، "ابعت البرنامج"). No slogans.

**Hard bans:** purple/blue gradients · glassmorphism/blurred cards · emoji as icons · grids of identical
stat cards · large blurry shadows, radii > 22px on surfaces · motion on every element · empty marketing
copy · one font for everything · translated fitness terms · Eastern-Arabic digits.

---

## 2. Brand color derivation (identical for both directions)

The trainer picks **one** hex. `brand-derive.mjs` (pure, to be ported to `src/domain/brand.ts`) computes:

| Token | Light | Dark |
| --- | --- | --- |
| `--brand` | the picked color (fills: primary button, selected tab/day, "next" marker) | same; lifted toward white until ≥ 3:1 on `--bg` if it disappears |
| `--brand-on` | text/icons on a brand fill: `#FFFFFF` or near-black `#111111`, whichever has higher contrast | same rule on the dark fill |
| `--brand-ink` | brand used *as text* (links, active tab label): mixed toward black until ≥ 4.5:1 on `--bg` | mixed toward white until ≥ 5.5:1 on `--bg` |
| `--brand-tint` | 10% brand over `--bg` (selected rows, brand chips background) | 16% over dark `--bg` |
| `--brand-tint-strong` | 20% (focus rings, halo of the next-session dot) | 28% |
| `--muscle-hit` / `--muscle-hit-2` | primary / secondary target muscles: brand, and `color-mix(in oklab, brand 45%, --muscle-off)` | `--muscle-hit` uses `--brand-ink` in A for visibility |

Proven in the mockups with a second color per direction (`#alt` on any screen URL):
A default pine `#1F6B53` → alt terracotta `#B4532A`; B default signal orange `#F25C1F` (on-color
resolves to **dark** text) → alt crimson `#C81E3A` (on-color flips to **white**).

Semantic colors (`--ok`, `--warn`, `--danger` + `-tint`) are fixed per direction and never derived from
the brand, so a red brand can't be confused with "late payment".

**Contrast audit (all 8 theme × brand combinations):** text, text-2, text-3, brand-ink, semantic-on-tint,
brand-on-brand all ≥ 4.5:1 (checked with the same contrast function as `brand-derive.mjs`). The app must
re-run the check whenever the trainer changes the color and show a warning if a pair fails.

---

## 3. Shared token names

Both `tokens.css` files define exactly these custom properties (values differ):

```
Type     --font-ui --font-display --font-num
         --t-display --t-title --t-headline --t-body --t-callout --t-sub --t-caption --t-label --t-num --t-num-lg
Space    --sp-1..--sp-8 (4 8 12 16 20 24 32 40) --gutter
Shape    --r-xs --r-sm --r-md --r-lg --r-sheet --r-full --hairline --icon-stroke
Sizes    --tap --row-h --tabbar-h --field-h
Motion   --dur-1 --dur-2 --dur-3 --ease-out --ease-sheet
Neutral  --bg --surface --surface-2 --line --line-strong --text --text-2 --text-3 --scrim
Media    --photo --photo-ink --muscle-base --muscle-off --muscle-hit --muscle-hit-2
Brand    --brand --brand-on --brand-ink --brand-tint --brand-tint-strong
Semantic --ok --ok-tint --warn --warn-tint --danger --danger-tint
Elevation --shadow-sheet --shadow-raise
```

Dark mode: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` plus a manual
`data-theme` override in settings. Trainer's brand is written at runtime as inline custom properties on
`:root` (both modes), computed by the derive function.

---

## 4. Direction A — «الدفتر» The Ledger

**Rationale (عربي):** زي دفتر المدرب الشخصي بس متنظّم: خلفية لون الورق، خطوط رفيعة بتفصل بدل الكروت،
وعناوين بخط نسخ فيه روح وشخصية. لون الهوية بيظهر في حاجات قليلة ومهمة: الحصة الجاية والزرار الأساسي
والتبويب الحالي. البحث وزرار الإضافة تحت عند الصباع. هادي ومحترم ومريح للعين، والأرقام مرصوصة زي جدول حسابات.

### Color
| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#F4F1EA` warm paper | `#141311` |
| `--surface` | `#FBFAF7` | `#1C1B18` |
| `--surface-2` | `#EDE9E0` | `#252320` |
| `--line` / `--line-strong` | `#E0DBD0` / `#CFC9BC` | `#2F2D29` / `#3D3A35` |
| `--text` / `-2` / `-3` | `#1B1A17` / `#5E5A52` / `#6A655C` | `#EDEAE3` / `#ABA69C` / `#948F85` |
| `--ok` `--warn` `--danger` | `#2A7343` `#8C5200` `#B3261E` | `#6BBF85` `#E0A64A` `#F08A80` |
| brand default | `#1F6B53` (ink same) | fill `#236E56`, ink `#6FA592` |

Brand usage is **sparse**: next-session row tint + dot, active tab, primary button, links, superset rail.

### Type
- Headings: **Noto Naskh Arabic 700** — `--t-display` 34/1.25 (30 on ≤380px wide), `--t-title` 24/1.3, section titles 21.
- UI + numbers: **IBM Plex Sans Arabic** 400/500/600/700 — body 16/1.55, headline 17/600, sub 14, caption 12.5.
- Numbers: Plex, tabular, medium weight, 17px in lists, 28px for the one big package number. Never bigger.

### Space, shape, elevation
- Gutter 20px; rows 56px min (timeline 64). 4pt scale.
- Radii: 4 (tags) · 6 (photo slots, small buttons) · 10 (buttons, fields) · 14 (sheet). Lists are full-bleed with hairlines, **not cards**.
- Hairlines 0.5px. Elevation only on sheets (`--shadow-sheet`) and a 1px lift on the search field; none in dark mode.

### Components
- **Tab bar**: 5 tabs (الرئيسية، العملاء، المواعيد، التمارين، المزيد), 50pt + safe area, solid `--surface`, hairline top; icons 25px stroke 1.6, active = `--brand-ink` + stroke 2.
- **Command bar** (Home and list screens): pinned above the tab bar — search field "دوّر على عميل أو تمرين" + square brand "+" (quick add sheet: عميل، حصة، برنامج). Thumb-reachable, iOS-Safari-like.
- **List row**: title 17/600, sub 14 `--text-2`, trailing value/chevron; separators inset from the start.
- **Timeline row**: time column (start) `5:00` + `م` under it, a 1px rail with status dot, done rows muted, next row on `--brand-tint` with brand dot + halo.
- **Swipe**: leading (from the right in RTL) and trailing actions 76px wide each; brand action = `--brand`, neutral = `#6F6A61`, destructive = `--danger`.
- **Buttons**: primary 50pt brand fill; secondary hairline outline on `--surface`; plain = brand-ink text; small 34pt visual / 44pt hit.
- **Action bar** (pushed screens): `--surface` + hairline, primary flex-1, secondaries with icon+label; on ≤400px wide secondaries become 50pt icon-only (label kept in `aria-label`).
- **Fields**: 44pt, `--surface`, hairline `--line-strong`, radius 10, label above in caption.
- **Tags/chips**: 24px high, radius 4, `--surface-2`; brand/warn/danger variants on tints.
- **Ledger spec grid** (program): 5 equal columns سيتات/عدات/راحة/تمبو/RPE, hairline cells, caption label over a 16px tabular value.
- **Sheet**: radius 14 top, grabber 36×5, `--scrim` behind.
- **Empty state**: one Naskh line saying what to do + one primary button; no illustration ("لسه ما ضفتش عملاء. ابدأ بأول عميل").
- **Toast/undo**: inverted (`--text` bg), 48pt, "تراجع" underlined, 5s, above the action bar.

### Iconography
**Updated 2026-11-19 (owner):** filled, rounded icons everywhere — Material Symbols Rounded, fill 1, weight 400
(Apache-2.0), path data in `src/ui/icons/paths.ts`, rendered by `<Icon>` in `currentColor`. Every section title has
one in a brand-tinted tile, rows have a leading icon, actions have an icon before the label, section footers start
with an info icon. The only outline icon is the empty favourite star (to show the off state).
`design/icons.svg` (the old stroke set) is kept for the design mockups only.

### Photo / 3D treatment
Photo slots: 60×60 square, radius 6, hairline frame, neutral `--photo` fill; real photos are shown
unfiltered. Next to each photo a 26×60 back/front body silhouette with target muscles in brand.
Day header shows front+back at 40×92. 3D viewer: model on `--bg`, muscles `--muscle-off`, target in `--brand`.

### PDF look
Paper-colored background, Naskh headings, Plex body, hairline-ruled exercise tables exactly like the
ledger spec grid, brand used only for the trainer's name rule and target muscles. Feels like a printed program.

---

## 5. Direction B — «الحديد» Iron

**Rationale (عربي):** روح صالة الجيم: خط عناوين عريض وتقيل، وأرقام كبيرة بس لما يكون ليها معنى زي ميعاد
الحصة الجاية وعدد الحصص الباقية. لون الهوية بيتحط بجرأة على الحصة الجاية واليوم المختار والزرار الأساسي.
صور التمارين أكبر وعليها خريطة العضلة. زرار الإضافة في نص شريط التبويبات. واضح وسريع وبيتقري من بعيد،
ومعمول للاستعمال بين السيتات.

### Color
| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#EDEDEA` concrete | `#0B0C0C` |
| `--surface` | `#FFFFFF` | `#161818` |
| `--surface-2` | `#F3F3F1` | `#1F2222` |
| `--line` / `--line-strong` | `#E3E3DF` / `#D2D3CF` | `#252828` / `#2E3232` |
| `--text` / `-2` / `-3` | `#0E0F0F` / `#4A4D4E` / `#5F6364` | `#F2F3F1` / `#A3A8A6` / `#868B89` |
| `--ok` `--warn` `--danger` | `#1B7040` `#8F5600` `#B42318` | `#5CC88A` `#F0B04F` `#FF8A7E` |
| brand default | `#F25C1F`, on `#111111`, ink `#AA3F14` | same fill, ink `#FF7A45` |

Brand usage is **bold**: next-session hero block fully in brand, selected day pill, primary buttons,
center add button, A1/A2 superset tags, target muscles.

### Type
- Display + numbers: **Alexandria** 700/800 — `--t-display` 30/800, hero time 52/800, remaining sessions 34/800, weights 24/800.
- UI: **Readex Pro** 400/500/600 — body 16, headline 17/500, sub 14, caption 12.5.
- Numbers: Alexandria tabular in lists 18–19/700. Sets×reps shown as `4 سيت × 8–10 عدة` at 22/800.

### Space, shape, elevation
- Gutter 16px; content grouped in **tiles** (radius 18) on `--bg`, rows 60–64pt.
- Radii: 6 (A1 tags) · 10 (small buttons, avatars) · 14 (buttons, photos) · 18 (tiles) · 22 (sheet) · pill for chips/day pills.
- No shadows on tiles; only the sheet casts one. Borders 1px.

### Components
- **Tab bar**: 4 tabs + center 52×44 brand "+" (quick add sheet). "المزيد"/settings lives behind the trainer's initial/logo button at top of Home.
- **Top bar**: large title start-aligned, round 44pt buttons (search, profile) on `--surface`.
- **Hero (next session)**: brand block — status line, time 52px, client name 22px, then on-brand inverse button "ابدأ الحصة" + outline WhatsApp.
- **List row**: in tiles, 1px separators; done sessions struck-through + `تم` ok chip.
- **Expiring row**: renew button + a days-left column (big number in brand-ink when ≤3 days).
- **Segmented control** (client): 4 segments on `--surface`, selected = inverted (`--text` bg).
- **Package ring**: 12 segments, fills counter-clockwise from the top (RTL), used = `--text-3`, booked = `--brand`, left = `--surface-2`; big remaining number centered.
- **Buttons**: primary 48–52pt brand fill; secondary `--surface-2`; stacked icon-over-label 64×52 buttons in the action bar.
- **Chips**: 28px pill, `--surface-2`, values in Alexandria bold.
- **Fields**: 48pt, `--surface`, radius 14, no border in light, 1px `--line-strong` in dark.
- **Sheet**: radius 22, grabber 40×5.
- **Empty state**: tile with Alexandria headline + one primary button.
- **Toast/undo**: inverted, 52pt, radius 14.

### Iconography
Same sprite as A, rendered at stroke 2 (heavier, matches Alexandria).

### Photo / 3D treatment
Photo slots 96×96 radius 14, with the muscle map in a small `--surface` badge in the corner and A1/A2
superset tags on the photo. Day tile shows front+back maps 40×92 with a direct link "شوفها على المجسم 3D".
3D viewer: dark stage even in light mode is acceptable; target muscles in `--brand`.

### PDF look
White pages, bold Alexandria headers, a brand-colored band on the cover with the trainer logo, exercise
cards with large photos and the muscle badge, sets×reps in big numerals — reads well printed or on a phone.

---

## 6. Motion (both)

- What moves: sheets (`--dur-3`, `--ease-sheet`), pushes (system-like 300ms), swipe actions (follow finger,
  settle `--dur-2`), toast in/out (`--dur-2`), drag-reorder lift (scale 1.02, `--dur-1`), checkmark on
  attendance (`--dur-1`). Nothing else animates: no list stagger, no hover effects, no parallax, no counters.
- `prefers-reduced-motion: reduce` → all transitions/animations off; sheets appear instantly.
- Haptics are not available in iOS PWAs; don't fake them with animation.

## 7. Light/dark rules

- Follow the system by default; settings override (`data-theme`).
- Dark is tuned, not inverted: warmer near-blacks (A) / cool near-blacks (B), dimmer muscle-off, brand-ink
  lifted for contrast, semantic colors lighter, shadows removed except the sheet.
- Photos are never filtered in dark mode; their slot background darkens.

## 8. Fonts and licensing

All four families are SIL OFL 1.1 (Google Fonts), bundled as woff2 subsets in `design/fonts/` — they work
offline and must be listed in `LICENSES.md` when Phase 2 copies them into `public/`. The trainer's
font-picker (SPEC: Cairo/Tajawal/Plex) changes `--font-ui` only; `--font-display` stays with the direction.

## 9. Known gaps (to resolve after the choice)

- Exercise photo slots use pictograms; real `free-exercise-db` photos must be checked in both themes.
- Muscle map is a simplified in-house SVG; Phase 5 swaps in `react-body-highlighter` (check license) with the same CSS-variable coloring.
- Mockups use Chromium; Safari/WebKit rendering of Naskh and Alexandria must be verified on a real iPhone (add to `docs/MANUAL_QA.md`).
- Largest iOS Dynamic Type sizes not yet mocked.
