const DIACRITICS = /[ً-ٰٟـ]/g; // harakat, superscript alef, tatweel
const ARABIC_INDIC = /[٠-٩]/g;
const EXTENDED_INDIC = /[۰-۹]/g;

/**
 * Folds text so trainers find what they type: no diacritics or tatweel, alef/yaa/taa-marbuta
 * variants unified, Arabic-Indic digits mapped to 0-9, Latin lower-cased, spaces collapsed.
 */
export function normalizeForSearch(text: string): string {
  return text
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every word of the query must appear in at least one of the fields. Empty query matches all. */
export function matchesQuery(fields: readonly string[], query: string): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.map(normalizeForSearch);
  return words.every((w) => haystack.some((f) => f.includes(w)));
}

export function searchItems<T>(items: readonly T[], query: string, fields: (item: T) => readonly string[]): T[] {
  return items.filter((item) => matchesQuery(fields(item), query));
}

/** Items with their fields normalised once, so typing in a search box only does substring checks. */
export interface PreparedSearch<T> {
  readonly items: readonly T[];
  readonly haystacks: readonly (readonly string[])[];
}

export function prepareSearch<T>(items: readonly T[], fields: (item: T) => readonly string[]): PreparedSearch<T> {
  return { items, haystacks: items.map((item) => fields(item).map(normalizeForSearch)) };
}

/** Same rule as `matchesQuery` (every word in some field), over a prepared list. Empty query returns all. */
export function filterPrepared<T>(prepared: PreparedSearch<T>, query: string): T[] {
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...prepared.items];
  const out: T[] = [];
  prepared.items.forEach((item, i) => {
    const hay = prepared.haystacks[i] ?? [];
    if (words.every((w) => hay.some((f) => f.includes(w)))) out.push(item);
  });
  return out;
}
