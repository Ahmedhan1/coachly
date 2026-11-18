import { alternativesFor } from './alternatives';
import type { EquipmentId } from './pack';
import type { CatalogExercise } from './types';

/**
 * How well an exercise suits ONE client: equipment they have, injured joints, level, and the trainer's
 * favourite / avoided lists for that client. Pure and deterministic (ties break by id).
 *
 * Joint stress comes from the catalog's optional hints (`jointStress`, `homeFriendly`) when an exercise has
 * them, and otherwise from simple rules on the English name, category, equipment and muscles.
 */

export const JOINT_IDS = ['knee', 'shoulder', 'lower_back', 'wrist', 'elbow', 'neck', 'hip', 'ankle'] as const;
export type JointId = (typeof JOINT_IDS)[number];
export type JointLoad = 'low' | 'medium' | 'high';
export type FitLevel = 'beginner' | 'intermediate' | 'advanced';
export type TrainingPlace = 'gym' | 'home' | 'both';
export type TrainingEmphasis = 'fat_loss' | 'muscle' | 'strength' | 'fitness' | 'rehab';

/** The part of a client's training profile the fit rules read (all optional). */
export interface FitProfile {
  place?: TrainingPlace;
  homeEquipment?: readonly string[];
  level?: FitLevel;
  injuredJoints?: readonly JointId[];
  emphasis?: TrainingEmphasis;
  avoidIds?: readonly string[];
  favouriteIds?: readonly string[];
}

/** Optional catalog hints (added to pack entries by the exercise data). */
export interface FitHints {
  jointStress?: Partial<Record<string, JointLoad>>;
  homeFriendly?: boolean;
}

export interface ExerciseFit {
  available: boolean;
  avoided: boolean;
  favourite: boolean;
  levelOk: boolean;
  /** Medium/high stress on the client's injured joints, worst first. */
  risks: { joint: JointId; stress: 'medium' | 'high' }[];
  score: number;
}

const RANK: Record<JointLoad, number> = { low: 0, medium: 1, high: 2 };
const HINT_KEYS: Record<string, JointId> = { knee: 'knee', shoulder: 'shoulder', lowerBack: 'lower_back', lower_back: 'lower_back', wrist: 'wrist', elbow: 'elbow', neck: 'neck', hip: 'hip', ankle: 'ankle' };

const TEXT_JOINTS: readonly [JointId, RegExp][] = [
  ['knee', /ركب|رضف|غضروف|صليبي|knee|acl|menisc/i],
  ['shoulder', /كتف|اكتاف|أكتاف|shoulder|rotator/i],
  ['lower_back', /ظهر|فقر|ديسك|غضروف ?قطني|back|disc|lumbar|spine/i],
  ['wrist', /رسغ|معصم|wrist/i],
  ['elbow', /كوع|مرفق|elbow|tennis/i],
  ['neck', /رقب|neck|cervical/i],
  ['hip', /حوض|ورك|hip/i],
  ['ankle', /كاحل|كعب|ankle/i],
];

/** Joints named in free-text injury notes (Arabic or English), in a fixed order. */
export function jointsFromText(lines: readonly string[]): JointId[] {
  const text = lines.join(' ');
  return JOINT_IDS.filter((j) => TEXT_JOINTS.some(([id, re]) => id === j && re.test(text)));
}

/** Profile joints plus joints read from the client's older free-text injuries. */
export function injuredJoints(profile: FitProfile | null | undefined, legacyInjuries: readonly string[] = []): JointId[] {
  const set = new Set<JointId>([...(profile?.injuredJoints ?? []), ...jointsFromText(legacyInjuries)]);
  return JOINT_IDS.filter((j) => set.has(j));
}

type Stress = Partial<Record<JointId, JointLoad>>;
const LOWER = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors']);

