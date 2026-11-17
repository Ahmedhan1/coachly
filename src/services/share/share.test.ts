import { describe, expect, it } from 'vitest';
import { BrowserShareService, safeFileName, type ShareEnvironment } from './shareService';

function env(patch: Partial<ShareEnvironment> = {}) {
  const log: string[] = [];
  const shared: ShareData[] = [];
  const e: ShareEnvironment = {
    canShare: (d) => Boolean(d.files?.length),
    share: async (d) => {
      shared.push(d);
    },
    createObjectURL: () => 'blob:x',
    revokeObjectURL: (u) => log.push(`revoke ${u}`),
    clickDownload: (u, n) => log.push(`download ${u} ${n}`),
    makeFile: (parts, name, type) => new File(parts, name, { type }),
    defer: (fn) => fn(),
    ...patch,
  };
  return { e, log, shared };
}

const req = { data: new Blob(['%PDF']), fileName: 'برنامج سارة.pdf', mimeType: 'application/pdf', title: 'برنامج' };

describe('BrowserShareService', () => {
  it('shares files when canShare allows', async () => {
    const { e, shared } = env();
    const s = new BrowserShareService(e);
    expect(s.canShareFiles()).toBe(true);
    expect(await s.shareFile(req)).toEqual({ outcome: 'shared' });
    const file = shared[0]!.files![0]!;
    expect(file.name).toBe('برنامج سارة.pdf');
    expect(file.type).toBe('application/pdf');
    expect(shared[0]!.title).toBe('برنامج');
  });

  it('maps AbortError to cancelled and NotAllowedError to not_allowed', async () => {
    const abort = new BrowserShareService(env({ share: async () => Promise.reject(new DOMException('x', 'AbortError')) }).e);
    expect(await abort.shareFile(req)).toEqual({ outcome: 'cancelled' });
    const denied = new BrowserShareService(env({ share: async () => Promise.reject(new DOMException('x', 'NotAllowedError')) }).e);
    expect(await denied.shareFile(req)).toEqual({ outcome: 'failed', reason: 'not_allowed' });
  });

  it('downloads when files cannot be shared, or when asked to', async () => {
    const noFiles = env({ canShare: () => false });
    expect(await new BrowserShareService(noFiles.e).shareFile(req)).toEqual({ outcome: 'downloaded', fallback: true });
    expect(noFiles.log).toEqual(['download blob:x برنامج سارة.pdf', 'revoke blob:x']);
    const noApi = env({ share: undefined, canShare: undefined });
    const s = new BrowserShareService(noApi.e);
    expect(s.canShareFiles()).toBe(false);
    expect(await s.shareFile(req)).toEqual({ outcome: 'downloaded', fallback: true });
    const prefer = env();
    expect(await new BrowserShareService(prefer.e).shareFile(req, { prefer: 'download' })).toEqual({ outcome: 'downloaded' });
    expect(prefer.shared).toHaveLength(0);
  });

  it('falls back to download on other share errors, and fails quietly when nothing works', async () => {
    const typeErr = env({ share: async () => Promise.reject(new TypeError('bad')) });
    expect(await new BrowserShareService(typeErr.e).shareFile(req)).toEqual({ outcome: 'downloaded', fallback: true });
    const broken = env({ canShare: () => false, createObjectURL: () => { throw new Error('no'); } });
    expect(await new BrowserShareService(broken.e).shareFile(req)).toEqual({ outcome: 'failed', reason: 'unsupported' });
  });

  it('cleans file names', () => {
    expect(safeFileName('a/b:c*?.pdf')).toBe('a-b-c-.pdf');
    expect(safeFileName('  ...  ')).toBe('file');
    expect(safeFileName('حصة   أحمد.ics')).toBe('حصة أحمد.ics');
  });
});
