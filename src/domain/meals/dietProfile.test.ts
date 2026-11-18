import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, parseDietProfile } from '.';

describe('diet profile', () => {
  it('falls back to defaults for missing or bad data', () => {
    expect(parseDietProfile(undefined)).toEqual(EMPTY_PROFILE);
    expect(parseDietProfile({ split: 'nope', workoutTime: '25:00', shares: [0] })).toEqual(EMPTY_PROFILE);
  });

  it('keeps valid fields', () => {
    const p = parseDietProfile({
      split: 'custom',
      shares: [30, 40, 30],
      workoutTime: '17:30',
      cycle: { enabled: true, trainingDays: [1, 3, 5], refeedDay: 6 },
      macro: { protein: { unit: 'perKg', value: 2 }, fat: { unit: 'percent', value: 25 }, carb: { unit: 'grams', value: 0 }, rest: 'carb' },
      prefs: { allergies: ['nuts'], budget: true },
    });
    expect(p.split).toBe('custom');
    expect(p.shares).toEqual([30, 40, 30]);
    expect(p.workoutTime).toBe('17:30');
    expect(p.cycle.refeedDay).toBe(6);
    expect(p.macro?.fat.unit).toBe('percent');
    expect(p.prefs).toEqual({ dislikes: [], loves: [], allergies: ['nuts'], budget: true });
  });
});