function ruleStress(e: CatalogExercise): Stress {
  const n = e.nameEn.toLowerCase();
  const has = (re: RegExp) => re.test(n);
  const lower = e.primaryMuscles.some((m) => LOWER.has(m));
  const plyo = e.category === 'plyometrics' || has(/jump|hop|bound|leap|burpee|skater|sprint|plyo|skipping|butt kick/);
  const olympic = e.category === 'olympic_weightlifting' || has(/clean|snatch|jerk/);
  const squat = has(/squat|lunge|step-up|step up|split/);
  const s: Stress = {};
  const up = (j: JointId, level: JointLoad) => {
    if (RANK[level] > RANK[s[j] ?? 'low']) s[j] = level;
  };
  // Knee
  if (plyo && (lower || e.category === 'plyometrics')) up('knee', 'high');
  if (olympic) up('knee', 'high');
  if (has(/pistol|sissy|glute ham|nordic|hack squat|front squat|full squat|overhead squat|jefferson/)) up('knee', 'high');
  if (squat && (e.equipment === 'barbell' || e.category === 'powerlifting')) up('knee', 'high');
  if (squat || has(/leg press|leg extension|wall sit/)) up('knee', 'medium');
  if (e.primaryMuscles[0] === 'quads' && e.mechanic === 'compound') up('knee', 'medium');
  // Ankle / hip
  if (plyo || e.category === 'cardio' && has(/run|jog|sprint|skat|rope/)) up('ankle', 'high');
  if (squat || has(/calf raise/)) up('ankle', 'medium');
  if (plyo || olympic || has(/pistol|deep squat/)) up('hip', 'high');
  if (squat || has(/deadlift|good morning|leg raise|adduct|abduct|kick/)) up('hip', 'medium');
  // Lower back
  if (has(/deadlift|good morning|bent over|bent-over|t-bar|pendlay|jefferson/) && !has(/romanian|cable|leverage/)) up('lower_back', 'high');
  if (olympic || e.category === 'strongman' || (squat && e.equipment === 'barbell' && !has(/split|lunge|step/))) up('lower_back', 'high');
  if (has(/romanian|stiff|hyperextension|back extension|superman|swing|sit-up|situp|row/) && e.equipment !== 'machine') up('lower_back', 'medium');
  if (e.primaryMuscles[0] === 'lower_back') up('lower_back', 'medium');
  // Shoulder
  if (has(/behind the neck|upright row|dip|handstand|muscle up|kipping|military|overhead press|push press|jerk|snatch|arnold/)) up('shoulder', 'high');
  if (e.primaryMuscles[0] === 'shoulders' && e.mechanic === 'compound') up('shoulder', 'high');
  if (e.primaryMuscles[0] === 'shoulders' || has(/bench press|pull-?up|chin-?up|fly|flye|pullover|push-?up/)) up('shoulder', 'medium');
  // Wrist / elbow / neck
  if (has(/handstand|clean|snatch|wrist/)) up('wrist', 'high');
  if (has(/push-?up|plank|front squat|barbell curl|dip|mountain climber/)) up('wrist', 'medium');
  if (has(/skull|lying triceps|french press|tricep.*extension|dip/)) up('elbow', 'high');
  if (e.primaryMuscles[0] === 'triceps' || e.primaryMuscles[0] === 'biceps' || has(/close-grip|preacher/)) up('elbow', 'medium');
  if (e.primaryMuscles[0] === 'neck' || has(/behind the neck|headstand|neck/)) up('neck', 'high');
  if (has(/shrug|sit-up|situp|crunch|bridge/)) up('neck', 'medium');
  return s;
}

/** Stress per joint: catalog hints win for the joints they cover; rules fill the rest. */
export function jointStressOf(e: CatalogExercise): Stress {
  const out = ruleStress(e);
  const hints = (e as CatalogExercise & FitHints).jointStress;
  if (hints) {
    for (const [key, level] of Object.entries(hints)) {
      const joint = HINT_KEYS[key];
      if (joint && level && level in RANK) out[joint] = level;
    }
  }
  return out;
}

/** Equipment the client can use, or null when everything is (gym, gym + home, or place unknown). */
export function availableEquipment(profile: FitProfile | null | undefined): ReadonlySet<string> | null {
  if (profile?.place !== 'home') return null;
  return new Set(['body_only', ...(profile.homeEquipment ?? [])]);
}

/** Body-weight moves that still need a bar, rings or a station. */
const NEEDS_STATION = /pull-?up|chin-?up|\bdips?\b|hanging|muscle up|inverted row|glute ham|toes to bar/i;

function isAvailable(e: CatalogExercise, available: ReadonlySet<string> | null): boolean {
  if (available === null) return true;
  const hint = (e as CatalogExercise & FitHints).homeFriendly;
  const friendly = hint ?? (e.equipment === 'body_only' && NEEDS_STATION.test(e.nameEn) && !available.has('other') ? false : undefined);
  if (friendly === false && !available.has(e.equipment)) return false;
  if (friendly === false && e.equipment === 'body_only') return false;
  if (available.has(e.equipment)) return true;
  return friendly === true && (e.equipment === 'other' || e.equipment === 'body_only');
}

function levelOk(e: CatalogExercise, level: FitLevel | undefined): boolean {
  if (level !== 'beginner') return true;
  return e.level !== 'expert' && e.category !== 'olympic_weightlifting' && e.category !== 'strongman';
}

