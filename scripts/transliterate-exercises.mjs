#!/usr/bin/env node
// Runs every free-exercise-db exercise name through the Arabic fitness dictionary.
// Usage: node scripts/transliterate-exercises.mjs [input.json] [outDir]
// Writes <outDir>/exercise-names.ar.json and <outDir>/exercise-names.coverage.json.
// Requires Node >= 22.18 (imports the TypeScript dictionary directly; Node strips the types).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATASET_FIELD_TERMS,
  EQUIPMENT_TERMS,
  MUSCLE_TERMS,
  transliterateExerciseName,
} from '../src/i18n/fitness-terms.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(process.argv[2] ?? join(root, 'data-src/free-exercise-db/exercises.json'));
const outDir = resolve(process.argv[3] ?? join(root, 'data-src'));

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

const names = exercises
  .map((exercise) => {
    const { arabic, unknownTokens } = transliterateExerciseName(exercise.name);
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
      reviewed: false,
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
  missingFieldValues: [...missingFieldValues].sort(),
  unknownByFrequency,
  note: 'Machine transliteration. Every name must be reviewed by a real Egyptian trainer before release.',
};

writeFileSync(join(outDir, 'exercise-names.ar.json'), JSON.stringify(names, null, 2) + '\n');
writeFileSync(join(outDir, 'exercise-names.coverage.json'), JSON.stringify(coverage, null, 2) + '\n');

console.log(`exercises: ${coverage.exercises}`);
console.log(`fully covered names: ${fullyCovered} (${coverage.fullyCoveredPercent}%)`);
console.log(`word coverage: ${coverage.wordCoveragePercent}% (${unknownWords} unknown of ${totalWords})`);
console.log(`distinct unknown tokens: ${coverage.distinctUnknownTokens}`);
if (missingFieldValues.size > 0) console.log(`missing field values: ${coverage.missingFieldValues.join(', ')}`);
console.log(
  `top unknown: ${unknownByFrequency
    .slice(0, 30)
    .map((u) => `${u.token}(${u.count})`)
    .join(' ')}`,
);
