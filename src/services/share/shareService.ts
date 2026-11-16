export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'failed';

/**
 * `not_allowed`: iOS refused because the share was not started directly by a tap (user activation expired,
 * e.g. after a long PDF render). The UI should show a "شارك" button and call `shareFile` from its tap.
 */
export type ShareFailure = 'not_allowed' | 'unsupported' | 'error';

export type ShareResult = { outcome: 'shared' | 'cancelled' | 'downloaded' } | { outcome: 'failed'; reason: ShareFailure };

export interface ShareFileRequest {
  data: Blob;
  fileName: string;
  mimeType: string;
  title?: string;
  text?: string;
}

export interface ShareService {
  /** Whether the share sheet can take files here (otherwise `shareFile` downloads). */
  canShareFiles(sample?: ShareFileRequest): boolean;
  shareFile(request: ShareFileRequest, options?: { prefer?: 'share' | 'download' }): Promise<ShareResult>;
}

/** The parts of `navigator` and `document` the browser implementation needs (injected for tests). */
export interface ShareEnvironment {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** Clicks a temporary `<a download>`. */
  clickDownload: (url: string, fileName: string) => void;
  makeFile: (parts: BlobPart[], name: string, type: string) => File;
  /** Revoke later: Safari needs the URL alive while it opens the file. */
  defer: (fn: () => void, ms: number) => void;
}

export function browserShareEnvironment(): ShareEnvironment {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    canShare: nav?.canShare ? (d) => nav.canShare(d) : undefined,
    share: nav?.share ? (d) => nav.share(d) : undefined,
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
    clickDownload: (url, fileName) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    makeFile: (parts, name, type) => new File(parts, name, { type }),
    defer: (fn, ms) => {
      setTimeout(fn, ms);
    },
  };
}

/** Removes characters iOS/Android file systems or share targets reject; keeps Arabic. */
export function safeFileName(name: string, fallback = 'file'): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return (cleaned || fallback).slice(0, 120);
}

/**
 * Web Share API with files when `navigator.canShare({ files })` says yes (iOS share sheet → WhatsApp,
 * Files, Calendar…); otherwise a download through an object URL. Never throws.
 */
export class BrowserShareService implements ShareService {
  constructor(private readonly env: ShareEnvironment = browserShareEnvironment()) {}

  private fileFor(r: ShareFileRequest): File {
    return this.env.makeFile([r.data], safeFileName(r.fileName), r.mimeType);
  }

  canShareFiles(sample?: ShareFileRequest): boolean {
    if (!this.env.share || !this.env.canShare) return false;
    try {
      const file = sample ? this.fileFor(sample) : this.env.makeFile([''], 'probe.txt', 'text/plain');
      return this.env.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  async shareFile(request: ShareFileRequest, options: { prefer?: 'share' | 'download' } = {}): Promise<ShareResult> {
    let file: File;
    try {
      file = this.fileFor(request);
    } catch {
      return { outcome: 'failed', reason: 'error' };
    }
    if (options.prefer !== 'download' && this.env.share && this.env.canShare) {
      let can = false;
      try {
        can = this.env.canShare({ files: [file] });
      } catch {
        can = false;
      }
      if (can) {
        try {
          await this.env.share({ files: [file], title: request.title, text: request.text });
          return { outcome: 'shared' };
        } catch (e) {
          const name = e instanceof Error || e instanceof DOMException ? e.name : '';
          if (name === 'AbortError') return { outcome: 'cancelled' };
          if (name === 'NotAllowedError') return { outcome: 'failed', reason: 'not_allowed' };
          // Other errors (e.g. TypeError for a type the target refuses): fall back to download below.
        }
      }
    }
    return this.download(file);
  }

  private download(file: File): ShareResult {
    try {
      const url = this.env.createObjectURL(file);
      this.env.clickDownload(url, file.name);
      this.env.defer(() => this.env.revokeObjectURL(url), 60_000);
      return { outcome: 'downloaded' };
    } catch {
      return { outcome: 'failed', reason: 'unsupported' };
    }
  }
}

/** Records requests; answers with a scripted result. */
export class FakeShareService implements ShareService {
  readonly requests: ShareFileRequest[] = [];
  constructor(
    public result: ShareResult = { outcome: 'shared' },
    public filesSupported = true,
  ) {}

  canShareFiles(): boolean {
    return this.filesSupported;
  }

  async shareFile(request: ShareFileRequest): Promise<ShareResult> {
    this.requests.push(request);
    return this.result;
  }
}
