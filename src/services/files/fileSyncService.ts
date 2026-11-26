import { packFile, unpackFile, type PackedHeader } from '@/domain/files';
import type { CloudFileRecord } from '@/data/db';
import type { CloudFileRepository } from '@/data/repositories/cloudFileRepository';
import type { ImageRepository } from '@/data/repositories/imageRepository';
import type { MetaStore } from '@/services/meta/metaStore';
import type { ImageDownscaler } from '@/services/storage/types';
import { generateRawKey, openWithKey, sealWithKey } from '../../../shared/envelope';
import { base64UrlDecode, base64UrlEncode } from '../../../shared/bytes';
import type { CloudFileInfo } from '../../../shared/files';
import type { CloudFilesClient } from './types';

/**
 * Meta key of the trainer's files key (32 random bytes, base64url). It is NOT device-local, so it travels inside
 * the password-encrypted backup and a restored phone can still open the cloud copies.
 */
export const FILES_KEY_META = 'files.key';

export interface FileSyncDeps {
  client: CloudFilesClient;
  files: CloudFileRepository;
  images: Pick<ImageRepository, 'getBlob' | 'save'>;
  meta: MetaStore;
  downscaler: ImageDownscaler;
  now: () => number;
}

export interface SyncReport {
  uploaded: number;
  deleted: number;
  failed: number;
}

/** A client page the trainer published: its id, link key and the client it belongs to. */
export interface ShareLink {
  shareId: string;
  key: string;
  clientId: string;
}

export interface ImportedClientPhoto {
  clientId: string;
  imageId: string;
}

export interface OpenedFile extends PackedHeader {
  bytes: Uint8Array;
}

/**
 * Keeps cloud copies of photos, thumbnails, invoices and PDFs (golden rule: local first, the cloud is a copy).
 * Everything is encrypted on the phone before upload; every network failure is silent and retried with back-off.
 */
export class FileSyncService {
  private running: Promise<SyncReport> | null = null;
  private lastError: string | null = null;

  constructor(private readonly d: FileSyncDeps) {}

  /** The trainer's files key, created on first use. */
  async key(): Promise<Uint8Array> {
    const stored = await this.d.meta.get(FILES_KEY_META);
    const raw = typeof stored === 'string' ? base64UrlDecode(stored) : null;
    if (raw && raw.length === 32) return raw;
    const fresh = generateRawKey();
    await this.d.meta.set(FILES_KEY_META, base64UrlEncode(fresh));
    return fresh;
  }

