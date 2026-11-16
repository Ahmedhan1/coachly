import { MARK_STATUSES, type MarkStatus } from '@/domain/attendance';
import { t } from '@/i18n';
import { Icon, cx } from '@/ui';
import styles from './Schedule.module.css';

export interface AttendanceToggleProps {
  name: string;
  value: MarkStatus | null;
  onChange: (mark: MarkStatus) => void;
}

/** حضر / غاب / اعتذر متأخر — one tap records, tapping the active one again clears it. */
export function AttendanceToggle({ name, value, onChange }: AttendanceToggleProps) {
  return (
    <div className={styles.attendance} role="group" aria-label={t('schedule.attendance.label', { name })}>
      {MARK_STATUSES.map((mark) => (
        <button
          key={mark}
          type="button"
          className={cx(styles.mark, styles[`mark_${mark}`], value === mark && styles.markOn)}
          aria-pressed={value === mark}
          onClick={() => onChange(mark)}
        >
          {value === mark && mark === 'attended' && <Icon name="check" />}
          {t(`schedule.attendance.${mark}`)}
        </button>
      ))}
    </div>
  );
}
