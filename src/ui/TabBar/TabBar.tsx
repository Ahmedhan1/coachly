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

export interface TabBarProps {
  /** Four tabs: two on each side of the center add button (docs/DESIGN.md §5). */
  items: readonly TabItem[];
  label: string;
  center: { label: string; onClick: () => void };
}

function Tab({ item }: { item: TabItem }) {
  return (
    <li className={styles.item}>
      <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(styles.link, isActive && styles.active)}>
        <Icon name={item.icon} />
        <span className={styles.label}>{item.label}</span>
      </NavLink>
    </li>
  );
}

export function TabBar({ items, label, center }: TabBarProps) {
  const half = Math.ceil(items.length / 2);
  return (
    <nav className={styles.bar} aria-label={label}>
      <ul className={styles.list}>
        {items.slice(0, half).map((item) => (
          <Tab key={item.to} item={item} />
        ))}
        <li className={styles.item}>
          <button type="button" className={styles.add} aria-label={center.label} title={center.label} onClick={center.onClick}>
            <Icon name="plus" />
          </button>
        </li>
        {items.slice(half).map((item) => (
          <Tab key={item.to} item={item} />
        ))}
      </ul>
    </nav>
  );
}
