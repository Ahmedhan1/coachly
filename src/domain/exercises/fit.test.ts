import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogFromPack } from './catalog';
import {
  assessExercise,
  availableEquipment,
  injuredJoints,
  jointStressOf,
  jointsFromText,
  rankForClient,
  saferAlternatives,
  swapChoices,
  type FitProfile,
} from './fit';
import type { ExercisePack } from './pack';
import type { CatalogExercise } from './types';

const pack = JSON.parse(readFileSync('public/exercise-pack/exercises.json', 'utf8')) as ExercisePack;
const catalog = catalogFromPack(pack, '');
const byId = new Map(catalog.map((e) => [e.id, e]));
const get = (id: string): CatalogExercise => {
  const e = byId.get(id);
  if (!e) throw new Error(`missing ${id}`);
  return e;
};

const ex = (over: Partial<CatalogExercise> & { id: string }): CatalogExercise => ({
  nameEn: over.id,
  nameAr: over.id,
  primaryMuscles: ['quads'],
  secondaryMuscles: [],
  equipment: 'body_only',
  level: 'beginner',
  category: 'strength',
  force: 'push',
  mechanic: 'compound',
  images: [],
  isCustom: false,
  ...over,
});

describe('jointsFromText', () => {
  it('reads Arabic and English injury notes', () => {
    expect(jointsFromText(['خشونة في الركبة', 'Shoulder impingement', 'ديسك'])).toEqual(['knee', 'shoulder', 'lower_back']);
    expect(jointsFromText(['التواء الكاحل', 'وجع الكوع', 'رسغ', 'رقبة', 'الحوض'])).toEqual(['wrist', 'elbow', 'neck', 'hip', 'ankle']);
    expect(jointsFromText(['حساسية من اللاكتوز'])).toEqual([]);
  });
  it('merges profile joints with the old free-text injuries, no duplicates', () => {
    expect(injuredJoints({ injuredJoints: ['knee'] }, ['ركبة شمال', 'الظهر'])).toEqual(['knee', 'lower_back']);
  });
});

describe('jointStressOf', () => {
  it('rates jumps and barbell squats hard on the knee', () => {
    expect(jointStressOf(get('Barbell_Squat')).knee).toBe('high');
    const jump = catalog.find((e) => e.category === 'plyometrics' && /jump/i.test(e.nameEn) && e.primaryMuscles.includes('quads'));
    expect(jump && jointStressOf(jump).knee).toBe('high');
    expect(jointStressOf(get('Lying_Leg_Curls')).knee ?? 'low').not.toBe('high');
  });
  it('rates deadlifts hard on the lower back and overhead presses hard on the shoulder', () => {
    expect(jointStressOf(get('Barbell_Deadlift')).lower_back).toBe('high');
    expect(jointStressOf(get('Standing_Military_Press')).shoulder).toBe('high');
    expect(jointStressOf(get('Seated_Cable_Rows')).shoulder ?? 'low').not.toBe('high');
  });
  it('uses the catalog hints when present (lowerBack → lower_back), rules fill the other joints', () => {
    const hinted = { ...get('Barbell_Squat'), jointStress: { knee: 'low', shoulder: 'low', lowerBack: 'medium' } } as CatalogExercise;
    const s = jointStressOf(hinted);
    expect(s.knee).toBe('low');
    expect(s.lower_back).toBe('medium');
  });
});

describe('availableEquipment', () => {
  it('gym or unknown place = everything; home = body weight + what the client owns', () => {
    expect(availableEquipment({})).toBeNull();
    expect(availableEquipment({ place: 'gym' })).toBeNull();
    expect(availableEquipment({ place: 'both', homeEquipment: [] })).toBeNull();
    expect([...(availableEquipment({ place: 'home', homeEquipment: ['dumbbell'] }) ?? [])].sort()).toEqual(['body_only', 'dumbbell']);
  });
});

