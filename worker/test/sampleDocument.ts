import type { ShareDocument } from '../src/share/document';

/** A realistic client-page document (also used by test-browser/viewer.test.mjs). */
export const SAMPLE_DOCUMENT: ShareDocument = {
  v: 1,
  updatedAt: 1_790_000_000,
  brand: { name: 'كابتن سارة فيتنس', color: '#C81E3A', logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABz0lEQVR42u2dUVICMRBEky7OIceQ0vNryTHkIvjvh0Uwk57ZvP6G3aRfeiYsFGkNIYTQrupVBvr18nYffc/l9tkBsMjsqlD6DqZnhtF3Mz0bjL678W4QHeO9IDrGe0EI873jF+Z759Ex3luShPne+QnzvfMU5nvnK8z3zluY752/MN8LQZjvhSDM90IQtnklVr83BcJ8LwRhvhfCyTXA1++Ph197Pb+nv09oD2D1x6WAXVD2XRCrPzYFJCBzAlj98SkgAdU+CaNFACg/a8oQCaAEAYDyYyxDJIASBAAEAADQgE2N+FRh0CNfqlCCEAAAgAAAAAQAACAAAAABILNKPIpY9dvQFAmo8DdflfXbX0oQPQAACAAAoBEbGjAJoAQhjcQFzS0/JIAShPRMbNCc8kMCKpQgUhC3+klAlSZMCmJWf2sD/5zLj3ZjAGjmxdC4X4q4KOY/7pMiL475fBI+xi6IFMT5opU3w/zJJQgI//dBzpvvbv60JrwrhBnzVqbB7Gb+9G3oLhBmzlOZB3d081sLPknvSA/wohaWKg76KOYveRRRHUL0+DlN1bxwOE/YnFhO1DaXSs6UNytlg4yEkW1TUGaH8gwUntYihNCf+gHbTeOGlKMNvAAAAABJRU5ErkJggg==' },
  client: { firstName: 'نورهان' },
  programTitle: 'برنامج 3 أيام',
  days: [
    {
      title: 'اليوم 1 — بوش',
      exercises: [
        { name: 'بنش برس', sets: 4, reps: '8-10', restSec: 90, tempo: '3-1-1', rpe: 8, image: 'Barbell_Bench_Press_-_Medium_Grip-0.webp' },
        { name: 'دامبل شولدر برس', sets: 3, reps: '12', restSec: 60, notes: 'خلي ضهرك ثابت على الكرسي', group: 'A' },
        { name: 'لاترال رايز', sets: 3, reps: '15', restSec: 60, image: 'Side_Lateral_Raise-0.webp', image2: 'Side_Lateral_Raise-1.webp', group: 'A' },
      ],
    },
    { title: 'اليوم 2 — ليجز', exercises: [{ name: 'هيب ثرست', sets: 4, reps: '10', rpe: 7.5 }] },
  ],
  meals: [
    { title: 'الفطار', time: '9:00', items: ['3 بيض', 'عيش بلدي', 'خيار'] },
    { title: 'الغدا', items: ['200 جم فراخ', 'رز'], notes: 'اشرب مية كتير' },
  ],
  supplements: [{ name: 'واي بروتين', text: 'سكوب بعد التمرين زي ما اتفقنا' }],
  notes: 'التزم بالنوم 7 ساعات.\nكلمني لو حسيت بأي ألم.',
  checkinsEnabled: true,
  goal: { title: 'خسارة دهون', note: 'ننزل 6 كيلو قبل الصيف ونحافظ على العضل' },
  targets: { kcal: 1650, proteinG: 130, carbG: 150, fatG: 55, waterMinMl: 2500, waterMaxMl: 3200 },
  mealDays: [
    {
      title: 'اليوم 1',
      kcal: 1650,
      meals: [
        { title: 'الفطار', time: '9:00', items: ['3 بيض', 'عيش بلدي', 'خيار'] },
        { title: 'الغدا', items: ['200 جم فراخ', 'رز'], notes: 'اشرب مية كتير', options: [{ items: ['250 جم سمك بلطي', 'رز'] }, { items: ['180 جم كفتة', 'بطاطس'] }] },
      ],
    },
    { title: 'اليوم 2', meals: [{ title: 'الفطار', items: ['زبادي يوناني', 'شوفان'] }] },
  ],
  progress: [
    {
      key: 'weight',
      points: [
        { d: '2026-08-01', v: 78 },
        { d: '2026-08-15', v: 76.8 },
        { d: '2026-09-01', v: 75.5 },
        { d: '2026-09-15', v: 74.9 },
        { d: '2026-10-01', v: 73.6 },
      ],
    },
    { key: 'waist', points: [{ d: '2026-08-01', v: 86 }, { d: '2026-10-01', v: 81 }] },
  ],
  records: [{ name: 'هيب ثرست', weightKg: 80, reps: 8, d: '2026-09-20' }],
  sessions: [{ at: 4_102_444_800, durationMin: 60 }],
  package: { left: 5, total: 12, endDate: '2026-12-31' },
  attended: 7,
  nextDay: 1,
  streakWeeks: 4,
  startDate: '2026-08-01',
  checkins: [
    { d: '2026-10-01', weightKg: 73.6, waistCm: 81 },
    { d: '2026-09-15', weightKg: 74.9 },
    { d: '2026-09-01', weightKg: 75.5 },
    { d: '2026-08-15', weightKg: 76.8 },
  ],
};
