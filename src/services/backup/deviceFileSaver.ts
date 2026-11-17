import type { SaveOutcome } from '@/domain/backup';
import { BrowserShareService, type ShareFailure, type ShareService } from '@/services/share';

/**
 * Puts a backup file OUTSIDE browser storage, where deleting the app or Safari evicting its data cannot touch
 * it. Order:
 * 1. Web Share with files (iPhone: «حفظ في الملفات», WhatsApp to yourself, Mail, the trainer's own Drive app);
 * 2. File System Access save picker (desktop Chrome/Edge);
 * 3. `<a download>` (Android Chrome: lands in Downloads; no completion signal, so the UI asks the trainer).
 * Never throws.
 */

export interface SaveFileRequest {
  blob: Blob;
  fileName: string;
  mimeType: string;
  title?: string;
}

export interface SaveResult {
  outcome: SaveOutcome;
  /** `not_allowed`: iOS refused because the tap's user activation expired; show a button and call again from its tap. */
  failure?: ShareFailure;
}

export interface DeviceFileSaver {
  save(request: SaveFileRequest): Promise<SaveResult>;
}

/** The subset of the File System Access API used here (not in TypeScript's DOM lib). */
export interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}
export interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}
export type SavePicker = (options: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileHandleLike>;

export function browserSavePicker(): SavePicker | undefined {
  const w = globalThis as { showSaveFilePicker?: SavePicker };
  return typeof w.showSaveFilePicker === 'function' ? (o) => w.showSaveFilePicker!(o) : undefined;
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

export class BrowserDeviceFileSaver implements DeviceFileSaver {
  constructor(
    private readonly share: ShareService = new BrowserShareService(),
    private readonly picker: SavePicker | undefined = browserSavePicker(),
  ) {}

  async save(request: SaveFileRequest): Promise<SaveResult> {
    const shareRequest = { data: request.blob, fileName: request.fileName, mimeType: request.mimeType, title: request.title, downloadName: request.fileName };
    if (this.share.canShareFiles(shareRequest)) {
      const r = await this.share.shareFile(shareRequest, { prefer: 'share' });
      if (r.outcome === 'failed') return { outcome: 'failed', failure: r.reason };
      return { outcome: r.outcome };
    }
    if (this.picker) {
      let writable: WritableLike | null = null;
      try {
        const ext = extensionOf(request.fileName);
        const handle = await this.picker({
          suggestedName: request.fileName,
          types: ext ? [{ description: request.title ?? request.fileName, accept: { [request.mimeType]: [ext] } }] : undefined,
        });
        writable = await handle.createWritable();
        await writable.write(request.blob);
        await writable.close();
        return { outcome: 'saved' };
      } catch (error) {
        await writable?.abort?.().catch(() => undefined);
        if (isAbort(error)) return { outcome: 'cancelled' };
        // fall through to a plain download
      }
    }
    const r = await this.share.shareFile(shareRequest, { prefer: 'download' });
    if (r.outcome === 'failed') return { outcome: 'failed', failure: r.reason };
    return { outcome: r.outcome === 'downloaded' ? 'downloaded' : r.outcome };
  }
}

/** Test/preview fake: returns scripted outcomes and remembers what it was given. */
export class FakeDeviceFileSaver implements DeviceFileSaver {
  readonly saved: SaveFileRequest[] = [];
  constructor(public next: SaveResult = { outcome: 'shared' }) {}

  async save(request: SaveFileRequest): Promise<SaveResult> {
    this.saved.push(request);
    return this.next;
  }
}
