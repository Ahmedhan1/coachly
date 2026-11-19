/**
 * Joint load (knee / shoulder / lower back) and "can be done at home" for every exercise, by rule.
 *
 * The build script (scripts/build-exercise-pack.mjs) imports this file directly with Node, so it has only
 * type imports and erasable TypeScript. Hand-reviewed exceptions live in assets-src/exercises/exercise-fixes.json
 * (dataset exercises) and assets-src/exercises/exercise-extras.json (our own); they win over these rules.
 * The rules are documented in docs/EXERCISE_PACK.md ("Joint stress and home-friendly").
 */
import type { EquipmentId, ExerciseCategory, JointStress, MuscleGroupId, StressLevel } from './pack';

/** What the rules look at. Both pack entries and catalog exercises can be mapped to this. */
export interface JointRuleInput {
  /** English name (gym-standard). */
  en: string;
  primary: readonly MuscleGroupId[];
  secondary: readonly MuscleGroupId[];
  equipment: EquipmentId;
  category: ExerciseCategory;
}

export type Joint = keyof JointStress;
export const JOINTS: readonly Joint[] = ['knee', 'shoulder', 'lowerBack'];

const RANK: Readonly<Record<StressLevel, number>> = { low: 0, medium: 1, high: 2 };

const has = (name: string, re: RegExp): boolean => re.test(name);
const any = (list: readonly MuscleGroupId[], ids: readonly MuscleGroupId[]): boolean => list.some((m) => ids.includes(m));

const LEG_MUSCLES: readonly MuscleGroupId[] = ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'];

