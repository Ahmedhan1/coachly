import { useEffect, useId, useMemo, useState } from 'react';
import { CLOUD_PASSWORD_KEY, useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { t, type TKey } from '@/i18n';
import { MIN_BACKUP_PASSWORD_LENGTH, type BackupFile, type SchedulerState } from '@/services/backup';
import { BrowserShareService } from '@/services/share';
import { Badge, Button, PageHeader, Sheet, TextField } from '@/ui';
import { formatBytes, formatIsoDate, formatTime } from '@/ui/format';
import { toIsoDate } from '@/domain/models';
import styles from './Settings.module.css';

const IDLE: SchedulerState = { phase: 'stopped', dirty: false, lastSuccessAt: null, lastError: null, nextAttemptAt: null, attempt: 0 };

function when(ms: number): string {
  return `${formatIsoDate(toIsoDate(new Date(ms)))} ${formatTime(ms)}`;
}

const CLOUD_EXTRA: Record<string, TKey> = {
  storage_unavailable: 'nutrition.cloudExtra.storage_unavailable',
  too_large: 'nutrition.cloudExtra.too_large',
  timeout: 'nutrition.cloudExtra.timeout',
  rate_limited: 'nutrition.cloudExtra.rate_limited',
};

function errorText<K extends string>(group: 'importErrors' | 'cloudErrors', code: K): string {
  const extra = group === 'cloudErrors' ? CLOUD_EXTRA[code] : undefined;
  if (extra) return t(extra);
  const key = `settings.backup.${group}.${code}` as TKey;
  const text = t(key);
  return text === key ? t(`settings.backup.${group}.generic` as TKey) : text;
}

/** Live cloud scheduler state (the scheduler returns a fresh copy per call, so keep it in state). */
function useSchedulerState(): SchedulerState {
  const { backup } = useServices();
  const [state, setState] = useState<SchedulerState>(() => backup?.scheduler.getState() ?? IDLE);
  useEffect(() => backup?.scheduler.subscribe((next) => setState(next)), [backup]);
  return state;
}

/** الإعدادات ← النسخ الاحتياطي: local file (export / restore) and the automatic encrypted cloud copy. */
export function BackupScreen() {
  const services = useServices();
  const { backup, meta } = services;
  const showToast = useUiStore((s) => s.showToast);
  const [version, setVersion] = useState(0);
  const cloudState = useSchedulerState();
  const status = useLive(async () => (backup ? backup.local.status() : null), [backup, version, cloudState.lastSuccessAt]);
  const hasPassword = useLive(async () => typeof (await meta.get(CLOUD_PASSWORD_KEY)) === 'string', [meta, version]);
  const used = useLive(() => services.data.repos.images.totalBytes(), [services]);
  const share = useMemo(() => new BrowserShareService(), []);
  const [sheet, setSheet] = useState<null | 'export' | 'import' | 'cloud' | 'restoreCloud'>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState<BackupFile | null>(null);

  if (!backup) return <PageHeader title={t('settings.backup.title')} back={{ to: '/more/settings', label: t('screens.settings.title') }} />;

  const doExport = async (password: string | null) => {
    setSheet(null);
    setBusy(t('settings.backup.exporting'));
    const r = await backup.local.exportFile({ password });
    setBusy(null);
    if (!r.ok) return showToast({ message: t('settings.backup.exportFailed') });
    setReady(r.value);
  };

  const sendFile = async (file: BackupFile) => {
    const r = await share.shareFile({ data: file.blob, fileName: file.fileName, mimeType: file.mimeType }, { prefer: 'share' });
    if (r.outcome === 'shared' || r.outcome === 'downloaded') {
      await backup.local.recordSaved(Date.now());
      setReady(null);
      setVersion((v) => v + 1);
      // A download (Android, or no share sheet) lands in Downloads: tell the trainer to move it off the phone.
      showToast({ message: r.outcome === 'downloaded' ? t('nutrition.cloudExtra.savedToFiles') : t('settings.backup.saved'), duration: r.outcome === 'downloaded' ? 6000 : 2500 });
    }
  };

  const cloudOn = hasPassword === true;
  const cloudError = cloudState.lastError ?? (status?.lastCloudError as string | null | undefined) ?? null;

  return (
    <>
      <PageHeader title={t('settings.backup.title')} back={{ to: '/more/settings', label: t('screens.settings.title') }} subtitle={t('settings.backup.lead')} />

      <section className={styles.card} aria-labelledby="local-title">
        <h2 id="local-title" className={styles.cardTitle}>
          {t('settings.backup.localTitle')}
        </h2>
        <p className={styles.body}>{t('settings.backup.localBody')}</p>
        <p className={styles.meta}>{status?.lastLocalAt ? t('settings.backup.lastLocal', { date: when(status.lastLocalAt) }) : t('settings.backup.neverLocal')}</p>
        {used !== undefined && <p className={styles.meta}>{t('settings.backup.storageUsed', { size: formatBytes(used) })}</p>}
        {ready ? (
          <Button block icon="share" onClick={() => void sendFile(ready)}>
            {t('settings.backup.exported')} · {formatBytes(ready.blob.size)}
          </Button>
        ) : (
          <Button block icon="file" disabled={busy !== null} onClick={() => setSheet('export')}>
            {busy ?? t('settings.backup.export')}
          </Button>
        )}
        <Button block variant="secondary" icon="undo" disabled={busy !== null} onClick={() => setSheet('import')}>
          {t('settings.backup.import')}
        </Button>
        <p className={styles.meta}>{t('settings.backup.importHint')}</p>
      </section>

      <section className={styles.card} aria-labelledby="cloud-title">
        <div className={styles.cardHead}>
          <h2 id="cloud-title" className={styles.cardTitle}>
            {t('settings.backup.cloudTitle')}
          </h2>
          <Badge tone={cloudOn ? 'ok' : 'neutral'}>{cloudOn ? t('settings.backup.cloudOn') : t('settings.backup.cloudOff')}</Badge>
        </div>
        <p className={styles.body}>{t('settings.backup.cloudBody')}</p>
        {cloudOn && (
          <>
            <p className={styles.meta}>
              {status?.lastCloudAt ? t('settings.backup.lastCloud', { date: when(status.lastCloudAt) }) : t('settings.backup.neverCloud')}
              {' · '}
              {t(`settings.backup.cloudPhases.${cloudState.phase}`)}
            </p>
            {cloudError && <p className={styles.warn}>{errorText('cloudErrors', cloudError)}</p>}
            <Button
              block
              icon="cloudOk"
              disabled={cloudState.phase === 'running'}
              onClick={async () => {
                const r = await backup.scheduler.runNow();
                setVersion((v) => v + 1);
                showToast({ message: r.ok ? t('settings.backup.cloudDone') : errorText('cloudErrors', r.error) });
              }}
            >
              {cloudState.phase === 'running' ? t('settings.backup.cloudUploading') : t('settings.backup.cloudNow')}
            </Button>
          </>
        )}
        <Button block variant={cloudOn ? 'secondary' : 'primary'} onClick={() => setSheet('cloud')}>
          {cloudOn ? t('settings.backup.cloudChangePassword') : t('settings.backup.cloudEnable')}
        </Button>
        {cloudOn && (
          <Button
            block
            variant="plain"
            onClick={async () => {
              await meta.set(CLOUD_PASSWORD_KEY, null);
              setVersion((v) => v + 1);
              showToast({ message: t('settings.backup.cloudDisabled'), duration: 2500 });
            }}
          >
            {t('settings.backup.cloudDisable')}
          </Button>
        )}
        <Button block variant="plain" icon="undo" onClick={() => setSheet('restoreCloud')}>
          {t('settings.backup.restoreCloud')}
        </Button>
      </section>

      {sheet === 'export' && <ExportSheet onClose={() => setSheet(null)} onExport={(p) => void doExport(p)} />}
      {sheet === 'import' && <ImportSheet onClose={() => setSheet(null)} />}
      {sheet === 'cloud' && (
        <PasswordSheet
          title={t('settings.backup.cloudTitle')}
          confirm
          onClose={() => setSheet(null)}
          onSave={async (password) => {
            await meta.set(CLOUD_PASSWORD_KEY, password);
            setSheet(null);
            setVersion((v) => v + 1);
            backup.scheduler.notifyChange();
            showToast({ message: t('settings.backup.cloudPasswordSaved') });
          }}
        />
      )}
      {sheet === 'restoreCloud' && <RestoreCloudSheet onClose={() => setSheet(null)} />}
    </>
  );
}

function PasswordSheet({ title, confirm, onClose, onSave, note }: { title: string; confirm?: boolean; onClose: () => void; onSave: (p: string) => void | Promise<void>; note?: string }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (a.length < MIN_BACKUP_PASSWORD_LENGTH) return setError(t('settings.backup.passwordWeak'));
    if (confirm && a !== b) return setError(t('settings.backup.passwordMismatch'));
    void onSave(a);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="button" className={styles.sheetSave} onClick={submit}>
          {t('common.save')}
        </button>
      }
    >
      <div className={styles.form}>
        {note && <p className={styles.body}>{note}</p>}
        <TextField label={t('settings.backup.password')} type="password" autoComplete="new-password" value={a} error={error} onChange={(e) => (setA(e.target.value), setError(null))} ltr />
        {confirm && <TextField label={t('settings.backup.passwordConfirm')} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} ltr />}
      </div>
    </Sheet>
  );
}

