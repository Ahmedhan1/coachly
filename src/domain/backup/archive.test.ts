import { describe, expect, it } from 'vitest';
import {
  addArchiveEntry,
  archiveCutoff,
  archiveForImage,
  archivedImageIds,
  hasFreshBackup,
  markRestored,
  parseArchiveRegistry,
  PLACEHOLDER_MIN_SAVING_BYTES,
  selectPhotosToArchive,
  type PhotoArchiveEntry,
} from './archive';
import { buildManifest, parseManifest } from './manifest';
import type { StorageCategory, StoredImageInfo } from './storage';

const DAY = 86_400_000;
const now = new Date('2026-11-17T10:00:00Z');
const img = (id: string, createdAt: string, bytes = 300_000): StoredImageInfo => ({
  id,
  mime: 'image/jpeg',
  bytes,
  width: 1200,
  height: 900,
  createdAt: new Date(createdAt).getTime(),
});

describe('archiveCutoff', () => {
  it('goes back whole calendar months (UTC), clamping the day', () => {
    expect(new Date(archiveCutoff(now, 6)).toISOString()).toBe('2026-05-17T10:00:00.000Z');
    expect(new Date(archiveCutoff(new Date('2026-03-31T00:00:00Z'), 1)).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(() => archiveCutoff(now, 0)).toThrow(RangeError);
  });
});

describe('selectPhotosToArchive', () => {
  const owners = new Map<string, StorageCategory>([
    ['old1', 'clientPhotos'],
    ['old2', 'clientPhotos'],
    ['new', 'clientPhotos'],
    ['logo', 'branding'],
    ['ex', 'exercisePhotos'],
    ['tiny', 'clientPhotos'],
    ['done', 'clientPhotos'],
  ]);
  const images = [
    img('old2', '2026-02-01'),
    img('old1', '2025-12-01', 500_000),
    img('new', '2026-10-01'),
    img('logo', '2024-01-01'),
    img('ex', '2024-01-01'),
    img('tiny', '2024-01-01', PLACEHOLDER_MIN_SAVING_BYTES),
    img('done', '2024-01-01'),
    img('orphan', '2024-01-01'),
  ];

  it('picks only old client/progress photos, oldest first, skipping already-archived and tiny ones', () => {
    const r = selectPhotosToArchive(images, owners, new Set(['done']), now, 6);
    expect(r.ids).toEqual(['old1', 'old2']);
    expect(r.bytes).toBe(800_000);
  });

  it('nothing old enough (or only tiny / non-client photos) → empty', () => {
    expect(selectPhotosToArchive(images, owners, new Set(['done']), now, 24)).toEqual({ ids: [], bytes: 0 });
  });
});

describe('archive registry', () => {
  const entry = (id: string, imageIds: string[]): PhotoArchiveEntry => ({
    id,
    fileName: `pt-coach-photos-${id}.ptbackup`,
    createdAt: 1,
    savedAt: 2,
    count: imageIds.length,
    bytes: 100,
    imageIds,
    restoredAt: null,
  });

  it('parses tolerantly (garbage → empty) and round-trips', () => {
    expect(parseArchiveRegistry(undefined)).toEqual([]);
    expect(parseArchiveRegistry('x')).toEqual([]);
    expect(parseArchiveRegistry([{ id: 1 }])).toEqual([]);
    const reg = addArchiveEntry([], entry('a', ['i1', 'i2']));
    expect(parseArchiveRegistry(JSON.parse(JSON.stringify(reg)))).toEqual(reg);
  });

  it('knows which archive holds a photo and which photos are placeholders', () => {
    const reg = addArchiveEntry(addArchiveEntry([], entry('a', ['i1', 'i2'])), entry('b', ['i3']));
    expect([...archivedImageIds(reg)].sort()).toEqual(['i1', 'i2', 'i3']);
    expect(archiveForImage(reg, 'i3')?.id).toBe('b');
    expect(archiveForImage(reg, 'zz')).toBeNull();
  });

  it('restoring removes photos from their archive and closes it when empty', () => {
    const reg = addArchiveEntry(addArchiveEntry([], entry('a', ['i1', 'i2'])), entry('b', ['i3']));
    const after = markRestored(reg, ['i1', 'i3'], 99);
    expect(after.find((e) => e.id === 'a')).toMatchObject({ imageIds: ['i2'], restoredAt: null });
    expect(after.find((e) => e.id === 'b')).toMatchObject({ imageIds: [], restoredAt: 99 });
    expect(archivedImageIds(after)).toEqual(new Set(['i2']));
  });

  it('re-adding the same archive id replaces it', () => {
    const reg = addArchiveEntry(addArchiveEntry([], entry('a', ['i1'])), entry('a', ['i9']));
    expect(reg).toHaveLength(1);
    expect(reg[0]!.imageIds).toEqual(['i9']);
  });
});

describe('hasFreshBackup (destructive steps need an export first)', () => {
  it('true only for a device file saved within the last day', () => {
    expect(hasFreshBackup(null, now)).toBe(false);
    expect(hasFreshBackup(now.getTime() - DAY + 1, now)).toBe(true);
    expect(hasFreshBackup(now.getTime() - DAY - 1, now)).toBe(false);
    expect(hasFreshBackup(now.getTime() + 5 * DAY, now)).toBe(false); // clock went back: do not trust
  });
});

describe('photo archive manifest', () => {
  const sha = 'a'.repeat(64);
  it('photo archives use format version 2 so older apps refuse them instead of wiping data', () => {
    const m = buildManifest({
      kind: 'photos',
      archiveId: 'arc1',
      appVersion: '1',
      schemaVersion: 3,
      createdAt: 1,
      imageVariant: 'full',
      counts: { images: 1 },
      files: [
        { path: 'data/images.json', sha256: sha, bytes: 1 },
        { path: 'images/x.jpg', sha256: sha, bytes: 1 },
      ],
    });
    expect(m.formatVersion).toBe(2);
    expect(parseManifest(JSON.stringify(m))).toEqual({ ok: true, value: m });
    const full = buildManifest({ appVersion: '1', schemaVersion: 3, createdAt: 1, imageVariant: 'full', counts: {}, files: [] });
    expect(full).toMatchObject({ kind: 'full', formatVersion: 1 });
  });

  it('old manifests without kind are full backups; inconsistent ones are refused', () => {
    const old = JSON.parse(JSON.stringify(buildManifest({ appVersion: '1', schemaVersion: 1, createdAt: 1, imageVariant: 'full', counts: {}, files: [] })));
    delete old.kind;
    const parsed = parseManifest(JSON.stringify(old));
    expect(parsed.ok && parsed.value.kind).toBe('full');
    expect(parseManifest(JSON.stringify({ ...old, kind: 'photos' })).ok).toBe(false); // v1 cannot be a photo archive
    expect(parseManifest(JSON.stringify({ ...old, formatVersion: 2, kind: 'photos', archiveId: 'a', counts: { clients: 0 } })).ok).toBe(false);
  });
});

