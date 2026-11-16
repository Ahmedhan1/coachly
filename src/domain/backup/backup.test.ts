import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  imageFilePath,
  isAllowedArchivePath,
  mimeForImagePath,
  parseManifest,
  verifyArchiveFiles,
  type BackupManifest,
} from './manifest';
import {
  chooseCloudVariant,
  CLOUD_HARD_CAP_BYTES,
  DEFAULT_CLOUD_BUDGET_BYTES,
  downgradeVariant,
  estimatedArchiveBytes,
  schemaAction,
  smallerVariant,
} from './policy';
import { backupFileName, backupReminder } from './reminder';

const sha = (c: string) => c.repeat(64);

function sample(): BackupManifest {
  return buildManifest({
    appVersion: '0.1.0',
    schemaVersion: 1,
    createdAt: 1_763_280_000_000,
    imageVariant: 'full',
    counts: { clients: 2, images: 1 },
    files: [
      { path: 'images/img1.jpg', sha256: sha('a'), bytes: 10 },
      { path: 'data/clients.json', sha256: sha('b'), bytes: 20 },
      { path: 'data/images.json', sha256: sha('c'), bytes: 30 },
    ],
  });
}

describe('manifest', () => {
  it('builds a sorted manifest that parses back unchanged', () => {
    const m = sample();
    expect(m.files.map((f) => f.path)).toEqual(['data/clients.json', 'data/images.json', 'images/img1.jpg']);
    expect(m.imageFiles).toBe(1);
    const parsed = parseManifest(JSON.stringify(m));
    expect(parsed).toEqual({ ok: true, value: m });
  });

  it('refuses non-backups, newer formats and malformed manifests', () => {
    expect(parseManifest('not json')).toEqual({ ok: false, error: 'malformed' });
    expect(parseManifest('{"format":"other"}')).toEqual({ ok: false, error: 'not_a_backup' });
    expect(parseManifest(JSON.stringify({ ...sample(), formatVersion: 99 }))).toEqual({ ok: false, error: 'unsupported_format' });
    expect(parseManifest(JSON.stringify({ ...sample(), schemaVersion: 0 }))).toEqual({ ok: false, error: 'malformed' });
    const dup = sample();
    dup.files.push({ ...dup.files[0]! });
    expect(parseManifest(JSON.stringify(dup)).ok).toBe(false);
    const traversal = sample();
    traversal.files[0] = { path: '../../etc/passwd', sha256: sha('d'), bytes: 1 };
    expect(parseManifest(JSON.stringify(traversal)).ok).toBe(false);
    const missingTable = { ...sample(), counts: { clients: 2, images: 1, sessions: 3 } };
    expect(parseManifest(JSON.stringify(missingTable)).ok).toBe(false);
  });

  it('only allows safe archive paths', () => {
    expect(isAllowedArchivePath('data/clients.json')).toBe(true);
    expect(isAllowedArchivePath('images/abc-1.webp')).toBe(true);
    expect(isAllowedArchivePath('images/../x.jpg')).toBe(false);
    expect(isAllowedArchivePath('data/x.js')).toBe(false);
    expect(imageFilePath('id_1', 'image/jpeg')).toBe('images/id_1.jpg');
    expect(imageFilePath('id 1', 'image/jpeg')).toBeNull();
    expect(imageFilePath('id1', 'image/gif')).toBeNull();
    expect(mimeForImagePath('images/a.png')).toBe('image/png');
  });

  it('verifies files against checksums', () => {
    const m = sample();
    const actual = new Map(m.files.map((f) => [f.path, { sha256: f.sha256, bytes: f.bytes }]));
    expect(verifyArchiveFiles(m, actual)).toEqual({ ok: true });
    actual.set('images/img1.jpg', { sha256: sha('e'), bytes: 10 });
    expect(verifyArchiveFiles(m, actual)).toEqual({ ok: false, error: 'checksum_mismatch', path: 'images/img1.jpg' });
    actual.delete('images/img1.jpg');
    expect(verifyArchiveFiles(m, actual)).toEqual({ ok: false, error: 'missing_file', path: 'images/img1.jpg' });
    const extra = new Map(m.files.map((f) => [f.path, { sha256: f.sha256, bytes: f.bytes }]));
    extra.set('images/ghost.jpg', { sha256: sha('f'), bytes: 1 });
    expect(verifyArchiveFiles(m, extra)).toEqual({ ok: false, error: 'unexpected_file', path: 'images/ghost.jpg' });
  });
});

