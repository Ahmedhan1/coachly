import { describe, expect, it } from 'vitest';
import { fieldOfError, missingField, type CalcDraft } from './calculatorModel';

const draft = (over: Partial<CalcDraft> = {}): CalcDraft => ({
  sex: 'female',
  age: '30',
  height: '165',
  weight: '74',
  bodyFat: '',
  formula: 'mifflin-st-jeor',
  activity: 'moderate',
  goal: 'cut',
  goalPercent: 20,
  proteinPerKg: 2,
  fatPerKg: 0.8,
  ...over,
});

describe('calculator validation helpers', () => {
  it('names the first empty required field', () => {
    expect(missingField(draft())).toBeNull();
    expect(missingField(draft({ age: ' ' }))).toBe('age');
    expect(missingField(draft({ height: '', weight: '' }))).toBe('height');
    expect(missingField(draft({ weight: '' }))).toBe('weight');
    expect(missingField(draft({ bodyFat: '' }))).toBeNull();
  });

  it('maps errors to the field that caused them', () => {
    expect(fieldOfError('invalid_age')).toBe('age');
    expect(fieldOfError('invalid_weight')).toBe('weight');
    expect(fieldOfError('missing_body_fat')).toBe('bodyFat');
    expect(fieldOfError('protein_out_of_range')).toBeNull();
  });
});
