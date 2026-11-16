import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { err, ok, type Result } from '@/domain/nutrition/result';

/** Lowercase hex SHA-256 via Web Crypto. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

const FLUSH_BYTES = 4 * 1024 * 1024;

/**
 * Streaming zip writer. Output chunks are folded into Blobs every few MB so a 500-photo archive is held by
 * the browser's Blob storage rather than as one huge JS ArrayBuffer.
 */
export class ZipBlobWriter {
  private readonly parts: Blob[] = [];
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private written = 0;
  private failure: Error | null = null;
  private readonly zip: Zip;

  constructor(
    private readonly mtime: number,
    private readonly flushBytes = FLUSH_BYTES,
  ) {
    this.zip = new Zip((error, chunk) => {
      if (error) {
        this.failure = error;
        return;
      }
      this.pending.push(chunk);
      this.pendingBytes += chunk.length;
      this.written += chunk.length;
      if (this.pendingBytes >= this.flushBytes) this.flush();
    });
  }

  private flush(): void {
    if (this.pending.length === 0) return;
    this.parts.push(new Blob(this.pending as BlobPart[]));
    this.pending = [];
    this.pendingBytes = 0;
  }

  private check(): void {
    if (this.failure) throw this.failure;
  }

  /** JSON and other compressible data. */
  addDeflated(path: string, data: Uint8Array): void {
    const file = new ZipDeflate(path, { level: 6 });
    file.mtime = this.mtime;
    this.zip.add(file);
    file.push(data, true);
    this.check();
  }

  /** Already-compressed data (JPEG/WebP/PNG): stored as is. */
  addStored(path: string, data: Uint8Array): void {
    const file = new ZipPassThrough(path);
    file.mtime = this.mtime;
    this.zip.add(file);
    file.push(data, true);
    this.check();
  }

  get bytesWritten(): number {
    return this.written;
  }

  finish(type = 'application/zip'): Blob {
    this.zip.end();
    this.check();
    this.flush();
    return new Blob(this.parts, { type });
  }
}

export type ZipReadError = 'malformed' | 'too_large' | 'cancelled' | 'unexpected_file';

export interface ZipReadOptions {
  /** Refuse any single entry bigger than this once decompressed (zip-bomb guard). */
  maxEntryBytes: number;
  /** Paths that may appear; anything else aborts the read. */
  isAllowed: (path: string) => boolean;
  signal?: AbortSignal;
  chunkBytes?: number;
}

/**
 * Streams a zip from a Blob and hands each complete entry to `onEntry`, one at a time, awaiting it before
 * reading further. Entries are never all held in memory together by this reader.
 */
export async function readZipEntries(
  source: Blob,
  onEntry: (path: string, bytes: Uint8Array) => Promise<void>,
  options: ZipReadOptions,
): Promise<Result<{ entries: number }, ZipReadError>> {
  let failure: ZipReadError | null = null;
  const done: { path: string; bytes: Uint8Array }[] = [];
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (failure) return;
    if (!options.isAllowed(file.name)) {
      failure = 'unexpected_file';
      return;
    }
    if ((file.originalSize ?? 0) > options.maxEntryBytes) {
      failure = 'too_large';
      return;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        failure = 'malformed';
        return;
      }
      size += chunk.length;
      if (size > options.maxEntryBytes) {
        failure = 'too_large';
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        const bytes = chunks.length === 1 ? chunks[0]! : concat(chunks, size);
        done.push({ path: file.name, bytes });
      }
    };
    try {
      file.start();
    } catch {
      failure = 'malformed';
    }
  };

  let entries = 0;
  const drain = async () => {
    while (done.length > 0 && !failure) {
      const next = done.shift()!;
      entries += 1;
      await onEntry(next.path, next.bytes);
    }
  };

  const step = options.chunkBytes ?? 1024 * 1024;
  try {
    for (let offset = 0; offset < source.size || offset === 0; offset += step) {
      if (options.signal?.aborted) return err('cancelled');
      const end = Math.min(source.size, offset + step);
      const chunk = new Uint8Array(await source.slice(offset, end).arrayBuffer());
      unzip.push(chunk, end >= source.size);
      if (failure) return err(failure);
      await drain();
      if (end >= source.size) break;
    }
  } catch {
    return err('malformed');
  }
  if (failure) return err(failure);
  await drain();
  return ok({ entries });
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
