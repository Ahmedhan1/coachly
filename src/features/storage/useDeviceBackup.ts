import { useCallback, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { needsSaveConfirmation, shouldRecordSave } from '@/domain/backup';
import { FILE_PASSWORD_KEY } from '@/data/backupMeta';
import { t } from '@/i18n';
import { BrowserDeviceFileSaver, type BackupFile, type BackupProgress, type DeviceFileSaver, type SaveResult } from '@/services/backup';

export type DeviceBackupState =
  | { kind: 'idle' }
  | { kind: 'setup' }
  | { kind: 'working'; label: string }
  /** File made and verified; the next tap opens the share sheet / save picker (iOS needs a fresh tap). */
  | { kind: 'ready'; file: BackupFile }
  /** A plain download happened: ask the trainer whether the file landed. */
  | { kind: 'confirm'; file: BackupFile };

export interface SetupChoice {
  encrypt: boolean;
  password: string | null;
  remember: boolean;
}

function percent(p: BackupProgress): number {
  return p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
}

function progressLabel(p: BackupProgress): string {
  if (p.phase === 'encrypt') return t('storage.device.encrypting', { percent: percent(p) });
  if (p.phase === 'read' || p.phase === 'verify' || p.phase === 'decrypt') return t('storage.device.checking');
  return t('storage.device.preparing', { percent: percent(p) });
}

async function storedPassword(get: (k: string) => Promise<unknown>): Promise<string | null> {
  const v = await get(FILE_PASSWORD_KEY).catch(() => null);
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * «نزّل نسخة على التليفون»: make the encrypted file, verify it end to end, put it outside the app, and record
 * the backup only when the share/save finished or the trainer confirmed the download (`shouldRecordSave`).
 */
export function useDeviceBackup(options: { saver?: DeviceFileSaver; onSaved?: () => void } = {}) {
  const { backup, meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const saver = useMemo(() => options.saver ?? new BrowserDeviceFileSaver(), [options.saver]);
  const [state, setState] = useState<DeviceBackupState>({ kind: 'idle' });
  const onSaved = options.onSaved;

  const record = useCallback(
    async (file: BackupFile, how: 'shared' | 'saved' | 'downloaded') => {
      if (!backup) return;
      await backup.local.recordSaved(Date.now(), { bytes: file.blob.size, how });
      setState({ kind: 'idle' });
      showToast({ message: how === 'saved' ? t('storage.device.savedFiles') : t('storage.device.saved'), duration: 2500 });
      onSaved?.();
    },
    [backup, showToast, onSaved],
  );

  const handleResult = useCallback(
    async (file: BackupFile, r: SaveResult) => {
      if (shouldRecordSave(r.outcome, null)) return record(file, r.outcome === 'saved' ? 'saved' : 'shared');
      if (needsSaveConfirmation(r.outcome)) return setState({ kind: 'confirm', file });
      setState({ kind: 'ready', file });
      if (r.outcome === 'cancelled') showToast({ message: t('storage.device.cancelled'), duration: 3000 });
      else if (r.outcome === 'failed' && r.failure !== 'not_allowed') showToast({ message: t('storage.device.sendFailed') });
    },
    [record, showToast],
  );

  /** Call from a tap: opens the share sheet / save picker for a ready file. */
  const send = useCallback(
    async (file: BackupFile) => {
      setState({ kind: 'working', label: t('storage.device.sendToSelf') });
      await handleResult(file, await saver.save({ blob: file.blob, fileName: file.fileName, mimeType: file.mimeType, title: t('storage.device.button') }));
    },
    [saver, handleResult],
  );

  const run = useCallback(
    async (password: string | null) => {
      if (!backup) return;
      setState({ kind: 'working', label: t('storage.device.preparing', { percent: 0 }) });
      const onProgress = (p: BackupProgress) => setState({ kind: 'working', label: progressLabel(p) });
      const made = await backup.local.exportFile({ password, onProgress });
      if (!made.ok) {
        setState({ kind: 'idle' });
        return showToast({ message: t('storage.device.failed') });
      }
      setState({ kind: 'working', label: t('storage.device.checking') });
      const verified = await backup.local.verifyFile(made.value.blob, password);
      if (!verified.ok) {
        setState({ kind: 'idle' });
        return showToast({ message: t('storage.device.failed') });
      }
      // Try right away; iOS refuses once the tap's activation expired (`not_allowed`) → a "send" button shows.
      await handleResult(made.value, await saver.save({ blob: made.value.blob, fileName: made.value.fileName, mimeType: made.value.mimeType, title: t('storage.device.button') }));
    },
    [backup, saver, handleResult, showToast],
  );

  /** The one tap: uses the remembered choice, or asks once (encrypt? password? remember?). */
  const start = useCallback(async () => {
    if (!backup) return;
    const status = await backup.local.status();
    if (status.fileEncrypted === false) return run(null);
    if (status.fileEncrypted === true) {
      const pw = await storedPassword((k) => meta.get(k));
      if (pw) return run(pw);
    }
    setState({ kind: 'setup' });
  }, [backup, meta, run]);

  const submitSetup = useCallback(
    async (choice: SetupChoice) => {
      if (!backup) return;
      await backup.local.setFileEncrypted(choice.encrypt);
      await meta.set(FILE_PASSWORD_KEY, choice.encrypt && choice.remember ? choice.password : null).catch(() => undefined);
      await run(choice.encrypt ? choice.password : null);
    },
    [backup, meta, run],
  );

  const confirm = useCallback(
    async (landed: boolean) => {
      if (state.kind !== 'confirm') return;
      if (shouldRecordSave('downloaded', landed)) return record(state.file, 'downloaded');
      setState({ kind: 'ready', file: state.file });
    },
    [state, record],
  );

  return {
    state,
    available: backup !== undefined,
    start,
    send,
    confirm,
    submitSetup,
    openSetup: () => setState({ kind: 'setup' }),
    cancelSetup: () => setState({ kind: 'idle' }),
  };
}