  /** Uploads and deletes everything due. One run at a time; a second call joins the running one. */
  run(): Promise<SyncReport> {
    this.running ??= this.runOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce(): Promise<SyncReport> {
    const report: SyncReport = { uploaded: 0, deleted: 0, failed: 0 };
    const due = await this.d.files.due(this.d.now());
    for (const row of due) {
      const done = row.state === 'deleting' ? await this.deleteRemote(row) : await this.upload(row);
      if (done === 'ok') {
        if (row.state === 'deleting') report.deleted++;
        else report.uploaded++;
      } else if (done === 'failed') {
        report.failed++;
        await this.d.files.markFailed(row.id);
        // Offline or not activated: the rest would fail the same way; try again later.
        if (this.lastError === 'offline' || this.lastError === 'not_signed_in') break;
      }
    }
    return report;
  }

  private async contentOf(row: CloudFileRecord): Promise<Uint8Array | null> {
    if (row.bytes) return new Uint8Array(row.bytes);
    if (row.imageId) {
      const blob = await this.d.images.getBlob(row.imageId);
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    }
    return null;
  }

  private async seal(row: CloudFileRecord, content: Uint8Array): Promise<Uint8Array> {
    const header: PackedHeader = row.name ? { mime: row.mime, name: row.name } : { mime: row.mime };
    return sealWithKey(await this.key(), packFile(header, content));
  }

  /** Finds the remote copy of kind + ref (after a restore, or when an earlier answer was lost). */
  private async findRemote(row: CloudFileRecord): Promise<CloudFileInfo | null | 'error'> {
    if (row.ref === null && row.kind !== 'trainer_photo') return null;
    const r = await this.d.client.list(row.ref === null ? { kind: row.kind, source: 'trainer' } : { kind: row.kind, ref: row.ref, source: 'trainer' });
    if (!r.ok) {
      this.lastError = r.error;
      return 'error';
    }
    return r.value.find((f) => f.ref === row.ref) ?? null;
  }

  private async upload(row: CloudFileRecord): Promise<'ok' | 'failed' | 'gone'> {
    const content = await this.contentOf(row);
    if (content === null) {
      // The image was deleted locally: nothing to upload any more.
      await this.d.files.removeRecord(row);
      return 'gone';
    }
    const envelope = await this.seal(row, content);
    let remoteId = row.remoteId;
    if (remoteId === null) {
      const found = await this.findRemote(row);
      if (found === 'error') return 'failed';
      remoteId = found?.id ?? null;
    }
    let result = remoteId !== null ? await this.d.client.replace(remoteId, envelope) : null;
    if (result === null || (!result.ok && result.error === 'not_found')) result = await this.d.client.create(row.kind, row.ref, envelope);
    if (!result.ok) {
      this.lastError = result.error;
      return 'failed';
    }
    await this.d.files.markSynced(row.id, result.value.id, row.updatedAt);
    return 'ok';
  }

  private async deleteRemote(row: CloudFileRecord): Promise<'ok' | 'failed'> {
    if (row.remoteId !== null) {
      const r = await this.d.client.remove(row.remoteId);
      if (!r.ok && r.error !== 'not_found') {
        this.lastError = r.error;
        return 'failed';
      }
    }
    await this.d.files.forget(row.id);
    return 'ok';
  }

  /** Downloads and decrypts a file (to view a PDF or invoice that is no longer on this phone). null on any failure. */
  async open(remoteId: string, key?: Uint8Array): Promise<OpenedFile | null> {
    const r = await this.d.client.download(remoteId);
    if (!r.ok) return null;
    const opened = await openWithKey(key ?? (await this.key()), r.value);
    if (!opened.ok) return null;
    const unpacked = unpackFile(opened.data);
    return unpacked ? { ...unpacked.header, bytes: unpacked.bytes } : null;
  }

  /**
   * Brings in profile photos clients uploaded from their page: decrypts with that page's link key, stores the
   * picture on the phone, then deletes the server copy. Files from unknown or deleted pages are left alone.
   */
  async pullClientPhotos(links: readonly ShareLink[]): Promise<ImportedClientPhoto[]> {
    if (links.length === 0) return [];
    const list = await this.d.client.list({ kind: 'client_photo', source: 'client' });
    if (!list.ok) return [];
    const byShare = new Map(links.map((l) => [l.shareId, l]));
    // Newest first, so if a client sent two before the app pulled, the latest wins.
    const files = [...list.value].sort((a, b) => b.createdAt - a.createdAt);
    const imported: ImportedClientPhoto[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      const link = f.shareId ? byShare.get(f.shareId) : undefined;
      if (!link) continue;
      if (seen.has(link.clientId)) {
        await this.d.client.remove(f.id);
        continue;
      }
      const opened = await this.open(f.id, base64UrlDecode(link.key) ?? undefined);
      if (!opened || !opened.mime.startsWith('image/')) continue;
      try {
        const small = await this.d.downscaler.downscale(new Blob([opened.bytes as BlobPart], { type: opened.mime }));
        const saved = await this.d.images.save(small);
        imported.push({ clientId: link.clientId, imageId: saved.id });
        seen.add(link.clientId);
        await this.d.client.remove(f.id);
      } catch {
        // Undecodable picture: leave it on the server; the next pull tries again.
      }
    }
    return imported;
  }
}
