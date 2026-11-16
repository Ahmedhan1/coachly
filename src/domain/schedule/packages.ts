export type AttendanceStatus = 'attended' | 'noShow' | 'lateCancel' | 'cancelled';

export interface AttendanceRecord {
  sessionId: string;
  packageId: string;
  status: AttendanceStatus;
}

/** Which statuses use up a session from the package. Trainer-editable policy. */
export const DEFAULT_CONSUMING_STATUSES: readonly AttendanceStatus[] = ['attended', 'noShow', 'lateCancel'];

export interface PackageUsage {
  used: number;
  remaining: number;
  /** Sessions consumed beyond the package size (owed by the client). */
  overused: number;
}

/**
 * Remaining sessions in a package. When a session has several records (status corrected later),
 * the last one in the array wins.
 */
export function packageUsage(
  pkg: { id: string; totalSessions: number },
  records: readonly AttendanceRecord[],
  consuming: readonly AttendanceStatus[] = DEFAULT_CONSUMING_STATUSES,
): PackageUsage {
  const latest = new Map<string, AttendanceStatus>();
  for (const r of records) if (r.packageId === pkg.id) latest.set(r.sessionId, r.status);
  let used = 0;
  for (const status of latest.values()) if (consuming.includes(status)) used++;
  const total = Math.max(0, Math.floor(pkg.totalSessions));
  return { used, remaining: Math.max(0, total - used), overused: Math.max(0, used - total) };
}
