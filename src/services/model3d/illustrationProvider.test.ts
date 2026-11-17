import { describe, expect, it, vi } from 'vitest';
import { IllustrationProvider, cacheApiStore, type IllustrationStore } from './illustrationProvider';
import { illustrationSpec } from '@/domain/exercises';

const spec = illustrationSpec({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] });
const palette = { base: '#dddddd', off: '#bbbbbb', hit: '#f25c1f' };
const blob = (text: string) => new Blob([text], { type: 'image/png' });

function memoryStore(): IllustrationStore & { data: Map<string, Blob> } {
  const data = new Map<string, Blob>();
  return { data, get: async (k) => data.get(k) ?? null, put: async (k, b) => void data.set(k, b) };
}

const urls = { create: (b: Blob) => `blob:${b.size}`, revoke: vi.fn() };

describe('IllustrationProvider', () => {
  it('renders once, stores the picture and serves the same URL from memory afterwards', async () => {
    const render = vi.fn(async () => blob('abc'));
    const store = memoryStore();
    const provider = new IllustrationProvider({ render, store, urls });
    const first = await provider.url(spec, palette);
    const second = await provider.url(spec, palette);
    expect(first).toBe('blob:3');
    expect(second).toBe(first);
    expect(render).toHaveBeenCalledTimes(1);
    expect(store.data.size).toBe(1);
  });

  it('shares one render between concurrent callers with the same muscles', async () => {
    const render = vi.fn(async () => blob('x'));
    const provider = new IllustrationProvider({ render, store: memoryStore(), urls });
    await Promise.all([provider.url(spec, palette), provider.url(spec, palette), provider.url(spec, palette)]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('uses the persistent store before rendering (second app run)', async () => {
    const store = memoryStore();
    await new IllustrationProvider({ render: async () => blob('seed'), store, urls }).url(spec, palette);
    const render = vi.fn(async () => blob('new'));
    const url = await new IllustrationProvider({ render, store, urls }).url(spec, palette);
    expect(url).toBe('blob:4');
    expect(render).not.toHaveBeenCalled();
  });

  it('renders different pictures for different muscles or colours', async () => {
    const render = vi.fn(async () => blob('x'));
    const provider = new IllustrationProvider({ render, store: memoryStore(), urls });
    await provider.url(spec, palette);
    await provider.url(illustrationSpec({ primaryMuscles: ['lats'], secondaryMuscles: [] }), palette);
    await provider.url(spec, { ...palette, hit: '#112233' });
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('renders one picture at a time', async () => {
    let running = 0;
    let peak = 0;
    const render = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return blob('x');
    };
    const provider = new IllustrationProvider({ render, store: memoryStore(), urls });
    const muscles = ['chest', 'abs', 'quads', 'lats'] as const;
    await Promise.all(muscles.map((m) => provider.url(illustrationSpec({ primaryMuscles: [m], secondaryMuscles: [] }), palette)));
    expect(peak).toBe(1);
  });

  it('returns null (never throws) when rendering fails, and does not retry the same picture in a loop', async () => {
    const render = vi.fn(async () => {
      throw new Error('no webgl');
    });
    const provider = new IllustrationProvider({ render, store: memoryStore(), urls });
    expect(await provider.url(spec, palette)).toBeNull();
    expect(await provider.url(spec, palette)).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('keeps working when the persistent store is broken', async () => {
    const store: IllustrationStore = {
      get: async () => {
        throw new Error('storage off');
      },
      put: async () => {
        throw new Error('storage off');
      },
    };
    expect(await new IllustrationProvider({ render: async () => blob('ok'), store, urls }).url(spec, palette)).toBe('blob:2');
  });

  it('frees the oldest object URLs beyond the memory limit', async () => {
    const revoke = vi.fn();
    const provider = new IllustrationProvider({ render: async () => blob('x'), store: memoryStore(), urls: { create: () => `blob:${Math.random()}`, revoke }, maxInMemory: 2 });
    for (const m of ['chest', 'abs', 'quads'] as const) await provider.url(illustrationSpec({ primaryMuscles: [m], secondaryMuscles: [] }), palette);
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('cacheApiStore', () => {
  it('stores and reads blobs through the Cache API under a synthetic URL, and tolerates a missing Cache API', async () => {
    const entries = new Map<string, Response>();
    const caches = {
      open: async () => ({
        match: async (key: string) => entries.get(key)?.clone(),
        put: async (key: string, res: Response) => void entries.set(key, res),
      }),
    } as unknown as CacheStorage;
    const store = cacheApiStore('test-cache', caches);
    expect(await store.get('k|1')).toBeNull();
    await store.put('k|1', blob('hello'));
    expect(await (await store.get('k|1'))?.text()).toBe('hello');
    expect([...entries.keys()][0]).toMatch(/^\/__exercise-illustration\//);
    const none = cacheApiStore('x', null);
    expect(await none.get('a')).toBeNull();
    await expect(none.put('a', blob('b'))).resolves.toBeUndefined();
  });
});
