import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  PermanentError,
  buildPack,
  detectEncoder,
  formatBytes,
  parseArgs,
  planImages,
  runPool,
  serializePack,
  withRetry,
} from './build-exercise-pack.mjs';
import { buildExercisePack, type DatasetExercise } from '../src/domain/exercises/pack';

// 16×8 red JPEG
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAIABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCKALXj/9k=',
  'base64',
);

const dataset = (id: string, extra: Partial<DatasetExercise> = {}): DatasetExercise => ({
  id,
  name: id.replace(/_/g, ' '),
  force: 'pull',
  level: 'beginner',
  mechanic: 'isolation',
  equipment: 'dumbbell',
  primaryMuscles: ['biceps'],
  secondaryMuscles: ['forearms'],
  instructions: ['SECRET-INSTRUCTIONS'],
  category: 'strength',
  images: [`${id}/0.jpg`, `${id}/1.jpg`],
  ...extra,
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parseArgs', () => {
  it('uses the defaults resolved against the repo root', () => {
    const opts = parseArgs([], '/repo');
    expect(opts).toMatchObject({ size: 480, quality: 60, format: 'webp', offline: false, out: '/repo/public/exercise-pack' });
  });

  it('parses flags and rejects bad values', () => {
    const opts = parseArgs(['--offline', '--size', '360', '--quality', '55', '--format', 'jpeg', '--limit', '10'], '/r');
    expect(opts).toMatchObject({ offline: true, size: 360, quality: 55, format: 'jpeg', limit: 10 });
    expect(() => parseArgs(['--size', '-1'])).toThrow();
    expect(() => parseArgs(['--format', 'gif'])).toThrow();
    expect(() => parseArgs(['--what'])).toThrow();
    expect(DEFAULTS.budgetMb).toBe(40);
  });

  it('knows the English data files and the manifest-only mode', () => {
    expect(parseArgs([], '/repo')).toMatchObject({ manifestOnly: false, namesEn: '/repo/assets-src/exercises/exercise-names.en.json', cuesEn: '/repo/assets-src/exercises/exercise-cues.en.json' });
    expect(parseArgs(['--manifest-only'], '/r').manifestOnly).toBe(true);
  });
});

describe('planImages', () => {
  it('maps dataset image paths to raw.githubusercontent URLs and flat output names', () => {
    const plan = planImages([dataset('3_4_Sit-Up')], 'webp');
    expect(plan).toEqual([
      {
        id: '3_4_Sit-Up',
        remotePath: '3_4_Sit-Up/0.jpg',
        url: 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/3_4_Sit-Up/0.jpg',
        outName: '3_4_Sit-Up-0.webp',
      },
      {
        id: '3_4_Sit-Up',
        remotePath: '3_4_Sit-Up/1.jpg',
        url: 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/3_4_Sit-Up/1.jpg',
        outName: '3_4_Sit-Up-1.webp',
      },
    ]);
    expect(planImages([dataset('A')], 'jpeg')[0]?.outName).toBe('A-0.jpg');
  });
});

describe('runPool', () => {
  it('keeps order and never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, (7 - n) * 2));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(3);
  });
});

describe('withRetry', () => {
  const noSleep = async () => {};

  it('retries transient errors with exponential backoff', async () => {
    const delays: number[] = [];
    let calls = 0;
    const value = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('flaky');
        return 'ok';
      },
      { retries: 3, baseDelayMs: 100, sleep: async (ms) => void delays.push(ms) },
    );
    expect(value).toBe('ok');
    expect(delays).toEqual([100, 200]);
  });

  it('gives up after the retry budget and never retries permanent errors', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error('down'); }, { retries: 2, sleep: noSleep })).rejects.toThrow('down');
    expect(calls).toBe(3);
    calls = 0;
    await expect(withRetry(async () => { calls++; throw new PermanentError('404'); }, { retries: 5, sleep: noSleep })).rejects.toThrow('404');
    expect(calls).toBe(1);
  });
});

describe('manifest', () => {
  it('serialises one exercise per line as valid JSON without instructions', () => {
    const pack = buildExercisePack({
      sources: [dataset('B'), dataset('A')],
      arabicNames: new Map([['A', 'أ']]),
      imagesById: new Map(),
      image: { format: 'webp', maxSize: 480, quality: 60 },
      source: 'x',
    });
    const text = serializePack(pack);
    expect(JSON.parse(text)).toEqual(pack);
    expect(text.split('\n')).toHaveLength(5);
    expect(text).not.toContain('SECRET-INSTRUCTIONS');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});

describe('buildPack (offline, end to end)', async () => {
  const encoder = await detectEncoder('webp');

  it.skipIf(encoder === null)('encodes cached images, lists only existing ones and reports missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'exercise-pack-'));
    dirs.push(root);
    const sources = [dataset('Curl'), dataset('Row')];
    writeFileSync(join(root, 'exercises.json'), JSON.stringify(sources));
    writeFileSync(join(root, 'names.json'), JSON.stringify([{ id: 'Curl', ar: 'دامبل كيرل' }, { id: 'Row', ar: 'رو' }]));
    mkdirSync(join(root, 'cache/Curl'), { recursive: true });
    writeFileSync(join(root, 'cache/Curl/0.jpg'), TINY_JPEG);
    mkdirSync(join(root, 'out/img'), { recursive: true });
    writeFileSync(join(root, 'out/img/Stale-0.webp'), 'old');

    const lines: string[] = [];
    const opts = parseArgs(
      ['--offline', '--source', 'exercises.json', '--names', 'names.json', '--cache', 'cache', '--out', 'out', '--size', '8'],
      root,
    );
    const result = await buildPack(opts, (l) => lines.push(l));

    expect(result).toMatchObject({ imageCount: 1, totalImages: 4, missing: 3, fetched: 0, encoded: 1, overBudget: false });
    const written = JSON.parse(readFileSync(join(root, 'out/exercises.json'), 'utf8'));
    expect(written.exercises[0]).toMatchObject({ id: 'Curl', ar: 'دامبل كيرل', primary: ['biceps'], images: ['Curl-0.webp'] });
    expect(written.exercises[1].images).toEqual([]);
    expect(written.imageBytes).toBeGreaterThan(0);
    const webp = readFileSync(join(root, 'out/img/Curl-0.webp'));
    expect(webp.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(webp.subarray(8, 12).toString('latin1')).toBe('WEBP');
    expect(existsSync(join(root, 'out/img/Stale-0.webp'))).toBe(false);
    expect(lines.some((l) => l.startsWith('exercises: 2'))).toBe(true);

    const again = await buildPack(opts, () => {});
    expect(again.encoded).toBe(0); // resume: up-to-date outputs are not re-encoded
  });
});
