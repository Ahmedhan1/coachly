import type {
  Client,
  ClientGoal,
  MealPlan,
  Measurements,
  PdfSection,
  Program,
  ProgressEntry,
  Recipe,
  Supplement,
} from '../models';
import type { Macros } from '../nutrition/macros';

/** Where a picture comes from; the renderer resolves it to pixels (and downscales it). */
export type PdfImageRef = { kind: 'stored'; imageId: string } | { kind: 'pack'; path: string } | { kind: 'url'; url: string };

/** One exercise as it appears in the PDF (built from a catalog entry; see `pdfExerciseFromCatalog`). */
export interface PdfExercise {
  name: string;
  /** e.g. the English name, shown smaller under the Arabic one. */
  secondaryName: string | null;
  muscles: readonly string[];
  image: PdfImageRef | null;
  /** Still snapshot of the 3D model with the target muscle coloured. */
  muscleMap: PdfImageRef | null;
  /** True when `image` is the muscle picture standing in for a missing photo (drawn whole, not cropped). */
  imageIsMuscleMap?: boolean;
  /** Attribution printed small under the photo (CC BY-SA sources), e.g. "Everkinetic, CC BY-SA 4.0". */
  imageCredit?: string | null;
}

export interface PdfNutrition {
  method: 'mifflin_st_jeor' | 'katch_mcardle';
  bmrKcal: number;
  activityFactor: number;
  tdeeKcal: number;
  targetKcal: number;
  /** Goal adjustment vs TDEE in percent (−20 = cut by 20 %). */
  adjustmentPercent: number;
  macros: Macros;
  waterMl: number | null;
}

/** Every user-visible word the PDF prints. The UI fills it from src/i18n/ar/. */
export interface PdfLabels {
  sections: Record<PdfSection, string>;
  cover: { client: string; preparedBy: string; date: string; planFor: string; contact: string };
  client: {
    name: string;
    gender: string;
    genders: Record<'male' | 'female', string>;
    age: string;
    goal: string;
    goals: Record<ClientGoal, string>;
    goalNote: string;
    injuries: string;
    measurements: Record<keyof Measurements, string>;
  };
  nutrition: {
    method: string;
    methods: Record<PdfNutrition['method'], string>;
    bmr: string;
    activityFactor: string;
    tdee: string;
    target: string;
    adjustment: string;
    protein: string;
    carbs: string;
    fat: string;
    water: string;
  };
  program: {
    sets: string;
    reps: string;
    rest: string;
    tempo: string;
    rpe: string;
    superset: string;
    notes: string;
    /** Column head over "4 × 8-12". */
    setsReps: string;
    exerciseCount: string;
    /** Column head over the exercise name. */
    exercise: string;
    /** Added to the repeated header on a page that continues a day, e.g. "تابع". */
    continued: string;
    /** Column head over tempo / RPE / notes. */
    details: string;
  };
  meals: {
    servings: string;
    ingredients: string;
    perServing: string;
    mealTotal: string;
    dailyTotal: string;
    recipesTitle: string;
    /** Shown when some items have no macros (free text), so the totals are partial. */
    partialTotals: string;
    water: string;
  };
  supplements: { dose: string; timing: string };
  progress: { weightChart: string; before: string; after: string; first: string; latest: string; change: string; measurement: string };
  notes: { contact: string; closing: string };
  units: { kg: string; cm: string; kcal: string; g: string; ml: string; sec: string; years: string; percent: string };
}

export type PdfLogoSize = 'small' | 'medium' | 'large';

export interface PdfBranding {
  trainerName: string;
  logo: PdfImageRef | null;
  logoPlacement: 'start' | 'center' | 'end';
  /** Trainer's logo size setting (cover and page headers). Default 'large'. */
  logoSize: PdfLogoSize;
  primaryColor: string;
  secondaryColor: string;
  /** CSS font-family name, e.g. 'Rubik'. */
  fontFamily: string;
  /** Page background with opacity 0..1 (content pages). */
  background: { image: PdfImageRef; opacity: number } | null;
  /** Separate cover background (full bleed). */
  coverImage: PdfImageRef | null;
  footerText: string;
  contactLines: readonly string[];
}

export interface PdfDocumentInput {
  sections: readonly PdfSection[];
  labels: PdfLabels;
  /** Language the PDF is written in (the trainer's app language). Default Arabic (RTL). */
  language?: 'ar' | 'en';
  branding: PdfBranding;
  /** Fixed line on every page; the default comes from settings/i18n (see `resolveDisclaimer`). */
  disclaimer: string;
  /** Local date the PDF is made (for the cover and the client's age). */
  generatedOn: string;
  /** Cover title, e.g. the program or template name. */
  title: string;
  /** Free text such as "8 أسابيع", shown under the title. */
  subtitle: string;
  client: Client | null;
  program: Program | null;
  exercises: ReadonlyMap<string, PdfExercise>;
  nutrition: PdfNutrition | null;
  mealPlan: MealPlan | null;
  recipes: readonly Recipe[];
  recipeImages?: ReadonlyMap<string, PdfImageRef>;
  supplements: readonly Supplement[];
  supplementImages?: ReadonlyMap<string, PdfImageRef>;
  progress: readonly ProgressEntry[];
  /** Trainer's instructions for this client. */
  notes: string;
}

