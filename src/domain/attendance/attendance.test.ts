import { describe, expect, it } from 'vitest';
import { markOf, remainingAfterChange, statusOf, storedAttendanceFor, toggleMark } from './attendance';

describe('attendance mapping', () => {
  it('stores no-show and late cancel as missed, and reads them back', () => {
    expect(storedAttendanceFor('attended')).toBe('attended');
    expect(storedAttendanceFor('noShow')).toBe('missed');
    expect(storedAttendanceFor('lateCancel')).toBe('missed');
    expect(storedAttendanceFor(null)).toBe('scheduled');
    expect(markOf('missed', true)).toBe('lateCancel');
    expect(markOf('missed', false)).toBe('noShow');
    expect(markOf('scheduled', false)).toBeNull();
    expect(statusOf('cancelled', false)).toBe('cancelled');
  });
  it('tapping the active status clears it', () => {
    expect(toggleMark('attended', 'attended')).toBeNull();
    expect(toggleMark('attended', 'noShow')).toBe('noShow');
    expect(toggleMark(null, 'lateCancel')).toBe('lateCancel');
  });
});

describe('remainingAfterChange', () => {
  it('attended, no-show and late cancel each use one session', () => {
    for (const after of ['attended', 'noShow', 'lateCancel'] as const) {
      expect(remainingAfterChange({ stored: 5, before: null, after })).toBe(4);
    }
  });
  it('switching between consuming statuses does not double count', () => {
    expect(remainingAfterChange({ stored: 4, before: 'attended', after: 'lateCancel' })).toBe(4);
  });
  it('clearing or cancelling gives the session back', () => {
    expect(remainingAfterChange({ stored: 4, before: 'attended', after: null })).toBe(5);
    expect(remainingAfterChange({ stored: 4, before: 'noShow', after: 'cancelled' })).toBe(5);
  });
  it('never goes below zero', () => {
    expect(remainingAfterChange({ stored: 0, before: null, after: 'attended' })).toBe(0);
  });
  it('follows a custom consuming policy', () => {
    expect(remainingAfterChange({ stored: 3, before: null, after: 'lateCancel', consuming: ['attended'] })).toBe(3);
  });
});
