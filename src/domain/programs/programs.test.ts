import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogById, catalogFromPack, type ExercisePack } from '../exercises';
import { programSchema, type ExerciseId, type ProgramDay, type ProgramItem } from '../models';
import {
  localizeTemplateDayName,
  BUILTIN_TEMPLATES,
  addDay,
  addItem,
  copyProgramToClient,
  copyWeek,
  dayBlocks,
  displayReps,
  duplicateDay,
  estimateDayMinutes,
  formatReps,
  instantiateTemplate,
  linkSuperset,
  moveItem,
  normalizeSupersets,
  normalizeTempo,
  parseReps,
  removeItem,
  reorderItems,
  restoreItem,
  saveAsTemplate,
  supersetTags,
  targetReps,
  templateExerciseIds,
  toLocalId,
  unlinkFromSuperset,
  ungroupSuperset,
  updateItem,
  weekMuscleLoad,
  weeklySetsPerMuscle,
  dayPrimaryMuscles,
  type ProgramBody,
} from '.';

const pack = JSON.parse(readFileSync(new URL('../../../public/exercise-pack/exercises.json', import.meta.url), 'utf8')) as ExercisePack;
const catalog = catalogById(catalogFromPack(pack, '/exercise-pack/'));

function ids(prefix = 'id') {
  let n = 0;
  return () => toLocalId(`${prefix}${++n}`);
}

const item = (id: string, group: string | null = null, sets = 3): ProgramItem => ({
  id: toLocalId(id),
  exerciseId: 'Barbell_Squat' as ExerciseId,
  sets,
  reps: '10',
  restSec: 90,
  tempo: '',
  rpe: null,
  supersetGroup: group,
  notes: '',
});

const day = (items: ProgramItem[], id = 'd1'): ProgramDay => ({ id: toLocalId(id), name: 'يوم', items });
const body = (days: ProgramDay[]): ProgramBody => ({ name: 'برنامج', clientId: null, isTemplate: false, days, notes: '' });
const order = (b: ProgramBody, dayIndex = 0) => b.days[dayIndex]?.items.map((i) => `${i.id}${i.supersetGroup ?? ''}`).join(' ');

const meta = { id: 'p1', createdAt: 1, updatedAt: 1, deletedAt: null, demo: false };

describe('built-in templates', () => {
  it('every exercise id exists in the bundled pack', () => {
    const missing = templateExerciseIds().filter((id) => !catalog.has(id));
    expect(missing).toEqual([]);
  });

  it.each(BUILTIN_TEMPLATES.map((tpl) => [tpl.id, tpl] as const))('%s instantiates into a valid Program', (_id, tpl) => {
    const program = instantiateTemplate(tpl, { name: 'قالب', dayName: (key) => key, newId: ids() });
    expect(() => programSchema.parse({ ...program, ...meta })).not.toThrow();
    expect(program.days.length).toBe(tpl.days.length);
    const allIds = program.days.flatMap((d) => [d.id, ...d.items.map((i) => i.id)]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('covers push/pull/legs, upper/lower and full body with supersets', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.id)).toEqual(['ppl', 'upper_lower', 'full_body']);
    const ppl = instantiateTemplate(BUILTIN_TEMPLATES[0]!, { name: 'x', dayName: (k) => k, newId: ids() });
    expect(ppl.days.map((d) => d.name)).toEqual(['push', 'pull', 'legs']);
    expect([...supersetTags(ppl.days[0]!.items).values()]).toEqual(['A1', 'A2']);
  });
});

describe('reps and tempo', () => {
  it('parses single, range and free text', () => {
    expect(parseReps('10')).toEqual({ kind: 'single', value: 10 });
    expect(parseReps('10-8')).toEqual({ kind: 'range', min: 8, max: 10 });
    expect(parseReps(' 8 – 10 ')).toEqual({ kind: 'range', min: 8, max: 10 });
    expect(parseReps('AMRAP')).toEqual({ kind: 'text', text: 'AMRAP' });
    expect(formatReps({ kind: 'range', min: 8, max: 10 })).toBe('8-10');
    expect(displayReps('8-10')).toBe('8–10');
    expect(targetReps('8-10')).toBe(10);
    expect(targetReps('30s')).toBeNull();
  });
  it('normalises tempo', () => {
    expect(normalizeTempo('3110')).toBe('3-1-1-0');
    expect(normalizeTempo('3-1-x-0')).toBe('3-1-X-0');
    expect(normalizeTempo(' ')).toBe('');
  });
});

