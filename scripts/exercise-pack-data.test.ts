// Checks the SHIPPED exercise pack (public/exercise-pack/exercises.json) and its photos on disk.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_IDS,
  EQUIPMENT_IDS,
  LEVEL_IDS,
  MUSCLE_GROUP_IDS,
  STRESS_LEVELS,
  type ExercisePack,
} from '../src/domain/exercises/pack';

const root = join(__dirname, '..', 'public', 'exercise-pack');
const pack = JSON.parse(readFileSync(join(root, 'exercises.json'), 'utf8')) as ExercisePack;
const list = pack.exercises;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const dups = (values: string[]) => values.filter((v, i) => values.indexOf(v) !== i);

describe('shipped exercise pack', () => {
  it('has at least 1050 exercises and a correct count', () => {
    expect(list.length).toBeGreaterThanOrEqual(1050);
    expect(pack.count).toBe(list.length);
  });

  it('has no duplicate ids, English names or Arabic names', () => {
    expect(dups(list.map((e) => e.id))).toEqual([]);
    expect(dups(list.map((e) => norm(e.en)))).toEqual([]);
    expect(dups(list.map((e) => norm(e.ar)))).toEqual([]);
  });

  it('gives every exercise an Arabic and an English name', () => {
    const bad = list.filter((e) => e.en.trim() === '' || e.ar.trim() === '' || !/[؀-ۿ]/.test(e.ar));
    expect(bad.map((e) => e.id)).toEqual([]);
  });

  it('uses only known muscles, equipment, levels and categories, with a primary muscle', () => {
    const bad = list.filter(
      (e) =>
        e.primary.length === 0 ||
        ![...e.primary, ...e.secondary].every((m) => (MUSCLE_GROUP_IDS as readonly string[]).includes(m)) ||
        !(EQUIPMENT_IDS as readonly string[]).includes(e.equipment) ||
        !(LEVEL_IDS as readonly string[]).includes(e.level) ||
        !(CATEGORY_IDS as readonly string[]).includes(e.category),
    );
    expect(bad.map((e) => e.id)).toEqual([]);
  });

  it('has every listed photo on disk, each at most 40 KB', () => {
    const missing: string[] = [];
    const big: string[] = [];
    for (const e of list) {
      for (const file of e.images) {
        const path = join(root, pack.image.base, file);
        if (!existsSync(path)) missing.push(file);
        else if (statSync(path).size > 40 * 1024) big.push(file);
      }
    }
    expect(missing).toEqual([]);
    expect(big).toEqual([]);
  });

  it('has joint stress (knee, shoulder, lower back) and homeFriendly on every exercise', () => {
    const levels = STRESS_LEVELS as readonly string[];
    const bad = list.filter(
      (e) =>
        e.jointStress === undefined ||
        !levels.includes(e.jointStress.knee) ||
        !levels.includes(e.jointStress.shoulder) ||
        !levels.includes(e.jointStress.lowerBack) ||
        typeof e.homeFriendly !== 'boolean',
    );
    expect(bad.map((e) => e.id)).toEqual([]);
  });

  it('gives every built-in extra Arabic and English cues', () => {
    const bad = list.filter((e) => e.extra === true && ((e.cues?.length ?? 0) < 2 || (e.cuesEn?.length ?? 0) < 2));
    expect(bad.map((e) => e.id)).toEqual([]);
  });

  it('credits every own (non-dataset) photo of an extra, and suspension exercises are home-friendly', () => {
    const own = list.filter((e) => e.extra === true && e.images.some((f) => f.startsWith(`${e.id}-`)));
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((e) => !e.imageCredit?.includes('CC BY-SA')).map((e) => e.id)).toEqual([]);
    const trx = list.filter((e) => e.equipment === 'suspension');
    expect(trx.length).toBeGreaterThanOrEqual(14);
    expect(trx.filter((e) => e.homeFriendly !== true).map((e) => e.id)).toEqual([]);
  });

  it('keeps a useful spread of joint-friendly and home exercises', () => {
    const gentle = list.filter((e) => e.jointStress?.knee === 'low' && e.jointStress.lowerBack === 'low' && e.category !== 'stretching');
    expect(gentle.length).toBeGreaterThan(200);
    expect(list.filter((e) => e.homeFriendly === true).length).toBeGreaterThan(300);
  });
});
