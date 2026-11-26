import { describe, expect, it } from 'vitest';
import { endOfCairoDay } from '../src/admin/cairoDate';

describe('endOfCairoDay', () => {
  it('ends at the next Cairo midnight, winter (UTC+2) and summer (UTC+3)', () => {
    expect(endOfCairoDay('2027-01-31')).toBe(Date.UTC(2027, 1, 1, -2) / 1000);
    expect(endOfCairoDay('2026-07-15')).toBe(Date.UTC(2026, 6, 16, -3) / 1000);
  });

  it('rejects malformed or impossible dates', () => {
    for (const bad of ['', '2027-02-30', '27-01-01', '2027-1-1', 'x']) expect(endOfCairoDay(bad)).toBeNull();
  });
});
