import type { AppServices } from '@/app/services';
import { readJoinFragment } from '@/domain/team';
import { TEAM_META_KEYS } from '@/services/team/teamService';
import type { MetaStore } from '@/services/meta/metaStore';
import { teamErrorText } from './teamErrors';

/** An invite link was opened (`#join=…`): keep it until the trainer is signed in. Returns true when found. */
export async function rememberInvite(meta: MetaStore, hash: string): Promise<boolean> {
  const invite = readJoinFragment(hash);
  if (invite === null) return false;
  await meta.set(TEAM_META_KEYS.pendingJoin, invite);
  return true;
}

export type JoinOutcome = { ok: true; gym: string } | { ok: false; message: string } | null;

/** Joins the remembered gym once signed in. Null when there is nothing to do. Never throws. */
export async function joinRememberedInvite(services: AppServices): Promise<JoinOutcome> {
  try {
    const pending = await services.meta.get(TEAM_META_KEYS.pendingJoin);
    const team = services.online?.team;
    if (team === undefined || typeof pending !== 'object' || pending === null) return null;
    const { code, key } = pending as { code?: unknown; key?: unknown };
    if (typeof code !== 'string' || typeof key !== 'string') return null;
    const state = await services.auth.getState();
    if (state.status !== 'signedIn') return null;
    const joined = await team.join({ code, key });
    if (!joined.ok) {
      // A refused invite will not work later either; a network problem is retried on the next start.
      if (!['offline', 'timeout', 'network', 'server'].includes(joined.error)) await services.meta.set(TEAM_META_KEYS.pendingJoin, null);
      return { ok: false, message: teamErrorText(joined.error) };
    }
    await services.auth.refresh();
    return { ok: true, gym: joined.value.name };
  } catch {
    return null;
  }
}

/**
 * The trainer pastes an invite link inside the installed app. Needed on iPhone: a link tapped in WhatsApp opens in
 * Safari, whose storage is separate from the home-screen app's, so the `#join=` there never reaches the app.
 */
export async function joinPastedInvite(services: AppServices, pasted: string): Promise<JoinOutcome | 'invalid'> {
  const hashAt = pasted.indexOf('#');
  const found = hashAt >= 0 && (await rememberInvite(services.meta, pasted.slice(hashAt).trim()));
  if (!found) return 'invalid';
  return joinRememberedInvite(services);
}
