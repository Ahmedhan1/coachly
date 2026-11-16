import { describe, expect, it } from 'vitest';
import { alternativesFor } from './alternatives';
import type { CatalogExercise } from './types';

const ex = (id: string, over: Partial<CatalogExercise> = {}): CatalogExercise => ({
  id, nameEn: id, nameAr: id, primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'barbell', level: 'intermediate',
  category: 'strength', force: 'push', mechanic: 'compound', images: [], isCustom: false, ...over,
} as CatalogExercise);

describe('alternativesFor', () => {
  const bench = ex('bench');
  const catalog = [bench, ex('db_press', { equipment: 'dumbbell' }), ex('fly', { mechanic: 'isolation', equipment: 'dumbbell' }), ex('pushup', { equipment: 'body_only' }), ex('squat', { primaryMuscles: ['quads'] })];
  it('keeps the same main muscle and ranks the closest movement first', () => {
    expect(alternativesFor(bench, catalog).map((e) => e.id)).toEqual(['db_press', 'pushup', 'fly']);
  });
  it('respects the available equipment (body weight always allowed)', () => {
    expect(alternativesFor(bench, catalog, { available: new Set(['machine']) }).map((e) => e.id)).toEqual(['pushup']);
  });
});
