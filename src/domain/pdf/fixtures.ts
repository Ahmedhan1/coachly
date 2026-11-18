import {
  clientSchema,
  mealPlanSchema,
  programSchema,
  progressEntrySchema,
  recipeSchema,
  supplementSchema,
  type Client,
  type MealPlan,
  type Program,
  type ProgressEntry,
  type Recipe,
  type Supplement,
} from '../models';
import { PDF_PRESETS } from './presets';
import type { PdfBranding, PdfDocumentInput, PdfExercise, PdfImageRef, PdfLabels } from './types';

/**
 * The five spec test PDFs (docs/SPEC.md "خطة الاختبار"), as pure inputs. Used by the domain tests and by
 * the browser harness (src/services/pdf/harness). Test data only: the app's labels come from src/i18n.
 */
export type PdfTestCaseId = 'no_images' | 'fifty_exercises' | 'long_names' | 'mixed_text' | 'max_branding';
export const PDF_TEST_CASES: readonly PdfTestCaseId[] = ['no_images', 'fifty_exercises', 'long_names', 'mixed_text', 'max_branding'];

export const PDF_TEST_LABELS: PdfLabels = {
  sections: {
    cover: 'الغلاف',
    client_info: 'بيانات العميل',
    program: 'جدول التمارين',
    muscle_map: 'خريطة العضلات',
    nutrition: 'السعرات والماكروز',
    recipes: 'خطة الوجبات',
    supplements: 'المكملات',
    progress: 'التقدم',
    notes: 'تعليمات وملاحظات',
  },
  cover: { client: 'العميل', preparedBy: 'إعداد', date: 'التاريخ', planFor: 'برنامج مخصص لـ', contact: 'للتواصل' },
  client: {
    name: 'الاسم',
    gender: 'النوع',
    genders: { male: 'ذكر', female: 'أنثى' },
    age: 'السن',
    goal: 'الهدف',
    goals: { fat_loss: 'تنشيف', muscle_gain: 'تضخيم', strength: 'قوة', fitness: 'لياقة', rehab: 'تأهيل', other: 'أخرى' },
    goalNote: 'تفاصيل الهدف',
    injuries: 'إصابات',
    measurements: {
      weightKg: 'الوزن',
      heightCm: 'الطول',
      bodyFatPercent: 'نسبة الدهون',
      waistCm: 'الوسط',
      hipCm: 'الهيب',
      chestCm: 'الصدر',
      armCm: 'الدراع',
      thighCm: 'الفخذ',
      neckCm: 'الرقبة',
    },
  },
  nutrition: {
    method: 'طريقة الحساب',
    methods: { mifflin_st_jeor: 'Mifflin-St Jeor', katch_mcardle: 'Katch-McArdle' },
    bmr: 'الأيض الأساسي BMR',
    activityFactor: 'معامل النشاط',
    tdee: 'الاحتياج اليومي TDEE',
    target: 'السعرات المستهدفة',
    adjustment: 'التعديل حسب الهدف',
    protein: 'بروتين',
    carbs: 'كارب',
    fat: 'دهون',
    water: 'المياه',
  },
  program: { sets: 'مجموعات', reps: 'عدات', rest: 'راحة', tempo: 'تمبو', rpe: 'RPE', superset: 'سوبر سِت', notes: 'ملاحظة', setsReps: 'سيتات × عدات', exerciseCount: 'عدد التمارين', exercise: 'التمرين', continued: 'تابع', details: 'تمبو وملاحظات' },
  meals: {
      servings: 'حصة',
      ingredients: 'المكونات',
      perServing: 'للحصة',
      mealTotal: 'الوجبة',
      dailyTotal: 'إجمالي اليوم',
      recipesTitle: 'الوصفات',
      partialTotals: 'الأصناف اللي من غير ماكروز مش محسوبة في الإجمالي.',
      water: 'المياه في اليوم',
    },
  supplements: { dose: 'الجرعة', timing: 'الميعاد' },
  progress: { weightChart: 'الوزن', before: 'قبل', after: 'بعد', first: 'أول قياس', latest: 'آخر قياس', change: 'التغيير', measurement: 'القياس' },
  notes: { contact: 'للتواصل', closing: 'بالتوفيق! أي سؤال أنا معاك.' },
  units: { kg: 'كجم', cm: 'سم', kcal: 'سعرة', g: 'جم', ml: 'مل', sec: 'ث', years: 'سنة', percent: '%' },
};

