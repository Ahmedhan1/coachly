import type { Result } from '@/domain/nutrition/result';
import type { CloudError } from '@/services/cloud/types';
import type { CloudFileInfo, FileKind, FileSource } from '../../../shared/files';

export type FilesError = CloudError | 'not_activated';

export interface FileListQuery {
  kind?: FileKind;
  ref?: string;
  source?: FileSource;
}

/**
 * The Worker's cloud-files API (bytes are already encrypted envelopes). Never throws: every failure is a
 * FilesError, so callers stay silent and retry later (golden rule).
 */
export interface CloudFilesClient {
  list(query?: FileListQuery): Promise<Result<CloudFileInfo[], FilesError>>;
  create(kind: FileKind, ref: string | null, envelope: Uint8Array): Promise<Result<CloudFileInfo, FilesError>>;
  replace(id: string, envelope: Uint8Array): Promise<Result<CloudFileInfo, FilesError>>;
  download(id: string): Promise<Result<Uint8Array, FilesError>>;
  remove(id: string): Promise<Result<true, FilesError>>;
}
