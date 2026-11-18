import { NavLink, useLocation } from 'react-router-dom';
import { t } from '@/i18n';
import { cx } from '@/ui';
import styles from './ClientNav.module.css';

const TABS = [
  { path: 'nutrition', key: 'calculator' },
  { path: 'meals', key: 'meals' },
  { path: 'supplements', key: 'supplements' },
  { path: 'progress', key: 'progress' },
] as const;

/** Switches between a client's nutrition screens (inverted selected segment, as in the client screen). */
export function ClientNav({ clientId }: { clientId: string }) {
  const { state, pathname } = useLocation();
  // The diet planner (/diet) belongs to the meals tab.
  const onDiet = pathname.endsWith('/diet');
  return (
    <nav className={styles.nav} aria-label={t('nutrition.clientNav.label')}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={`/clients/${clientId}/${tab.path}`}
          replace
          state={state}
          end={tab.path !== 'progress'}
          className={({ isActive }) => cx(styles.link, (isActive || (onDiet && tab.path === 'meals')) && styles.active)}
          aria-current={onDiet && tab.path === 'meals' ? 'page' : undefined}
        >
          {t(`nutrition.clientNav.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}
