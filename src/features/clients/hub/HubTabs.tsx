import { useEffect, useRef } from 'react';
import { t } from '@/i18n';
import { cx } from '@/ui';
import { HUB_TABS, type HubTab } from './tabs';
import styles from './Hub.module.css';

/** Sticky, horizontally scrollable tab strip (one-handed: big targets, the selected tab scrolled into view). */
export function HubTabs({ value, onChange }: { value: HubTab; onChange: (tab: HubTab) => void }) {
  const selected = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selected.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  return (
    <div className={styles.tabs} role="tablist" aria-label={t('hub.tabs.label')}>
      {HUB_TABS.map((tab) => (
        <button
          key={tab}
          ref={tab === value ? selected : undefined}
          type="button"
          role="tab"
          id={`hub-tab-${tab}`}
          aria-selected={tab === value}
          aria-controls="hub-panel"
          className={cx(styles.tab, tab === value && styles.tabOn)}
          onClick={() => onChange(tab)}
        >
          {t(`hub.tabs.${tab}`)}
        </button>
      ))}
    </div>
  );
}
