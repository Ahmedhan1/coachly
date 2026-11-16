import { muscleGroup } from './labels';
import type { MuscleGroupId } from './pack';
import type { CatalogExercise } from './types';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * Normalises Arabic + English text for matching: strips tashkeel and tatweel, unifies alef forms (أ إ آ ٱ → ا),
 * alef maqsura (ى → ي), ta marbuta (ة → ه), hamza seats (ؤ → و, ئ → ي), maps Arabic-Indic digits to 0-9,
 * lowercases, and turns any punctuation into single spaces.
 */
export function normalizeSearchText(text: string): string {
  return text
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const SCORE = { exact: 100, prefix: 80, wordPrefix: 60, contains: 40, primaryMuscle: 20, secondaryMuscle: 10 } as const;

function textScore(text: string, query: string, tokens: readonly string[]): number {
  if (text === '') return 0;
  if (text === query) return SCORE.exact;
  if (text.startsWith(query)) return SCORE.prefix;
  const words = text.split(' ');
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) return SCORE.wordPrefix;
  if (tokens.every((t) => text.includes(t))) return SCORE.contains;
  return 0;
}

const muscleTextCache = new Map<MuscleGroupId, readonly string[]>();
function muscleTexts(id: MuscleGroupId): readonly string[] {
  let texts = muscleTextCache.get(id);
  if (texts === undefined) {
    const group = muscleGroup(id);
    texts = [normalizeSearchText(group.labelAr), normalizeSearchText(group.labelEn)];
    muscleTextCache.set(id, texts);
  }
  return texts;
}

function musclesMatch(ids: readonly MuscleGroupId[], tokens: readonly string[]): boolean {
  return ids.some((id) => muscleTexts(id).some((text) => {
    const words = text.split(' ');
    return tokens.every((t) => words.some((w) => w.startsWith(t)));
  }));
}

/** Relevance of one exercise for an already-normalised query (0 = no match). */
export function scoreExercise(exercise: CatalogExercise, normalizedQuery: string): number {
  const tokens = normalizedQuery.split(' ').filter((t) => t !== '');
  if (tokens.length === 0) return 0;
  const nameScore = Math.max(
    textScore(normalizeSearchText(exercise.nameAr), normalizedQuery, tokens),
    textScore(normalizeSearchText(exercise.nameEn), normalizedQuery, tokens),
  );
  if (nameScore > 0) return nameScore;
  if (musclesMatch(exercise.primaryMuscles, tokens)) return SCORE.primaryMuscle;
  if (musclesMatch(exercise.secondaryMuscles, tokens)) return SCORE.secondaryMuscle;
  return 0;
}

/**
 * Arabic + English search over names (and muscle labels as a weaker signal). Results are sorted by score,
 * then by normalised Arabic name. An empty query returns the list unchanged (up to `limit`).
 */
export function searchExercises(
  exercises: readonly CatalogExercise[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
): CatalogExercise[] {
  const normalized = normalizeSearchText(query);
  if (normalized === '') return exercises.slice(0, limit);
  return exercises
    .map((exercise) => ({ exercise, score: scoreExercise(exercise, normalized), key: normalizeSearchText(exercise.nameAr) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, limit)
    .map((r) => r.exercise);
}
