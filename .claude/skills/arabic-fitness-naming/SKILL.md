---
name: arabic-fitness-naming
description: Use whenever you write or change any user-visible Arabic text, muscle/exercise/equipment names, exercise data, i18n strings (src/i18n/**), or anything that names a gym term in Arabic. Enforces transliteration (Glutes → جلوتس), never literal translation, and runs the forbidden-words gate.
---

# Arabic fitness naming

The product is sold to Egyptian personal trainers. Gym terms are **transliterated the way trainers say them in
the gym, never translated**. A literal textbook translation ("المؤخرة", "الرفعة الميتة") makes the app look
foreign and amateur to the buyer.

## Rules

1. **Every user-visible string comes from `src/i18n/ar.ts`.** No hard-coded UI text in components.
2. **Gym terms come from the dictionary `src/i18n/fitness-terms.ts`.** Muscles, equipment, movements,
   modifiers, named exercises. Examples: Glutes جلوتس · Quads كوادز · Hamstrings هامسترينج · Lats لاتس ·
   Traps ترابس · Chest تشيست · Shoulders شولدرز · Biceps Curl بايسبس كيرل · Bench Press بنش برس ·
   Deadlift ديدليفت · Hip Thrust هيب ثرست · Lat Pulldown لات بول داون · Dumbbell دامبل · Barbell بار · Cable كيبل.
3. **Never use a word from `FORBIDDEN_TERMS`** (same file, between the `forbidden-words:begin/end` markers).
   If you need a new term, add it to the right group in the dictionary — do not invent a translation inline.
4. Spelling conventions: g → ج, p → ب, v → ف, ch → تش, th → ث. Keep English word order. Plurals collapse to
   what trainers say ("Curls" → كيرل) except words always said in plural (جلوتس، كوادز، لاتس، باندز).
5. Plain Arabic is fine for non-jargon UI words (مبتدئ، متوسط، متقدم، العملاء، المواعيد).
6. Digits are Western 0-9. Layout uses CSS logical properties.
7. Exercise names are **defaults the trainer can edit** in the app. Never hard-code them in components.
8. Machine-generated names always need review by a real trainer; never claim they are final.

## Tools

- `transliterateExerciseName(english)` in `src/i18n/fitness-terms.ts` → `{ arabic, unknownTokens }`.
  Multi-word phrases match first; numbers, hyphens, slashes and parentheses are handled.
- `node scripts/transliterate-exercises.mjs` → regenerates `assets-src/exercises/exercise-names.ar.json` and
  `assets-src/exercises/exercise-names.coverage.json` (unknown tokens by frequency). Aim for 0 unknown tokens; add missing
  words to the dictionary, never post-edit the generated JSON by hand.
- `npm run check:words` → scans `src/i18n/**` (not tests), `src/**/*.ar.json`, `assets-src/exercises/**/*.ar.json` and
  `public/**/*.json`; prints `file:line` and exits 1 on any forbidden word. Must pass before any phase is done.

## Checklist before saying "done"

- [ ] New Arabic text lives in `src/i18n/ar.ts` (or the dictionary for gym terms).
- [ ] `npx vitest run src/i18n scripts` passes.
- [ ] `npm run check:words` passes (show its output).
- [ ] If exercise data changed: rerun the transliteration script and report the coverage line.
- [ ] Never weaken the gate (no removing terms from `FORBIDDEN_TERMS`, no new skip markers, no excluding files)
      to make it pass. Fix the text instead.