export const PDF_TEST_DISCLAIMER = 'المحتوى إرشادي من المدرب ولا يغني عن استشارة طبيب.';

const META = { createdAt: 1_763_280_000_000, updatedAt: 1_763_280_000_000, deletedAt: null, demo: false };

/** Images a case may use; the harness maps these ids to real pixels. */
export const FIXTURE_IMAGE_IDS = {
  logo: 'fixture-logo',
  background: 'fixture-background',
  cover: 'fixture-cover',
  before: 'fixture-before',
  after: 'fixture-after',
  recipe: 'fixture-recipe',
  supplement: 'fixture-supplement',
} as const;

const stored = (imageId: string): PdfImageRef => ({ kind: 'stored', imageId });

function branding(id: PdfTestCaseId): PdfBranding {
  const base: PdfBranding = {
    trainerName: 'كابتن سارة حسن',
    logo: stored(FIXTURE_IMAGE_IDS.logo),
    logoPlacement: 'center',
    logoSize: 'medium',
    primaryColor: '#2F6F5E',
    secondaryColor: '#3A3A3C',
    fontFamily: 'Readex Pro',
    background: null,
    coverImage: null,
    footerText: 'برنامج خاص بالعميل — ممنوع النشر',
    contactLines: ['واتساب 01001234567', 'Instagram @coach.sara'],
  };
  if (id === 'no_images') return { ...base, logo: null };
  if (id === 'max_branding') {
    return {
      ...base,
      logoSize: 'large',
      logoPlacement: 'start',
      primaryColor: '#8A1C7C',
      fontFamily: 'Alexandria',
      background: { image: stored(FIXTURE_IMAGE_IDS.background), opacity: 1 },
      coverImage: stored(FIXTURE_IMAGE_IDS.cover),
    };
  }
  return base;
}

const LONG_CLIENT = 'عبد الرحمن محمد عبد العزيز السيد إبراهيم الشناوي المنصوري الإسكندراني الكبير صاحب أطول اسم في الجيم كله';
const LONG_PROGRAM = 'برنامج تضخيم وتقوية متقدم لمدة اثني عشر أسبوعاً مع تركيز على الجلوتس والهامسترينج والكوادز والظهر';

function client(id: PdfTestCaseId): Client {
  return clientSchema.parse({
    id: 'c1',
    name: id === 'long_names' ? LONG_CLIENT.slice(0, 120) : id === 'mixed_text' ? 'Sara سارة Ahmed' : 'سارة أحمد',
    phone: '01001234567',
    gender: 'female',
    birthDate: '1995-03-04',
    goal: 'fat_loss',
    goalNote: id === 'mixed_text' ? 'تنشيف قبل الـ wedding في March' : 'تنشيف 6 كيلو',
    injuries: id === 'long_names' ? ['خشونة بسيطة في الركبة الشمال بعد إصابة قديمة في الملعب', 'ألم أسفل الظهر'] : ['ركبة'],
    measurements: { weightKg: 74.5, heightCm: 165, bodyFatPercent: 31, waistCm: 84, hipCm: 104 },
    package: null,
    startDate: '2026-11-01',
    endDate: '2027-01-31',
    remainingSessions: 10,
    notes: '',
    photoId: null,
    ...META,
  });
}

const DAY_NAMES = ['اليوم الأول — رجل', 'اليوم الثاني — صدر وكتف', 'اليوم الثالث — ظهر', 'اليوم الرابع — رجل وجلوتس', 'اليوم الخامس — دراع وأبس'];

