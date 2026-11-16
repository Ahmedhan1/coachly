import type { ShareDocument } from '../src/share/document';

/** A realistic client-page document (also used by test-browser/viewer.test.mjs). */
export const SAMPLE_DOCUMENT: ShareDocument = {
  v: 1,
  updatedAt: 1_790_000_000,
  brand: { name: 'كابتن سارة فيتنس', color: '#C81E3A' },
  client: { firstName: 'نورهان' },
  programTitle: 'برنامج 3 أيام',
  days: [
    {
      title: 'اليوم 1 — بوش',
      exercises: [
        { name: 'بنش برس', sets: 4, reps: '8-10', restSec: 90, tempo: '3-1-1', rpe: 8, image: 'Barbell_Bench_Press_-_Medium_Grip-0.webp' },
        { name: 'دامبل شولدر برس', sets: 3, reps: '12', restSec: 60, notes: 'خلي ضهرك ثابت على الكرسي' },
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
};
