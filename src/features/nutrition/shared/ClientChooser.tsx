import { useState } from 'react';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import { searchItems } from '@/data';
import { t } from '@/i18n';
import { Avatar, EmptyState, ListRow, ListSection, SearchField } from '@/ui';

/** A searchable client list whose rows open `/clients/:id/<path>`. */
export function ClientChooser({ path, title, emptyBody }: { path: string; title: string; emptyBody: string }) {
  const repos = useRepos();
  const clients = useLive(() => repos.clients.list(), [repos]);
  const [query, setQuery] = useState('');
  if (!clients) return null;
  if (clients.length === 0) return <EmptyState icon="users" title={title} body={emptyBody} />;
  const shown = searchItems(clients, query, (c) => [c.name, c.phone]);
  return (
    <>
      {clients.length > 6 && (
        <div style={{ paddingInline: 'var(--gutter)', marginBlockStart: 'var(--sp-4)' }}>
          <SearchField value={query} onChange={setQuery} label={t('common.search')} placeholder={t('common.search')} clearLabel={t('common.clearSearch')} />
        </div>
      )}
      <ListSection title={title} count={shown.length}>
        {shown.map((c) => (
          <ListRow key={c.id} leading={<Avatar name={c.name} />} title={c.name} to={`/clients/${c.id}/${path}`} />
        ))}
      </ListSection>
    </>
  );
}
