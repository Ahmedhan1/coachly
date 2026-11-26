import type { AppServices } from '@/app/services';
import { effectiveStatus } from '@/domain/account';
import { toIsoDate } from '@/domain/models';
import { buildRoster } from '@/domain/team';
import { TEAM_META_KEYS } from '@/services/team/teamService';

/** Send the client summary to the gym at most this often (it is a few KB; the gym sees it within the hour). */
export const ROSTER_EVERY_MS = 30 * 60_000;

/**
 * For trainers in a gym (and the gym manager's own clients): seal the client summary with the team key and upload
 * it. Quiet: skips offline, without a gym or key, or when the last upload is recent. Returns true when uploaded.
 */
export async function syncRoster(services: AppServices, now: Date, force = false): Promise<boolean> {
  const team = services.online?.team;
  if (team === undefined) return false;
  const state = await services.auth.getState();
  if (state.status !== 'signedIn' || effectiveStatus(state.account, now) !== 'approved') return false;
  const gym = state.account.gym;
  if (gym === null || gym.membership === 'pending') return false;
  const last = await services.meta.get(TEAM_META_KEYS.rosterAt);
  if (!force && typeof last === 'number' && now.getTime() - last < ROSTER_EVERY_MS) return false;
  const { repos } = services.data;
  const [clients, sessions, settings] = await Promise.all([repos.clients.list(), repos.sessions.list(), repos.settings.get()]);
  const roster = buildRoster({
    trainerName: settings.name || state.account.name,
    clients,
    sessions,
    today: toIsoDate(now),
    now,
  });
  return (await team.uploadRoster(roster, now.getTime())).ok;
}