describe('assessExercise', () => {
  const homeKnee: FitProfile = { place: 'home', homeEquipment: ['dumbbell'], injuredJoints: ['knee'], level: 'beginner' };
  it('flags missing equipment, injured joints, level and avoided/favourite lists', () => {
    const squat = assessExercise(get('Barbell_Squat'), homeKnee);
    expect(squat.available).toBe(false);
    expect(squat.risks).toEqual([{ joint: 'knee', stress: 'high' }]);
    const fit = assessExercise(get('Dumbbell_Bicep_Curl'), { ...homeKnee, favouriteIds: ['Dumbbell_Bicep_Curl'] });
    expect(fit).toMatchObject({ available: true, risks: [], favourite: true, avoided: false });
    expect(assessExercise(get('Dumbbell_Bicep_Curl'), { avoidIds: ['Dumbbell_Bicep_Curl'] }).avoided).toBe(true);
    expect(assessExercise(ex({ id: 'x', level: 'expert' }), { level: 'beginner' }).levelOk).toBe(false);
    expect(assessExercise(ex({ id: 'x', level: 'expert' }), { level: 'advanced' }).levelOk).toBe(true);
  });
  it('homeFriendly hint lets "other" equipment through at home, and false blocks a body-weight move', () => {
    const p: FitProfile = { place: 'home', homeEquipment: [] };
    expect(assessExercise({ ...ex({ id: 'o', equipment: 'other' }), homeFriendly: true } as CatalogExercise, p).available).toBe(true);
    expect(assessExercise(ex({ id: 'o', equipment: 'other' }), p).available).toBe(false);
    expect(assessExercise({ ...ex({ id: 'b' }), homeFriendly: false } as CatalogExercise, p).available).toBe(false);
    // Without a hint, a body-weight move that needs a bar is not counted as doable at home.
    expect(assessExercise(ex({ id: 'p', nameEn: 'Pull-Up' }), p).available).toBe(false);
    expect(assessExercise(ex({ id: 'p', nameEn: 'Pull-Up' }), { place: 'gym' }).available).toBe(true);
  });
});

describe('rankForClient', () => {
  it('hides avoided and unavailable, puts favourites first, risky ones last (still listed, flagged)', () => {
    const list = [
      ex({ id: 'jump', category: 'plyometrics', nameEn: 'Jump Squat' }),
      ex({ id: 'plain', primaryMuscles: ['chest'] }),
      ex({ id: 'fav', primaryMuscles: ['chest'] }),
      ex({ id: 'bar', equipment: 'barbell' }),
      ex({ id: 'no', primaryMuscles: ['chest'] }),
    ];
    const ranked = rankForClient(list, { place: 'home', injuredJoints: ['knee'], favouriteIds: ['fav'], avoidIds: ['no'] });
    expect(ranked.map((r) => r.exercise.id)).toEqual(['fav', 'plain', 'jump']);
    expect(ranked[2]?.fit.risks[0]).toEqual({ joint: 'knee', stress: 'high' });
  });
  it('is deterministic', () => {
    const p: FitProfile = { place: 'gym', level: 'intermediate', injuredJoints: ['shoulder'] };
    expect(rankForClient(catalog, p).slice(0, 30).map((r) => r.exercise.id)).toEqual(rankForClient(catalog, p).slice(0, 30).map((r) => r.exercise.id));
  });
});

describe('saferAlternatives', () => {
  it('offers same-muscle moves with less knee stress the client can do at home', () => {
    const p: FitProfile = { place: 'home', homeEquipment: ['dumbbell'], injuredJoints: ['knee'] };
    const alts = saferAlternatives(get('Barbell_Squat'), catalog, p, 5);
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) {
      expect(['dumbbell', 'body_only']).toContain(a.equipment);
      expect(a.primaryMuscles).toContain('quads');
      expect(a.category).not.toBe('stretching');
      expect(jointStressOf(a).knee ?? 'low').not.toBe('high');
    }
  });
});

describe('swapChoices', () => {
  it('filters the usual alternatives by the profile and keeps the old list without one', () => {
    const plain = swapChoices(get('Barbell_Squat'), catalog, null, 8);
    expect(plain.length).toBe(8);
    const p: FitProfile = { place: 'home', homeEquipment: ['dumbbell'], injuredJoints: ['knee'], avoidIds: [] };
    const tailored = swapChoices(get('Barbell_Squat'), catalog, p, 8);
    expect(tailored.length).toBeGreaterThan(0);
    for (const a of tailored) {
      expect(['dumbbell', 'body_only']).toContain(a.equipment);
      expect(jointStressOf(a).knee ?? 'low').not.toBe('high');
    }
  });
});
