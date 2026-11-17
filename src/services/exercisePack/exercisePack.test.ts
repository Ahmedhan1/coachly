import { describe, expect, it } from 'vitest';
import type { ExercisePack } from '@/domain/exercises';
import { BrowserExercisePackService, PHOTO_CACHE_NAME, type PackServiceDeps } from './index';

const PACK: ExercisePack = {
  version: 1,
  source: 'test',
  count: 2,
  image: { format: 'webp', maxSize: 480, quality: 60, base: 'img/' },
  imageBytes: 400,
  exercises: [
    { id: 'A', en: 'A', ar: 'أ', primary: ['chest'], secondary: [], equipment: 'barbell', level: 'beginner', category: 'strength', force: null, mechanic: null, images: ['A-0.webp', 'A-1.webp'] },
    { id: 'B', en: 'B', ar: 'ب', primary: ['quads'], secondary: [], equipment: 'barbell', level: 'beginner', category: 'strength', force: null, mechanic: null, images: ['B-0.webp', 'B-1.webp'] },
  ],
};

/** Minimal Cache Storage fake keyed by pathname. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    let store = stores.get(name);
    if (!store) stores.set(name, (store = new Map()));
    const s = store;
    return {
      keys: async () => [...s.keys()].map((p) => new Request(`http://app${p}`)),
      put: async (req: RequestInfo | URL, res: Response) => void s.set(String(req), res),
    } as unknown as Cache;
  };
  return { stores, caches: { open } };
}

function deps(over: Partial<PackServiceDeps> & { fail?: Set<string> } = {}) {
  const calls: string[] = [];
  const { stores, caches } = fakeCaches();
  const d: PackServiceDeps = {
    caches,
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith('exercises.json')) return new Response(JSON.stringify(PACK));
      if (over.fail?.has(url)) return new Response('', { status: 404 });
      return new Response(new Blob([new Uint8Array(100)], { type: 'image/webp' }));
    },
    ...over,
  };
  return { d, calls, stores };
}

describe('BrowserExercisePackService', () => {
  it('loads the manifest once and validates it', async () => {
    const { d, calls } = deps();
    const svc = new BrowserExercisePackService(d);
    const [a, b] = await Promise.all([svc.loadPack(), svc.loadPack()]);
    expect(a).toBe(b);
    expect(a.count).toBe(2);
    expect(calls).toEqual(['/exercise-pack/exercises.json']);
  });

  it('retries after a failed manifest load and rejects bad formats', async () => {
    let n = 0;
    const svc = new BrowserExercisePackService({
      caches: null,
      fetch: async () => (++n === 1 ? new Response('', { status: 500 }) : new Response(JSON.stringify({ nope: 1 }))),
    });
    await expect(svc.loadPack()).rejects.toThrow('500');
    await expect(svc.loadPack()).rejects.toThrow('bad format');
  });

  it('lists absolute photo urls', () => {
    const svc = new BrowserExercisePackService(deps().d);
    expect(svc.photoUrls(PACK)).toEqual([
      '/exercise-pack/img/A-0.webp',
      '/exercise-pack/img/A-1.webp',
      '/exercise-pack/img/B-0.webp',
      '/exercise-pack/img/B-1.webp',
    ]);
  });

  it('downloads every missing photo into the runtime cache, reporting progress, and skips cached ones', async () => {
    const { d, calls, stores } = deps();
    let persisted = 0;
    d.requestPersistence = async () => persisted++;
    const svc = new BrowserExercisePackService(d);
    const seen: number[] = [];
    const first = await svc.downloadAll(PACK, { concurrency: 2, onProgress: (p) => seen.push(p.doneFiles) });
    expect(first).toMatchObject({ totalFiles: 4, doneFiles: 4, failedFiles: 0, doneBytes: 400, cancelled: false });
    expect(seen.at(-1)).toBe(4);
    expect(persisted).toBe(1);
    expect(stores.get(PHOTO_CACHE_NAME)?.size).toBe(4);
    expect(await svc.offlineStatus(PACK)).toEqual({ totalFiles: 4, cachedFiles: 4, totalBytes: 400 });

    calls.length = 0;
    const again = await svc.downloadAll(PACK);
    expect(again.doneFiles).toBe(4);
    expect(calls).toEqual([]);
  });

  it('counts failures and can be cancelled (resumable later)', async () => {
    const { d } = deps({ fail: new Set(['/exercise-pack/img/A-1.webp']) });
    const svc = new BrowserExercisePackService(d);
    const result = await svc.downloadAll(PACK, { concurrency: 1 });
    expect(result).toMatchObject({ doneFiles: 3, failedFiles: 1 });

    const controller = new AbortController();
    const fresh = deps();
    const svc2 = new BrowserExercisePackService(fresh.d);
    const cancelled = await svc2.downloadAll(PACK, {
      concurrency: 1,
      signal: controller.signal,
      onProgress: (p) => p.doneFiles === 1 && controller.abort(),
    });
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.doneFiles).toBe(1);
    expect((await svc2.offlineStatus(PACK)).cachedFiles).toBe(1);
  });

  it('reports everything as failed when Cache Storage is missing', async () => {
    const svc = new BrowserExercisePackService({ ...deps().d, caches: null });
    expect(await svc.offlineStatus(PACK)).toEqual({ totalFiles: 4, cachedFiles: 0, totalBytes: 400 });
    expect((await svc.downloadAll(PACK)).failedFiles).toBe(4);
  });

  it('gives up on a photo whose request stalls, so the download always finishes', async () => {
    const { d } = deps();
    const stalled = '/exercise-pack/img/A-1.webp';
    const base = d.fetch;
    d.fetch = (url, init) =>
      url === stalled
        ? new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
        : base(url, init);
    const svc = new BrowserExercisePackService(d);
    const result = await svc.downloadAll(PACK, { concurrency: 2, fileTimeoutMs: 30 });
    expect(result).toMatchObject({ doneFiles: 3, failedFiles: 1, cancelled: false });
  });
});