describe('supersets', () => {
  it('normalise: contiguous runs relabelled A, B; singletons cleared', () => {
    const items = normalizeSupersets([item('a', 'Z'), item('b', 'Z'), item('c', 'Q'), item('d', 'Y'), item('e', 'Y')]);
    expect(items.map((i) => i.supersetGroup)).toEqual(['A', 'A', null, 'B', 'B']);
  });

  it('link moves selected items together at the first one', () => {
    const items = linkSuperset([item('a'), item('b'), item('c'), item('d')], ['b', 'd']);
    expect(items.map((i) => `${i.id}${i.supersetGroup ?? ''}`)).toEqual(['a', 'bA', 'dA', 'c']);
    expect(linkSuperset([item('a')], ['a']).map((i) => i.supersetGroup)).toEqual([null]);
  });

  it('unlink keeps the remaining members grouped; ungroup breaks the group', () => {
    const three = normalizeSupersets([item('a', 'A'), item('b', 'A'), item('c', 'A'), item('d')]);
    expect(unlinkFromSuperset(three, 'a').map((i) => `${i.id}${i.supersetGroup ?? ''}`)).toEqual(['bA', 'cA', 'a', 'd']);
    const two = normalizeSupersets([item('a', 'A'), item('b', 'A')]);
    expect(unlinkFromSuperset(two, 'a').map((i) => i.supersetGroup)).toEqual([null, null]);
    expect(ungroupSuperset(three, 'b').every((i) => i.supersetGroup === null)).toBe(true);
  });

  it('day blocks give A1/A2 tags', () => {
    const blocks = dayBlocks([item('a'), item('b', 'A'), item('c', 'A'), item('d', 'B'), item('e', 'B')]);
    expect(blocks.map((b) => (b.kind === 'single' ? b.item.id : b.tags.join('+')))).toEqual(['a', 'A1+A2', 'B1+B2']);
  });
});

describe('reorder', () => {
  const b = body([day(normalizeSupersets([item('a'), item('b', 'A'), item('c', 'A'), item('d')]))]);
  it('moves an item to the drop target', () => {
    expect(order(reorderItems(b, 'd1', 'd', 'a'))).toBe('d a bA cA');
  });
  it('a superset member dragged away leaves the group', () => {
    expect(order(reorderItems(b, 'd1', 'b', 'd'))).toBe('a c d b');
  });
  it('an item dropped inside a superset joins it', () => {
    const four = body([day(normalizeSupersets([item('a'), item('b', 'A'), item('c', 'A')]))]);
    expect(order(reorderItems(four, 'd1', 'a', 'b'))).toBe('bA aA cA');
  });
  it('members can swap inside their group', () => {
    expect(order(reorderItems(b, 'd1', 'b', 'c'))).toBe('a cA bA d');
  });
  it('keyboard move up/down', () => {
    expect(order(moveItem(b, 'd1', 'd', -1))).toBe('a d bA cA'); // hops over the whole superset
    expect(order(moveItem(b, 'd1', 'a', 1))).toBe('bA cA a d');
    expect(order(moveItem(b, 'd1', 'b', 1))).toBe('a cA bA d'); // swaps inside the group
    expect(order(moveItem(b, 'd1', 'c', 1))).toBe('a b c d'); // leaves the group at its edge
    expect(order(moveItem(b, 'd1', 'a', -1))).toBe(order(b));
  });
});

