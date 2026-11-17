const DAY_MS = 86_400_000;
export const DEFAULT_BACKUP_REMINDER_DAYS = 7;

export interface BackupReminderInput {
  /** Last time a local backup file was saved (epoch ms), null if never. */
  lastBackupAt: number | null;
  /** When the trainer started using the app; avoids nagging on day one. null = unknown. */
  firstUseAt: number | null;
  /** The trainer tapped "later" until this time. */
  snoozedUntil?: number | null;
  now: Date;
  intervalDays?: number;
}

export interface BackupReminder {
  due: boolean;
  /** Whole days since the last backup, null if there never was one. */
  daysSince: number | null;
}

/** Weekly reminder: flag when no local backup file was saved in the last `intervalDays` days. */
export function backupReminder(input: BackupReminderInput): BackupReminder {
  const now = input.now.getTime();
  const interval = (input.intervalDays ?? DEFAULT_BACKUP_REMINDER_DAYS) * DAY_MS;
  const snoozed = input.snoozedUntil != null && input.snoozedUntil > now;
  if (input.lastBackupAt !== null) {
    const age = Math.max(0, now - input.lastBackupAt);
    return { due: !snoozed && age >= interval, daysSince: Math.floor(age / DAY_MS) };
  }
  const usedLongEnough = input.firstUseAt === null || now - input.firstUseAt >= interval;
  return { due: !snoozed && usedLongEnough, daysSince: null };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** e.g. `pt-coach-backup-2026-11-16-1530.zip`; local time of `now`. Encrypted files use `.ptbackup`. */
export function backupFileName(now: Date, encrypted: boolean): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `pt-coach-backup-${stamp}.${encrypted ? 'ptbackup' : 'zip'}`;
}

export interface BackupCardInput {
  /** Last device backup file that was really saved/shared (epoch ms). */
  lastLocalAt: number | null;
  lastCloudAt: number | null;
  /** The optional cloud copy is switched on; its time is shown only then. */
  cloudEnabled: boolean;
  firstUseAt: number | null;
  snoozedUntil: number | null;
  intervalDays?: number;
  now: Date;
}

export interface BackupCardModel {
  /** Show the nudge and the one-tap button prominently. */
  due: boolean;
  tone: 'ok' | 'due' | 'never';
  localAt: number | null;
  localDaysSince: number | null;
  cloudAt: number | null;
}

/**
 * Home card / Settings line. The nudge follows the device file only: the cloud copy is an optional extra
 * that may be down or switched off, so it never stands in for the file on the phone.
 */
export function backupCard(input: BackupCardInput): BackupCardModel {
  const r = backupReminder({
    lastBackupAt: input.lastLocalAt,
    firstUseAt: input.firstUseAt,
    snoozedUntil: input.snoozedUntil,
    now: input.now,
    intervalDays: input.intervalDays,
  });
  return {
    due: r.due,
    tone: input.lastLocalAt === null ? 'never' : r.due ? 'due' : 'ok',
    localAt: input.lastLocalAt,
    localDaysSince: r.daysSince,
    cloudAt: input.cloudEnabled ? input.lastCloudAt : null,
  };
}

/** "فكّرني بعدين": hide the nudge for `days` days. */
export function snoozeUntil(now: Date, days = 1): number {
  return now.getTime() + days * DAY_MS;
}
