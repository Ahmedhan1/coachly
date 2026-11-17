import { describe, expect, it } from 'vitest';
import { mealDraftSchema, mealsFromDraft, parseDraft, programDraftSchema, programFromDraft } from './drafts';
import { toLocalId } from '../programs';

let n = 0;
const newId = () => toLocalId(`id-${++n}`);

describe('AI drafts', () => {
  it('parses a valid program draft and drops unknown exercises', () => {
    const text = JSON.stringify({ name: 'فول بادي', days: [{ name: 'يوم 1', items: [{ exerciseId: 'Bench', sets: 3, reps: '8-10', restSec: 90 }, { exerciseId: 'Nope', sets: 3, reps: '10', restSec: 60 }] }] });
    const draft = parseDraft(programDraftSchema, text);
    expect(draft).not.toBeNull();
    const { body, dropped } = programFromDraft(draft!, { knownIds: new Set(['Bench']), clientId: null, newId });
    expect(dropped).toBe(1);
    expect(body.days[0]?.items).toHaveLength(1);
    expect(body.days[0]?.items[0]).toMatchObject({ exerciseId: 'Bench', sets: 3, reps: '8-10', restSec: 90, rpe: null });
  });

  it('rejects bad JSON and out-of-range values', () => {
    expect(parseDraft(programDraftSchema, 'not json')).toBeNull();
    expect(parseDraft(programDraftSchema, JSON.stringify({ name: 'x', days: [{ name: '', items: [{ exerciseId: 'a', sets: 99, reps: '1', restSec: 1 }] }] }))).toBeNull();
  });

  it('turns a meal draft into free-text meals, dropping invalid times', () => {
    const draft = parseDraft(mealDraftSchema, JSON.stringify({ meals: [{ name: 'فطار', time: '09:00', items: ['فول'] }, { name: 'سناك', time: 'later', items: ['تفاحة'] }], notes: '' }));
    const meals = mealsFromDraft(draft!, () => 'm');
    expect(meals[0]).toMatchObject({ name: 'فطار', time: '09:00', items: [{ recipeId: null, text: 'فول', servings: 1 }] });
    expect(meals[1]?.time).toBeNull();
  });
});
