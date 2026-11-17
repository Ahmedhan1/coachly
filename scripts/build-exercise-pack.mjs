#!/usr/bin/env node
// Builds the offline exercise pack: public/exercise-pack/exercises.json + public/exercise-pack/img/*.
//
// 1. Downloads the free-exercise-db photos (raw.githubusercontent.com) into data-src/free-exercise-db/images/
//    (git-ignored) with a concurrency limit, retries and resume (files already cached are skipped).
// 2. Resizes each photo to at most --size px on the long side and encodes WebP (JPEG with --format jpeg)
//    using ImageMagick (`magick`/`convert`) or, if missing, ffmpeg. No npm dependency.
// 3. Writes the compact manifest (Arabic + English name, app muscle-group ids, equipment, level, category,
//    image file names). The English instructions text is NOT shipped (origin undocumented, see LICENSES.md).
// 4. Prints exercise count, fetched / missing images and the pack size; exits 1 when over --budget-mb.
//
// Usage: node scripts/build-exercise-pack.mjs [--offline] [--size 480] [--quality 60] [--format webp|jpeg]
//        [--concurrency 8] [--retries 3] [--limit N] [--budget-mb 40]
//        [--source <exercises.json>] [--names <exercise-names.ar.json>] [--overrides <json>] [--extras <json>] [--cache <dir>] [--out <dir>]
// Requires Node >= 22.18 (imports the TypeScript pack module directly; Node strips the types).
// Details and the app loading strategy: docs/EXERCISE_PACK.md.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildExercisePack, packImageFileName } from '../src/domain/exercises/pack.ts';

const run = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const REMOTE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
export const SOURCE_LABEL = 'yuhonas/free-exercise-db';

export const DEFAULTS = Object.freeze({
  source: 'data-src/free-exercise-db/exercises.json',
  names: 'data-src/exercise-names.ar.json',
  overrides: 'data-src/exercise-names.overrides.ar.json',
  extras: 'data-src/exercise-extras.json',
  cache: 'data-src/free-exercise-db/images',
  out: 'public/exercise-pack',
  size: 480,
  quality: 60,
  format: 'webp',
  concurrency: 8,
  retries: 3,
  limit: Infinity,
  budgetMb: 40,
  offline: false,
});

/** @param {string[]} argv @param {string} [root] */
export function parseArgs(argv, root = repoRoot) {
  const opts = { ...DEFAULTS };
  const num = (flag, value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} needs a positive number, got "${value}"`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case '--offline': opts.offline = true; break;
      case '--source': opts.source = value(); break;
      case '--names': opts.names = value(); break;
      case '--overrides': opts.overrides = value(); break;
      case '--extras': opts.extras = value(); break;
      case '--cache': opts.cache = value(); break;
      case '--out': opts.out = value(); break;
      case '--size': opts.size = Math.round(num(flag, value())); break;
      case '--quality': opts.quality = Math.min(100, Math.round(num(flag, value()))); break;
      case '--concurrency': opts.concurrency = Math.round(num(flag, value())); break;
      case '--retries': opts.retries = Math.round(Number(value())); break;
      case '--limit': opts.limit = Math.round(num(flag, value())); break;
      case '--budget-mb': opts.budgetMb = num(flag, value()); break;
      case '--format': {
        const f = value();
        if (f !== 'webp' && f !== 'jpeg') throw new Error('--format must be webp or jpeg');
        opts.format = f;
        break;
      }
      default: throw new Error(`unknown option ${flag}`);
    }
  }
  for (const key of ['source', 'names', 'overrides', 'extras', 'cache', 'out']) opts[key] = resolve(root, opts[key]);
  return opts;
}

/**
 * One planned image per dataset image path ("Air_Bike/0.jpg").
 * @param {ReadonlyArray<{id: string, images: readonly string[]}>} sources
 * @param {'webp' | 'jpeg'} format
 */
export function planImages(sources, format) {
  const ext = format === 'webp' ? 'webp' : 'jpg';
  return sources.flatMap((s) =>
    s.images.map((remotePath, index) => ({
      id: s.id,
      remotePath,
      url: REMOTE_BASE + remotePath.split('/').map(encodeURIComponent).join('/'),
      outName: packImageFileName(s.id, index, ext),
    })),
  );
}

/** Runs `worker` over `items` with at most `limit` in flight; results keep input order. */
export async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}

export class PermanentError extends Error {}

/** Retries `fn` with exponential backoff; a PermanentError (e.g. HTTP 404) is not retried. */
export async function withRetry(fn, { retries, baseDelayMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (error instanceof PermanentError || attempt >= retries) throw error;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const isJpeg = (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;

async function download(url, file, retries) {
  return withRetry(async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) throw new PermanentError(`404 ${url}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isJpeg(buf)) throw new Error(`not a JPEG: ${url}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.part`, buf);
    renameSync(`${file}.part`, file); // atomic: an interrupted run never leaves a half file behind
  }, { retries });
}

