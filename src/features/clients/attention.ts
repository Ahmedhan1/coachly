import type { ClientAttention } from '@/domain/models';
import { t } from '@/i18n';

export function attentionLabel(a: ClientAttention): string {
  switch (a.kind) {
    case 'ending_soon':
      return a.daysLeft === 0 ? t('attention.endsToday') : t('attention.endsInDays', { n: a.daysLeft });
    case 'ended':
      return t('attention.ended', { n: a.daysAgo });
    case 'low_sessions':
      return t('attention.lowSessions', { n: a.remaining });
  }
}

export function attentionTone(a: ClientAttention): 'warning' | 'danger' {
  return a.kind === 'ended' ? 'danger' : 'warning';
}