/** Loaded carries, sled pushes and drags: kind to the knee, a moderate load on the back. */
const CARRY_OR_DRAG = /\b(carry|farmer'?s? walk|yoke walk|drag|drags|sled push|prowler)\b/i;

// --- knee -----------------------------------------------------------------------------------------------
const KNEE_HIGH = /\b(jump|jumps|hop|hops|hopping|bound|bounds|pistol|sissy|leap|depth|skater|tuck jump|burpee|sprint|frog hops|stride jump|box skip|split jump|jerk|snatch|clean)\b/i;
const KNEE_LOWISH = /\b(leg curl|hamstring curl|glute ham|calf|hip thrust|bridge|deadlift|rdl|good morning|kickback|abduction|adduction|clamshell|hydrant|pull-through|swing|step-down|terminal knee|quad set|straight leg raise|spanish squat|bike|cycling|bicycling|elliptical|walk|ski erg|ergometer|carry)\b/i;
/** Deep or shear-heavy knee bends: always high. */
const KNEE_DEEP = /\b(pistol|sissy|front squat|full squat|overhead squat|jefferson|hack squat|olympic squat|nordic)\b/i;
/** Loaded with a barbell these are high on the knee. */
const KNEE_LOADED = /\b(squat|lunge|lunges|split|step-up|step up)\b/i;
const KNEE_MEDIUM = /\b(squat|lunge|lunges|leg press|step-up|step up|leg extension|split|hack|wall sit|stair|step mill|skipping|run|running|jog|jogging|rope|thruster|wall ball|mountain climber|high knees|cossack|curtsy)\b/i;

function kneeStress(e: JointRuleInput): StressLevel {
  const n = e.en;
  if (e.category === 'stretching') return 'low';
  const legs = any(e.primary, LEG_MUSCLES) || any(e.secondary, ['quads']);
  if (e.category === 'plyometrics' && legs) return 'high';
  if (has(n, CARRY_OR_DRAG)) return 'low';
  if (e.category === 'olympic_weightlifting' || e.category === 'strongman') return legs || has(n, KNEE_HIGH) ? 'high' : 'medium';
  if (has(n, KNEE_HIGH) && (legs || e.category === 'cardio')) return 'high';
  if (has(n, KNEE_DEEP)) return 'high';
  if ((e.equipment === 'barbell' || e.category === 'powerlifting') && has(n, KNEE_LOADED) && !/\bbox squat\b/i.test(n)) return 'high';
  if (has(n, KNEE_LOWISH)) return 'low';
  if (has(n, KNEE_MEDIUM)) return 'medium';
  if (e.primary.includes('quads')) return 'medium';
  return 'low';
}

// --- shoulder -------------------------------------------------------------------------------------------
const SHOULDER_HIGH = /\b(military press|overhead press|push press|arnold|behind the neck|behind neck|dip|dips|upright row|snatch|jerk|overhead squat|handstand|kipping|muscle up|guillotine|bradford|ring|iron cross|crucifix|turkish)\b/i;
const SHOULDER_LOW = /\b(face pull|external rotation|internal rotation|pull apart|scapular|wall slide|y-t-w|pendulum|codman|band row|seated row|cable row|machine row|low row|row machine|shrug|carry|farmer|curl|wrist|forearm|hand squeeze|pinch|hang\b)/i;
const SHOULDER_MEDIUM = /\b(press|push-up|push up|pushup|fly|flye|flyes|pec deck|crossover|raise|pull-up|pullup|chin|pulldown|pullover|extension|skull|throw|slam|rope|clean|swing|plank|crawl|burpee|landmine|halo|windmill)\b/i;

function shoulderStress(e: JointRuleInput): StressLevel {
  const n = e.en;
  const upper = any(e.primary, ['shoulders', 'chest', 'triceps', 'lats', 'traps', 'middle_back']);
  if (has(n, SHOULDER_HIGH)) return 'high';
  if (e.category === 'stretching') return 'low';
  if (has(n, SHOULDER_LOW)) return 'low';
  if (e.category === 'olympic_weightlifting') return 'high';
  if (/\b(hanging|toes to bar|captain)\b/i.test(n)) return 'medium';
  if (has(n, SHOULDER_MEDIUM) && (upper || /\b(clean|swing|plank|crawl|burpee|throw|slam|landmine|halo|windmill)\b/i.test(n))) return 'medium';
  if (e.primary.includes('shoulders') || e.primary.includes('chest')) return 'medium';
  return 'low';
}

// --- lower back -----------------------------------------------------------------------------------------
const BACK_HIGH = /\b(deadlift|good morning|good mornings|bent-over row|bent over row|pendlay|t-bar|long bar row|atlas|keg|tire|log lift|yoke|car deadlift|rickshaw|jefferson|zercher|stiff leg|stiff-leg|stiff legs|rack pull|rack pulls|clean|snatch|jerk|axle|sandbag)\b/i;
const BACK_LOW = /\b(machine|leverage|smith|seated|lying|supported|chest-supported|bird dog|dead bug|plank|mcgill|pallof|bridge|clamshell|hydrant|curl|extension machine|cable row|pulldown|pull-up|chin|press-up|bike|cycling|elliptical|walk|ergometer|stretch)\b/i;
/** Squats and lunges load the back only when weight is held. */
const LOADED_LEGS = /\b(squat|lunge|lunges|split|step-up|thruster)\b/i;
const BACK_MEDIUM = /\b(swing|row|sit-up|situp|v-up|jackknife|leg raise|toes to bar|russian twist|back extension|hyperextension|superman|swimmer|overhead press|military press|push press|thruster|carry|farmer|rowing|run|sprint|jump|burpee|slam|wood ?chop|rollout|hip thrust|pull-through|rdl|romanian)\b/i;

function lowerBackStress(e: JointRuleInput): StressLevel {
  const n = e.en;
  if (e.category === 'stretching') return 'low';
  if (has(n, CARRY_OR_DRAG)) return 'medium';
  if (e.category === 'strongman' || e.category === 'olympic_weightlifting') return 'high';
  if (has(n, BACK_HIGH)) return e.equipment === 'machine' || /\b(smith|single-leg|one-legged|dumbbell|kettlebell|band|cable)\b/i.test(n) ? 'medium' : 'high';
  if (e.equipment === 'barbell' && /\b(squat|lunge|standing|military|overhead|step-up|split)\b/i.test(n) && !/\b(smith|seated)\b/i.test(n)) return 'high';
  if (has(n, BACK_LOW)) return 'low';
  if (has(n, BACK_MEDIUM)) return 'medium';
  if (has(n, LOADED_LEGS) && e.equipment !== 'body_only' && e.equipment !== 'bands' && e.equipment !== 'other') return 'medium';
  if (e.primary.includes('lower_back')) return 'medium';
  return 'low';
}

/** Joint load by rule. Deliberately conservative: when unsure it says medium, never low. */
export function deriveJointStress(e: JointRuleInput): JointStress {
  return { knee: kneeStress(e), shoulder: shoulderStress(e), lowerBack: lowerBackStress(e) };
}

const HOME_EQUIPMENT: ReadonlySet<EquipmentId> = new Set([
  'body_only', 'bands', 'dumbbell', 'kettlebell', 'exercise_ball', 'medicine_ball', 'foam_roll', 'suspension', 'other',
]);
const GYM_ONLY = /\b(machine|smith|cable|pulley|leverage|sled|prowler|treadmill|stationary|spin bike|assault|recumbent|rowing machine|elliptical|stairmaster|step mill|ski erg|ergometer|hanging|pull-up|pullup|pull ups|chin-up|chin|muscle up|dip|dips|ring|rope climb|glute ham|lat pulldown|pulldown|captain|landmine|yoke|tire|keg|atlas|log|rickshaw|car|conan|sledgehammer|chains|board|pin|blocks|incline|decline|preacher|bench press|hyperextension|back extension|reverse hyper|box jump|platform|bar|barbell|battling|heavy bag|circus|axle|t-bar|leg press|hack|pec deck|belt squat|pendulum|trap bar|wall ball|trail|bicycling|skating|jammer|bosu|harness)\b/i;

/** Can be done at home with body weight, bands, dumbbells, a kettlebell, a ball, a foam roller or a mat. */
export function deriveHomeFriendly(e: Pick<JointRuleInput, 'en' | 'equipment' | 'category'>): boolean {
  if (!HOME_EQUIPMENT.has(e.equipment)) return false;
  if (GYM_ONLY.test(e.en)) return false;
  if (e.equipment === 'other') return e.category === 'stretching' || /\b(suspension|trx|towel|wall|mat)\b/i.test(e.en);
  return true;
}

/** Fills the unset parts of a hand-set joint load from the rules. */
export function mergeJointStress(rule: JointStress, hand: Partial<JointStress> | undefined): JointStress {
  return hand === undefined ? rule : { ...rule, ...hand };
}

/**
 * True when an exercise loads no joint above the given limits, e.g. `{ knee: 'low' }` for a client with a
 * knee problem. Exercises without joint data (custom ones from an old pack) are treated as medium.
 */
export function fitsJointLimits(stress: JointStress | undefined, limits: Partial<Record<Joint, StressLevel>>): boolean {
  for (const joint of JOINTS) {
    const limit = limits[joint];
    if (limit === undefined) continue;
    const level = stress?.[joint] ?? 'medium';
    if (RANK[level] > RANK[limit]) return false;
  }
  return true;
}

/** Highest load across the three joints (for sorting "gentlest first"). */
export function maxJointStress(stress: JointStress | undefined): StressLevel {
  if (stress === undefined) return 'medium';
  return JOINTS.map((j) => stress[j]).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'low' as StressLevel);
}