async function has(cmd, args, pattern) {
  try {
    const { stdout } = await run(cmd, args, { maxBuffer: 8 * 1024 * 1024 });
    return pattern.test(stdout);
  } catch {
    return false;
  }
}

/** Picks the first image tool that can produce `format`. */
export async function detectEncoder(format) {
  const want = format === 'webp' ? /^\s*WEBP\*?\s+\S+\s+rw/m : /^\s*JPEG\*?\s+\S+\s+rw/m;
  for (const cmd of ['magick', 'convert']) {
    if (await has(cmd, ['-list', 'format'], want)) {
      return {
        name: `ImageMagick (${cmd})`,
        encode: (src, dst, size, quality) =>
          run(cmd, [
            src, '-auto-orient', '-strip', '-resize', `${size}x${size}>`, '-quality', String(quality),
            ...(format === 'webp' ? ['-define', 'webp:method=6'] : ['-interlace', 'JPEG', '-sampling-factor', '4:2:0']),
            dst,
          ]),
      };
    }
  }
  const ffEncoder = format === 'webp' ? 'libwebp' : 'mjpeg';
  if (await has('ffmpeg', ['-hide_banner', '-encoders'], new RegExp(`\\s${ffEncoder}\\s`))) {
    return {
      name: 'ffmpeg',
      encode: (src, dst, size, quality) =>
        run('ffmpeg', [
          '-y', '-loglevel', 'error', '-i', src,
          '-vf', `scale='min(${size},iw)':'min(${size},ih)':force_original_aspect_ratio=decrease`,
          ...(format === 'webp'
            ? ['-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6']
            : ['-q:v', String(Math.max(2, Math.round(31 - (quality / 100) * 29)))]),
          dst,
        ]),
    };
  }
  return null;
}

function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
}

function readPreviousSettings(manifestFile) {
  try {
    const { image } = JSON.parse(readFileSync(manifestFile, 'utf8'));
    return image ?? null;
  } catch {
    return null;
  }
}

/** One exercise per line: small diffs, and check:words reports useful line numbers. */
export function serializePack(pack) {
  const { exercises, ...head } = pack;
  const lines = exercises.map((e) => JSON.stringify(e));
  return `${JSON.stringify(head).slice(0, -1)},"exercises":[\n${lines.join(',\n')}\n]}\n`;
}

