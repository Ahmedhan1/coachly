/** The "when was the last backup" rule shared by Home and Settings. */

export interface BackupTimes {
  lastLocalAt: number | null;
  lastCloudAt: number | null;
}

export type BackupPlace = 'local' | 'cloud';

/** The most recent backup of any kind, or null when there never was one. */
export function latestBackup(times: BackupTimes): { at: number; place: BackupPlace } | null {
  const candidates: Array<{ at: number | null; place: BackupPlace }> = [
    { at: times.lastLocalAt, place: 'local' },
    { at: times.lastCloudAt, place: 'cloud' },
  ];
  let best: { at: number; place: BackupPlace } | null = null;
  for (const c of candidates) {
    if (typeof c.at === 'number' && c.at > 0 && (best === null || c.at > best.at)) best = { at: c.at, place: c.place };
  }
  return best;
}

export const REMINDER_DAY_CHOICES: readonly number[] = [3, 7, 14];
