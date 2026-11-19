import { useDeferredValue, useState } from 'react';
import { useGo } from '@/app/shell/nav';
import { useUiStore } from '@/app/uiStore';
import { t } from '@/i18n';
import { Icon, ListRow, ListSection, SearchField, Sheet, type IconName } from '@/ui';
import { MIN_QUERY, useGlobalSearch, type SearchGroup } from './useGlobalSearch';
import styles from './GlobalSearch.module.css';

const GROUPS: ReadonlyArray<{ group: SearchGroup; icon: IconName }> = [
  { group: 'clients', icon: 'user' },
  { group: 'exercises', icon: 'dumbbell' },
  { group: 'programs', icon: 'list' },
  { group: 'recipes', icon: 'utensils' },
  { group: 'foods', icon: 'utensils' },
];

/** Top-bar search over clients, exercises, programs, recipes and foods; a result opens its screen. */
export function GlobalSearchSheet() {
  const open = useUiStore((s) => s.searchOpen);
  const close = useUiStore((s) => s.closeSearch);
  if (!open) return null;
  return <SearchBody onClose={close} />;
}

function SearchBody({ onClose }: { onClose: () => void }) {
  const go = useGo();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const results = useGlobalSearch(deferred, true);
  const total = results ? GROUPS.reduce((n, g) => n + results[g.group].length, 0) : 0;
  const typed = deferred.trim().length >= MIN_QUERY;
  return (
    <Sheet open onClose={onClose} title={t('hub.search.title')} cancelLabel={t('common.close')} initialFocusId="global-search-field">
      <SearchField id="global-search-field" value={query} onChange={setQuery} label={t('hub.search.label')} placeholder={t('hub.search.placeholder')} clearLabel={t('common.clearSearch')} />
      <div className={styles.results}>
        {!typed && <p className={styles.hint}>{t('hub.search.hint')}</p>}
        {typed && results && total === 0 && <p className={styles.hint}>{t('hub.search.none', { q: deferred.trim() })}</p>}
        {typed &&
          results &&
          GROUPS.filter((g) => results[g.group].length > 0).map(({ group, icon }) => (
            <ListSection key={group} title={t(`hub.search.${group}`)}>
              {results[group].map((hit) => (
                <ListRow
                  key={`${group}-${hit.id}`}
                  leading={<Icon name={icon} />}
                  title={hit.title}
                  subtitle={hit.subtitle || undefined}
                  onClick={() => {
                    onClose();
                    go(hit.to);
                  }}
                />
              ))}
            </ListSection>
          ))}
      </div>
    </Sheet>
  );
}