function program(id: PdfTestCaseId, exerciseIds: readonly string[]): Program {
  const perDay = id === 'fifty_exercises' ? 10 : 4;
  const days = id === 'fifty_exercises' ? 5 : 3;
  let n = 0;
  return programSchema.parse({
    id: 'p1',
    name: id === 'long_names' ? LONG_PROGRAM.slice(0, 120) : 'برنامج 8 أسابيع',
    clientId: 'c1',
    isTemplate: false,
    days: Array.from({ length: days }, (_, d) => ({
      id: `d${d + 1}`,
      name: DAY_NAMES[d] ?? `اليوم ${d + 1}`,
      items: Array.from({ length: perDay }, (_, i) => {
        const exerciseId = exerciseIds[n++ % exerciseIds.length]!;
        return {
          id: `i${d}-${i}`,
          exerciseId,
          sets: 3 + (i % 2),
          reps: i % 3 === 0 ? '8-12' : '10',
          restSec: 90,
          tempo: i % 4 === 0 ? '3-1-1-0' : '',
          rpe: i % 2 === 0 ? 8 : null,
          supersetGroup: i === 2 || i === 3 ? 'A' : null,
          notes:
            id === 'mixed_text' && i === 0
              ? 'بنش برس 3×10 @ RPE 8 — keep elbows at 45° وانزل ببطء'
              : id === 'long_names' && i === 1
                ? 'ملاحظة طويلة جداً: ركّز على النزول البطيء ثلاث ثواني وثبات الكتف وما تقفلش الركبة في آخر الحركة خالص'
                : '',
        };
      }),
    })),
    notes: id === 'mixed_text' ? 'Warm-up 10 min على المشاية ثم mobility للهيب.' : 'زوّد الوزن لما تكمّل كل العدات بسهولة.',
    ...META,
  });
}

function recipes(withImages: boolean): Recipe[] {
  return [
    recipeSchema.parse({
      id: 'r1',
      name: 'فول بالطحينة وبيض مسلوق',
      servings: 1,
      ingredients: [
        { name: 'فول مدمس', quantity: 150, unit: 'جم', kcal: 165, proteinG: 11, carbsG: 27, fatG: 1 },
        { name: 'طحينة', quantity: 10, unit: 'جم', kcal: 60, proteinG: 2, carbsG: 2, fatG: 5 },
        { name: 'بيض', quantity: 2, unit: 'حبة', kcal: 140, proteinG: 12, carbsG: 1, fatG: 10 },
      ],
      instructions: 'سخّن الفول وضيف الطحينة والليمون والكمون. قدّمه مع البيض.',
      imageId: withImages ? FIXTURE_IMAGE_IDS.recipe : null,
      tags: [],
      ...META,
    }),
    recipeSchema.parse({
      id: 'r2',
      name: 'صدور فراخ مشوية مع رز بسمتي',
      servings: 2,
      ingredients: [
        { name: 'صدور فراخ', quantity: 300, unit: 'جم', kcal: 495, proteinG: 93, carbsG: 0, fatG: 11 },
        { name: 'رز بسمتي', quantity: 150, unit: 'جم', kcal: 540, proteinG: 12, carbsG: 118, fatG: 1 },
      ],
      instructions: 'تتبّل الفراخ وتتشوى 20 دقيقة. الرز يتسلق.',
      imageId: null,
      tags: [],
      ...META,
    }),
  ];
}

function mealPlan(): MealPlan {
  return mealPlanSchema.parse({
    id: 'm1',
    clientId: 'c1',
    name: 'خطة تنشيف',
    targetKcal: 1700,
    meals: [
      { id: 'meal1', name: 'الفطار', time: '09:00', items: [{ recipeId: 'r1', text: '', servings: 1 }] },
      { id: 'meal2', name: 'الغدا', time: '15:00', items: [{ recipeId: 'r2', text: 'من غير صوص', servings: 1 }, { recipeId: null, text: 'سلطة خضرا', servings: 1 }] },
      { id: 'meal3', name: 'العشا', time: '21:00', items: [{ recipeId: null, text: 'زبادي يوناني + تفاحة', servings: 1 }] },
    ],
    notes: 'اشرب مية كتير. ممنوع المشروبات الغازية.',
    ...META,
  });
}

