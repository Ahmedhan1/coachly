import { describe, expect, it } from 'vitest';
import { currencySchema, hexColorSchema, isoDateSchema, moneyMinorSchema, timeOfDaySchema } from './common';
import { clientIdSchema } from './ids';

describe('isoDateSchema', () => {
  it.each(['2026-02-28', '2024-02-29', '2026-12-31'])('accepts %s', (d) => {
    expect(isoDateSchema.safeParse(d).success).toBe(true);
  });
  it.each(['2026-02-29', '2026-13-01', '2026-04-31', '26-01-01', '2026-1-1', '2026-01-01T00:00', ''])(
    'rejects %s',
    (d) => {
      expect(isoDateSchema.safeParse(d).success).toBe(false);
    },
  );
});

describe('moneyMinorSchema', () => {
  it('accepts integer minor units including zero', () => {
    expect(moneyMinorSchema.parse(0)).toBe(0);
    expect(moneyMinorSchema.parse(150_000)).toBe(150_000);
  });
  it.each([12.5, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (n) => {
    expect(moneyMinorSchema.safeParse(n).success).toBe(false);
  });
});

describe('small value schemas', () => {
  it('currency must be a 3-letter upper-case code', () => {
    expect(currencySchema.safeParse('EGP').success).toBe(true);
    expect(currencySchema.safeParse('egp').success).toBe(false);
    expect(currencySchema.safeParse('EGPX').success).toBe(false);
  });
  it('colors must be #RRGGBB', () => {
    expect(hexColorSchema.safeParse('#2f6F5e').success).toBe(true);
    expect(hexColorSchema.safeParse('#fff').success).toBe(false);
    expect(hexColorSchema.safeParse('red').success).toBe(false);
  });
  it('time of day is 24h HH:MM', () => {
    expect(timeOfDaySchema.safeParse('23:59').success).toBe(true);
    expect(timeOfDaySchema.safeParse('24:00').success).toBe(false);
    expect(timeOfDaySchema.safeParse('7:30').success).toBe(false);
  });
  it('ids are non-empty url-safe strings', () => {
    expect(clientIdSchema.safeParse('c_01-AB').success).toBe(true);
    expect(clientIdSchema.safeParse('').success).toBe(false);
    expect(clientIdSchema.safeParse('has space').success).toBe(false);
    expect(clientIdSchema.safeParse('x'.repeat(65)).success).toBe(false);
  });
});
