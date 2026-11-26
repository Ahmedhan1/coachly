import { t, type TKey } from '@/i18n';

const KNOWN = ['trainer_limit', 'invalid_invite', 'in_other_gym', 'own_gym', 'is_gym', 'disabled'] as const;
const OFFLINE = new Set(['offline', 'timeout', 'network']);

/** Arabic message for a TeamService error (Worker code or CloudError). */
export function teamErrorText(code: string): string {
  if ((KNOWN as readonly string[]).includes(code)) return t(`team.errors.${code}` as TKey);
  if (OFFLINE.has(code)) return t('team.errors.offline');
  return t('team.errors.generic');
}
