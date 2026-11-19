import { err, ok, type Result } from '@/domain/nutrition/result';
import type { CloudFileInfo, FileKind, FileSource } from '../../../shared/files';
import type { CloudFilesClient, FileListQuery, FilesError } from './types';

/** In-memory server for tests: same rules as the Worker (ids, kind + ref, replace, delete). */
export class FakeCloudFilesClient implements CloudFilesClient {
  readonly files = new Map<string, { info: CloudFileInfo; bytes: Uint8Array }>();
  /** When set, every call fails with this error (offline, server down, ...). */
  failWith: FilesError | null = null;
  calls: string[] = [];
  private n = 0;
  private clock = 1_790_000_000;

  private fail<T>(): Result<T, FilesError> | null {
    return this.failWith ? err(this.failWith) : null;
  }

  /** Puts a file on the "server" as if a client page uploaded it. */
  seed(kind: FileKind, bytes: Uint8Array, extra: { source?: FileSource; shareId?: string | null; ref?: string | null } = {}): CloudFileInfo {
    const id = `remote${++this.n}`.padEnd(16, '0');
    const info: CloudFileInfo = { id, kind, ref: extra.ref ?? null, source: extra.source ?? 'trainer', shareId: extra.shareId ?? null, size: bytes.length, createdAt: ++this.clock, updatedAt: this.clock };
    this.files.set(id, { info, bytes: new Uint8Array(bytes) });
    return info;
  }

  async list(query: FileListQuery = {}): Promise<Result<CloudFileInfo[], FilesError>> {
    this.calls.push('list');
    const f = this.fail<CloudFileInfo[]>();
    if (f) return f;
    return ok(
      [...this.files.values()]
        .map((x) => x.info)
        .filter((i) => (!query.kind || i.kind === query.kind) && (!query.ref || i.ref === query.ref) && (!query.source || i.source === query.source)),
    );
  }

  async create(kind: FileKind, ref: string | null, envelope: Uint8Array): Promise<Result<CloudFileInfo, FilesError>> {
    this.calls.push(`create ${kind}`);
    const f = this.fail<CloudFileInfo>();
    if (f) return f;
    return ok(this.seed(kind, envelope, { ref }));
  }

  async replace(id: string, envelope: Uint8Array): Promise<Result<CloudFileInfo, FilesError>> {
    this.calls.push(`replace ${id}`);
    const f = this.fail<CloudFileInfo>();
    if (f) return f;
    const cur = this.files.get(id);
    if (!cur) return err('not_found');
    const info = { ...cur.info, size: envelope.length, updatedAt: ++this.clock };
    this.files.set(id, { info, bytes: new Uint8Array(envelope) });
    return ok(info);
  }

  async download(id: string): Promise<Result<Uint8Array, FilesError>> {
    this.calls.push(`download ${id}`);
    const f = this.fail<Uint8Array>();
    if (f) return f;
    const cur = this.files.get(id);
    return cur ? ok(new Uint8Array(cur.bytes)) : err('not_found');
  }

  async remove(id: string): Promise<Result<true, FilesError>> {
    this.calls.push(`remove ${id}`);
    const f = this.fail<true>();
    if (f) return f;
    if (!this.files.delete(id)) return err('not_found');
    return ok(true);
  }
}
