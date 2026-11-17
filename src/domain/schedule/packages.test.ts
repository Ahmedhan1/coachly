import { describe, expect, it } from 'vitest';
import { packageUsage, type AttendanceRecord } from './packages';

const rec = (sessionId: string, status: AttendanceRecord['status'], packageId = 'p1'): AttendanceRecord => ({
  sessionId,
  packageId,
  status,
});

describe('packageUsage', () => {
  it('12-session package: 2 attended + 1 no-show + 1 late cancel used, cancelled is free', () => {
    // used = 4, remaining = 12 - 4 = 8
    const r = packageUsage({ id: 'p1', totalSessions: 12 }, [
      rec('s1', 'attended'),
      rec('s2', 'attended'),
      rec('s3', 'noShow'),
      rec('s4', 'lateCancel'),
      rec('s5', 'cancelled'),
      rec('s6', 'attended', 'other'),
    ]);
    expect(r).toEqual({ used: 4, remaining: 8, overused: 0 });
  });

  it('last record per session wins and policy is configurable', () => {
    const records = [rec('s1', 'noShow'), rec('s1', 'cancelled'), rec('s2', 'noShow')];
    expect(packageUsage({ id: 'p1', totalSessions: 5 }, records)).toEqual({ used: 1, remaining: 4, overused: 0 });
    expect(packageUsage({ id: 'p1', totalSessions: 5 }, records, ['attended'])).toEqual({ used: 0, remaining: 5, overused: 0 });
  });

  it('over-use never yields negative remaining', () => {
    expect(packageUsage({ id: 'p1', totalSessions: 1 }, [rec('a', 'attended'), rec('b', 'attended')])).toEqual({
      used: 2,
      remaining: 0,
      overused: 1,
    });
  });
});
