import type { Attendance } from '../models/session';
import { packageUsage, type AttendanceStatus, type AttendanceRecord } from '../schedule/packages';
import { MAX_REMAINING_SESSIONS } from './renewal';

/**
 * Bridges the stored session attendance (`scheduled | attended | missed | cancelled`) and the schedule
 * domain's statuses (`attended | noShow | lateCancel | cancelled`). A late cancellation is stored as
 * `missed` (it uses up a session like a no-show) plus a marker kept next to the schedule preferences.
 */
export type MarkStatus = Extract<AttendanceStatus, 'attended' | 'noShow' | 'lateCancel'>;
export const MARK_STATUSES: readonly MarkStatus[] = ['attended', 'noShow', 'lateCancel'];

export function storedAttendanceFor(mark: MarkStatus | null): Attendance {
  if (mark === 'attended') return 'attended';
  if (mark === 'noShow' || mark === 'lateCancel') return 'missed';
  return 'scheduled';
}

/** The status shown on the attendance toggle, or null while the session is still just scheduled. */
export function markOf(attendance: Attendance, lateCancel: boolean): MarkStatus | null {
  if (attendance === 'attended') return 'attended';
  if (attendance === 'missed') return lateCancel ? 'lateCancel' : 'noShow';
  return null;
}

/** Domain status of a stored session (null = scheduled, nothing recorded yet). */
export function statusOf(attendance: Attendance, lateCancel: boolean): AttendanceStatus | null {
  return attendance === 'cancelled' ? 'cancelled' : markOf(attendance, lateCancel);
}

/** Tapping the active status again clears it (back to "scheduled"). */
export function toggleMark(current: MarkStatus | null, tapped: MarkStatus): MarkStatus | null {
  return current === tapped ? null : tapped;
}

/** Storage limit of `Client.remainingSessions`. */
const MAX_REMAINING = MAX_REMAINING_SESSIONS;

function usedBy(status: AttendanceStatus | null, consuming?: readonly AttendanceStatus[]): number {
  if (status === null) return 0;
  const records: AttendanceRecord[] = [{ sessionId: 's', packageId: 'p', status }];
  return packageUsage({ id: 'p', totalSessions: Number.MAX_SAFE_INTEGER }, records, consuming).used;
}

/**
 * The client's remaining sessions after one session's status changes from `before` to `after`.
 * Works on the stored counter (so packages entered with sessions already used stay right); the change
 * in usage comes from the schedule domain's `packageUsage` policy. Never below 0; may exceed `total` when
 * sessions were carried over from a renewal, so there is no upper clamp beyond the storage limit.
 */
export function remainingAfterChange(input: {
  stored: number;
  before: AttendanceStatus | null;
  after: AttendanceStatus | null;
  consuming?: readonly AttendanceStatus[];
}): number {
  const delta = usedBy(input.after, input.consuming) - usedBy(input.before, input.consuming);
  return Math.min(MAX_REMAINING, Math.max(0, input.stored - delta));
}
