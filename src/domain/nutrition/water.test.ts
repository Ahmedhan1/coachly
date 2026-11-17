import { describe, expect, it } from 'vitest';
import { waterIntake } from './water';

describe('waterIntake', () => {
  it('80 kg: 80*30 = 2400 ml to 80*35 = 2800 ml', () => {
    expect(waterIntake(80)).toEqual({ ok: true, value: { minMl: 2400, maxMl: 2800 } });
  });

  it('custom coefficient and invalid input', () => {
    expect(waterIntake(70, { min: 40, max: 40 })).toEqual({ ok: true, value: { minMl: 2800, maxMl: 2800 } });
    expect(waterIntake(0)).toEqual({ ok: false, error: 'invalid_weight' });
    expect(waterIntake(70, { min: 35, max: 30 })).toEqual({ ok: false, error: 'invalid_coefficient' });
  });
});
