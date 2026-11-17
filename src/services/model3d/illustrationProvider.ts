import { illustrationKey, type IllustrationSpec } from '@/domain/exercises';
import type { MuscleMapPalette } from './palette';

/** Draws one exercise illustration; the real one lazy-loads three.js (illustrationRenderer.ts). */
export type RenderIllustration = (spec: IllustrationSpec, palette: MuscleMapPalette) => Promise<Blob>;

/** Where finished pictures survive between app runs (Cache API); failures are never fatal. */
export interface IllustrationStore {
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
}

export interface ObjectUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export const ILLUSTRATION_CACHE_NAME = 'exercise-illustrations-v1';

const syntheticUrl = (key: string) => `/__exercise-illustration/${encodeURIComponent(key)}.png`;

/** Cache API backed store. With no Cache API (private window, old browser) it simply remembers nothing. */
export function cacheApiStore(
  name = ILLUSTRATION_CACHE_NAME,
  storage: CacheStorage | null = typeof caches === 'undefined' ? null : caches,
): IllustrationStore {
  return {
    async get(key) {
      if (storage === null) return null;
      const hit = await (await storage.open(name)).match(syntheticUrl(key));
      return hit ? await hit.blob() : null;
    },
    async put(key, blob) {
      if (storage === null) return;
      await (await storage.open(name)).put(
        syntheticUrl(key),
        new Response(blob, { headers: { 'Content-Type': blob.type || 'image/png' } }),
      );
    },
  };
}

interface Deps {
  render: RenderIllustration;
  store: IllustrationStore;
  urls?: ObjectUrls;
  /** Object URLs kept alive at once; the oldest are revoked beyond this. */
  maxInMemory?: number;
}

const browserUrls: ObjectUrls = { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) };

/**
 * Muscle-target pictures for exercises: memory (object URLs) → Cache API → render. Pictures depend only on
 * the muscles, the view and the colours, so most exercises share one. One render at a time (iOS allows few
 * WebGL contexts), concurrent requests for the same picture share one render, and a failure returns null
 * so the caller keeps its 2D fallback.
 */
export class IllustrationProvider {
  private readonly memory = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly failed = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();
  private readonly urls: ObjectUrls;
  private readonly max: number;

  constructor(private readonly deps: Deps) {
    this.urls = deps.urls ?? browserUrls;
    this.max = deps.maxInMemory ?? 150;
  }

  /** The picture as an object URL, or null when it cannot be drawn on this device. Never throws. */
  url(spec: IllustrationSpec, palette: MuscleMapPalette): Promise<string | null> {
    const key = illustrationKey(spec, `${palette.hit}/${palette.off}/${palette.base}`);
    const ready = this.memory.get(key);
    if (ready !== undefined) {
      this.memory.delete(key);
      this.memory.set(key, ready); // most recently used
      return Promise.resolve(ready);
    }
    if (this.failed.has(key)) return Promise.resolve(null);
    const running = this.pending.get(key);
    if (running) return running;
    const job = this.queue(() => this.load(key, spec, palette)).finally(() => this.pending.delete(key));
    this.pending.set(key, job);
    return job;
  }

  private queue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async load(key: string, spec: IllustrationSpec, palette: MuscleMapPalette): Promise<string | null> {
    try {
      let blob = await this.deps.store.get(key).catch(() => null);
      if (blob === null) {
        blob = await this.deps.render(spec, palette);
        void this.deps.store.put(key, blob).catch(() => undefined);
      }
      return this.remember(key, this.urls.create(blob));
    } catch {
      this.failed.add(key);
      return null;
    }
  }

  private remember(key: string, url: string): string {
    this.memory.set(key, url);
    while (this.memory.size > this.max) {
      const oldest = this.memory.entries().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest[0]);
      this.urls.revoke(oldest[1]);
    }
    return url;
  }
}

/** The muscle map colours of the current theme (CSS variables; defaults match tokens.css light). */
export function readIllustrationPalette(
  root: Element | null = typeof document === 'undefined' ? null : document.documentElement,
): MuscleMapPalette {
  const fallback: MuscleMapPalette = { base: '#d9dad6', off: '#c3c5c1', hit: '#f25c1f' };
  if (!root || typeof getComputedStyle === 'undefined') return fallback;
  const style = getComputedStyle(root);
  const read = (name: string, def: string) => {
    const v = style.getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : def;
  };
  return { base: read('--muscle-base', fallback.base), off: read('--muscle-off', fallback.off), hit: read('--brand', fallback.hit) };
}
