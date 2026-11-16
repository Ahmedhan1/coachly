import { t } from '@/i18n';
import { Button, Icon, Sheet } from '@/ui';
import { onRemindersPromptAccepted } from './reminders';
import styles from './Schedule.module.css';

/** One-time, gentle explanation after the first booking (see reminders.ts for the push hook). */
export function RemindersSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={t('schedule.reminders.title')} cancelLabel={t('common.close')}>
      <div className={styles.reminders}>
        <span className={styles.remindersIcon}>
          <Icon name="clock" />
        </span>
        <p>{t('schedule.reminders.body')}</p>
        <p className={styles.remindersHint}>{t('schedule.reminders.calendarHint')}</p>
        <Button
          block
          onClick={() => {
            void onRemindersPromptAccepted();
            onClose();
          }}
        >
          {t('schedule.reminders.ok')}
        </Button>
      </div>
    </Sheet>
  );
}
