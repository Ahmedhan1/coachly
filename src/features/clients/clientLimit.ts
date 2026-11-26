import type { AppServices } from '@/app/services';
import { clientLimitReached } from '@/domain/account';

/** The plan's client limit when this trainer is at it (no new client allowed), otherwise null. Works offline. */
export async function reachedClientLimit(services: Pick<AppServices, 'auth' | 'data'>): Promise<number | null> {
  // Test harnesses and guest mode may have no account service: no plan means no limit.
  const state = await services.auth?.getState().catch(() => null);
  if (state?.status !== 'signedIn') return null;
  const { maxClients } = state.account.plan;
  if (maxClients === null) return null;
  const count = (await services.data.repos.clients.list()).length;
  return clientLimitReached(state.account.plan, count) ? maxClients : null;
}
