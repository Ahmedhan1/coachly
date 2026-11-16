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

/** Every user-visible word the PDF prints. The UI fills it from src/i18n/ar.ts. */
export interface PdfLabels {
  sections: Record<PdfSection, string>;
  cover: { client: string; preparedBy: string; date: string };
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
  program: { sets: string; reps: string; rest: string; tempo: string; rpe: string; superset: string; notes: string };
  meals: { servings: string; ingredients: string; perServing: string };
  supplements: { dose: string; timing: string };
  progress: { weightChart: string; before: string; after: string; first: string; latest: string; change: string };
  notes: { contact: string };
  units: { kg: string; cm: string; kcal: string; g: string; ml: string; sec: string; years: string; percent: string };
}

export interface PdfBranding {
  trainerName: string;
  logo: PdfImageRef | null;
  logoPlacement: 'start' | 'center' | 'end';
  /** Logo height on the cover in CSS px; clamped to [MIN_LOGO_PX, MAX_LOGO_PX]. */
  logoHeightPx: number;
  primaryColor: string;
  secondaryColor: string;
  /** CSS font-family name, e.g. 'Readex Pro'. */
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
  | { type: 'sectionTitle'; text: string }
  | { type: 'subTitle'; text: string; meta: string }
  | { type: 'keyValues'; rows: KeyValue[] }
  | { type: 'stats'; items: StatItem[] }
  | { type: 'macroBar'; parts: { label: string; percent: number; tone: 'protein' | 'carbs' | 'fat' }[] }
  | { type: 'paragraph'; text: string; muted: boolean }
  | {
      type: 'exercise';
      index: number;
      name: string;
      secondaryName: string | null;
      muscles: string;
      prescription: KeyValue[];
      notes: string;
      image: PdfImageRef | null;
      muscleMap: PdfImageRef | null;
      superset: string | null;
    }
  | { type: 'mealItem'; text: string; detail: string }
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
  | { type: 'photoPair'; before: { image: PdfImageRef; caption: string }; after: { image: PdfImageRef; caption: string } }
  | { type: 'contact'; title: string; lines: string[] };

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
}

export interface PdfTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  trainerName: string;
  logo: PdfImageRef | null;
  logoPlacement: PdfBranding['logoPlacement'];
  coverLogoPx: number;
  headerLogoPx: number;
  background: { image: PdfImageRef; opacity: number } | null;
  coverImage: PdfImageRef | null;
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
