import { useNavigate } from 'react-router-dom';
import { t } from '@/i18n';
import { ListSection, SectionLink } from '@/ui';
import { OutboxList } from './OutboxList';
import { useOutbox } from './useOutbox';

/** Home: the first few messages of the day, one tap each. Hidden when there is nothing to send. */
export function OutboxCard() {
  const outbox = useOutbox();
  const navigate = useNavigate();
  if (!outbox || outbox.items.length === 0) return null;
  return (
    <ListSection icon="send"
      title={t('outbox.title')}
      count={outbox.items.length}
      action={outbox.items.length > 3 ? <SectionLink onClick={() => navigate('/more/outbox')}>{t('outbox.openAll')}</SectionLink> : undefined}
    >
      <OutboxList items={outbox.items} clients={outbox.clients} onChange={outbox.refresh} limit={3} />
    </ListSection>
  );
}
