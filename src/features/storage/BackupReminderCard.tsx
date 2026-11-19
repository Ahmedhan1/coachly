import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CLOUD_PASSWORD_KEY, useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { backupCard, snoozeUntil } from '@/domain/backup';
import { toIsoDate } from '@/domain/models';
import { t } from '@/i18n';
import { Button, Icon, cx, TitleIcon } from '@/ui';
import { formatIsoDate, formatTime } from '@/ui/format';
import { DeviceBackupFlow } from './DeviceBackupFlow';
import styles from './Storage.module.css';

function when(ms: number): string {
  return `${formatIsoDate(toIsoDate(new Date(ms)))} ${formatTime(ms)}`;
}

/**
 * Home card: the REAL last device-file time (and the cloud copy when switched on), a weekly nudge and the
 * one-tap «نزّل نسخة على التليفون». Mount: `<BackupReminderCard />` (needs no props).
 */
export function BackupReminderCard({ now: nowProp }: { now?: Date }) {
  const { backup, meta } = useServices();
  const [tick, setTick] = useState(0);
  // Stamps `firstUseAt` once (a write, so not inside the live query below).
  useEffect(() => {
    void backup?.local.status();
  }, [backup]);
  const status = useLive(async () => (backup ? backup.meta.get() : null), [backup, tick]);
  const cloudEnabled = useLive(async () => typeof (await meta.get(CLOUD_PASSWORD_KEY)) === 'string', [meta, tick]);
  if (!backup || !status) return null;
  const now = nowProp ?? new Date();
  const card = backupCard({
    lastLocalAt: status.lastLocalAt,
    lastCloudAt: status.lastCloudAt,
    cloudEnabled: cloudEnabled === true,
    firstUseAt: status.firstUseAt,
    snoozedUntil: status.reminderSnoozedUntil,
    intervalDays: status.reminderDays,
    now,
  });
  const line =
    card.localAt === null
      ? t('storage.card.never')
      : card.localDaysSince === 0
        ? t('storage.card.today')
        : t('storage.card.daysAgo', { n: card.localDaysSince ?? 0 });

  return (
    <section className={cx(styles.card, card.due && styles.due)} aria-labelledby="backup-card-title">
      <div className={styles.cardHead}>
        <h2 id="backup-card-title" className={styles.cardTitle}><TitleIcon name="backup" />
          {t('storage.card.title')}
        </h2>
        <Icon name={card.due ? 'alert' : 'cloudOk'} />
      </div>
      <p className={styles.strong}>{line}</p>
      {card.localAt !== null && <p className={styles.meta}>{when(card.localAt)}</p>}
      {card.cloudAt !== null && <p className={styles.meta}>{t('storage.card.cloud', { date: when(card.cloudAt) })}</p>}
      <p className={card.due ? styles.warn : styles.body}>
        {card.due ? t('storage.card.due') : card.tone === 'never' ? t('storage.card.neverHint') : t('storage.card.ok')}
      </p>
      <DeviceBackupFlow onSaved={() => setTick((n) => n + 1)} />
      {card.due && (
        <Button icon="clock"
          block
          variant="plain"
          onClick={async () => {
            await backup.local.snooze(snoozeUntil(new Date()));
            setTick((n) => n + 1);
          }}
        >
          {t('storage.card.later')}
        </Button>
      )}
      <Link to="/more/settings/backup" className={styles.link}>
        {t('storage.card.open')}
      </Link>
    </section>
  );
}
