import { describe, expect, it } from 'vitest';
import { fixedOffsetClock, intlZonedClock, localDateAt, type ZonedClock } from './zone';

function cairo(): ZonedClock {
  const r = intlZonedClock('Africa/Cairo');
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('fixedOffsetClock', () => {
  const c = fixedOffsetClock(120);
  it('converts wall time to UTC and back', () => {
    // 2026-11-16 18:00 at +02:00 = 16:00Z
    const t = c.toEpochMs({ date: '2026-11-16', minute: 18 * 60 });
    expect(new Date(t).toISOString()).toBe('2026-11-16T16:00:00.000Z');
    expect(c.toLocal(t)).toEqual({ date: '2026-11-16', minute: 1080 });
  });

  it('local date crosses midnight correctly', () => {
    // 23:30Z at +02:00 is 01:30 the next day
    expect(localDateAt(new Date('2026-11-16T23:30:00Z'), c)).toBe('2026-11-17');
  });
});

describe('intlZonedClock (Africa/Cairo, Egypt DST since 2023)', () => {
  it('rejects unknown zones', () => {
    expect(intlZonedClock('Mars/Olympus')).toEqual({ ok: false, error: 'invalid_time_zone' });
  });

  it('winter is +02:00 and summer is +03:00', () => {
    const c = cairo();
    expect(c.offsetMinutesAt(Date.parse('2026-01-15T12:00:00Z'))).toBe(120);
    expect(c.offsetMinutesAt(Date.parse('2026-07-15T12:00:00Z'))).toBe(180);
  });

  it('same wall time maps to different UTC instants across DST', () => {
    const c = cairo();
    expect(new Date(c.toEpochMs({ date: '2026-04-20', minute: 1080 })).toISOString()).toBe('2026-04-20T16:00:00.000Z');
    expect(new Date(c.toEpochMs({ date: '2026-05-04', minute: 1080 })).toISOString()).toBe('2026-05-04T15:00:00.000Z');
  });

  it('non-existent wall time (spring-forward gap, 2025-04-25 00:30) moves forward', () => {
    // Clocks jump 00:00 -> 01:00 on Friday 2025-04-25; 00:30 is resolved with +02:00 = 22:30Z = 01:30 local.
    const c = cairo();
    const t = c.toEpochMs({ date: '2025-04-25', minute: 30 });
    expect(new Date(t).toISOString()).toBe('2025-04-24T22:30:00.000Z');
    expect(c.toLocal(t)).toEqual({ date: '2025-04-25', minute: 90 });
  });

  it('ambiguous wall time (fall-back overlap, 2025-10-30 23:30) resolves to the earlier instant', () => {
    // Thursday 2025-10-30 24:00 EEST -> 23:00 EET, so 23:30 happens twice; first one is at +03:00 = 20:30Z.
    const c = cairo();
    expect(new Date(c.toEpochMs({ date: '2025-10-30', minute: 23 * 60 + 30 })).toISOString()).toBe(
      '2025-10-30T20:30:00.000Z',
    );
  });
});
