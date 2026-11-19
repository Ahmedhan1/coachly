/**
 * Versions of the shipped food table and recipe book. Bumping one makes existing installs merge in what is new.
 *
 * Kept apart from `starter.ts` on purpose: the app checks these on every launch, while the ~350 KB of seed JSON
 * is loaded (dynamic import) only when a version differs — first install or an update that ships new data.
 * `versions.test.ts` fails if these drift from the `version` fields of the JSON files.
 */
export const STARTER_FOOD_VERSION = 5;
export const STARTER_RECIPE_VERSION = 4;
