import { Link } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { parseSessionState } from '@/domain/programs';
import { t } from '@/i18n';
import { Icon } from '@/ui';
import { ACTIVE_SESSION_KEY } from './sessionKey';
import styles from './Session.module.css';

/**
 * "A session is still running" bar for Home: after the app was killed mid-session it reopens on Home, and
 * this one tap brings the trainer back to the exact set (the state is persisted after every change).
 * Renders nothing when no unsaved session exists.
 */
export function ActiveSessionBanner() {
  const { data, meta } = useServices();
  const active = useLive(async () => {
    const state = parseSessionState(await meta.get(ACTIVE_SESSION_KEY));
    if (!state) return null;
    const done = state.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    if (done === 0) return null;
    const client = await data.repos.clients.get(state.clientId);
    if (!client) return null;
    const href = `/session/${encodeURIComponent(state.key)}?client=${state.clientId}${state.programId ? `&program=${state.programId}` : ''}`;
    return { href, name: client.name, done };
  }, [data, meta]);
  if (!active) return null;
  return (
    <Link to={active.href} className={styles.banner}>
      <Icon name="timer" />
      <span className={styles.bannerText}>
        <strong>{t('training.session.bannerTitle', { name: active.name })}</strong>
        <span>{t('training.session.bannerBody', { n: active.done })}</span>
      </span>
      <Icon name="chevronForward" />
    </Link>
  );
}
