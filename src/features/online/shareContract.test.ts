import { describe, expect, it } from 'vitest';
import { buildShareDocument, type ShareSources } from '@/domain/clientPage';
import type { MealPlan, Program } from '@/domain/models';
// The live Worker's own runtime guard: what the app uploads must pass it, or the viewer page shows nothing.
import { parseShareDocument } from '../../../worker/src/share/document';

const long = (n: number) => 'س'.repeat(n);

function sources(over: Partial<ShareSources> = {}): ShareSources {
  const program = {
    name: long(200),
    days: Array.from({ length: 20 }, (_, d) => ({
      id: `d${d}`,
      name: long(100),
      items: Array.from({ length: 50 }, (_, i) => ({
        id: `i${d}-${i}`,
        exerciseId: 'Bench',
        sets: 4,
        reps: '8-10 لكل ناحية بالراحة',
        restSec: 9000,
        tempo: '3-1-1-0 بالراحة خالص',
        rpe: 8.5,
        supersetGroup: null,
        notes: long(900),
      })),
    })),
  } as unknown as Program;
  const mealPlan = {
    meals: Array.from({ length: 15 }, (_, m) => ({
      id: `m${m}`,
      name: long(100),
      time: '09:00',
      items: Array.from({ length: 40 }, () => ({ recipeId: null, text: long(300), servings: 1 })),
    })),
  } as unknown as MealPlan;
  return {
    now: 1_795_000_000_000,
    trainerName: long(120),
    color: '#F25C1F',
    client: { name: `${long(60)} محمود` },
    program,
    exercise: () => ({ name: long(200), imageFile: '0001-0.webp' }),
    dayTitle: (i, n) => `اليوم ${i + 1} — ${n}`,
    mealPlan,
    mealItem: (i) => i.text,
    supplements: Array.from({ length: 40 }, () => ({ name: 'كرياتين', dose: long(300), timing: long(300), notes: '' })),
    notes: long(5000),
    checkinsEnabled: true,
    ...over,
  };
}

describe('client page document ↔ worker/src/share/document.ts', () => {
  it('a document at every size limit passes the Worker guard', () => {
    expect(parseShareDocument(buildShareDocument(sources()))).not.toBeNull();
  });

  it('a minimal document (no program, no meals, odd colour) passes', () => {
    const doc = buildShareDocument(sources({ program: null, mealPlan: null, supplements: [], notes: '', color: 'red', trainerName: '' }));
    expect(parseShareDocument(doc)).not.toBeNull();
  });
});
