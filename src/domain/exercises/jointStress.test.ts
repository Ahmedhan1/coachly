import { describe, expect, it } from 'vitest';
import {
  deriveHomeFriendly,
  deriveJointStress,
  fitsJointLimits,
  maxJointStress,
  mergeJointStress,
  type JointRuleInput,
} from './jointStress';

const ex = (en: string, more: Partial<JointRuleInput> = {}): JointRuleInput => ({
  en,
  primary: ['quads'],
  secondary: [],
  equipment: 'body_only',
  category: 'strength',
  ...more,
});

describe('deriveJointStress — knee', () => {
  it('rates jumps, deep and barbell-loaded knee bends high', () => {
    expect(deriveJointStress(ex('Box Jump', { category: 'plyometrics' })).knee).toBe('high');
    expect(deriveJointStress(ex('Barbell Back Squat', { equipment: 'barbell' })).knee).toBe('high');
    expect(deriveJointStress(ex('Hack Squat', { equipment: 'machine' })).knee).toBe('high');
    expect(deriveJointStress(ex('Pistol Squat')).knee).toBe('high');
  });
  it('rates machine / dumbbell squats, lunges and leg press medium', () => {
    expect(deriveJointStress(ex('Leg Press', { equipment: 'machine' })).knee).toBe('medium');
    expect(deriveJointStress(ex('Dumbbell Lunge', { equipment: 'dumbbell' })).knee).toBe('medium');
    expect(deriveJointStress(ex('Leg Extension', { equipment: 'machine' })).knee).toBe('medium');
  });
  it('rates hinges, curls, bridges, carries, bikes and upper body low', () => {
    for (const name of ['Lying Leg Curl', 'Glute Bridge', 'Romanian Deadlift', "Farmer's Walk", 'Stationary Bike']) {
      expect(deriveJointStress(ex(name, { primary: ['hamstrings'] })).knee).toBe('low');
    }
    expect(deriveJointStress(ex('Dumbbell Bench Press', { primary: ['chest'] })).knee).toBe('low');
    expect(deriveJointStress(ex("Farmer's Walk", { primary: ['forearms'], secondary: ['quads'], category: 'strongman' })).knee).toBe('low');
  });
  it('rates every stretch low', () => {
    expect(deriveJointStress(ex('Couch Stretch', { category: 'stretching' }))).toEqual({ knee: 'low', shoulder: 'low', lowerBack: 'low' });
  });
});

describe('deriveJointStress — shoulder', () => {
  it('rates overhead barbell pressing, behind-the-neck, dips and upright rows high', () => {
    for (const name of ['Standing Military Press', 'Push Press (Behind the Neck)', 'Chest Dips', 'Barbell Upright Row']) {
      expect(deriveJointStress(ex(name, { primary: ['shoulders'], equipment: 'barbell' })).shoulder).toBe('high');
    }
  });
  it('rates presses, flies and pull-ups medium; rows, curls and rotator work low', () => {
    expect(deriveJointStress(ex('Dumbbell Bench Press', { primary: ['chest'] })).shoulder).toBe('medium');
    expect(deriveJointStress(ex('Pull-Up', { primary: ['lats'] })).shoulder).toBe('medium');
    expect(deriveJointStress(ex('Rear Pull-Up (Wide Grip)', { primary: ['lats'] })).shoulder).toBe('medium');
    expect(deriveJointStress(ex('Seated Cable Row', { primary: ['middle_back'] })).shoulder).toBe('low');
    expect(deriveJointStress(ex('Dumbbell Biceps Curl', { primary: ['biceps'] })).shoulder).toBe('low');
    expect(deriveJointStress(ex('Band Face Pull', { primary: ['shoulders'] })).shoulder).toBe('low');
  });
});