function ExportSheet({ onClose, onExport }: { onClose: () => void; onExport: (password: string | null) => void }) {
  const [encrypt, setEncrypt] = useState(true);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!encrypt) return onExport(null);
    if (a.length < MIN_BACKUP_PASSWORD_LENGTH) return setError(t('settings.backup.passwordWeak'));
    if (a !== b) return setError(t('settings.backup.passwordMismatch'));
    onExport(a);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('settings.backup.export')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="button" className={styles.sheetSave} onClick={submit}>
          {t('settings.backup.export')}
        </button>
      }
    >
      <div className={styles.form}>
        <label className={styles.check}>
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          <span>
            {t('settings.backup.encrypt')}
            <small>{t('settings.backup.encryptHint')}</small>
          </span>
        </label>
        {encrypt && (
          <>
            <TextField label={t('settings.backup.password')} type="password" autoComplete="new-password" value={a} error={error} onChange={(e) => (setA(e.target.value), setError(null))} ltr />
            <TextField label={t('settings.backup.passwordConfirm')} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} ltr />
          </>
        )}
      </div>
    </Sheet>
  );
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const { backup } = useServices();
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  if (!backup) return null;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setError(null);
    const kind = await backup.local.detectFile(f);
    if (kind === 'unknown') setError(errorText('importErrors', 'not_a_backup'));
    setNeedsPassword(kind === 'encrypted');
  };

  const run = async () => {
    if (!file) return;
    if (!window.confirm(t('settings.backup.importConfirm'))) return;
    setWorking(true);
    const r = await backup.local.importFile(file, { password: needsPassword ? password : null });
    setWorking(false);
    if (!r.ok) return setError(errorText('importErrors', r.error));
    window.alert(t('settings.backup.imported'));
    window.location.replace('/');
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('settings.backup.import')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="button" className={styles.sheetSave} disabled={!file || working || (needsPassword && !password)} onClick={() => void run()}>
          {working ? t('settings.backup.importing') : t('settings.backup.importConfirmYes')}
        </button>
      }
    >
      <div className={styles.form}>
        <p className={styles.warnBox}>{t('settings.backup.importHint')}</p>
        <label className={styles.fileButton} htmlFor={fileId}>
          {file ? file.name : t('settings.backup.import')}
          <input id={fileId} type="file" className={styles.fileInput} onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {needsPassword && (
          <TextField label={t('settings.backup.importPassword')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} ltr />
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

function RestoreCloudSheet({ onClose }: { onClose: () => void }) {
  const { backup, meta } = useServices();
  const info = useLive(async () => (backup ? backup.cloud.info() : null), [backup]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  if (!backup) return null;
  const present = info?.ok && info.value !== null ? info.value : null;

  const run = async () => {
    if (!window.confirm(t('settings.backup.restoreCloudConfirm'))) return;
    setWorking(true);
    const r = await backup.cloud.restore(password);
    setWorking(false);
    if (!r.ok) return setError(errorText(r.error in IMPORT_ERRORS ? 'importErrors' : 'cloudErrors', r.error));
    await meta.set(CLOUD_PASSWORD_KEY, password);
    window.alert(t('settings.backup.imported'));
    window.location.replace('/');
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('settings.backup.restoreCloud')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="button" className={styles.sheetSave} disabled={!present || password.length < MIN_BACKUP_PASSWORD_LENGTH || working} onClick={() => void run()}>
          {working ? t('settings.backup.importing') : t('settings.backup.importConfirmYes')}
        </button>
      }
    >
      <div className={styles.form}>
        <p className={styles.body}>{t('settings.backup.restoreCloudHint')}</p>
        {info !== undefined &&
          (present ? (
            <p className={styles.meta}>
              {t('settings.backup.restoreCloudInfo', { size: formatBytes(present.bytes ?? 0), date: present.updatedAt ? when(present.updatedAt) : '—' })}
            </p>
          ) : (
            <p className={styles.warn}>{info?.ok === false ? errorText('cloudErrors', info.error) : t('settings.backup.restoreCloudNone')}</p>
          ))}
        <p className={styles.warnBox}>{t('settings.backup.restoreCloudConfirm')}</p>
        <TextField label={t('settings.backup.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => (setPassword(e.target.value), setError(null))} ltr />
        {error && (
          <p className={styles.warn} role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

const IMPORT_ERRORS: Record<string, true> = {
  not_a_backup: true,
  password_required: true,
  wrong_password: true,
  unsupported_format: true,
  malformed: true,
  checksum_mismatch: true,
  missing_file: true,
  unexpected_file: true,
  newer_schema: true,
  migration_failed: true,
  write_failed: true,
  cancelled: true,
};
