import { describe, expect, it } from 'vitest';
import { buildShareDocument, parseCheckin } from './document';
import type { MealPlan, Program } from '../models';

const program = {
  name: 'برنامج 4 أيام',
  days: [{ id: 'd1', name: 'بوش', items: [{ id: 'i1', exerciseId: 'Bench', sets: 4, reps: '6-8', restSec: 120, tempo: '', rpe: 8, supersetGroup: null, notes: '' }] }],
} as unknown as Program;

describe('buildShareDocument', () => {
  it('keeps the first name only and maps the program', () => {
    const doc = buildShareDocument({
      now: 1_700_000_000_000,
      trainerName: 'كوتش أحمد',
      color: '#F25C1F',
      client: { name: 'سارة محمود علي' },
      program,
      exercise: () => ({ name: 'بنش برس', imageFile: 'Bench-0.jpg' }),
      dayTitle: (i, n) => `اليوم ${i + 1} — ${n}`,
      mealPlan: null,
      mealItem: () => '',
      supplements: [{ name: 'كرياتين', dose: '', timing: 'بعد التمرين', notes: '' }],
      notes: '',
      checkinsEnabled: true,
    });
    expect(doc.client.firstName).toBe('سارة');
    expect(JSON.stringify(doc)).not.toContain('محمود');
    expect(doc.days[0]).toEqual({ title: 'اليوم 1 — بوش', exercises: [{ name: 'بنش برس', sets: 4, reps: '6-8', restSec: 120, rpe: 8, image: 'Bench-0.jpg' }] });
    expect(doc.supplements).toEqual([{ name: 'كرياتين', text: 'بعد التمرين' }]);
    expect(doc.updatedAt).toBe(1_700_000_000);
  });

  it('maps meals and drops empty items', () => {
    const mealPlan = { meals: [{ id: 'm', name: 'فطار', time: '09:00', items: [{ recipeId: null, text: 'فول', servings: 1 }, { recipeId: null, text: ' ', servings: 1 }] }] } as unknown as MealPlan;
    const doc = buildShareDocument({
      now: 0,
      trainerName: '',
      color: 'red',
      client: { name: 'علي' },
      program: null,
      exercise: () => ({ name: '', imageFile: null }),
      dayTitle: () => '',
      mealPlan,
      mealItem: (i) => i.text,
      supplements: [],
      notes: 'x',
      checkinsEnabled: false,
    });
    expect(doc.meals).toEqual([{ title: 'فطار', time: '09:00', items: ['فول'] }]);
    expect(doc.brand.color).toBe('#333333');
    expect(doc.programTitle).toBeUndefined();
  });
});

describe('parseCheckin', () => {
  it('accepts a valid check-in and rejects out-of-range values', () => {
    expect(parseCheckin({ v: 1, kind: 'checkin', createdAt: 1_700_000_000, weightKg: 80.5, notes: 'تمام' })).toEqual({ v: 1, kind: 'checkin', createdAt: 1_700_000_000, weightKg: 80.5, notes: 'تمام' });
    expect(parseCheckin({ v: 1, kind: 'checkin', createdAt: 1, weightKg: 5 })).toBeNull();
    expect(parseCheckin({ v: 1, kind: 'checkin', createdAt: 1, photo: 'data:text/html;base64,AA' })).toBeNull();
    expect(parseCheckin(null)).toBeNull();
  });
});
