import { describe, expect, it } from 'vitest';
import { buildShareDocument, parseCheckin } from './document';
import { bestLifts, nextProgramDay, shareExtras } from './extras';
import type { MealPlan, Program, ProgressEntry, Session, WorkoutLog } from '../models';
// The live Worker's own guard (pure TypeScript, no Worker APIs).
import { parseShareDocument as parseWorkerDoc } from '../../../worker/src/share/document';

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

describe('meal options for the client to pick', () => {
  it('carries up to 3 options per meal; the Worker accepts them; old documents (no options) still pass', () => {
    const item = (text: string) => ({ recipeId: null, text, servings: 1 });
    const mealPlan = {
      meals: [{ id: 'm', name: 'غدا', time: '14:00', items: [item('فراخ ورز')], options: [{ items: [item('سمك ورز')] }, { items: [item('كفتة وبطاطس')] }, { items: [item('تونة')] }, { items: [item('زيادة')] }] }],
    } as unknown as MealPlan;
    const doc = buildShareDocument({
      now: 0,
      trainerName: 'x',
      color: '#F25C1F',
      client: { name: 'علي' },
      program: null,
      exercise: () => ({ name: '', imageFile: null }),
      dayTitle: () => '',
      mealPlan,
      mealItem: (i) => i.text,
      supplements: [],
      notes: '',
      checkinsEnabled: false,
    });
    expect(doc.meals[0]?.options).toEqual([{ items: ['سمك ورز'] }, { items: ['كفتة وبطاطس'] }, { items: ['تونة'] }]);
    expect(parseWorkerDoc(doc)).not.toBeNull();
    const old = { ...doc, meals: [{ title: 'غدا', items: ['فراخ ورز'] }] };
    expect(parseWorkerDoc(old)).not.toBeNull();
    const bad = { ...doc, meals: [{ title: 'غدا', items: ['x'], options: [{ items: 'nope' }] }] };
    expect(parseWorkerDoc(bad)).toBeNull();
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

describe('shareExtras (progress, sessions, targets for the client page)', () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 10, 17, 10); // Tue 17 Nov 2026
  const entry = (date: string, m: Record<string, number>, source: 'trainer' | 'client' = 'trainer', deletedAt: number | null = null) =>
    ({ id: date, clientId: 'c', date, measurements: m, photoIds: [], notes: '', source, deletedAt }) as unknown as ProgressEntry;
  const session = (startsAt: number, attendance: Session['attendance']) =>
    ({ id: String(startsAt), clientId: 'c', startsAt, durationMin: 60, attendance, deletedAt: null }) as unknown as Session;

  it('builds measurement series oldest first, skipping deleted entries', () => {
    const x = shareExtras({
      now,
      progress: [entry('2026-11-01', { weightKg: 78, waistCm: 90 }), entry('2026-10-01', { weightKg: 80 }), entry('2026-10-15', { weightKg: 99 }, 'trainer', 1)],
      sessions: [],
    });
    expect(x.progress).toEqual([
      { key: 'weight', points: [{ d: '2026-10-01', v: 80 }, { d: '2026-11-01', v: 78 }] },
      { key: 'waist', points: [{ d: '2026-11-01', v: 90 }] },
    ]);
    expect(x.startDate).toBe('2026-10-01');
  });

  it('lists upcoming sessions, counts attendance and the weekly streak', () => {
    const x = shareExtras({
      now,
      progress: [],
      sessions: [
        session(now - 1 * DAY, 'attended'),
        session(now - 8 * DAY, 'attended'),
        session(now - 15 * DAY, 'attended'),
        session(now - 29 * DAY, 'attended'),
        session(now - 3 * DAY, 'missed'),
        session(now + 2 * DAY, 'scheduled'),
        session(now + 1 * DAY, 'cancelled'),
      ],
    });
    expect(x.sessions).toEqual([{ at: Math.floor((now + 2 * DAY) / 1000), durationMin: 60 }]);
    expect(x.attended).toBe(4);
    expect(x.streakWeeks).toBe(3);
  });

  it('check-in history: client entries, newest first, at most 12', () => {
    const list = Array.from({ length: 15 }, (_, i) => entry(`2026-0${1 + Math.floor(i / 2)}-1${i % 2}`, { weightKg: 80 - i }, 'client'));
    const x = shareExtras({ now, progress: [...list, entry('2026-11-01', { weightKg: 70 })], sessions: [] });
    expect(x.checkins).toHaveLength(12);
    expect(x.checkins?.[0]).toEqual({ d: '2026-08-10', weightKg: 66 });
  });

  it('next program day follows the last logged day', () => {
    const p = { id: 'p1', days: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } as unknown as Program;
    const logs = [{ programId: 'p1', programDayId: 'b', date: '2026-11-10', deletedAt: null }, { programId: 'p1', programDayId: 'c', date: '2026-11-03', deletedAt: null }] as unknown as WorkoutLog[];
    expect(nextProgramDay(p, logs)).toBe(2);
    expect(nextProgramDay(p, [])).toBe(0);
  });

  it('every extra passes the Worker guard together with the document', () => {
    const doc = buildShareDocument({
      now,
      trainerName: 'كوتش',
      color: '#F25C1F',
      client: { name: 'علي' },
      program: null,
      exercise: () => ({ name: '', imageFile: null }),
      dayTitle: () => '',
      mealPlan: null,
      mealItem: () => '',
      supplements: [],
      notes: '',
      checkinsEnabled: true,
      extras: {
        ...shareExtras({ now, progress: [entry('2026-11-01', { weightKg: 78 }, 'client')], sessions: [session(now + DAY, 'scheduled')] }),
        goal: { title: 'تنشيف', note: 'x' },
        targets: { kcal: 1800, proteinG: 150 },
        package: { left: 3, total: 12, endDate: '2026-12-31' },
        nextDay: 0,
      },
    });
    expect(doc.checkins).toHaveLength(1);
    expect(parseWorkerDoc(doc)).not.toBeNull();
  });

  it('check-ins accept sleep, energy 1-5 and adherence %', () => {
    expect(parseCheckin({ v: 1, kind: 'checkin', createdAt: 5, sleepHours: 7.5, energy: 4, adherence: 80 })).toMatchObject({ sleepHours: 7.5, energy: 4, adherence: 80 });
    expect(parseCheckin({ v: 1, kind: 'checkin', createdAt: 5, energy: 6 })).toBeNull();
    expect(parseCheckin({ v: 1, kind: 'checkin', createdAt: 5, adherence: 101 })).toBeNull();
    expect(parseCheckin({ v: 1, kind: 'checkin', createdAt: 5, hipCm: 100, photos: ['data:image/jpeg;base64,AAAA'] })).toMatchObject({ hipCm: 100, photos: ['data:image/jpeg;base64,AAAA'] });
  });
});

describe('bestLifts', () => {
  it('keeps the heaviest done set per exercise, newest first', () => {
    const set = (weightKg: number, reps: number, done = true) => ({ weightKg, reps, done, rpe: null });
    const logs = [
      { date: '2026-10-01', deletedAt: null, exercises: [{ exerciseId: 'squat', sets: [set(60, 8), set(70, 5)] }] },
      { date: '2026-11-01', deletedAt: null, exercises: [{ exerciseId: 'squat', sets: [set(90, 3, false)] }, { exerciseId: 'bench', sets: [set(40, 10)] }] },
    ] as unknown as WorkoutLog[];
    expect(bestLifts(logs, (id) => id.toUpperCase())).toEqual([
      { name: 'BENCH', weightKg: 40, reps: 10, d: '2026-11-01' },
      { name: 'SQUAT', weightKg: 70, reps: 5, d: '2026-10-01' },
    ]);
  });
});

describe('client page language', () => {
  const base = {
    now: 1_700_000_000_000,
    trainerName: 'Coach Ahmed',
    color: '#F25C1F',
    client: { name: 'Sara Mahmoud' },
    program: null,
    exercise: () => ({ name: 'Bench Press', imageFile: null }),
    dayTitle: (i: number) => `Day ${i + 1}`,
    mealPlan: null,
    mealItem: () => '',
    supplements: [],
    notes: '',
    checkinsEnabled: true,
  };
  it('marks an English page and the live Worker still accepts it', () => {
    const doc = buildShareDocument({ ...base, extras: { lang: 'en' } });
    expect(doc.lang).toBe('en');
    expect(parseWorkerDoc(doc)).not.toBeNull();
  });
  it('leaves Arabic pages unmarked and drops unknown languages', () => {
    expect(buildShareDocument({ ...base, extras: {} }).lang).toBeUndefined();
    expect(buildShareDocument({ ...base, extras: { lang: 'fr' as unknown as 'en' } }).lang).toBeUndefined();
  });
});

describe('client page exercise notes', () => {
  it("adds the client's own note to the exercise's notes", () => {
    const program = {
      name: 'برنامج',
      notes: '',
      days: [{ id: 'd', name: '', items: [{ id: 'i', exerciseId: 'Squat', sets: 3, reps: '10', restSec: 60, tempo: '', rpe: null, supersetGroup: null, notes: 'نزول بطيء' }] }],
    } as unknown as Parameters<typeof buildShareDocument>[0]['program'];
    const doc = buildShareDocument({
      now: 1_700_000_000_000,
      trainerName: 'كابتن',
      color: '#F25C1F',
      client: { name: 'سارة' },
      program,
      exercise: () => ({ name: 'سكوات', imageFile: null, note: 'من غير ألم في الركبة' }),
      dayTitle: () => 'اليوم 1',
      mealPlan: null,
      mealItem: () => '',
      supplements: [],
      notes: '',
      checkinsEnabled: false,
    });
    expect(doc.days[0]?.exercises[0]?.notes).toBe('نزول بطيء\nمن غير ألم في الركبة');
  });
});
