import type { ExercisePack } from '@/domain/exercises';

/** Folder of the bundled pack, served from public/exercise-pack/ (absolute so deep links resolve it). */
export const PACK_FOLDER = '/exercise-pack/';
export const PACK_MANIFEST_URL = `${PACK_FOLDER}exercises.json`;
/** Must match the Workbox runtime route cache name in vite.config.ts. */
export const PHOTO_CACHE_NAME = 'exercise-photos';

export interface OfflinePhotosStatus {
  totalFiles: number;
  cachedFiles: number;
  /** Size of the whole photo set from the manifest. */
  totalBytes: number;
}

export interface DownloadProgress {
  totalFiles: number;
  doneFiles: number;
  failedFiles: number;
  totalBytes: number;
  /** Bytes of the files done so far (measured for downloads, estimated for files already cached). */
  doneBytes: number;
}

export interface DownloadResult extends DownloadProgress {
  cancelled: boolean;
}

export interface DownloadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  /** Requests in flight (default 6). */
  concurrency?: number;
}

/** Loads the bundled exercise pack and manages its photos in Cache Storage. */
export interface ExercisePackService {
  loadPack(): Promise<ExercisePack>;
  /** Every photo URL of the pack (absolute paths). */
  photoUrls(pack: ExercisePack): string[];
  offlineStatus(pack: ExercisePack): Promise<OfflinePhotosStatus>;
  /** Fetches every photo not cached yet. Resumable: files already cached are skipped. */
  downloadAll(pack: ExercisePack, options?: DownloadOptions): Promise<DownloadResult>;
}
