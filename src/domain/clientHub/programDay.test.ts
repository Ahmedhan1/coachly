import { describe, expect, it } from 'vitest';
import { parseSessionDays, plannedDay, setSessionDays, SESSION_DAYS_MAX } from './programDay';

const days = [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }];
const log = (programDayId: string, createdAt: number) => ({ programId: 'p1', programDayId, createdAt });

describe('plannedDay', () => {
  it('prefers the day attached to the booking', () => {
    expect(plannedDay({ days, attachedDayId: 'd3', logs: [log('d1', 1)], programId: 'p1' })).toEqual({ day: { id: 'd3' }, how: 'attached' });
  });
  it('otherwise takes the next day in rotation after the last logged one', () => {
    expect(plannedDay({ days, attachedDayId: null, logs: [log('d1', 1), log('d2', 2)], programId: 'p1' })).toEqual({ day: { id: 'd3' }, how: 'rotation' });
  });
  it('ignores an attached day that no longer exists', () => {
    expect(plannedDay({ days, attachedDayId: 'gone', logs: [], programId: 'p1' })?.day.id).toBe('d1');
  });
  it('is null for a program without days', () => {
    expect(plannedDay({ days: [], attachedDayId: 'd1', logs: [], programId: 'p1' })).toBeNull();
  });
});

describe('session → day map', () => {
  it('parses safely, attaches and detaches days for several sessions', () => {
    expect(parseSessionDays(null)).toEqual({});
    const a = setSessionDays({}, ['s1', 's2'], 'd1');
    expect(a).toEqual({ s1: 'd1', s2: 'd1' });
    expect(setSessionDays(a, ['s1'], null)).toEqual({ s2: 'd1' });
  });
  it('keeps only the newest entries', () => {
    const many = Object.fromEntries(Array.from({ length: SESSION_DAYS_MAX }, (_, i) => [`s${i}`, 'd']));
    const next = setSessionDays(many, ['new'], 'd');
    expect(Object.keys(next)).toHaveLength(SESSION_DAYS_MAX);
    expect(next.new).toBe('d');
    expect(next.s0).toBeUndefined();
  });
});
