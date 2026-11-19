import { useCallback, useEffect, useId, useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { hasFreshBackup, STORAGE_CATEGORIES, storagePressure, type PhotoArchiveEntry } from '@/domain/backup';
import { FILE_PASSWORD_KEY } from '@/data/backupMeta';
import { t, type TKey } from '@/i18n';
import type { DeviceStorageReport } from '@/services/storage';
import { Badge, Button, PageHeader, TextField } from '@/ui';
import { formatBytes } from '@/ui/format';
import { DeviceBackupFlow } from './DeviceBackupFlow';
import { PhotoArchiveSheet } from './PhotoArchiveSheet';
import styles from './Storage.module.css';

type Persist = 'unknown' | 'on' | 'off' | 'unsupported';

function canPersist(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'persist' in navigator.storage;
}

/** الإعدادات ← التخزين: usage/quota with a breakdown, persistent storage, and safe ways to free space. */
export function StorageScreen() {
  const services = useServices();
  const { backup } = services;
  const showToast = useUiStore((s) => s.showToast);
  const [report, setReport] = useState<DeviceStorageReport | null>(null);
  const [registry, setRegistry] = useState<PhotoArchiveEntry[]>([]);
  const [version, setVersion] = useState(0);
  const [persist, setPersist] = useState<Persist>('unknown');
  const [busy, setBusy] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const status = useLive(async () => (backup ? backup.meta.get() : null), [backup, version]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    void backup?.storage.report().then((r) => live && setReport(r));
    void backup?.archive.registry().then((r) => live && setRegistry(r));
    void services.storage.isPersisted().then((p) => live && setPersist(p ? 'on' : canPersist() ? 'off' : 'unsupported'));
    return () => {
      live = false;
    };
  }, [backup, services.storage, version]);

  const back = { to: '/more/settings', label: t('screens.settings.title') };
  if (!backup) return <PageHeader title={t('storage.screen.title')} back={back} />;

  const fresh = hasFreshBackup(status?.lastLocalAt ?? null, new Date());
  const estimate = report?.estimate ?? null;
  const pressure = estimate ? storagePressure(estimate.quotaBytes, estimate.usageBytes) : 'ok';
  const ratio = estimate && estimate.quotaBytes > 0 ? Math.min(1, estimate.usageBytes / estimate.quotaBytes) : 0;

  const requestPersist = async () => {
    // Called straight from the tap: browsers only grant persistence on a user gesture.
    const r = await services.storage.requestPersistence();
    setPersist(r === 'granted' ? 'on' : r === 'unsupported' ? 'unsupported' : 'off');
    showToast({ message: r === 'granted' ? t('storage.screen.persistGranted') : r === 'unsupported' ? t('storage.screen.persistUnsupported') : t('storage.screen.persistDenied'), duration: 5000 });
  };

  const shrink = async () => {
    if (!report || !fresh) return;
    const n = report.oversized.ids.length;
    if (!window.confirm(t('storage.screen.shrinkConfirm', { n }))) return;
    const r = await backup.storage.shrink(report.oversized.ids, (done, total) => setBusy(t('storage.screen.shrinking', { done, total })));
    setBusy(null);
    showToast({ message: t('storage.screen.shrunk', { n: r.shrunk, size: formatBytes(r.savedBytes) }) });
    refresh();
  };

  const deleteUnused = async () => {
    if (!report || !fresh) return;
    if (!window.confirm(t('storage.screen.unusedConfirm', { n: report.unused.ids.length }))) return;
    const r = await backup.storage.deleteUnused(report.unused.ids);
    showToast({ message: t('storage.screen.unusedDone', { n: r.deleted, size: formatBytes(r.bytes) }) });
    refresh();
  };

  return (
    <>
      <PageHeader title={t('storage.screen.title')} back={back} subtitle={t('storage.screen.lead')} />

      <section className={styles.card} aria-labelledby="usage-title">
        <h2 id="usage-title" className={styles.cardTitle}>
          {t('storage.screen.usageTitle')}
        </h2>
        {estimate ? (
          <>
            <p className={styles.strong}>{t('storage.screen.usage', { used: formatBytes(estimate.usageBytes), quota: formatBytes(estimate.quotaBytes) })}</p>
            <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
              <div className={styles.barFill} style={{ inlineSize: `${Math.max(2, ratio * 100)}%` }} />
            </div>
          </>
        ) : (
          <p className={styles.body}>{report ? t('storage.screen.usageUnknown') : '…'}</p>
        )}
        {report && (
          <ul className={styles.rows}>
            <li className={styles.row}>
              <span>{t('storage.screen.photos')}</span>
              <span>{formatBytes(report.imageBytes)}</span>
            </li>
            {report.otherBytes !== null && (
              <li className={styles.row}>
                <span>{t('storage.screen.data')}</span>
                <span>{formatBytes(report.otherBytes)}</span>
              </li>
            )}
            {STORAGE_CATEGORIES.filter((c) => report.byCategory[c].count > 0).map((c) => (
              <li key={c} className={styles.row}>
                <span className={styles.meta}>{t(`storage.screen.categories.${c}` as TKey)}</span>
                <span className={styles.meta}>{t('storage.screen.count', { n: report.byCategory[c].count, size: formatBytes(report.byCategory[c].bytes) })}</span>
              </li>
            ))}
          </ul>
        )}
        {report?.clientsThatFit != null && <p className={styles.body}>{t('storage.screen.clientsFit', { n: report.clientsThatFit })}</p>}
        {pressure !== 'ok' && <p className={styles.warnBox}>{t(pressure === 'critical' ? 'storage.screen.pressureCritical' : 'storage.screen.pressureHigh')}</p>}
        <details className={styles.details}>
          <summary>{t('storage.screen.quotaWhyTitle')}</summary>
          <p className={styles.body}>{t('storage.screen.quotaWhy')}</p>
        </details>
      </section>

      <section className={styles.card} aria-labelledby="persist-title">
        <div className={styles.cardHead}>
          <h2 id="persist-title" className={styles.cardTitle}>
            {t('storage.screen.persistTitle')}
          </h2>
          <Badge tone={persist === 'on' ? 'ok' : 'neutral'}>{persist === 'on' ? t('settings.backup.cloudOn') : t('settings.backup.cloudOff')}</Badge>
        </div>
        <p className={styles.body}>
          {persist === 'on' ? t('storage.screen.persistOn') : persist === 'unsupported' ? t('storage.screen.persistUnsupported') : t('storage.screen.persistOff')}
        </p>
        {persist === 'off' && (
          <Button icon="lock" block variant="secondary" onClick={() => void requestPersist()}>
            {t('storage.screen.persistButton')}
          </Button>
        )}
      </section>

      <section className={styles.card} aria-labelledby="save-title">
        <h2 id="save-title" className={styles.cardTitle}>
          {t('storage.screen.saveTitle')}
        </h2>
        {!fresh && (
          <>
            <p className={styles.warnBox}>{t('storage.screen.needBackup')}</p>
            <DeviceBackupFlow onSaved={refresh} />
          </>
        )}
        {busy && (
          <p className={styles.strong} aria-live="polite">
            {busy}
          </p>
        )}
        {report && (
          <>
            <p className={styles.strong}>{t('storage.screen.shrinkTitle')}</p>
            <p className={styles.body}>
              {report.oversized.ids.length === 0
                ? t('storage.screen.shrinkNone')
                : t('storage.screen.shrinkBody', { n: report.oversized.ids.length, size: formatBytes(report.oversized.bytes) })}
            </p>
            {report.oversized.ids.length > 0 && (
              <Button icon="image" block variant="secondary" disabled={!fresh || busy !== null} onClick={() => void shrink()}>
                {t('storage.screen.shrinkButton', { n: report.oversized.ids.length })}
              </Button>
            )}
            <p className={styles.strong}>{t('storage.screen.unusedTitle')}</p>
            <p className={styles.body}>
              {report.unused.ids.length === 0
                ? t('storage.screen.unusedNone')
                : t('storage.screen.unusedBody', { n: report.unused.ids.length, size: formatBytes(report.unused.bytes) })}
            </p>
            {report.unused.ids.length > 0 && (
              <Button block variant="secondary" icon="trash" disabled={!fresh || busy !== null} onClick={() => void deleteUnused()}>
                {t('storage.screen.unusedButton', { n: report.unused.ids.length })}
              </Button>
            )}
          </>
        )}
        <p className={styles.strong}>{t('storage.archive.title')}</p>
        <p className={styles.body}>{t('storage.archive.body')}</p>
        <Button block variant="secondary" icon="image" disabled={!fresh} onClick={() => setArchiveOpen(true)}>
          {t('storage.archive.title')}
        </Button>
      </section>

      <ArchivesCard registry={registry} onRestored={refresh} />

      {archiveOpen && (
        <PhotoArchiveSheet
          onClose={() => setArchiveOpen(false)}
          onDone={() => {
            setArchiveOpen(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

/** Archive files the app knows about, and restoring photos from one (adds photos back; deletes nothing). */
function ArchivesCard({ registry, onRestored }: { registry: PhotoArchiveEntry[]; onRestored: () => void }) {
  const { backup, meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void meta.get(FILE_PASSWORD_KEY).then((v) => typeof v === 'string' && setPassword((cur) => cur || v));
  }, [meta]);
  if (!backup) return null;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setNeedsPassword((await backup.local.detectFile(f)) === 'encrypted');
  };

  const restore = async () => {
    if (!file) return;
    setWorking(true);
    const r = await backup.archive.restore(file, { password: needsPassword ? password : null });
    setWorking(false);
    if (!r.ok) {
      const key = `settings.backup.importErrors.${r.error}` as TKey;
      return setError(t(key) === key ? t('settings.backup.importErrors.generic') : t(key));
    }
    showToast({
      message: r.value.skipped > 0 ? t('storage.archive.restoredSkipped', { n: r.value.restored, skipped: r.value.skipped }) : t('storage.archive.restored', { n: r.value.restored }),
      duration: 5000,
    });
    setFile(null);
    onRestored();
  };

  return (
    <section className={styles.card} aria-labelledby="archives-title">
      <h2 id="archives-title" className={styles.cardTitle}>
        {t('storage.archive.listTitle')}
      </h2>
      {registry.length > 0 && (
        <ul className={styles.rows}>
          {registry.map((e) => (
            <li key={e.id} className={styles.meta}>
              {e.imageIds.length === 0 ? t('storage.archive.listRestored', { file: e.fileName }) : t('storage.archive.listItem', { file: e.fileName, n: e.imageIds.length })}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.strong}>{t('storage.archive.restoreTitle')}</p>
      <p className={styles.body}>{t('storage.archive.restoreHint')}</p>
      <label className={styles.fileButton} htmlFor={fileId}>
        {file ? file.name : t('storage.archive.pick')}
        <input id={fileId} type="file" className={styles.fileInput} onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {needsPassword && (
        <TextField label={t('storage.archive.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} ltr />
      )}
      <Button icon="undo" block disabled={!file || working || (needsPassword && !password)} onClick={() => void restore()}>
        {working ? t('storage.archive.restoring') : t('storage.archive.restore')}
      </Button>
      {error && (
        <p className={styles.warn} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
