import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findForbiddenTerms } from '@/i18n/fitness-terms';
import { EQUIPMENT_IDS, MUSCLE_GROUP_IDS, catalogFromPack, searchExercises, type ExercisePack } from '@/domain/exercises';

const pack = JSON.parse(readFileSync('public/exercise-pack/exercises.json', 'utf8')) as ExercisePack;

describe('the shipped exercise pack (public/exercise-pack/exercises.json)', () => {
  it('every exercise has an Arabic name with no Latin letters, and no two names are alike', () => {
    const seen = new Map<string, string>();
    for (const e of pack.exercises) {
      expect(e.ar, e.id).not.toMatch(/[A-Za-z]/);
      expect(findForbiddenTerms(e.ar), e.id).toEqual([]);
      expect(seen.get(e.ar), `${e.id} has the same name as ${seen.get(e.ar)}`).toBeUndefined();
      seen.set(e.ar, e.id);
    }
  });

  it('every popular exercise has 2-4 cues, and every cue is clean Arabic', () => {
    for (const e of pack.exercises) {
      if (e.popular !== undefined) expect(e.cues?.length ?? 0, `${e.id} needs cues`).toBeGreaterThanOrEqual(2);
      if (e.cues === undefined) continue;
      expect(e.cues.length, e.id).toBeLessThanOrEqual(4);
      for (const cue of e.cues) {
        expect(cue, e.id).not.toMatch(/[A-Za-z]/);
        expect(findForbiddenTerms(cue), `${e.id}: ${cue}`).toEqual([]);
      }
    }
  });

  it('every exercise has a clean English name (no Arabic letters, no dataset noise), and no two are alike', () => {
    const seen = new Map<string, string>();
    for (const e of pack.exercises) {
      expect(e.en.trim(), e.id).not.toBe('');
      expect(e.en, e.id).not.toMatch(/[\u0600-\u06FF]/);
      expect(e.en, e.id).not.toMatch(/Medium Grip| - |^\s|\s$|\s{2}/);
      const key = e.en.toLowerCase();
      expect(seen.get(key), `${e.id} has the same English name as ${seen.get(key)}`).toBeUndefined();
      seen.set(key, e.id);
    }
  });

  it('every exercise with Arabic cues has the same number of short English cues', () => {
    for (const e of pack.exercises) {
      if (e.cues === undefined) {
        expect(e.cuesEn, e.id).toBeUndefined();
        continue;
      }
      expect(e.cuesEn?.length, e.id).toBe(e.cues.length);
      for (const cue of e.cuesEn ?? []) {
        expect(cue, e.id).not.toMatch(/[\u0600-\u06FF]/);
        expect(cue.length, `${e.id}: ${cue}`).toBeLessThanOrEqual(90);
      }
    }
  });

  it('search finds the same exercise by its English or Arabic name', () => {
    const catalog = catalogFromPack(pack, '');
    expect(searchExercises(catalog, 'Romanian Deadlift')[0]?.id).toBe('Romanian_Deadlift');
    expect(searchExercises(catalog, 'رومانيان ديدليفت بالبار')[0]?.id).toBe('Romanian_Deadlift');
    expect(searchExercises(catalog, 'lat pulldown wide').map((e) => e.id)).toContain('Wide-Grip_Lat_Pulldown');
    expect(searchExercises(catalog, 'بنش برس')[0]?.id).toBe('Barbell_Bench_Press_-_Medium_Grip');
    expect(searchExercises(catalog, 'bench press')[0]?.id).toBe('Barbell_Bench_Press_-_Medium_Grip');
  });

  it('popular is a unique 1-based rank (a number, not a flag)', () => {
    const ranks = pack.exercises.flatMap((e) => (e.popular === undefined ? [] : [e.popular]));
    expect(ranks.every((r) => Number.isInteger(r) && r >= 1)).toBe(true);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('muscles and equipment are known ids, and every exercise targets at least one muscle', () => {
    for (const e of pack.exercises) {
      expect(e.primary.length, e.id).toBeGreaterThan(0);
      for (const m of [...e.primary, ...e.secondary]) expect(MUSCLE_GROUP_IDS, e.id).toContain(m);
      expect(EQUIPMENT_IDS, e.id).toContain(e.equipment);
    }
  });

  it('covers the machines, cardio, core, mobility and glute work Egyptian gyms use', () => {
    const ids = new Set(pack.exercises.map((e) => e.id));
    for (const id of [
      'Smith_Machine_Squat', 'Cable_Crossover', 'Butterfly', 'Hack_Squat', 'Leg_Press', 'Seated_Leg_Curl', 'Lying_Leg_Curls',
      'Thigh_Abductor', 'Thigh_Adductor', 'T-Bar_Row_with_Handle', 'pt_Assisted_Pull_Up_Machine', 'pt_Incline_Treadmill_Walk',
      'Recumbent_Bike', 'Elliptical_Trainer', 'Rowing_Stationary', 'Rope_Jumping', 'Plank', 'Dead_Bug', 'Pallof_Press',
      'Barbell_Hip_Thrust', 'pt_Frog_Pump', 'pt_B_Stance_RDL', 'pt_Hip_Thrust_Machine', 'pt_Glute_Kickback_Machine',
    ]) expect(ids.has(id), id).toBe(true);
    expect(pack.exercises.length).toBeGreaterThanOrEqual(950);
  });
});
