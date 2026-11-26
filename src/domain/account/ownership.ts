/**
 * Whose data is on this phone. The app's data is local; an account only marks who it belongs to. A different
 * account signing in must never see, back up or upload the previous account's clients.
 * - 'claim': mark the data as this account's (first account here, or nothing worth protecting).
 * - 'ok': it is already this account's.
 * - 'other_account': the phone holds another account's data; the trainer must sign out or erase it first.
 */
export type Ownership = 'claim' | 'ok' | 'other_account';

export function dataOwnership(input: { owner: string | null; accountId: string; hasData: boolean }): Ownership {
  if (input.owner === input.accountId) return 'ok';
  if (input.owner === null || !input.hasData) return 'claim';
  return 'other_account';
}
