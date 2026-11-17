#!/usr/bin/env node
// Runs every free-exercise-db exercise name through the Arabic fitness dictionary.
// Usage: node scripts/transliterate-exercises.mjs [input.json] [outDir]
// Writes <outDir>/exercise-names.ar.json and <outDir>/exercise-names.coverage.json.
// Names: hand-curated data-src/exercise-names.overrides.ar.json first ("source": "curated"), then the
// Egyptian word-order rule naturalExerciseName ("source": "auto"). "popular" marks the الأشهر set.
// Requires Node >= 22.18 (imports the TypeScript dictionary directly; Node strips the types).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATASET_FIELD_TERMS,
  EQUIPMENT_TERMS,
  MUSCLE_TERMS,
  findForbiddenTerms,
  naturalExerciseName,
} from '../src/i18n/fitness-terms.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(process.argv[2] ?? join(root, 'data-src/free-exercise-db/exercises.json'));
const outDir = resolve(process.argv[3] ?? join(root, 'data-src'));
const overridesFile = resolve(process.argv[4] ?? join(root, 'data-src/exercise-names.overrides.ar.json'));

/** @type {{ names: Record<string, string>, popular: string[] }} */
const overrides = JSON.parse(readFileSync(overridesFile, 'utf8'));
const curated = new Map(Object.entries(overrides.names ?? {}));
const popular = new Set(overrides.popular ?? []);

/** @type {Array<{id: string, name: string, primaryMuscles: string[], secondaryMuscles: string[], equipment: string | null, level: string, category: string}>} */
const exercises = JSON.parse(readFileSync(input, 'utf8'));

const unknownCounts = new Map();
const missingFieldValues = new Set();
let totalWords = 0;
let unknownWords = 0;
let fullyCovered = 0;

function field(map, value, kind) {
  if (value === null || value === undefined) return null;
  const arabic = map[value];
  if (arabic === undefined) missingFieldValues.add(`${kind}:${value}`);
  return arabic ?? value;
}

const knownIds = new Set(exercises.map((e) => e.id));
const strayIds = [...curated.keys(), ...popular].filter((id) => !knownIds.has(id));
if (strayIds.length > 0) {
  console.error(`overrides name unknown exercise ids: ${strayIds.join(', ')}`);
  process.exit(1);
}
for (const [id, ar] of curated) {
  const bad = findForbiddenTerms(ar);
  if (bad.length > 0) {
    console.error(`curated name for ${id} uses forbidden words: ${bad.join(', ')}`);
    process.exit(1);
  }
}

const names = exercises
  .map((exercise) => {
    const curatedName = curated.get(exercise.id);
    const auto = naturalExerciseName(exercise.name);
    const arabic = curatedName ?? auto.arabic;
    const unknownTokens = curatedName === undefined ? auto.unknownTokens : [];
    const words = exercise.name.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
    totalWords += words.length;
    unknownWords += unknownTokens.length;
    if (unknownTokens.length === 0) fullyCovered += 1;
    for (const token of unknownTokens) unknownCounts.set(token, (unknownCounts.get(token) ?? 0) + 1);
    const entry = {
      id: exercise.id,
      en: exercise.name,
      ar: arabic,
      primaryMuscles: exercise.primaryMuscles.map((m) => field(MUSCLE_TERMS, m, 'muscle')),
      secondaryMuscles: exercise.secondaryMuscles.map((m) => field(MUSCLE_TERMS, m, 'muscle')),
      equipment: field(EQUIPMENT_TERMS, exercise.equipment, 'equipment'),
      level: field(DATASET_FIELD_TERMS.level, exercise.level, 'level'),
      category: field(DATASET_FIELD_TERMS.category, exercise.category, 'category'),
      source: curatedName === undefined ? 'auto' : 'curated',
      popular: popular.has(exercise.id),
      reviewed: curatedName !== undefined,
    };
    if (unknownTokens.length > 0) entry.unknownTokens = unknownTokens;
    return entry;
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const unknownByFrequency = [...unknownCounts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([token, count]) => ({ token, count }));

const coverage = {
  source: 'yuhonas/free-exercise-db dist/exercises.json',
  exercises: exercises.length,
  fullyCoveredNames: fullyCovered,
  fullyCoveredPercent: Number(((100 * fullyCovered) / exercises.length).toFixed(2)),
  englishWords: totalWords,
  unknownWords,
  wordCoveragePercent: Number((100 * (1 - unknownWords / totalWords)).toFixed(2)),
  distinctUnknownTokens: unknownByFrequency.length,
  curatedNames: curated.size,
  popular: popular.size,
  missingFieldValues: [...missingFieldValues].sort(),
  unknownByFrequency,
  note: 'Machine transliteration. Every name must be reviewed by a real Egyptian trainer before release.',
};

writeFileSync(join(outDir, 'exercise-names.ar.json'), JSON.stringify(names, null, 2) + '\n');
writeFileSync(join(outDir, 'exercise-names.coverage.json'), JSON.stringify(coverage, null, 2) + '\n');

console.log(`exercises: ${coverage.exercises}`);
console.log(`fully covered names: ${fullyCovered} (${coverage.fullyCoveredPercent}%)`);
console.log(`word coverage: ${coverage.wordCoveragePercent}% (${unknownWords} unknown of ${totalWords})`);
console.log(`curated names: ${curated.size}, popular: ${popular.size}`);
console.log(`distinct unknown tokens: ${coverage.distinctUnknownTokens}`);
if (missingFieldValues.size > 0) console.log(`missing field values: ${coverage.missingFieldValues.join(', ')}`);
console.log(
  `top unknown: ${unknownByFrequency
    .slice(0, 30)
    .map((u) => `${u.token}(${u.count})`)
    .join(' ')}`,
);
