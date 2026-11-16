import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../cx';
import styles from './TabBar.module.css';

export interface TabItem {
  to: string;
  label: string;
  icon: IconName;
  /** Match only the exact path (for the home tab). */
  end?: boolean;
}

export function TabBar({ items, label }: { items: readonly TabItem[]; label: string }) {
  return (
    <nav className={styles.bar} aria-label={label}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.to} className={styles.item}>
            <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(styles.link, isActive && styles.active)}>
              <Icon name={item.icon} />
              <span className={styles.label}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
