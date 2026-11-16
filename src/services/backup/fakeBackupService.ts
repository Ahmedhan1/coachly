import { buildManifest, type BackupManifest } from '@/domain/backup';
import { err, ok, type Result } from '@/domain/nutrition/result';
import { EMPTY_BACKUP_STATUS, type BackupStatus } from '@/data/backupMeta';
import type {
  BackupFile,
  BackupFileKind,
  BackupService,
  ExportError,
  ExportOptions,
  ImportError,
  ImportOptions,
  ImportSummary,
} from './types';

/** For UI tests and screenshots: no database, scripted outcomes. */
export class FakeBackupService implements BackupService {
  exportResult: Result<BackupFile, ExportError> | null = null;
  importResult: Result<ImportSummary, ImportError> = ok({
    counts: { clients: 3, images: 2 },
    schemaVersion: 1,
    migratedFrom: null,
    imageVariant: 'full',
    createdAt: 0,
    appVersion: 'fake',
  });
  state: BackupStatus = { ...EMPTY_BACKUP_STATUS };
  imported: Blob[] = [];

  constructor(private readonly now: () => number = () => 0) {}

  private manifest(): BackupManifest {
    return buildManifest({ appVersion: 'fake', schemaVersion: 1, createdAt: this.now(), imageVariant: 'full', counts: {}, files: [] });
  }

  async exportFile(options: ExportOptions = {}): Promise<Result<BackupFile, ExportError>> {
    if (this.exportResult) return this.exportResult;
    if (options.password != null && options.password.length < 8) return err('weak_password');
    const encrypted = options.password != null;
    return ok({
      blob: new Blob(['fake'], { type: encrypted ? 'application/octet-stream' : 'application/zip' }),
      fileName: encrypted ? 'pt-coach-backup.ptbackup' : 'pt-coach-backup.zip',
      mimeType: encrypted ? 'application/octet-stream' : 'application/zip',
      encrypted,
      manifest: this.manifest(),
    });
  }

  async detectFile(file: Blob): Promise<BackupFileKind> {
    return file.type === 'application/octet-stream' ? 'encrypted' : 'zip';
  }

  async importFile(file: Blob, options: ImportOptions = {}): Promise<Result<ImportSummary, ImportError>> {
    this.imported.push(file);
    if (options.signal?.aborted) return err('cancelled');
    return this.importResult;
  }

  async recordSaved(at: number): Promise<void> {
    this.state = { ...this.state, lastLocalAt: at };
  }

  async status(): Promise<BackupStatus> {
    return { ...this.state };
  }
}
