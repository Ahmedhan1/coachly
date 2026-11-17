#!/usr/bin/env node
// Forbidden-words gate: fails (exit 1) when a literal translation of a gym term appears in
// user-visible text or exercise data. The list lives in src/i18n/fitness-terms.ts (FORBIDDEN_TERMS).
//
// Scanned (relative to --root, default = repo root):
//   - src/i18n/**            (.ts .tsx .js .mjs .json .md), excluding *.test.* / *.spec.*
//   - src/**/*.ar.json, data-src/**/*.ar.json
//   - public/**/*.json       (public data shipped with the app, incl. future exercise data)
//   - worker/src/share/**, worker/src/admin/** (.ts .js .mjs .html), excluding tests: the Arabic client
//     page and owner dashboard rendered by the Cloudflare Worker
// Lines between "forbidden-words:begin" and "forbidden-words:end" are skipped (the list itself).
//
// Usage: node scripts/check-forbidden-words.mjs [--root <dir>]
// Requires Node >= 22.18 (imports the TypeScript dictionary directly).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findForbiddenTerms } from '../src/i18n/fitness-terms.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootFlag = process.argv.indexOf('--root');
const root = rootFlag >= 0 && process.argv[rootFlag + 1] ? resolve(process.argv[rootFlag + 1]) : repoRoot;

const TEXT_EXT = /\.(ts|tsx|js|mjs|json|md)$/;
const WORKER_PAGE_EXT = /\.(ts|js|mjs|html)$/;
const TEST_FILE = /\.(test|spec)\.[a-z]+$/;

function listFiles(dir) {
  const abs = join(root, dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return [];
  return readdirSync(abs, { recursive: true })
    .map((entry) => join(dir, String(entry)))
    .filter((path) => !path.split(sep).includes('node_modules'))
    .filter((path) => statSync(join(root, path)).isFile());
}

const targets = new Set([
  ...listFiles('src/i18n').filter((p) => TEXT_EXT.test(p) && !TEST_FILE.test(p)),
  ...listFiles('src').filter((p) => p.endsWith('.ar.json')),
  ...listFiles('data-src').filter((p) => p.endsWith('.ar.json')),
  ...listFiles('public').filter((p) => p.endsWith('.json')),
  ...['worker/src/share', 'worker/src/admin'].flatMap((dir) =>
    listFiles(dir).filter((p) => WORKER_PAGE_EXT.test(p) && !TEST_FILE.test(p)),
  ),
]);

const hits = [];
for (const file of [...targets].sort()) {
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  let skipping = false;
  lines.forEach((line, index) => {
    if (line.includes('forbidden-words:begin')) skipping = true;
    if (!skipping) {
      for (const term of findForbiddenTerms(line)) hits.push({ file, line: index + 1, term, text: line.trim() });
    }
    if (line.includes('forbidden-words:end')) skipping = false;
  });
}

if (hits.length > 0) {
  for (const hit of hits) {
    console.error(`${relative(process.cwd(), join(root, hit.file))}:${hit.line}: forbidden word "${hit.term}" — ${hit.text}`);
  }
  console.error(`check:words FAILED — ${hits.length} forbidden word(s) in ${targets.size} file(s). Use the transliterated term from src/i18n/fitness-terms.ts.`);
  process.exit(1);
}
console.log(`check:words OK — ${targets.size} file(s) scanned, no forbidden words.`);
