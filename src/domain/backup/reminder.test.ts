import { describe, expect, it } from 'vitest';
import { backupCard, snoozeUntil } from './reminder';
import { needsSaveConfirmation, shouldRecordSave } from './saveOutcome';

const DAY = 86_400_000;
const now = new Date('2026-11-17T10:00:00Z');
const base = { lastLocalAt: null, lastCloudAt: null, cloudEnabled: false, firstUseAt: now.getTime() - 30 * DAY, snoozedUntil: null, now };

describe('backupCard (Home card / Settings line)', () => {
  it('never backed up after a week of use: due, tone never', () => {
    expect(backupCard(base)).toEqual({ due: true, tone: 'never', localAt: null, localDaysSince: null, cloudAt: null });
  });

  it('first days of use: not nagging yet', () => {
    expect(backupCard({ ...base, firstUseAt: now.getTime() - DAY }).due).toBe(false);
  });

  it('a recent device file is ok, a week-old one is due', () => {
    expect(backupCard({ ...base, lastLocalAt: now.getTime() - 2 * DAY })).toMatchObject({ due: false, tone: 'ok', localDaysSince: 2 });
    expect(backupCard({ ...base, lastLocalAt: now.getTime() - 7 * DAY })).toMatchObject({ due: true, tone: 'due', localDaysSince: 7 });
  });

  it('a cloud copy does not replace the device file (cloud is an optional extra)', () => {
    const m = backupCard({ ...base, lastLocalAt: now.getTime() - 9 * DAY, lastCloudAt: now.getTime() - 1000, cloudEnabled: true });
    expect(m.due).toBe(true);
    expect(m.cloudAt).toBe(now.getTime() - 1000);
  });

  it('hides the cloud time when the cloud backup is off', () => {
    expect(backupCard({ ...base, lastCloudAt: 5, cloudEnabled: false }).cloudAt).toBeNull();
  });

  it('snooze hides the nudge until it ends; custom interval', () => {
    const last = now.getTime() - 10 * DAY;
    expect(backupCard({ ...base, lastLocalAt: last, snoozedUntil: now.getTime() + 1 }).due).toBe(false);
    expect(backupCard({ ...base, lastLocalAt: last, snoozedUntil: now.getTime() - 1 }).due).toBe(true);
    expect(backupCard({ ...base, lastLocalAt: last, intervalDays: 14 }).due).toBe(false);
    expect(snoozeUntil(now)).toBe(now.getTime() + DAY);
    expect(snoozeUntil(now, 3)).toBe(now.getTime() + 3 * DAY);
  });
});

describe('save outcome', () => {
  it('counts share and save-picker as saved, a download only after the trainer confirms', () => {
    expect(shouldRecordSave('shared', null)).toBe(true);
    expect(shouldRecordSave('saved', null)).toBe(true);
    expect(shouldRecordSave('downloaded', null)).toBe(false);
    expect(shouldRecordSave('downloaded', false)).toBe(false);
    expect(shouldRecordSave('downloaded', true)).toBe(true);
    expect(shouldRecordSave('cancelled', true)).toBe(false);
    expect(shouldRecordSave('failed', true)).toBe(false);
    expect(needsSaveConfirmation('downloaded')).toBe(true);
    expect(needsSaveConfirmation('shared')).toBe(false);
  });
});