describe('editing', () => {
  it('add, update, remove with undo', () => {
    const start = body([day([])]);
    const added = addItem(start, 'd1', 'Leg_Press' as ExerciseId, ids('n'));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const updated = updateItem(added.value.body, 'd1', added.value.itemId, { sets: 4, reps: '8-10' });
    expect(updated.days[0]?.items[0]).toMatchObject({ sets: 4, reps: '8-10', exerciseId: 'Leg_Press' });
    const removed = removeItem(updated, 'd1', added.value.itemId);
    expect(removed.body.days[0]?.items).toEqual([]);
    const restored = restoreItem(removed.body, 'd1', removed.removed!, removed.index);
    expect(restored.days[0]?.items).toEqual(updated.days[0]?.items);
  });

  it('day limit is enforced', () => {
    let b = body([]);
    const newId = ids();
    for (let i = 0; i < 14; i++) {
      const r = addDay(b, `d${i}`, newId);
      if (r.ok) b = r.value.body;
    }
    expect(addDay(b, 'x', newId)).toEqual({ ok: false, error: 'too_many_days' });
  });

  it('duplicate day inserts a fresh copy after it', () => {
    const b = body([day([item('a', 'A'), item('b', 'A')], 'd1'), day([item('c')], 'd2')]);
    const r = duplicateDay(b, 'd1', ids('n'));
    expect(r.ok && r.value.body.days.map((d) => d.id)).toEqual(['d1', 'n1', 'd2']);
    expect(r.ok && r.value.body.days[1]?.items.map((i) => `${i.id}${i.supersetGroup}`)).toEqual(['n2A', 'n3A']);
  });

  it('copy week appends renamed copies with fresh ids', () => {
    const b = body([day([item('a')], 'd1'), day([item('b')], 'd2')]);
    const r = copyWeek(b, ids('w'), (name, i) => `${name} ${i + 5}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.days.map((d) => d.id)).toEqual(['d1', 'd2', 'w1', 'w3']);
    expect(r.value.days[2]?.name).toBe('يوم 5');
    expect(r.value.days[2]?.items[0]?.exerciseId).toBe('Barbell_Squat');
    const full = body(Array.from({ length: 8 }, (_, i) => day([], `x${i}`)));
    expect(copyWeek(full, ids())).toEqual({ ok: false, error: 'too_many_days' });
  });

  it('copy program client → client gives fresh ids and the new client', () => {
    const source: ProgramBody = { ...body([day([item('a')])]), clientId: 'c1' as ProgramBody['clientId'] };
    const copy = copyProgramToClient(source, 'c2' as NonNullable<ProgramBody['clientId']>, ids('k'));
    expect(copy.clientId).toBe('c2');
    expect(copy.isTemplate).toBe(false);
    expect(copy.days[0]?.id).toBe('k1');
    expect(copy.days[0]?.items[0]?.id).toBe('k2');
    expect(source.days[0]?.id).toBe('d1');
    expect(() => programSchema.parse({ ...copy, ...meta })).not.toThrow();
    const tpl = saveAsTemplate(source, ids('t'));
    expect(tpl).toMatchObject({ clientId: null, isTemplate: true });
  });

  it('estimates minutes with one rest per superset round', () => {
    const single = day([item('a', null, 3)]);
    expect(estimateDayMinutes(single)).toBe(10); // 3 × (40 + 90) = 390 s → 10 min
    const ss = day(normalizeSupersets([item('a', 'A', 3), item('b', 'A', 3)]));
    expect(estimateDayMinutes(ss)).toBe(10); // 3×40 + 3×130 = 510 s → 10 min
    expect(estimateDayMinutes(day([]))).toBe(0);
  });
});

describe('muscle volume', () => {
  const ppl = instantiateTemplate(BUILTIN_TEMPLATES[0]!, { name: 'x', dayName: (k) => k, newId: ids() });
  it('week load covers chest, back and legs', () => {
    const muscles = weekMuscleLoad(ppl, catalog).map((m) => m.muscle);
    expect(muscles).toEqual(expect.arrayContaining(['chest', 'lats', 'quads', 'hamstrings']));
  });
  it('weekly sets per muscle counts direct sets', () => {
    const chest = weeklySetsPerMuscle(ppl, catalog).find((m) => m.muscle === 'chest');
    expect(chest?.direct).toBe(7); // bench 4 + incline 3
  });
  it('day primary muscles', () => {
    expect(dayPrimaryMuscles(ppl.days[2]!, catalog)[0]).toBe('quads');
  });
});

describe('localizeTemplateDayName', () => {
  const labels = { ar: { full: 'فول بادي', push: 'بوش' }, en: { full: 'Full Body', push: 'Push' } };
  it('shows a stored template day name in the app language, either way', () => {
    expect(localizeTemplateDayName('فول بادي', labels, 'en')).toBe('Full Body');
    expect(localizeTemplateDayName('Push', labels, 'ar')).toBe('بوش');
    expect(localizeTemplateDayName('فول بادي', labels, 'ar')).toBe('فول بادي');
  });
  it("keeps the trainer's own day names", () => {
    expect(localizeTemplateDayName('يوم الرجل', labels, 'en')).toBe('يوم الرجل');
    expect(localizeTemplateDayName('', labels, 'en')).toBe('');
  });
});
