import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/app/uiStore';
import { t, type TKey } from '@/i18n';
import { Icon, Sheet, type IconName } from '@/ui';
import styles from './QuickAddSheet.module.css';

interface Choice {
  label: TKey;
  hint: TKey;
  icon: IconName;
  run: (go: (path: string) => void, openAddClient: () => void) => void;
}

const CHOICES: readonly Choice[] = [
  { label: 'quickAdd.client', hint: 'quickAdd.clientHint', icon: 'users', run: (_go, openAddClient) => openAddClient() },
  { label: 'quickAdd.session', hint: 'quickAdd.sessionHint', icon: 'calendarPlus', run: (go) => go('/schedule') },
  { label: 'quickAdd.program', hint: 'quickAdd.programHint', icon: 'dumbbell', run: (go) => go('/more/programs') },
];

/** Opened by the center "+" of the tab bar: client, session or program in one tap. */
export function QuickAddSheet() {
  const open = useUiStore((s) => s.quickAddOpen);
  const close = useUiStore((s) => s.closeQuickAdd);
  const openAddClient = useUiStore((s) => s.openAddClient);
  const navigate = useNavigate();
  const go = (path: string) => {
    close();
    navigate(path);
  };
  return (
    <Sheet open={open} onClose={close} title={t('quickAdd.title')} cancelLabel={t('common.cancel')}>
      <ul className={styles.list}>
        {CHOICES.map((c) => (
          <li key={c.label}>
            <button type="button" className={styles.choice} onClick={() => c.run(go, openAddClient)}>
              <span className={styles.icon}>
                <Icon name={c.icon} />
              </span>
              <span className={styles.text}>
                <span className={styles.label}>{t(c.label)}</span>
                <span className={styles.hint}>{t(c.hint)}</span>
              </span>
              <Icon name="chevronForward" className={styles.chevron} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
