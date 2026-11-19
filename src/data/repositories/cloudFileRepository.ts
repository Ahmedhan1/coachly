import { nextAttemptAt } from '@/domain/files';
import type { FileKind } from '../../../shared/files';
import type { CloudFileRecord } from '../db';
import type { RepositoryContext } from './entityRepository';

/** What to upload: a stored image, or raw bytes (PDF, invoice file). */
export type CloudFileContent = { imageId: string; mime: string; name?: string } | { bytes: Uint8Array; mime: string; name?: string };

/**
 * The cloud-file queue (device-local). Files are named by kind + ref; putting new content under the same pair
 * replaces it (one client photo per client), and the next sync uploads it.
 */
export class CloudFileRepository {
  constructor(private readonly ctx: RepositoryContext) {}

  private get table() {
    return this.ctx.db.cloudFiles;
  }

  /** The live record for kind + ref (not one being deleted), or undefined. */
  async find(kind: FileKind, ref: string | null): Promise<CloudFileRecord | undefined> {
    const rows = ref === null ? await this.table.filter((r) => r.kind === kind && r.ref === null).toArray() : await this.table.where('[kind+ref]').equals([kind, ref]).toArray();
    return rows.find((r) => r.state !== 'deleting');
  }

  get(id: string): Promise<CloudFileRecord | undefined> {
    return this.table.get(id);
  }

  list(): Promise<CloudFileRecord[]> {
    return this.table.toArray();
  }

  /** Creates or replaces the content for kind + ref and queues the upload. */
  async put(kind: FileKind, ref: string | null, content: CloudFileContent): Promise<CloudFileRecord> {
    const now = this.ctx.clock();
    return this.ctx.db.transaction('rw', this.table, async () => {
      const existing = await this.find(kind, ref);
      const record: CloudFileRecord = {
        id: existing?.id ?? this.ctx.newId(),
        kind,
        ref,
        imageId: 'imageId' in content ? content.imageId : null,
        bytes: 'bytes' in content ? content.bytes.slice().buffer : null,
        mime: content.mime,
        name: content.name ?? null,
        remoteId: existing?.remoteId ?? null,
        state: 'pending',
        attempts: 0,
        nextAttemptAt: now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await this.table.put(record);
      return record;
    });
  }

  /** Remembers a file that already exists on the server (pulled from a client page, or found after a restore). */
  async adopt(kind: FileKind, ref: string | null, remoteId: string, content: CloudFileContent): Promise<CloudFileRecord> {
    const record = await this.put(kind, ref, content);
    const synced: CloudFileRecord = { ...record, remoteId, state: 'synced', bytes: null };
    await this.table.put(synced);
    return synced;
  }

  /** Records due for upload or remote delete at `now`, oldest first. */
  async due(now: number): Promise<CloudFileRecord[]> {
    const rows = await this.table.where('nextAttemptAt').belowOrEqual(now).toArray();
    return rows.filter((r) => r.state !== 'synced').sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);
  }

  /** The server has this version. Raw bytes are dropped (the cloud is their archive); images stay local. */
  async markSynced(id: string, remoteId: string, uploadedVersion: number): Promise<void> {
    await this.ctx.db.transaction('rw', this.table, async () => {
      const row = await this.table.get(id);
      // Changed again while uploading: keep it pending so the newer content goes up next.
      if (!row || row.updatedAt !== uploadedVersion) {
        if (row) await this.table.put({ ...row, remoteId });
        return;
      }
      await this.table.put({ ...row, remoteId, state: 'synced', bytes: null, attempts: 0 });
    });
  }

  async markFailed(id: string): Promise<void> {
    const row = await this.table.get(id);
    if (!row) return;
    const attempts = row.attempts + 1;
    await this.table.put({ ...row, attempts, nextAttemptAt: nextAttemptAt(attempts, new Date(this.ctx.clock())) });
  }

  /** Deletes kind + ref: forgotten at once when never uploaded, otherwise queued for a remote delete. */
  async remove(kind: FileKind, ref: string | null): Promise<void> {
    const row = await this.find(kind, ref);
    if (row) await this.removeRecord(row);
  }

  async removeRecord(row: CloudFileRecord): Promise<void> {
    if (row.remoteId === null) {
      await this.table.delete(row.id);
      return;
    }
    await this.table.put({ ...row, state: 'deleting', bytes: null, attempts: 0, nextAttemptAt: this.ctx.clock(), updatedAt: this.ctx.clock() });
  }

  /** Removes the local record for good (after the remote delete succeeded). */
  async forget(id: string): Promise<void> {
    await this.table.delete(id);
  }

  /** Every live record whose ref is one of `refs` (e.g. all files of a deleted client). */
  async byRefs(refs: ReadonlySet<string>): Promise<CloudFileRecord[]> {
    return this.table.filter((r) => r.ref !== null && refs.has(r.ref) && r.state !== 'deleting').toArray();
  }
}
