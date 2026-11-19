---
name: release-qa-gate
description: Use before building, tagging, deploying or handing over ANY release or phase build for trainers (Cloudflare Pages upload, worker deploy, "is it ready to ship?"). Runs every automated check from the spec's QA section in order and refuses to build if any fails. Never skip, disable or weaken a failing check.
---

# Release QA gate

No build goes to trainers unless **every** check below passes. Run them in this order; stop at the first
failure, report it plainly, and do not build. Show the real output of each command — never write "passes"
for something you did not run.

## Hard rules

- **Never** skip, comment out, `.skip`/`.only`, loosen thresholds, add lint-disable comments, remove forbidden
  words, or edit a test's expected values just to make the gate green. Fix the code, or stop and tell the owner.
- If a check cannot run in this environment (e.g. WebKit not installed), the gate is **not passed** — say which
  check is missing and why. Do not substitute Chromium for WebKit silently.
- Anything only a real iPhone can verify goes to `docs/MANUAL_QA.md`; the owner must tick it before selling.

## Ordered checks

1. **TypeScript strict, zero errors** — `npm run typecheck` (root) and `cd worker && npm run typecheck`.
2. **ESLint clean** — `npm run lint` (zero errors; warnings reported).
3. **Formula tests** — reference values computed by hand, plus edge cases (zero weight, very young age,
   missing body-fat %): `npx vitest run src/domain`.
4. **License tests** — valid code, forged signature, different device, activation window passed, license
   expired, clock rolled back: `npx vitest run shared` and `cd worker && npm test`.
5. **Database upgrade tests** — every old schema version upgrades to the newest with no data loss
   (`npx vitest run src/data`).
6. **Backup round-trip** — export then restore gives data identical to the original (local file and cloud
   format, including encryption with a known password).
7. **Calendar .ics** — valid for single and recurring sessions, with time zone and alarm.
8. **Full unit suite** — `npm test` (everything, root) — must include steps 3–7.
9. **Five test PDFs** — follow the `pdf-template-qa` skill: no images, 50 exercises, very long names, mixed
   Arabic/English, maximum background + logo. Pages reviewed as images.
10. **Playwright on WebKit at iPhone size** — activation, add client, build program, book appointment, calorie
    calculation, export PDF — each run **online and offline** (network cut), small and large iPhone viewports,
    light and dark: `npx playwright test --project=webkit` (or the project names in `playwright.config.ts`).
11. **Forbidden words in the translation file and the exercise data** — `npm run check:words`.
12. **Licenses** — every dependency in root and `worker/` is listed in `LICENSES.md`; no GPL/AGPL in shipped
    code (run the license scan script once it exists; until then, read each new package's license).
13. **Limits sanity** — `docs/LIMITS.md` re-verified against the Cloudflare docs on release day if the release
    touches the Worker, D1, R2 or cron.
14. **Secrets** — no private key, `.dev.vars`, `*.pem`/`*.key` or `ADMIN_PASSWORD` in the repo or in `dist/`
    (`git ls-files` and a grep of the built bundle for key material).
15. **Build** — only now: `npm run build` (and `cd worker && npx wrangler deploy --dry-run` for the Worker).

`npm run check` covers 1, 2, 8 and 11 in one command; the gate still needs 9, 10, 12–15 explicitly.

## Report format

A table: check · command · result (PASS / FAIL / NOT RUN + reason) · key output line. If anything is FAIL or
NOT RUN, end with "Release blocked" and the list of blockers. Then list the manual iPhone items still open in
`docs/MANUAL_QA.md`.
