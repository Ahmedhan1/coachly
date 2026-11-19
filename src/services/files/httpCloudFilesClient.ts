import { err, ok, type Result } from '@/domain/nutrition/result';
import type { WorkerApi } from '@/services/cloud/workerApi';
import type { CloudFileInfo, FileKind } from '../../../shared/files';
import type { CloudFilesClient, FileListQuery, FilesError } from './types';

/** `/api/files` over the shared Worker client (short timeout, silent failures). */
export class HttpCloudFilesClient implements CloudFilesClient {
  constructor(private readonly api: WorkerApi) {}

  async list(query: FileListQuery = {}): Promise<Result<CloudFileInfo[], FilesError>> {
    const params = new URLSearchParams();
    if (query.kind) params.set('kind', query.kind);
    if (query.ref) params.set('ref', query.ref);
    if (query.source) params.set('source', query.source);
    const qs = params.toString();
    const r = await this.api.json<{ files?: CloudFileInfo[] }>({ method: 'GET', path: `/api/files${qs ? `?${qs}` : ''}` });
    return r.ok ? ok(r.value.files ?? []) : r;
  }

  async create(kind: FileKind, ref: string | null, envelope: Uint8Array): Promise<Result<CloudFileInfo, FilesError>> {
    const params = new URLSearchParams({ kind });
    if (ref !== null) params.set('ref', ref);
    const r = await this.api.json<{ file?: CloudFileInfo }>({ method: 'POST', path: `/api/files?${params.toString()}`, bytes: envelope });
    if (!r.ok) return r;
    return r.value.file ? ok(r.value.file) : err('server');
  }

  async replace(id: string, envelope: Uint8Array): Promise<Result<CloudFileInfo, FilesError>> {
    const r = await this.api.json<{ file?: CloudFileInfo }>({ method: 'PUT', path: `/api/files/${encodeURIComponent(id)}`, bytes: envelope });
    if (!r.ok) return r;
    return r.value.file ? ok(r.value.file) : err('server');
  }

  download(id: string): Promise<Result<Uint8Array, FilesError>> {
    return this.api.bytes({ method: 'GET', path: `/api/files/${encodeURIComponent(id)}` });
  }

  async remove(id: string): Promise<Result<true, FilesError>> {
    const r = await this.api.send({ method: 'DELETE', path: `/api/files/${encodeURIComponent(id)}` });
    return r.ok ? ok(true) : r;
  }
}
