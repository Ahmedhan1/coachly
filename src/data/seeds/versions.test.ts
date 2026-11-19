import { describe, expect, it } from 'vitest';
import ingredientsJson from './ingredients.ar.json';
import recipesJson from './recipes.ar.json';
import { STARTER_FOOD_VERSION, STARTER_RECIPE_VERSION } from './versions';

describe('starter data versions', () => {
  it('match the version fields of the shipped JSON (bump both together)', () => {
    expect(STARTER_FOOD_VERSION).toBe(ingredientsJson.version);
    expect(STARTER_RECIPE_VERSION).toBe(recipesJson.version);
  });
});
