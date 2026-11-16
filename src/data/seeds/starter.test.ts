import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { storedRecipeNutrition } from '@/domain/meals';
import { findForbiddenTerms } from '@/i18n/fitness-terms';
import { starterIngredients, starterRecipeSources, starterRecipes, starterSupplements } from './starter';

describe('starter recipe data', () => {
  const table = starterIngredients();
  const sources = starterRecipeSources();

  it('has about 30 recipes with unique ids and names', () => {
    expect(sources.length).toBeGreaterThanOrEqual(30);
    expect(new Set(sources.map((r) => r.id)).size).toBe(sources.length);
    expect(new Set(sources.map((r) => r.name)).size).toBe(sources.length);
  });

  it('every referenced ingredient exists in the table', () => {
    const ids = new Set(table.map((i) => i.id));
    expect(ids.size).toBe(table.length);
    expect(new Set(table.map((i) => i.name)).size).toBe(table.length);
    for (const r of sources) for (const item of r.items) expect(ids.has(item.ingredient), `${r.id} → ${item.ingredient}`).toBe(true);
  });

  it('ingredient values are plausible (macros cannot exceed 100 g, kcal ≈ 4/4/9)', () => {
    for (const i of table) {
      const { kcal, proteinG, carbG, fatG } = i.per100g;
      expect(proteinG + carbG + fatG, i.id).toBeLessThanOrEqual(100);
      const atwater = proteinG * 4 + carbG * 4 + fatG * 9;
      // fibre and rounding make labels differ from Atwater; a large gap means a typo
      expect(Math.abs(atwater - kcal), i.id).toBeLessThanOrEqual(Math.max(25, kcal * 0.2));
    }
  });

  it('every recipe has computed macros (no hand-typed totals in the data)', () => {
    const raw = readFileSync(new URL('./recipes.ar.json', import.meta.url), 'utf8');
    expect(raw).not.toMatch(/"(kcal|proteinG|carbG|carbsG|fatG)"/);
    for (const r of starterRecipes(table)) {
      const n = storedRecipeNutrition(r);
      if (!n.ok) throw new Error(`${r.key}: ${n.error}`);
      expect(n.value.perServing.kcal, r.key).toBeGreaterThan(20);
      expect(n.value.incomplete).toBe(false);
    }
  });

  it('contains no forbidden words', () => {
    for (const file of ['./recipes.ar.json', './ingredients.ar.json', './supplements.ar.json']) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(findForbiddenTerms(text), file).toEqual([]);
    }
  });

  it('supplements are names only — no doses', () => {
    const raw = readFileSync(new URL('./supplements.ar.json', import.meta.url), 'utf8');
    expect(raw).not.toMatch(/"(dose|timing)"/);
    expect(starterSupplements().map((s) => s.name)).toEqual(['كرياتين', 'واي بروتين', 'أوميجا 3', 'مالتي فيتامين', 'كافيين']);
  });
});
