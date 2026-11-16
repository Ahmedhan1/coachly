import { useState } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { subscriptionAttention, toIsoDate, type Client } from '@/domain/models';
import { t } from '@/i18n';
import { Avatar, Badge, Button, EmptyState, IconButton, ListRow, ListSection, PageHeader, SearchField, SwipeRow } from '@/ui';
import { attentionLabel, attentionTone } from './attention';
import { useDeleteClient } from './useDeleteClient';
import styles from './Clients.module.css';

export function ClientsListScreen() {
  const repos = useRepos();
  const openAddClient = useUiStore((s) => s.openAddClient);
  const deleteClient = useDeleteClient();
  const [query, setQuery] = useState('');
  const all = useLive(() => repos.clients.list(), [repos]);
  const results = useLive(() => repos.clients.search(query), [repos, query]);
  const [today] = useState(() => toIsoDate(new Date()));

  return (
    <>
      <PageHeader
        title={t('clients.title')}
        subtitle={all ? t('clients.count', { n: all.length }) : undefined}
        actions={<IconButton icon="plus" tone="brand" label={t('clients.add')} onClick={openAddClient} />}
      />
      <div className={styles.body}>
        {all && all.length > 0 && (
          <SearchField
            value={query}
            onChange={setQuery}
            label={t('common.search')}
            placeholder={t('clients.searchPlaceholder')}
            clearLabel={t('common.clearSearch')}
          />
        )}
        {all?.length === 0 && (
          <EmptyState
            icon="users"
            title={t('clients.emptyTitle')}
            body={t('clients.emptyBody')}
            action={
              <Button icon="plus" onClick={openAddClient}>
                {t('clients.add')}
              </Button>
            }
          />
        )}
        {all && all.length > 0 && results?.length === 0 && (
          <EmptyState icon="search" title={t('clients.noResultsTitle')} body={t('clients.noResultsBody')} />
        )}
        {results && results.length > 0 && (
          <ListSection>
            {results.map((client) => (
              <SwipeRow
                key={client.id}
                onDelete={() => void deleteClient(client)}
                deleteLabel={t('clients.deleteAction')}
                deleteAccessibleLabel={t('clients.deleteNamed', { name: client.name })}
              >
                <ClientRow client={client} today={today} />
              </SwipeRow>
            ))}
          </ListSection>
        )}
      </div>
    </>
  );
}

function ClientRow({ client, today }: { client: Client; today: string }) {
  const attention = subscriptionAttention(client, today);
  // When a badge is shown it already carries the urgent fact; keep the subtitle short so nothing truncates.
  const subtitle = attention
    ? t(`goals.${client.goal}`)
    : [
        t(`goals.${client.goal}`),
        client.package ? t('clients.remaining', { n: client.remainingSessions }) : t('clients.noPackage'),
      ].join(' · ');
  return (
    <ListRow
      to={`/clients/${client.id}`}
      leading={<Avatar name={client.name} />}
      title={client.name}
      subtitle={subtitle}
      trailing={attention ? <Badge tone={attentionTone(attention)}>{attentionLabel(attention)}</Badge> : undefined}
    />
  );
}