describe('deriveJointStress — lower back', () => {
  it('rates barbell deadlifts, good mornings, bent-over rows and barbell squats high', () => {
    for (const name of ['Barbell Deadlift', 'Good Morning', 'Barbell Bent-Over Row', 'Barbell Back Squat']) {
      expect(deriveJointStress(ex(name, { equipment: 'barbell', primary: ['hamstrings'] })).lowerBack).toBe('high');
    }
  });
  it('rates the same hinge with a dumbbell, kettlebell or machine medium', () => {
    expect(deriveJointStress(ex('Dumbbell Single-Leg Deadlift', { equipment: 'dumbbell' })).lowerBack).toBe('medium');
    expect(deriveJointStress(ex('Kettlebell Swing', { equipment: 'kettlebell' })).lowerBack).toBe('medium');
  });
  it('rates supported machines, core stability and body-weight squats low', () => {
    for (const name of ['Seated Leg Curl', 'Bird Dog', 'Dead Bug', 'Plank', 'Lat Pulldown', 'Bodyweight Squat']) {
      expect(deriveJointStress(ex(name)).lowerBack).toBe('low');
    }
    expect(deriveJointStress(ex('Goblet Squat', { equipment: 'kettlebell' })).lowerBack).toBe('medium');
  });
  it('rates strongman and olympic lifts high, carries medium', () => {
    expect(deriveJointStress(ex('Atlas Stones', { category: 'strongman', equipment: 'other' })).lowerBack).toBe('high');
    expect(deriveJointStress(ex('Power Clean', { category: 'olympic_weightlifting', equipment: 'barbell' }))).toEqual({
      knee: 'high',
      shoulder: 'high',
      lowerBack: 'high',
    });
    expect(deriveJointStress(ex("Farmer's Walk", { category: 'strongman', equipment: 'other' })).lowerBack).toBe('medium');
  });
});

describe('deriveHomeFriendly', () => {
  it('accepts body weight, bands, dumbbells, kettlebells, balls and rollers', () => {
    expect(deriveHomeFriendly({ en: 'Push-Up', equipment: 'body_only', category: 'strength' })).toBe(true);
    expect(deriveHomeFriendly({ en: 'Band Biceps Curl', equipment: 'bands', category: 'strength' })).toBe(true);
    expect(deriveHomeFriendly({ en: 'Goblet Squat', equipment: 'kettlebell', category: 'strength' })).toBe(true);
  });
  it('rejects gym equipment and moves that need a bar, bench or station', () => {
    expect(deriveHomeFriendly({ en: 'Leg Press', equipment: 'machine', category: 'strength' })).toBe(false);
    expect(deriveHomeFriendly({ en: 'Barbell Curl', equipment: 'barbell', category: 'strength' })).toBe(false);
    expect(deriveHomeFriendly({ en: 'Pull-Up', equipment: 'body_only', category: 'strength' })).toBe(false);
    expect(deriveHomeFriendly({ en: 'Incline Dumbbell Press', equipment: 'dumbbell', category: 'strength' })).toBe(false);
    expect(deriveHomeFriendly({ en: 'Hanging Knee Raise', equipment: 'body_only', category: 'strength' })).toBe(false);
  });
  it('accepts "other" equipment only for stretches', () => {
    expect(deriveHomeFriendly({ en: 'Hamstring Stretch', equipment: 'other', category: 'stretching' })).toBe(true);
    expect(deriveHomeFriendly({ en: 'Atlas Stones', equipment: 'other', category: 'strongman' })).toBe(false);
  });
});

describe('helpers', () => {
  const js = { knee: 'high', shoulder: 'low', lowerBack: 'medium' } as const;
  it('merges hand-set parts over the rules', () => {
    expect(mergeJointStress(js, { knee: 'low' })).toEqual({ knee: 'low', shoulder: 'low', lowerBack: 'medium' });
    expect(mergeJointStress(js, undefined)).toBe(js);
  });
  it('checks a client limit per joint; missing data counts as medium', () => {
    expect(fitsJointLimits(js, { shoulder: 'low' })).toBe(true);
    expect(fitsJointLimits(js, { knee: 'medium' })).toBe(false);
    expect(fitsJointLimits(js, { lowerBack: 'medium', knee: 'high' })).toBe(true);
    expect(fitsJointLimits(undefined, { knee: 'low' })).toBe(false);
    expect(fitsJointLimits(undefined, { knee: 'medium' })).toBe(true);
  });
  it('reports the worst joint', () => {
    expect(maxJointStress(js)).toBe('high');
    expect(maxJointStress({ knee: 'low', shoulder: 'low', lowerBack: 'low' })).toBe('low');
    expect(maxJointStress(undefined)).toBe('medium');
  });
});
