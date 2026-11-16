import { describe, expect, it } from 'vitest';
import { exerciseSchema } from './exercise';
import { mealPlanSchema } from './mealPlan';
import { paymentSchema } from './payment';
import { pdfTemplateSchema } from './pdfTemplate';
import { programSchema } from './program';
import { recurrenceRuleSchema, sessionSchema } from './session';
import { supplementSchema } from './supplement';
import { meta } from './testFixtures';
import { defaultTrainerSettings, trainerSettingsSchema } from './trainer';

describe('paymentSchema', () => {
  const paid = {
    id: 'p1', clientId: 'c1', amountMinor: 150_000, currency: 'EGP', status: 'paid',
    paidOn: '2026-11-01', dueOn: null, method: 'cash', note: '', ...meta(),
  };
  it('accepts a paid payment', () => expect(paymentSchema.safeParse(paid).success).toBe(true));
  it('rejects zero amount', () => expect(paymentSchema.safeParse({ ...paid, amountMinor: 0 }).success).toBe(false));
  it('rejects paid without paidOn', () => expect(paymentSchema.safeParse({ ...paid, paidOn: null }).success).toBe(false));
  it('accepts a due payment with dueOn', () =>
    expect(paymentSchema.safeParse({ ...paid, status: 'due', paidOn: null, dueOn: '2026-12-01' }).success).toBe(true));
});

describe('sessions and recurrence', () => {
  const rule = { freq: 'weekly', interval: 1, byWeekday: [0, 2, 4], until: null, count: null };
  it('accepts a weekly rule', () => expect(recurrenceRuleSchema.safeParse(rule).success).toBe(true));
  it('rejects duplicate weekdays', () =>
    expect(recurrenceRuleSchema.safeParse({ ...rule, byWeekday: [1, 1] }).success).toBe(false));
  it('rejects both until and count', () =>
    expect(recurrenceRuleSchema.safeParse({ ...rule, until: '2026-12-31', count: 5 }).success).toBe(false));
  it('rejects weekday 7', () => expect(recurrenceRuleSchema.safeParse({ ...rule, byWeekday: [7] }).success).toBe(false));
  it('validates a session with attendance', () => {
    const s = {
      id: 's1', clientId: 'c1', startsAt: 1_763_280_000_000, durationMin: 60, recurrence: rule,
      seriesId: null, attendance: 'attended', programId: null, notes: '', ...meta(),
    };
    expect(sessionSchema.safeParse(s).success).toBe(true);
    expect(sessionSchema.safeParse({ ...s, durationMin: 0 }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...s, attendance: 'late' }).success).toBe(false);
  });
});

describe('exerciseSchema', () => {
  const custom = {
    id: 'e1', source: 'custom', builtinRef: null, name: 'هيب ثرست', primaryMuscles: ['glutes'],
    secondaryMuscles: [], equipment: '', level: null, instructions: '', imageIds: [], favorite: false, ...meta(),
  };
  it('accepts custom without builtinRef', () => expect(exerciseSchema.safeParse(custom).success).toBe(true));
  it('rejects custom with builtinRef', () =>
    expect(exerciseSchema.safeParse({ ...custom, builtinRef: 'Barbell_Hip_Thrust' }).success).toBe(false));
  it('rejects builtin without builtinRef', () =>
    expect(exerciseSchema.safeParse({ ...custom, source: 'builtin' }).success).toBe(false));
});

describe('programSchema', () => {
  const item = {
    id: 'i1', exerciseId: 'e1', sets: 4, reps: '8-12', restSec: 90, tempo: '3-1-1-0', rpe: 8.5,
    supersetGroup: 'A', notes: '',
  };
  const program = {
    id: 'pr1', name: 'Push/Pull/Legs', clientId: null, isTemplate: true, notes: '',
    days: [{ id: 'd1', name: 'Push', items: [item] }], ...meta(),
  };
  it('accepts a template program', () => expect(programSchema.safeParse(program).success).toBe(true));
  it('accepts empty tempo and null RPE', () => {
    const p = { ...program, days: [{ id: 'd1', name: '', items: [{ ...item, tempo: '', rpe: null, supersetGroup: null }] }] };
    expect(programSchema.safeParse(p).success).toBe(true);
  });
  it.each([{ sets: 0 }, { rpe: 8.3 }, { rpe: 11 }, { tempo: '31-1' }, { reps: '' }])('rejects item %o', (bad) => {
    const p = { ...program, days: [{ id: 'd1', name: '', items: [{ ...item, ...bad }] }] };
    expect(programSchema.safeParse(p).success).toBe(false);
  });
});

describe('supplementSchema', () => {
  it('dose is free text and may be empty — no default dose exists', () => {
    const s = {
      id: 'sp1', name: 'واي بروتين', imageId: null, priceMinor: null, currency: 'EGP', dose: '', timing: '', notes: '',
      ...meta(),
    };
    const parsed = supplementSchema.parse(s);
    expect(parsed.dose).toBe('');
  });
});

describe('mealPlanSchema', () => {
  it('requires each item to be a recipe or text', () => {
    const plan = {
      id: 'm1', clientId: 'c1', name: 'خطة تنشيف', targetKcal: 1800, notes: '', ...meta(),
      meals: [{ id: 'x', name: 'فطار', time: '08:00', items: [{ recipeId: null, text: '', servings: 1 }] }],
    };
    expect(mealPlanSchema.safeParse(plan).success).toBe(false);
  });
});

describe('pdfTemplateSchema', () => {
  it('rejects duplicate and empty sections', () => {
    const t = {
      id: 't1', name: 'افتراضي', sections: ['cover', 'cover'], coverImageId: null, backgroundImageId: null,
      showLogo: true, accentColor: null, ...meta(),
    };
    expect(pdfTemplateSchema.safeParse(t).success).toBe(false);
    expect(pdfTemplateSchema.safeParse({ ...t, sections: [] }).success).toBe(false);
  });
});

describe('trainer settings defaults', () => {
  it('defaults are valid and use EGP', () => {
    const s = trainerSettingsSchema.parse(defaultTrainerSettings(0));
    expect(s.currency).toBe('EGP');
    expect(s.formulas.bmrFormula).toBe('mifflin_st_jeor');
  });
});
