import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { t } from '@/i18n';
import { Button, SegmentedControl, Select, Sheet } from '@/ui';
import { savePrefs, type SchedulePrefs } from './prefs';
import styles from './Schedule.module.css';

const DURATIONS = [30, 45, 60, 75, 90, 120];
const ALARMS = ['none', '10', '15', '30', '60', '120', '180'] as const;

function alarmLabel(v: (typeof ALARMS)[number]): string {
  if (v === 'none') return t('schedule.prefs.alarmNone');
  const n = Number(v);
  if (n === 60) return t('schedule.prefs.alarmHour');
  if (n > 60) return t('schedule.prefs.alarmHours', { n: n / 60 });
  return t('schedule.prefs.alarmMinutes', { n });
}

type Uses = 'uses' | 'free';
const usesOptions = () => [
  { value: 'uses' as const, label: t('schedule.prefs.usesSession') },
  { value: 'free' as const, label: t('schedule.prefs.freeSession') },
];

/** Default session length, the calendar alarm and the no-show / late-cancel package rules: trainer settings. */
export function PrefsSheet({ prefs, onClose }: { prefs: SchedulePrefs; onClose: () => void }) {
  const { meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const [duration, setDuration] = useState(String(prefs.defaultDurationMin));
  const [alarm, setAlarm] = useState<(typeof ALARMS)[number]>(
    prefs.alarmMinutesBefore === null ? 'none' : ((ALARMS.find((a) => a === String(prefs.alarmMinutesBefore)) ?? '60') as (typeof ALARMS)[number]),
  );
  const [noShow, setNoShow] = useState<Uses>(prefs.noShowUsesSession ? 'uses' : 'free');
  const [late, setLate] = useState<Uses>(prefs.lateCancelUsesSession ? 'uses' : 'free');
  const save = async () => {
    await savePrefs(meta, {
      defaultDurationMin: Number(duration),
      alarmMinutesBefore: alarm === 'none' ? null : Number(alarm),
      noShowUsesSession: noShow === 'uses',
      lateCancelUsesSession: late === 'uses',
    });
    showToast({ message: t('schedule.prefs.saved') });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('schedule.prefs.title')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <Button size="small" onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.form}>
        <Select
          label={t('schedule.prefs.defaultDuration')}
          options={DURATIONS.map((d) => ({ value: String(d), label: t('schedule.sheet.minutes', { n: d }) }))}
          value={duration}
          onChange={setDuration}
        />
        <Select label={t('schedule.prefs.alarm')} options={ALARMS.map((a) => ({ value: a, label: alarmLabel(a) }))} value={alarm} onChange={setAlarm} />
        <SegmentedControl label={t('schedule.prefs.noShowRule')} options={usesOptions()} value={noShow} onChange={setNoShow} />
        <SegmentedControl label={t('schedule.prefs.lateCancelRule')} options={usesOptions()} value={late} onChange={setLate} />
        <p className={styles.prefsHint}>{t('schedule.prefs.rulesHint')}</p>
      </div>
    </Sheet>
  );
}