function supplements(withImages: boolean): Supplement[] {
  return [
    supplementSchema.parse({
      id: 's1', name: 'كرياتين مونوهيدرات', imageId: withImages ? FIXTURE_IMAGE_IDS.supplement : null, priceMinor: null, currency: 'EGP',
      dose: '5 جم', timing: 'بعد التمرين', notes: '', ...META,
    }),
    // No dose typed by the trainer: the PDF must not invent one.
    supplementSchema.parse({ id: 's2', name: 'أوميجا 3', imageId: null, priceMinor: null, currency: 'EGP', dose: '', timing: 'مع الغدا', notes: '', ...META }),
  ];
}

function progress(withPhotos: boolean): ProgressEntry[] {
  const weights = [78, 77.2, 76.5, 75.9, 75.1, 74.5];
  return weights.map((w, i) =>
    progressEntrySchema.parse({
      id: `pr${i}`,
      clientId: 'c1',
      date: `2026-${String(6 + i).padStart(2, '0')}-01`,
      measurements: { weightKg: w, waistCm: 90 - i },
      photoIds: withPhotos && i === 0 ? [FIXTURE_IMAGE_IDS.before] : withPhotos && i === weights.length - 1 ? [FIXTURE_IMAGE_IDS.after] : [],
      notes: '',
      source: 'trainer',
      ...META,
    }),
  );
}

/**
 * Builds one of the five spec cases. `exercises` supplies catalog entries (synthetic in unit tests, real
 * pack entries with photos in the browser harness); ids are used in order.
 */
export function pdfTestCase(id: PdfTestCaseId, exercises: ReadonlyMap<string, PdfExercise>): PdfDocumentInput {
  const images = id !== 'no_images';
  const ex = new Map(exercises);
  if (id === 'no_images') for (const [k, v] of ex) ex.set(k, { ...v, image: null, muscleMap: null });
  if (id === 'long_names') {
    let i = 0;
    for (const [k, v] of ex) {
      if (i++ % 2 === 0) ex.set(k, { ...v, name: `${v.name} مع ثبات ثلاث ثواني في أسفل الحركة ونزول بطيء جداً على البنش المائل بزاوية ثلاثين درجة` });
    }
  }
  return {
    sections: PDF_PRESETS.full_program,
    labels: PDF_TEST_LABELS,
    branding: branding(id),
    disclaimer: PDF_TEST_DISCLAIMER,
    generatedOn: '2026-11-16',
    title: id === 'long_names' ? LONG_PROGRAM : 'برنامج 8 أسابيع',
    subtitle: id === 'mixed_text' ? 'Phase 1 — تنشيف 8 weeks' : '8 أسابيع · 4 أيام في الأسبوع',
    client: client(id),
    program: program(id, [...ex.keys()]),
    exercises: ex,
    nutrition: {
      method: 'mifflin_st_jeor',
      bmrKcal: 1468,
      activityFactor: 1.55,
      tdeeKcal: 2275,
      targetKcal: 1820,
      adjustmentPercent: -20,
      macros: { proteinG: 149, fatG: 60, carbG: 171, proteinKcal: 596, fatKcal: 540, carbKcal: 684, carbsClamped: false, excessKcal: 0 },
      waterMl: 2600,
    },
    mealPlan: mealPlan(),
    recipes: recipes(images),
    supplements: supplements(images),
    progress: progress(images),
    notes:
      id === 'mixed_text'
        ? 'التزم بالـ program ده 8 weeks. لو حسيت بأي pain في الركبة وقّف فوراً وكلمني. Cardio: 20 min LISS بعد كل تمرين.'
        : 'التزم بالبرنامج. لو حسيت بأي ألم وقّف التمرين وكلمني فوراً. النوم 7 ساعات على الأقل.',
  };
}

/** Synthetic exercises for unit tests (no pixels). */
export function syntheticExercises(count: number, withImages: boolean): Map<string, PdfExercise> {
  const m = new Map<string, PdfExercise>();
  for (let i = 1; i <= count; i++) {
    m.set(`ex${i}`, {
      name: `تمرين رقم ${i} بنش برس`,
      secondaryName: `Exercise ${i} Bench Press`,
      muscles: ['تشيست', 'ترايسبس'],
      image: withImages ? { kind: 'pack', path: `img/ex${i}.webp` } : null,
      muscleMap: withImages ? { kind: 'url', url: `map-${i}.png` } : null,
    });
  }
  return m;
}