export interface KeyValue {
  label: string;
  value: string;
}

export interface StatItem {
  label: string;
  value: string;
  unit: string;
  emphasis?: boolean;
}

export type PdfBlock =
  | { type: 'sectionTitle'; text: string; index: number }
  | { type: 'subTitle'; text: string; meta: string }
  | { type: 'keyValues'; rows: KeyValue[] }
  | { type: 'stats'; items: StatItem[] }
  | { type: 'macroBar'; parts: { label: string; percent: number; tone: 'protein' | 'carbs' | 'fat' }[] }
  | { type: 'paragraph'; text: string; muted: boolean }
  | {
      /** Column header of a day's exercise table; `continued` = "day name · تابع" on a follow-on page. */
      type: 'exerciseHead';
      columns: { exercise: string; setsReps: string; rest: string; details: string };
      withMap: boolean;
      continued: string | null;
    }
  | {
      /** One row of the exercise table. */
      type: 'exercise';
      index: number;
      name: string;
      secondaryName: string | null;
      muscles: string;
      sets: string;
      reps: string;
      rest: string;
      /** Tempo, RPE… only when the trainer set them. */
      extras: KeyValue[];
      notes: string;
      image: PdfImageRef | null;
      /** The image is the muscle picture standing in for a missing photo. */
      imageIsMuscleMap?: boolean;
      /** Small attribution line under the image, or null. */
      imageCredit?: string | null;
      muscleMap: PdfImageRef | null;
      superset: string | null;
      /** Same table as the head (muscle-map column on/off). */
      withMap: boolean;
      /** Last row of its day (draws the closing edge of the table). */
      last: boolean;
    }
  | {
      type: 'clientCard';
      name: string;
      chips: string[];
      tiles: StatItem[];
      /** The client's own photo (taken by the trainer or uploaded from the client's phone), or null. */
      photo: PdfImageRef | null;
    }
  | { type: 'mealItem'; text: string; detail: string }
  | {
      type: 'mealCard';
      name: string;
      time: string;
      items: { text: string; detail: string; grams: string; kcal: string }[];
      /** Macros of the items that have them; null when none has. */
      totals: StatItem[] | null;
    }
  | {
      type: 'recipe';
      name: string;
      detail: string;
      ingredients: string[];
      instructions: string;
      image: PdfImageRef | null;
    }
  | { type: 'supplement'; name: string; rows: KeyValue[]; notes: string; image: PdfImageRef | null }
  | { type: 'weightChart'; title: string; points: { date: string; kg: number }[]; unit: string }
  | {
      type: 'measureTable';
      head: [string, string, string, string];
      rows: { label: string; first: string; latest: string; change: string; unit: string }[];
    }
  | {
      type: 'photoPair';
      before: { image: PdfImageRef; caption: string };
      /** null when only one check-in has photos: the one photo is shown alone. */
      after: { image: PdfImageRef; caption: string } | null;
    }
  | { type: 'contact'; title: string; lines: string[]; closing: string };

export type PdfBlockType = PdfBlock['type'];

export interface PdfCover {
  title: string;
  subtitle: string;
  clientLabel: string;
  clientName: string;
  preparedByLabel: string;
  trainerName: string;
  dateLabel: string;
  dateText: string;
  /** Small line above the client name, e.g. "برنامج مخصص لـ". */
  planForLabel: string;
  contactLabel: string;
  contacts: string[];
}

export interface PdfTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  trainerName: string;
  logo: PdfImageRef | null;
  logoPlacement: PdfBranding['logoPlacement'];
  logoSize: PdfLogoSize;
  /** Box the cover logo is fitted into (object-fit: contain), CSS px. */
  coverLogoBox: { width: number; height: number };
  headerLogoPx: number;
  /** Derived from primaryColor: readable text on a primary fill, primary as text on white, pale tint, deep shade. */
  onPrimary: string;
  primaryInk: string;
  primaryTint: string;
  primaryDeep: string;
  background: { image: PdfImageRef; opacity: number } | null;
  coverImage: PdfImageRef | null;
  /** Document language and direction (from PdfDocumentInput.language). Absent = Arabic, RTL. */
  lang?: 'ar' | 'en';
  dir?: 'rtl' | 'ltr';
}

export interface PdfFooter {
  disclaimer: string;
  text: string;
  contact: string;
}

export type PdfPage =
  | { kind: 'cover'; number: number; total: number; cover: PdfCover }
  | { kind: 'content'; number: number; total: number; blocks: PdfBlock[] };

export interface PdfDocument {
  theme: PdfTheme;
  footer: PdfFooter;
  pages: PdfPage[];
}
