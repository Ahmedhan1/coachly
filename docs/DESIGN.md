# DESIGN.md — PT Coach visual system

> **Status:** **Pebble «حصى»**, chosen by the owner on 2026-11-26, is what ships (it replaced Direction B «الحديد»
> Iron, 2026-11-16 → 2026-11-26). Its values live in `src/ui/tokens.css` (the only place visual values live);
> components are in `src/ui`. Pebble was picked from four directions (Steel, Pebble, Night Shift, Paper) rendered on
> the real app; older mockups remain in git history (`git show 708815f:design/`).

---

## 1. Principles

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
stat cards · dark or grey shadows (Pebble's are faint and warm-tinted, `--shadow-card`/`--shadow-float` only) ·
hard-cornered controls · motion on every element · empty marketing copy · translated fitness terms ·
Eastern-Arabic digits.

---

## 2. Brand color derivation

The trainer picks **one** hex. `brand-derive.mjs` (pure, to be ported to `src/domain/brand.ts`) computes:

| Token | Light | Dark |
| --- | --- | --- |
| `--brand` | the picked color (fills: primary button, selected tab/day, "next" marker) | same; lifted toward white until ≥ 3:1 on `--bg` if it disappears |
| `--brand-on` | text/icons on a brand fill: `#FFFFFF` or near-black `#111111`, whichever has higher contrast | same rule on the dark fill |
| `--brand-ink` | brand used *as text* (links, active tab label): mixed toward black until ≥ 4.5:1 on `--bg` | mixed toward white until ≥ 5.5:1 on `--bg` |
| `--brand-tint` | 10% brand over `--bg` (selected rows, brand chips background) | 16% over dark `--bg` |
| `--brand-tint-strong` | 20% (focus rings, halo of the next-session dot) | 28% |
| `--muscle-hit` / `--muscle-hit-2` | primary / secondary target muscles: brand, and `color-mix(in oklab, brand 45%, --muscle-off)` | same |

Default signal orange `#F25C1F` resolves to **dark** on-brand text; crimson `#C81E3A` flips it to **white**
(both pinned in `src/domain/branding/brand.test.ts`).

Semantic colors (`--ok`, `--warn`, `--danger` + `-tint`) are fixed and never derived from
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

## 5. Pebble «حصى» (shipping)

**Rationale (عربي):** شكل هادي ودود ومريح للعين: كل حاجة مدوّرة، الزراير والشيبس كبسولات، والكروت مرفوعة شوية بضل
خفيف على أرضية لونها أوف وايت دافي. خط واحد بس (Rubik) أطرافه ناعمة، والتدرّج بييجي من الحجم والوزن مش من خط تاني.
شريط التبويبات عايم فوق المحتوى زي كبسولة، وزرار الإضافة دايرة بلون الهوية في النص. لون الهوية بيظهر بجرأة على
الحصة الجاية والزرار الأساسي وزرار الإضافة.

### Color
| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#F3F1ED` warm off-white | `#131211` |
| `--surface` | `#FFFFFF` | `#1E1C1A` |
| `--surface-2` | `#EFECE6` | `#282623` |
| `--line` / `--line-strong` | `#E6E2DA` / `#D7D2C8` | `#2F2C29` / `#3B3834` |
| `--text` / `-2` / `-3` | `#1C1A17` / `#57524A` / `#6B665D` | `#F3F0EA` / `#B0AAA0` / `#948E84` |
| `--ok` `--warn` `--danger` | `#1B7040` `#8F5600` `#B42318` | `#5CC88A` `#F0B04F` `#FF8A7E` |
| brand default | `#F25C1F`, on `#111111`, ink `#AE4216` | same fill, ink `#F36931` |

Contrast (checked 2026-11-26 with `src/domain/branding` contrastRatio): every text token and semantic colour is
≥ 4.5:1 on `--bg`, `--surface` and `--surface-2` in both modes, semantic colours ≥ 4.5:1 on their tints, and all 8
brand presets pass `auditBrand` on these surfaces (`APP_SURFACES` in `src/domain/branding/brand.ts`).

### Type
One family, **Rubik** (variable 300–900, SIL OFL), for headings, text and numbers. Hierarchy by size and weight:
display 30/700, large title 28/700, title 20/600, heading 17/600, body 16/400, callout 15/500, sub 14/400,
caption 12.5/400, buttons 16/500. Numbers tabular (`.num`) at 600–700: hero time 52, remaining sessions 34–44.

### Space, shape, elevation
- Gutter 16px; content grouped in **lifted tiles** on `--bg`: `--surface` + `--shadow-card` (faint, warm) in light;
  no shadow in dark (surfaces are lighter than `--bg` instead).
- Radii: 10 (tags) · 16 (small tiles, photos) · 22 (cards) · 28 (big tiles) · 34 (sheet) · **24 for every control**:
  half of a 48pt control, so buttons, chips, fields and segments are pills while taller blocks stay soft rectangles.

### Components
- **Tab bar**: a floating pill (`--r-full`, `--shadow-float`) inset by the gutter, sitting just above the home
  indicator (`--tabbar-gap` on phones without one). 4 tabs + a 48pt brand circle "+" in the middle. Anything that
  must clear it uses `--tabbar-space`.
- **Hero (next session)**: brand block, radius 28, time 52px, on-brand "ابدأ الحصة" pill + round WhatsApp button.
- **Buttons / chips / segments / fields**: pills (`--r-control`); selected segment and pressed chip = `--text` fill.
- **Section title icons**: brand-tint circles.
- **Sheet**: radius 34, grabber 40×5, faint warm shadow.
- Everything else follows §10: one implementation per control in `src/ui`.

### PDF look
White pages, Rubik (or Cairo, the trainer's choice in PDF settings), a brand-colored band on the cover with the
trainer logo, exercise cards with large photos and the muscle badge, sets×reps in big numerals.

---

## 6. Motion

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

Rubik (the app) and Cairo (second PDF option) are SIL OFL 1.1, bundled as variable woff2 subsets in `public/fonts/`
with their licence texts, listed in `LICENSES.md`, and precached so they work offline. The trainer's font choice
applies to the PDF (`PDF_FONTS` in `src/features/pdf/pdfBranding.ts`); a saved font that is no longer bundled reads
as Rubik without resetting the rest of the trainer's PDF look.

## 9. Known gaps

- Exercise photo slots use pictograms; real `free-exercise-db` photos must be checked in both themes.
- Muscle map is a simplified in-house SVG; Phase 5 swaps in `react-body-highlighter` (check license) with the same CSS-variable coloring.
- Screens are checked in Chromium; Rubik, the floating tab bar and backdrop/shadow rendering must be verified in
  Safari on a real iPhone (`docs/MANUAL_QA.md`).
- Largest iOS Dynamic Type sizes not yet mocked.

---

## 10. Shared components — use them, don't restyle them

**Added 2026-11-26.** Every control below has exactly one implementation in `src/ui` (import from `@/ui`). A feature
never re-creates one in its own CSS module; if a screen needs something the component can't do, extend the component.

| Need | Component | Notes |
| --- | --- | --- |
| Save / Done / Restore in a sheet header | `<Button size="small">` as `Sheet`'s `primaryAction` | Filled brand, no icon, label only. |
| Filter, choice or inline-action chip | `<Chip pressed?>` · `<ChipGroup label>` | 36pt, 44pt hit. Dark fill when pressed; `tone="warn"` for injuries. Leave out `pressed` for action chips ("+ Add"). |
| − value + number entry | `<Stepper>` | `size="big"` in session mode. |
| List of actions in a sheet | `<ActionSheet actions>` | `danger` rows in red. |
| Pick a photo or file | `<FileButton onFiles>` | Clears the input after each pick; `busy` while processing; `block` for full width. |
| Remove a photo / attachment | `<Button variant="danger" size="small" icon="trash">` | |

Chips, file buttons and text fields sit on `--field-bg`: white on a page, `--surface-2` inside a sheet (`Sheet` sets it).
Static labels inside a row (muscle, "custom", sets×reps) are tags, not chips, and stay with their row's CSS.