export async function buildPack(opts, log = console.log) {
  const sources = JSON.parse(readFileSync(opts.source, 'utf8'));
  const names = JSON.parse(readFileSync(opts.names, 'utf8'));
  const arabicNames = new Map(names.map((n) => [n.id, n.ar]));
  const readOptional = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
  const popular = readOptional(opts.overrides, {}).popular ?? [];
  const extras = readOptional(opts.extras, {}).exercises ?? [];
  const sourceIds = new Set(sources.map((s) => s.id));
  for (const x of extras) {
    if (x.imagesFrom !== undefined && !sourceIds.has(x.imagesFrom)) throw new Error(`extra ${x.id}: imagesFrom ${x.imagesFrom} is not a dataset exercise`);
  }
  const imgDir = join(opts.out, 'img');
  const manifestFile = join(opts.out, 'exercises.json');
  mkdirSync(imgDir, { recursive: true });

  const plan = planImages(sources, opts.format).slice(0, opts.limit);
  const cachePath = (p) => join(opts.cache, p.remotePath);

  // 1. download (resume: skip cached files)
  const toFetch = plan.filter((p) => !existsSync(cachePath(p)));
  let fetched = 0;
  const failures = [];
  if (opts.offline) {
    log(`offline: ${toFetch.length} image(s) not in the cache are skipped`);
  } else if (toFetch.length > 0) {
    log(`downloading ${toFetch.length} image(s) (${plan.length - toFetch.length} already cached), concurrency ${opts.concurrency}…`);
    await runPool(toFetch, opts.concurrency, async (p) => {
      try {
        await download(p.url, cachePath(p), opts.retries);
        fetched++;
        if (fetched % 200 === 0) log(`  ${fetched}/${toFetch.length}`);
      } catch (error) {
        failures.push(`${p.remotePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  // 2. resize + encode (skip outputs that are up to date with the same settings)
  const encoder = await detectEncoder(opts.format);
  if (encoder === null) {
    throw new Error(`no image encoder for ${opts.format}: install ImageMagick (with WebP) or ffmpeg, or use --format jpeg`);
  }
  const settings = { format: opts.format, maxSize: opts.size, quality: opts.quality };
  const prev = readPreviousSettings(manifestFile);
  const sameSettings = prev !== null && prev.format === settings.format && prev.maxSize === settings.maxSize && prev.quality === settings.quality;
  const available = plan.filter((p) => existsSync(cachePath(p)));
  let encoded = 0;
  const encodeFailures = [];
  await runPool(available, availableParallelism(), async (p) => {
    const dst = join(imgDir, p.outName);
    if (sameSettings && existsSync(dst) && statSync(dst).mtimeMs >= statSync(cachePath(p)).mtimeMs) return;
    try {
      await encoder.encode(cachePath(p), `${dst}.tmp.${opts.format === 'webp' ? 'webp' : 'jpg'}`, opts.size, opts.quality);
      renameSync(`${dst}.tmp.${opts.format === 'webp' ? 'webp' : 'jpg'}`, dst);
      encoded++;
    } catch (error) {
      encodeFailures.push(`${p.remotePath}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  });

  // 3. remove stale outputs, write the manifest with the images that really exist
  const expected = new Set(available.map((p) => p.outName));
  for (const file of readdirSync(imgDir)) if (!expected.has(file)) rmSync(join(imgDir, file));
  const imagesById = new Map();
  for (const p of plan) {
    if (!existsSync(join(imgDir, p.outName))) continue;
    imagesById.set(p.id, [...(imagesById.get(p.id) ?? []), p.outName]);
  }
  const imgBytes = dirSize(imgDir);
  const pack = buildExercisePack({ sources, arabicNames, imagesById, image: settings, source: SOURCE_LABEL, imageBytes: imgBytes, popular, extras });
  writeFileSync(manifestFile, serializePack(pack));

  // 4. report
  const imageCount = [...imagesById.values()].reduce((n, list) => n + list.length, 0);
  const totalImages = planImages(sources, opts.format).length;
  const missing = totalImages - imageCount;
  const jsonBytes = statSync(manifestFile).size;
  const total = jsonBytes + imgBytes;
  const noImage = pack.exercises.filter((e) => e.images.length === 0).length;
  log(`encoder: ${encoder.name} → ${opts.format}, max ${opts.size}px, quality ${opts.quality}`);
  log(`exercises: ${pack.count} (${extras.length} built-in extras, ${popular.length} + extras popular; ${noImage} without any image)`);
  log(`images: ${imageCount}/${totalImages} in pack, ${fetched} downloaded now, ${encoded} encoded now, ${missing} missing`);
  for (const f of [...failures, ...encodeFailures].slice(0, 20)) log(`  failed: ${f}`);
  log(`size: exercises.json ${formatBytes(jsonBytes)} + img ${formatBytes(imgBytes)} = ${formatBytes(total)} (budget ${opts.budgetMb} MB)`);
  const overBudget = total > opts.budgetMb * 1024 * 1024;
  if (overBudget) log(`OVER BUDGET: try a smaller --size or --quality`);
  return { pack, imageCount, totalImages, missing, fetched, encoded, failures: [...failures, ...encodeFailures], totalBytes: total, overBudget };
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    const result = await buildPack(parseArgs(process.argv.slice(2)));
    process.exit(result.overBudget ? 1 : 0);
  } catch (error) {
    console.error(`build-exercise-pack FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