describe('version policy', () => {
  it('same, older, newer', () => {
    expect(schemaAction(3, 3)).toEqual({ ok: true, value: 'same' });
    expect(schemaAction(1, 3)).toEqual({ ok: true, value: 'migrate' });
    expect(schemaAction(4, 3)).toEqual({ ok: false, error: 'newer_schema' });
    expect(schemaAction(0, 3)).toEqual({ ok: false, error: 'invalid_schema' });
    expect(schemaAction(1.5, 3)).toEqual({ ok: false, error: 'invalid_schema' });
  });
});

describe('cloud variant policy', () => {
  const MB = 1024 * 1024;
  it('keeps full photos while under budget', () => {
    expect(chooseCloudVariant({ dataBytes: 1 * MB, imageCount: 20, fullImageBytes: 4 * MB })).toBe('full');
  });
  it('switches to thumbnails when full photos exceed the budget (200 photos ≈ 40 MB → ≈ 6 MB)', () => {
    const e = { dataBytes: 2 * MB, imageCount: 200, fullImageBytes: 40 * MB };
    expect(chooseCloudVariant(e)).toBe('thumbnail');
    expect(estimatedArchiveBytes(e, 'thumbnail')).toBeLessThan(DEFAULT_CLOUD_BUDGET_BYTES);
  });
  it('drops photos when even thumbnails do not fit, and respects a ceiling', () => {
    expect(chooseCloudVariant({ dataBytes: 1 * MB, imageCount: 2000, fullImageBytes: 400 * MB })).toBe('none');
    expect(chooseCloudVariant({ dataBytes: 1 * MB, imageCount: 1, fullImageBytes: 1 }, undefined, 'thumbnail')).toBe('thumbnail');
    expect(CLOUD_HARD_CAP_BYTES).toBe(100 * MB);
  });
  it('downgrades step by step', () => {
    expect(downgradeVariant('full')).toBe('thumbnail');
    expect(downgradeVariant('thumbnail')).toBe('none');
    expect(downgradeVariant('none')).toBeNull();
    expect(smallerVariant('full', 'thumbnail')).toBe('thumbnail');
    expect(smallerVariant('none', 'full')).toBe('none');
  });
});

describe('weekly backup reminder', () => {
  const DAY = 86_400_000;
  const now = new Date('2026-11-16T10:00:00Z');
  it('flags after 7 days without a backup', () => {
    expect(backupReminder({ lastBackupAt: now.getTime() - 6 * DAY, firstUseAt: 0, now })).toEqual({ due: false, daysSince: 6 });
    expect(backupReminder({ lastBackupAt: now.getTime() - 7 * DAY, firstUseAt: 0, now })).toEqual({ due: true, daysSince: 7 });
  });
  it('never backed up: due once the app was used a week', () => {
    expect(backupReminder({ lastBackupAt: null, firstUseAt: now.getTime() - DAY, now }).due).toBe(false);
    expect(backupReminder({ lastBackupAt: null, firstUseAt: now.getTime() - 8 * DAY, now }).due).toBe(true);
    expect(backupReminder({ lastBackupAt: null, firstUseAt: null, now }).due).toBe(true);
  });
  it('respects snooze and custom interval', () => {
    const last = now.getTime() - 10 * DAY;
    expect(backupReminder({ lastBackupAt: last, firstUseAt: 0, now, snoozedUntil: now.getTime() + 1 }).due).toBe(false);
    expect(backupReminder({ lastBackupAt: last, firstUseAt: 0, now, intervalDays: 14 }).due).toBe(false);
  });
  it('names files by local date', () => {
    const d = new Date(2026, 10, 16, 9, 5);
    expect(backupFileName(d, false)).toBe('pt-coach-backup-2026-11-16-0905.zip');
    expect(backupFileName(d, true)).toBe('pt-coach-backup-2026-11-16-0905.ptbackup');
  });
});
