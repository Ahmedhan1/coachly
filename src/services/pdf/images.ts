import type { PdfImageRef } from '@/domain/pdf';
import { DEFAULT_MAX_IMAGE_SIDE, type ImageDownscaler } from '@/services/storage/types';

/** Loads the original bytes behind a PdfImageRef. null = not available (the page shows an empty frame). */
export interface PdfImageSource {
  load(ref: PdfImageRef): Promise<Blob | null>;
}

export interface ImageSourceDeps {
  /** Stored images (Dexie images table). */
  getStoredBlob(imageId: string): Promise<Blob | undefined>;
  fetchFn?: (url: string) => Promise<Response>;
  /** Prefix for pack image paths, e.g. '/'. */
  packBaseUrl?: string;
}

export function createImageSource(deps: ImageSourceDeps): PdfImageSource {
  const fetchFn = deps.fetchFn ?? ((u: string) => fetch(u));
  const get = async (url: string) => {
    const res = await fetchFn(url);
    return res.ok ? res.blob() : null;
  };
  return {
    async load(ref) {
      try {
        if (ref.kind === 'stored') return (await deps.getStoredBlob(ref.imageId)) ?? null;
        if (ref.kind === 'pack') return await get(`${deps.packBaseUrl ?? '/'}${ref.path}`);
        return await get(ref.url);
      } catch {
        return null;
      }
    },
  };
}

export function imageRefKey(ref: PdfImageRef): string {
  return ref.kind === 'stored' ? `s:${ref.imageId}` : ref.kind === 'pack' ? `p:${ref.path}` : `u:${ref.url}`;
}

/** Collects every distinct image a document uses. */
export function collectImageRefs(values: unknown): PdfImageRef[] {
  const out = new Map<string, PdfImageRef>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ((o.kind === 'stored' && typeof o.imageId === 'string') || (o.kind === 'pack' && typeof o.path === 'string') || (o.kind === 'url' && typeof o.url === 'string')) {
        const ref = o as PdfImageRef;
        out.set(imageRefKey(ref), ref);
      } else Object.values(o).forEach(visit);
    }
  };
  visit(values);
  return [...out.values()];
}

/**
 * Resolves refs to object URLs of copies downscaled to ≤ `maxSide` px (spec: ~1200 px), one image at a time.
 * `release()` revokes every URL.
 */
export class ResolvedImages {
  private readonly urls = new Map<string, string>();

  static async resolve(
    refs: readonly PdfImageRef[],
    source: PdfImageSource,
    downscaler: ImageDownscaler,
    options: { maxSide?: number; signal?: AbortSignal; onEach?: (done: number, total: number) => void } = {},
  ): Promise<ResolvedImages> {
    const r = new ResolvedImages();
    let done = 0;
    for (const ref of refs) {
      if (options.signal?.aborted) break;
      const blob = await source.load(ref);
      if (blob) {
        try {
          const small = await downscaler.downscale(blob, options.maxSide ?? DEFAULT_MAX_IMAGE_SIDE);
          r.urls.set(imageRefKey(ref), URL.createObjectURL(small.blob));
        } catch {
          // undecodable image: leave the frame empty
        }
      }
      options.onEach?.(++done, refs.length);
    }
    return r;
  }

  url(ref: PdfImageRef | null): string | null {
    return ref ? (this.urls.get(imageRefKey(ref)) ?? null) : null;
  }

  get size(): number {
    return this.urls.size;
  }

  release(): void {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
  }
}

/**
 * Canvas downscaler for PDF pictures. Unlike the storage downscaler it keeps PNG as PNG so a transparent
 * logo does not turn black, and it returns small images untouched.
 */
export class PdfCanvasDownscaler implements ImageDownscaler {
  constructor(private readonly jpegQuality = 0.85) {}

  async downscale(input: Blob, maxSide = DEFAULT_MAX_IMAGE_SIDE) {
    const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
    try {
      const longest = Math.max(bitmap.width, bitmap.height);
      if (longest <= maxSide && (input.type === 'image/jpeg' || input.type === 'image/png')) {
        return { blob: input, width: bitmap.width, height: bitmap.height };
      }
      const scale = Math.min(1, maxSide / longest);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d unavailable');
      const png = input.type === 'image/png';
      if (!png) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), png ? 'image/png' : 'image/jpeg', this.jpegQuality),
      );
      canvas.width = 0;
      canvas.height = 0;
      return { blob, width, height };
    } finally {
      bitmap.close();
    }
  }
}