/** One exercise against one client's profile. */
export function assessExercise(e: CatalogExercise, profile: FitProfile, joints: readonly JointId[] = profile.injuredJoints ?? []): ExerciseFit {
  const available = isAvailable(e, availableEquipment(profile));
  const avoided = (profile.avoidIds ?? []).includes(e.id);
  const favourite = (profile.favouriteIds ?? []).includes(e.id);
  const ok = levelOk(e, profile.level);
  const stress = joints.length > 0 ? jointStressOf(e) : {};
  const risks = joints
    .map((joint) => ({ joint, stress: stress[joint] ?? 'low' }))
    .filter((r): r is ExerciseFit['risks'][number] => r.stress !== 'low')
    .sort((a, b) => RANK[b.stress] - RANK[a.stress]);
  let score = 0;
  if (favourite) score += 30;
  if (!available) score -= 100;
  if (avoided) score -= 200;
  if (!ok) score -= 15;
  if (profile.level === 'intermediate' && e.level === 'expert') score -= 4;
  for (const r of risks) score -= r.stress === 'high' ? 40 : profile.emphasis === 'rehab' ? 20 : 8;
  if (e.popularRank !== undefined) score += Math.max(0, 6 - e.popularRank / 25);
  if (e.images.length > 0) score += 0.5;
  if (e.category === 'stretching' || e.category === 'cardio') score -= 2;
  return { available, avoided, favourite, levelOk: ok, risks, score };
}

export interface RankedExercise {
  exercise: CatalogExercise;
  fit: ExerciseFit;
}

/**
 * The catalog for this client, best first: avoided and unavailable exercises are left out; risky ones stay
 * (flagged, at the end) so the trainer can still choose them knowingly.
 */
export function rankForClient(catalog: readonly CatalogExercise[], profile: FitProfile): RankedExercise[] {
  const joints = profile.injuredJoints ?? [];
  return catalog
    .map((exercise) => ({ exercise, fit: assessExercise(exercise, profile, joints) }))
    .filter((r) => r.fit.available && !r.fit.avoided)
    .sort((a, b) => b.fit.score - a.fit.score || (a.exercise.id < b.exercise.id ? -1 : a.exercise.id > b.exercise.id ? 1 : 0));
}

const worst = (fit: ExerciseFit) => RANK[fit.risks[0]?.stress ?? 'low'];
const total = (fit: ExerciseFit) => fit.risks.reduce((n, r) => n + RANK[r.stress], 0);

/** Same-muscle moves with less stress on the injured joints, that the client can do. */
export function saferAlternatives(target: CatalogExercise, catalog: readonly CatalogExercise[], profile: FitProfile, limit = 4): CatalogExercise[] {
  const joints = profile.injuredJoints ?? [];
  const base = assessExercise(target, profile, joints);
  const available = availableEquipment(profile);
  const candidates = alternativesFor(target, catalog, available ? { limit: 120, available } : { limit: 120 });
  return candidates
    .map((e, i) => ({ e, i, fit: assessExercise(e, profile, joints) }))
    .filter((c) => c.fit.available && !c.fit.avoided && c.fit.levelOk && worst(c.fit) < 2 && total(c.fit) < Math.max(1, total(base)))
    // A stretch is no substitute for a strength move.
    .filter((c) => target.category === 'stretching' || (c.e.category !== 'stretching' && c.e.category !== 'cardio'))
    .sort((a, b) => Number(b.fit.favourite) - Number(a.fit.favourite) || a.i - b.i)
    .slice(0, limit)
    .map((c) => c.e);
}

/**
 * Swap list in the session: the usual alternatives, kept to what suits the client (no profile → unchanged).
 * When the profile filters everything out, the plain list comes back so the trainer is never stuck.
 */
export function swapChoices(target: CatalogExercise, catalog: readonly CatalogExercise[], profile: FitProfile | null, limit = 8): CatalogExercise[] {
  if (!profile) return alternativesFor(target, catalog, { limit });
  const joints = profile.injuredJoints ?? [];
  const pool = alternativesFor(target, catalog, { limit: 60 });
  const kept = pool
    .map((e, i) => ({ e, i, fit: assessExercise(e, profile, joints) }))
    .filter((c) => c.fit.available && !c.fit.avoided && worst(c.fit) < 2)
    .sort((a, b) => Number(b.fit.favourite) - Number(a.fit.favourite) || total(a.fit) - total(b.fit) || a.i - b.i)
    .slice(0, limit)
    .map((c) => c.e);
  return kept.length > 0 ? kept : pool.slice(0, limit);
}

/** Equipment a home client can tick (the rest only exist in a gym). */
export const HOME_EQUIPMENT: readonly EquipmentId[] = ['dumbbell', 'kettlebell', 'bands', 'barbell', 'ez_bar', 'exercise_ball', 'medicine_ball', 'foam_roll', 'suspension', 'cable', 'machine', 'other'];
