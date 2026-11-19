import { useEffect, useId, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { ARCHIVE_MONTH_CHOICES, DEFAULT_ARCHIVE_MONTHS, shouldRecordSave, type SaveOutcome } from '@/domain/backup';
import { FILE_PASSWORD_KEY } from '@/data/backupMeta';
import { t, type TKey } from '@/i18n';
import {
  BrowserDeviceFileSaver,
  type ArchivePlan,
  type BackupProgress,
  type DeviceFileSaver,
  type PhotoArchiveFile,
  type VerifiedPhotoArchive,
} from '@/services/backup';
import { Button, SegmentedControl, Sheet, TextField } from '@/ui';
import { formatBytes } from '@/ui/format';
import styles from './Storage.module.css';

type Step =
  | { kind: 'choose' }
  | { kind: 'working'; label: string }
  | { kind: 'save'; made: PhotoArchiveFile; saved: boolean }
  | { kind: 'verified'; made: PhotoArchiveFile; verified: VerifiedPhotoArchive };

function archiveError(code: string): string {
  const key = `storage.archive.errors.${code}` as TKey;
  const text = t(key);
  return text === key ? t('storage.archive.errors.generic') : text;
}

function monthLabel(n: number): string {
  return n === 12 ? t('storage.archive.year') : t('storage.archive.months', { n });
}

/**
 * «أرشفة الصور القديمة» wizard: choose age → confirm → make file → save outside the app → pick the saved file
 * back and verify → only then swap originals for placeholders (confirmed again).
 */
export function PhotoArchiveSheet({ onClose, onDone, saver: saverProp }: { onClose: () => void; onDone: () => void; saver?: DeviceFileSaver }) {
  const { backup, meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const saver = useMemo(() => saverProp ?? new BrowserDeviceFileSaver(), [saverProp]);
  const fileId = useId();
  const [months, setMonths] = useState(DEFAULT_ARCHIVE_MONTHS);
  const [plan, setPlan] = useState<ArchivePlan | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void backup?.archive.plan(months).then((p) => live && setPlan(p));
    void meta.get(FILE_PASSWORD_KEY).then((v) => live && typeof v === 'string' && setPassword((cur) => cur || v));
    return () => {
      live = false;
    };
  }, [backup, meta, months]);

  if (!backup) return null;
  const pw = password.length > 0 ? password : null;
  const progress = (p: BackupProgress) =>
    setStep({ kind: 'working', label: t('storage.archive.making', { percent: p.total ? Math.round((p.done / p.total) * 100) : 0 }) });

  const make = async () => {
    if (!plan || plan.ids.length === 0) return;
    if (!window.confirm(t('storage.archive.confirm', { n: plan.ids.length }))) return;
    setError(null);
    const made = await backup.archive.createFile(plan.ids, pw, { onProgress: progress });
    if (!made.ok) {
      setStep({ kind: 'choose' });
      return setError(made.error === 'weak_password' ? t('settings.backup.passwordWeak') : archiveError('generic'));
    }
    setStep({ kind: 'save', made: made.value, saved: false });
  };

  const save = async (made: PhotoArchiveFile) => {
    const r = await saver.save({ blob: made.file.blob, fileName: made.file.fileName, mimeType: made.file.mimeType, title: t('storage.archive.title') });
    const outcome: SaveOutcome = r.outcome;
    // A download cannot prove anything; the pick-back step below is the real check either way.
    setStep({ kind: 'save', made, saved: shouldRecordSave(outcome, null) || outcome === 'downloaded' });
  };

  const verify = async (made: PhotoArchiveFile, picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    setStep({ kind: 'working', label: t('storage.archive.verifying') });
    const r = await backup.archive.verifySavedFile(picked, made.file.encrypted ? pw : null, made);
    if (!r.ok) {
      setStep({ kind: 'save', made, saved: true });
      return setError(archiveError(r.error));
    }
    setStep({ kind: 'verified', made, verified: r.value });
  };

  const commit = async (made: PhotoArchiveFile, verified: VerifiedPhotoArchive) => {
    if (!window.confirm(t('storage.archive.commitConfirm', { file: made.file.fileName }))) return;
    const r = await backup.archive.commit(verified, (done, total) => setStep({ kind: 'working', label: t('storage.archive.committing', { done, total }) }));
    if (!r.ok) {
      setStep({ kind: 'verified', made, verified });
      return setError(archiveError(r.error));
    }
    showToast({ message: t('storage.archive.done', { n: r.value.archived, size: formatBytes(r.value.freedBytes), file: made.file.fileName }), duration: 8000 });
    onDone();
  };

  return (
    <Sheet open onClose={onClose} title={t('storage.archive.title')} cancelLabel={t('common.close')}>
      <div className={styles.form}>
        {step.kind === 'choose' && (
          <>
            <p className={styles.body}>{t('storage.archive.body')}</p>
            <SegmentedControl
              label={t('storage.archive.olderThan')}
              options={ARCHIVE_MONTH_CHOICES.map((n) => ({ value: String(n), label: monthLabel(n) }))}
              value={String(months)}
              onChange={(v) => (setPlan(null), setMonths(Number(v)))}
            />
            <p className={styles.strong}>
              {plan === null ? '…' : plan.ids.length === 0 ? t('storage.archive.none') : t('storage.archive.found', { n: plan.ids.length, size: formatBytes(plan.bytes) })}
            </p>
            <TextField label={t('storage.archive.password')} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} ltr />
            <p className={styles.meta}>{t('storage.device.encryptHint')}</p>
            <Button block icon="file" disabled={!plan || plan.ids.length === 0} onClick={() => void make()}>
              {t('storage.archive.start', { n: plan?.ids.length ?? 0 })}
            </Button>
          </>
        )}
        {step.kind === 'working' && (
          <p className={styles.strong} aria-live="polite">
            {step.label}
          </p>
        )}
        {step.kind === 'save' && (
          <>
            <p className={styles.strong}>{t('storage.archive.stepSave')}</p>
            <p className={styles.body}>{t('storage.archive.stepSaveHint')}</p>
            <Button block icon="share" variant={step.saved ? 'secondary' : 'primary'} onClick={() => void save(step.made)}>
              {t('storage.device.sendToSelf')} · {formatBytes(step.made.file.blob.size)}
            </Button>
            <p className={styles.strong}>{t('storage.archive.stepPick')}</p>
            <p className={styles.body}>{t('storage.archive.stepPickHint')}</p>
            <label className={styles.fileButton} htmlFor={fileId}>
              {t('storage.archive.pick')}
              <input id={fileId} type="file" className={styles.fileInput} onChange={(e) => void verify(step.made, e.target.files?.[0])} />
            </label>
          </>
        )}
        {step.kind === 'verified' && (
          <>
            <p className={styles.strong}>{t('storage.archive.verified', { n: step.verified.originals.size })}</p>
            <p className={styles.strong}>{t('storage.archive.stepCommit')}</p>
            <Button icon="check" block variant="danger" onClick={() => void commit(step.made, step.verified)}>
              {t('storage.archive.commit', { size: formatBytes(step.made.file.manifest.files.reduce((s, f) => s + (f.path.startsWith('images/') ? f.bytes : 0), 0)) })}
            </Button>
          </>
        )}
        {error && (
          <p className={styles.warn} role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
