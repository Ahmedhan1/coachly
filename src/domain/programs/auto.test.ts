import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogFromPack, type CatalogExercise, type ExercisePack } from '../exercises';
import { jointStressOf } from '../exercises/fit';
import type { Client } from '../models';
import { autoProgram, autoSplit, autoPrescription, exerciseCount } from './auto';
import { clientNoteText, fitProfileOf, mergeItemNotes } from './tailor';

const pack = JSON.parse(readFileSync('public/exercise-pack/exercises.json', 'utf8')) as ExercisePack;
const catalog = catalogFromPack(pack, '');
const byId = new Map(catalog.map((e) => [e.id, e]));

let n = 0;
const newId = () => `id${++n}` as never;
const opts = { name: 'برنامج', dayName: (key: string) => key, newId, clientId: null };
const exercisesOf = (body: ReturnType<typeof autoProgram>): CatalogExercise[] =>
  body.days.flatMap((d) => d.items.map((i) => byId.get(i.exerciseId) as CatalogExercise));

describe('autoSplit', () => {
  it('picks the split from sessions per week and level', () => {
    expect(autoSplit(undefined, undefined)).toEqual(['full_a', 'full_b', 'full_c']);
    expect(autoSplit(2, 'advanced')).toEqual(['full_a', 'full_b']);
    expect(autoSplit(3, 'beginner')).toEqual(['full_a', 'full_b', 'full_c']);
    expect(autoSplit(3, 'intermediate')).toEqual(['push', 'pull', 'legs']);
    expect(autoSplit(4, 'beginner')).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect(autoSplit(5, 'advanced')).toEqual(['push', 'pull', 'legs', 'upper', 'lower']);
    expect(autoSplit(7, 'advanced')).toHaveLength(6);
    expect(autoSplit(1, 'beginner')).toEqual(['full_a']);
  });
});

describe('prescription', () => {
  it('sets/reps/rest follow the goal; beginners do at most 3 sets', () => {
    expect(autoPrescription('strength', 'advanced', true)).toEqual({ sets: 5, reps: '4-6', restSec: 180 });
    expect(autoPrescription('strength', 'beginner', true).sets).toBe(3);
    expect(autoPrescription('fat_loss', 'intermediate', false)).toEqual({ sets: 3, reps: '15', restSec: 45 });
    expect(autoPrescription(undefined, undefined, true)).toEqual({ sets: 4, reps: '8-10', restSec: 120 });
  });
  it('exercise count follows session length', () => {
    expect(exerciseCount(undefined)).toBe(6);
    expect(exerciseCount(30)).toBe(3);
    expect(exerciseCount(90)).toBe(8);
  });
});

describe('autoProgram', () => {
  it('a home client with dumbbells and a knee injury gets no barbell, no jumps, nothing hard on the knee', () => {
    const body = autoProgram({ place: 'home', homeEquipment: ['dumbbell'], injuredJoints: ['knee'], level: 'beginner', sessionsPerWeek: 3, emphasis: 'fat_loss' }, catalog, opts);
    expect(body.days).toHaveLength(3);
    const all = exercisesOf(body);
    expect(all.length).toBeGreaterThanOrEqual(12);
    for (const e of all) {
      // 'other' (a mat, a step…) only when the catalog marks it doable at home.
      if (e.equipment === 'other') expect(e.homeFriendly).toBe(true);
      else expect(['dumbbell', 'body_only']).toContain(e.equipment);
      expect(e.category).not.toBe('plyometrics');
      expect(e.nameEn).not.toMatch(/jump|hop|barbell/i);
      expect(jointStressOf(e).knee ?? 'low').not.toBe('high');
    }
    for (const d of body.days) expect(new Set(d.items.map((i) => i.exerciseId)).size).toBe(d.items.length);
    expect(body.days[0]?.items[0]).toMatchObject({ sets: 3, reps: '12-15', restSec: 60 });
  });

  it('is deterministic and honours favourites and avoided exercises', () => {
    const profile = { place: 'gym' as const, level: 'intermediate' as const, sessionsPerWeek: 4, favouriteIds: ['Dumbbell_Bicep_Curl'], avoidIds: ['Barbell_Squat'] };
    const a = autoProgram(profile, catalog, opts);
    const b = autoProgram(profile, catalog, opts);
    const ids = (x: typeof a) => x.days.map((d) => d.items.map((i) => i.exerciseId));
    expect(ids(a)).toEqual(ids(b));
    const flat = ids(a).flat();
    expect(flat).toContain('Dumbbell_Bicep_Curl');
    expect(flat).not.toContain('Barbell_Squat');
    expect(a.days.map((d) => d.name)).toEqual(['upper', 'lower', 'upper', 'lower']);
    // The second upper day is not a copy of the first.
    expect(ids(a)[2]).not.toEqual(ids(a)[0]);
  });

  it('a shoulder injury keeps overhead pressing out', () => {
    const body = autoProgram({ place: 'gym', injuredJoints: ['shoulder'], sessionsPerWeek: 3, level: 'advanced' }, catalog, opts);
    for (const e of exercisesOf(body)) expect(jointStressOf(e).shoulder ?? 'low').not.toBe('high');
  });

  it('rehab avoids even medium stress on the injured joint', () => {
    const body = autoProgram({ place: 'gym', injuredJoints: ['lower_back'], emphasis: 'rehab', sessionsPerWeek: 2 }, catalog, opts);
    for (const e of exercisesOf(body)) expect(jointStressOf(e).lower_back ?? 'low').toBe('low');
    expect(body.days[0]?.items[0]?.sets).toBe(2);
  });
});

describe('tailor helpers', () => {
  const client = { injuries: ['خشونة ركبة'], trainingProfile: { place: 'home', homeEquipment: ['bands'], injuredJoints: ['shoulder'] } } as unknown as Client;
  it('fitProfileOf merges the profile joints and the old injuries text', () => {
    expect(fitProfileOf(client).injuredJoints).toEqual(['knee', 'shoulder']);
    expect(fitProfileOf({ injuries: [] } as unknown as Client)).toEqual({ injuredJoints: [] });
  });
  it('clientNoteText and mergeItemNotes', () => {
    expect(clientNoteText(undefined, 'kg')).toBe('');
    expect(clientNoteText({ note: 'ركز على الجلوتس', maxKg: 20 }, 'كجم')).toBe('ركز على الجلوتس · ≤ 20 كجم');
    expect(clientNoteText({ note: '', maxKg: null }, 'kg')).toBe('');
    expect(mergeItemNotes('3 ثواني نزول', 'ركبة')).toBe('3 ثواني نزول\nركبة');
    expect(mergeItemNotes('', 'ركبة')).toBe('ركبة');
    expect(mergeItemNotes('a', 'a')).toBe('a');
  });
});
