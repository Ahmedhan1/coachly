import type { ExercisePack } from '@/domain/exercises';
import {
  PACK_FOLDER,
  PACK_MANIFEST_URL,
  PHOTO_CACHE_NAME,
  type DownloadOptions,
  type DownloadProgress,
  type DownloadResult,
  type ExercisePackService,
  type OfflinePhotosStatus,
} from './types';

/** The slice of the browser the service needs, injectable for tests. */
export interface PackServiceDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  caches: Pick<CacheStorage, 'open'> | null;
  /** Asked once before a full download so iOS keeps the photos under storage pressure. */
  requestPersistence?: () => Promise<unknown>;
}

const DEFAULT_FILE_TIMEOUT_MS = 30_000;

const browserDeps = (): PackServiceDeps => ({
  fetch: (input, init) => globalThis.fetch(input, init),
  caches: typeof caches === 'undefined' ? null : caches,
  requestPersistence: async () => navigator.storage?.persist?.(),
});

export function isExercisePack(value: unknown): value is ExercisePack {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ExercisePack>;
  return v.version === 1 && Array.isArray(v.exercises) && typeof v.image?.base === 'string';
}

export class BrowserExercisePackService implements ExercisePackService {
  private pack: Promise<ExercisePack> | null = null;

  constructor(
    private readonly deps: PackServiceDeps = browserDeps(),
    private readonly manifestUrl = PACK_MANIFEST_URL,
    private readonly folder = PACK_FOLDER,
  ) {}

  /** One request per app run; a failure is not cached so the next call retries. */
  loadPack(): Promise<ExercisePack> {
    if (!this.pack) {
      this.pack = this.fetchPack().catch((err: unknown) => {
        this.pack = null;
        throw err;
      });
    }
    return this.pack;
  }

  private async fetchPack(): Promise<ExercisePack> {
    const res = await this.deps.fetch(this.manifestUrl);
    if (!res.ok) throw new Error(`exercise pack HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (!isExercisePack(json)) throw new Error('exercise pack: bad format');
    return json;
  }

  photoUrls(pack: ExercisePack): string[] {
    const base = `${this.folder}${pack.image.base}`;
    return pack.exercises.flatMap((e) => e.images.map((file) => `${base}${file}`));
  }

  async offlineStatus(pack: ExercisePack): Promise<OfflinePhotosStatus> {
    const urls = this.photoUrls(pack);
    const status = { totalFiles: urls.length, cachedFiles: 0, totalBytes: pack.imageBytes };
    if (!this.deps.caches) return status;
    const cache = await this.deps.caches.open(PHOTO_CACHE_NAME);
    const keys = await cache.keys();
    const cached = new Set(keys.map((r) => new URL(r.url).pathname));
    status.cachedFiles = urls.filter((u) => cached.has(u)).length;
    return status;
  }

  async downloadAll(pack: ExercisePack, options: DownloadOptions = {}): Promise<DownloadResult> {
    const urls = this.photoUrls(pack);
    const avg = urls.length > 0 ? pack.imageBytes / urls.length : 0;
    const progress: DownloadProgress = {
      totalFiles: urls.length,
      doneFiles: 0,
      failedFiles: 0,
      totalBytes: pack.imageBytes,
      doneBytes: 0,
    };
    const report = () => options.onProgress?.({ ...progress });
    const { signal } = options;
    if (!this.deps.caches) {
      return { ...progress, failedFiles: urls.length, cancelled: false };
    }
    await this.deps.requestPersistence?.().catch(() => undefined);
    const cache = await this.deps.caches.open(PHOTO_CACHE_NAME);
    const cached = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const todo: string[] = [];
    for (const url of urls) {
      if (cached.has(url)) {
        progress.doneFiles++;
        progress.doneBytes += avg;
      } else todo.push(url);
    }
    report();

    let next = 0;
    const worker = async () => {
      while (next < todo.length && !signal?.aborted) {
        const url = todo[next++];
        if (url === undefined) break;
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort);
        const timer = setTimeout(abort, options.fileTimeoutMs ?? DEFAULT_FILE_TIMEOUT_MS);
        try {
          const res = await this.deps.fetch(url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          clearTimeout(timer);
          await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/webp' } }));
          progress.doneFiles++;
          progress.doneBytes += blob.size;
        } catch {
          if (signal?.aborted) break;
          progress.failedFiles++;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        }
        report();
      }
    };
    const workers = Math.max(1, Math.min(options.concurrency ?? 6, todo.length));
    await Promise.all(Array.from({ length: workers }, worker));
    progress.doneBytes = Math.min(Math.round(progress.doneBytes), progress.totalBytes || Math.round(progress.doneBytes));
    return { ...progress, cancelled: signal?.aborted === true };
  }
}
