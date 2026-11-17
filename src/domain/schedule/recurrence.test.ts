import { describe, expect, it } from 'vitest';
import { expandRecurrence, firstOccurrenceDate, occurrencesToSessions, type WeeklyRecurrence } from './recurrence';
import { intlZonedClock } from './zone';

// 2026-11-14 is a Saturday. Sat=6, Mon=1, Wed=3.
const base: WeeklyRecurrence = {
  startDate: '2026-11-14',
  startMinute: 18 * 60,
  durationMinutes: 60,
  weekdays: [6, 1, 3],
};

const dates = (r: ReturnType<typeof expandRecurrence>): string[] => (r.ok ? r.value.map((o) => o.date) : [r.error]);

describe('expandRecurrence', () => {
  it('weekly on Sat/Mon/Wed within a range', () => {
    expect(dates(expandRecurrence(base, { from: '2026-11-14', to: '2026-11-27' }))).toEqual([
      '2026-11-14',
      '2026-11-16',
      '2026-11-18',
      '2026-11-21',
      '2026-11-23',
      '2026-11-25',
    ]);
  });

  it('carries start minute and duration', () => {
    const r = expandRecurrence(base, { from: '2026-11-14', to: '2026-11-14' });
    expect(r).toEqual({ ok: true, value: [{ date: '2026-11-14', startMinute: 1080, durationMinutes: 60 }] });
  });

  it('every 2 weeks, weeks counted from the Saturday week containing the start', () => {
    // start Mon 2026-11-16 (week of Sat 11-14). Active weeks: 11-14, 11-28, 12-12.
    const r = expandRecurrence(
      { ...base, startDate: '2026-11-16', intervalWeeks: 2 },
      { from: '2026-11-01', to: '2026-12-13' },
    );
    expect(dates(r)).toEqual(['2026-11-16', '2026-11-18', '2026-11-28', '2026-11-30', '2026-12-02', '2026-12-12']);
  });

  it('until is inclusive', () => {
    expect(dates(expandRecurrence({ ...base, until: '2026-11-18' }, { from: '2026-11-01', to: '2027-01-01' }))).toEqual([
      '2026-11-14',
      '2026-11-16',
      '2026-11-18',
    ]);
  });

  it('count limits occurrences and exceptions still consume the count (RFC 5545)', () => {
    const r = expandRecurrence(
      { ...base, count: 4, exceptions: ['2026-11-16'] },
      { from: '2026-11-01', to: '2027-01-01' },
    );
    expect(dates(r)).toEqual(['2026-11-14', '2026-11-18', '2026-11-21']);
  });

  it('range starting mid-series still respects count from the series start', () => {
    const r = expandRecurrence({ ...base, count: 4 }, { from: '2026-11-20', to: '2027-01-01' });
    expect(dates(r)).toEqual(['2026-11-21']);
  });

  it('days before startDate are never generated', () => {
    // start Wednesday: Sat 14 and Mon 16 of the same week are skipped
    expect(dates(expandRecurrence({ ...base, startDate: '2026-11-18' }, { from: '2026-11-14', to: '2026-11-21' }))).toEqual([
      '2026-11-18',
      '2026-11-21',
    ]);
  });

  it('keeps the same wall time across a DST change and the UTC instant shifts', () => {
    // Egypt DST starts Friday 2026-04-24. Weekly Thursday 18:00 sessions.
    const r = expandRecurrence(
      { startDate: '2026-04-16', startMinute: 1080, durationMinutes: 60, weekdays: [4] },
      { from: '2026-04-16', to: '2026-04-30' },
    );
    expect(dates(r)).toEqual(['2026-04-16', '2026-04-23', '2026-04-30']);
    const clock = intlZonedClock('Africa/Cairo');
    if (!r.ok || !clock.ok) throw new Error('setup');
    const sessions = occurrencesToSessions(r.value, clock.value, 'c1', (d) => `rec1:${d}`);
    expect(sessions.map((s) => new Date(s.startMs).toISOString())).toEqual([
      '2026-04-16T16:00:00.000Z',
      '2026-04-23T16:00:00.000Z',
      '2026-04-30T15:00:00.000Z',
    ]);
    expect(sessions[0]).toMatchObject({ id: 'rec1:2026-04-16', clientId: 'c1', durationMinutes: 60 });
  });

  it.each([
    [{ weekdays: [] }, 'no_weekdays'],
    [{ startMinute: 1440 }, 'invalid_start_minute'],
    [{ durationMinutes: 0 }, 'invalid_duration'],
    [{ intervalWeeks: 0 }, 'invalid_interval'],
    [{ count: 0 }, 'invalid_count'],
    [{ until: '2026-11-01' }, 'until_before_start'],
    [{ startDate: '2026-02-30' }, 'invalid_date'],
    [{ exceptions: ['x'] }, 'invalid_date'],
  ] as const)('rejects %o', (patch, error) => {
    expect(expandRecurrence({ ...base, ...patch }, { from: '2026-11-01', to: '2026-12-01' })).toEqual({ ok: false, error });
  });
});

describe('firstOccurrenceDate', () => {
  it('is the first matching weekday on/after the start date', () => {
    // start Sunday 2026-11-15, weekdays Mon/Wed -> Monday 2026-11-16
    expect(firstOccurrenceDate({ ...base, startDate: '2026-11-15', weekdays: [1, 3] })).toEqual({
      ok: true,
      value: '2026-11-16',
    });
  });
});

describe('firstOccurrenceDate edge', () => {
  it('reports no_occurrences when until ends before the first matching weekday', () => {
    // start Sat 2026-11-14 until Sun 11-15, only Mondays
    expect(firstOccurrenceDate({ ...base, weekdays: [1], until: '2026-11-15' })).toEqual({ ok: false, error: 'no_occurrences' });
  });
});
