import { describe, expect, it } from 'vitest';
import { fixedOffsetClock } from '../schedule/zone';
import { bookingConflicts, planOccurrences, recurrenceRuleOf, seriesExceptions, weeklyRecurrenceOf, MAX_SERIES_WEEKS } from './booking';

const cairo = fixedOffsetClock(120);
const at = (iso: string) => new Date(iso).getTime();

describe('planOccurrences', () => {
  it('a single session is one occurrence at the local wall time', () => {
    const r = planOccurrences({ date: '2026-11-18', startMinute: 18 * 60, durationMinutes: 60, repeat: null }, cairo);
    expect(r).toEqual({ ok: true, value: [{ date: '2026-11-18', startMs: at('2026-11-18T18:00:00+02:00'), durationMinutes: 60 }] });
  });
  it('weekly on Sat and Tue, by count', () => {
    const r = planOccurrences(
      { date: '2026-11-21', startMinute: 9 * 60, durationMinutes: 45, repeat: { weekdays: [6, 2], intervalWeeks: 1, until: null, count: 4 } },
      cairo,
    );
    expect(r.ok && r.value.map((o) => o.date)).toEqual(['2026-11-21', '2026-11-24', '2026-11-28', '2026-12-01']);
  });
  it('every two weeks until a date (inclusive)', () => {
    const r = planOccurrences(
      { date: '2026-11-16', startMinute: 600, durationMinutes: 60, repeat: { weekdays: [1], intervalWeeks: 2, until: '2026-12-14', count: null } },
      cairo,
    );
    expect(r.ok && r.value.map((o) => o.date)).toEqual(['2026-11-16', '2026-11-30', '2026-12-14']);
  });
  it('open-ended series are capped', () => {
    const r = planOccurrences(
      { date: '2026-11-16', startMinute: 600, durationMinutes: 60, repeat: { weekdays: [1], intervalWeeks: 1, until: null, count: null } },
      cairo,
    );
    expect(r.ok && r.value.length).toBe(MAX_SERIES_WEEKS + 1);
  });
  it('reports invalid input from the recurrence domain', () => {
    expect(planOccurrences({ date: '2026-11-16', startMinute: 600, durationMinutes: 60, repeat: { weekdays: [], intervalWeeks: 1, until: null, count: 2 } }, cairo)).toEqual({
      ok: false,
      error: 'no_weekdays',
    });
    expect(planOccurrences({ date: '2026-02-30', startMinute: 600, durationMinutes: 60, repeat: null }, cairo).ok).toBe(false);
  });
});

describe('bookingConflicts', () => {
  const existing = [
    { id: 'a', startMs: at('2026-11-18T18:00:00+02:00'), durationMinutes: 60 },
    { id: 'b', startMs: at('2026-11-25T19:00:00+02:00'), durationMinutes: 60 },
  ];
  const plan = planOccurrences(
    { date: '2026-11-18', startMinute: 18 * 60 + 30, durationMinutes: 30, repeat: { weekdays: [3], intervalWeeks: 1, until: null, count: 2 } },
    cairo,
  );
  it('finds overlaps per occurrence; touching ends do not clash', () => {
    if (!plan.ok) throw new Error(plan.error);
    const hits = bookingConflicts(plan.value, existing);
    expect(hits.map((h) => [h.occurrence.date, h.with.id])).toEqual([['2026-11-18', 'a']]);
  });
  it('ignores the sessions being edited', () => {
    if (!plan.ok) throw new Error(plan.error);
    expect(bookingConflicts(plan.value, existing, new Set(['a']))).toEqual([]);
  });
});

describe('series rule and exceptions', () => {
  it('stores a sorted, de-duplicated weekly rule', () => {
    expect(recurrenceRuleOf({ weekdays: [6, 2, 6], intervalWeeks: 1, until: null, count: 8 })).toEqual({
      freq: 'weekly',
      interval: 1,
      byWeekday: [2, 6],
      until: null,
      count: 8,
    });
  });
  it('dates without a live session become exceptions', () => {
    const rule = weeklyRecurrenceOf({ date: '2026-11-16', startMinute: 600, durationMinutes: 60, repeat: { weekdays: [1], intervalWeeks: 1, until: null, count: 3 } });
    expect(seriesExceptions(rule, new Set(['2026-11-16', '2026-11-30']), '2027-01-01')).toEqual(['2026-11-23']);
  });
});
