import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRepos, useServices } from '@/app/services';
import { useGo } from '@/app/shell/nav';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import type { Client, ClientId, Program } from '@/domain/models';
import { BUILTIN_TEMPLATES, duplicateProgram, instantiateTemplate, type BuiltinTemplate } from '@/domain/programs';
import { searchItems } from '@/data';
import { t } from '@/i18n';
import { Badge, Button, EmptyState, Icon, IconButton, ListRow, ListSection, PageHeader, SearchField, SwipeRow, Tx, TitleIcon } from '@/ui';
import { markActiveProgram } from '@/data/prefs/activePrograms';
import { newLocalId } from './ids';
import { templateDayName, templateName } from '@/i18n/programNames';
import styles from './Programs.module.css';

function daysLabel(n: number) {
  return n === 1 ? t('training.programs.oneDay') : t('training.programs.days', { n });
}

function exercisesIn(p: Pick<Program, 'days'>) {
  return p.days.reduce((n, d) => n + d.items.length, 0);
}

/** More → البرامج (or a client's programs with ?client=): built-in templates, own templates, client programs. */
export function ProgramsScreen() {
  const repos = useRepos();
  const { meta } = useServices();
  const navigate = useNavigate();
  const go = useGo();
  const showToast = useUiStore((s) => s.showToast);
  const [params] = useSearchParams();
  const clientFilter = params.get('client');
  const programs = useLive(() => repos.programs.list(), [repos]);
  const clients = useLive(() => repos.clients.list(), [repos]);
  const [query, setQuery] = useState('');

  const byClient = useMemo(() => new Map<string, Client>((clients ?? []).map((c) => [c.id, c])), [clients]);
  const forClient = clientFilter ? byClient.get(clientFilter) : undefined;

  const shown = useMemo(() => {
    const all = (programs ?? []).filter((p) => !clientFilter || p.clientId === clientFilter);
    return searchItems(all, query, (p) => [p.name, p.clientId ? (byClient.get(p.clientId)?.name ?? '') : '']);
  }, [programs, clientFilter, query, byClient]);

  const templates = shown.filter((p) => p.isTemplate);
  const assigned = shown.filter((p) => !p.isTemplate && p.clientId);
  const loose = shown.filter((p) => !p.isTemplate && !p.clientId);

  const open = (id: string) => go(`/programs/${id}${clientFilter ? '?from=client' : ''}`);

  const fromBuiltin = async (tpl: BuiltinTemplate) => {
    const name = forClient ? t('training.programs.forClient', { name: forClient.name }) : templateName(tpl.id);
    const body = instantiateTemplate(tpl, {
      name,
      dayName: templateDayName,
      newId: newLocalId,
      clientId: (clientFilter as ClientId | null) ?? null,
    });
    const created = await repos.programs.create(body);
    if (clientFilter) await markActiveProgram(meta, clientFilter, created.id);
    showToast({ message: t('training.programs.created'), duration: 2500 });
    open(created.id);
  };

  const blank = async () => {
    const created = await repos.programs.create({
      name: forClient ? t('training.programs.forClient', { name: forClient.name }) : t('training.programs.newProgramName'),
      clientId: (clientFilter as ClientId | null) ?? null,
      isTemplate: false,
      days: [],
      notes: '',
    });
    if (clientFilter) await markActiveProgram(meta, clientFilter, created.id);
    open(created.id);
  };

  const duplicate = async (p: Program) => {
    const copy = duplicateProgram(p, newLocalId, t('training.programs.copyName', { name: p.name }));
    await repos.programs.create(copy);
    showToast({ message: t('training.programs.duplicated'), duration: 2500 });
  };

  const remove = async (p: Program) => {
    await repos.programs.softDelete(p.id);
    showToast({ message: t('training.programs.deleted'), actionLabel: t('common.undo'), onAction: () => void repos.programs.restore(p.id) });
  };

  const back = forClient ? { to: `/clients/${forClient.id}`, label: forClient.name } : { to: '/more', label: t('training.programs.backToMore') };
  const title = forClient ? t('training.programs.forClientTitle', { name: forClient.name }) : t('training.programs.title');

  const row = (p: Program) => {
    const client = p.clientId ? byClient.get(p.clientId) : undefined;
    return (
      <SwipeRow key={p.id} onDelete={() => void remove(p)} deleteLabel={t('common.delete')} deleteAccessibleLabel={t('training.programs.deleteLabel', { name: p.name })}>
        <ListRow
          leading={<Icon name="list" />}
          title={p.name}
          subtitle={
            <>
              {client && !forClient ? `${client.name} · ` : ''}
              {daysLabel(p.days.length)} · <Tx k="training.programs.exercisesCount" params={{ n: exercisesIn(p) }} />
            </>
          }
          trailing={
            <span className={styles.trailing}>
              {p.isTemplate && <Badge>{t('training.programs.templateBadge')}</Badge>}
              <IconButton icon="copy" tone="muted" label={t('training.programs.duplicateLabel', { name: p.name })} onClick={() => void duplicate(p)} />
            </span>
          }
          onClick={() => open(p.id)}
        />
      </SwipeRow>
    );
  };

  return (
    <>
      <PageHeader
        title={title}
        back={back}
        actions={<IconButton icon="plus" label={t('training.programs.newProgram')} onClick={() => void blank()} />}
      />

      <section className={styles.builtins} aria-labelledby="builtin-title">
        <h2 id="builtin-title" className={styles.sectionTitle}><TitleIcon name="list" />
          {t('training.programs.builtin')}
        </h2>
        <p className={styles.hint}>{t('training.programs.builtinHint')}</p>
        <ul className={styles.tplRow}>
          {BUILTIN_TEMPLATES.map((tpl) => (
            <li key={tpl.id}>
              <button type="button" className={styles.tpl} onClick={() => void fromBuiltin(tpl)}>
                <span className={styles.tplName}>{templateName(tpl.id)}</span>
                <span className={styles.tplSub}>
                  {daysLabel(tpl.days.length)} · <Tx k="training.programs.exercisesCount" params={{ n: tpl.days.reduce((n, d) => n + d.items.length, 0) }} />
                </span>
                <span className={styles.tplDays}>{tpl.days.map((d) => templateDayName(d.key)).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {(programs?.length ?? 0) > 6 && (
        <div className={styles.search}>
          <SearchField
            value={query}
            onChange={setQuery}
            label={t('training.programs.searchLabel')}
            placeholder={t('training.programs.searchPlaceholder')}
            clearLabel={t('common.clearSearch')}
          />
        </div>
      )}

      {programs && shown.length === 0 && (
        query ? (
          <p className={styles.hint}>{t('training.programs.noResults')}</p>
        ) : (
          <EmptyState
            icon="list"
            title={forClient ? t('training.programs.emptyClientTitle') : t('training.programs.emptyTitle')}
            body={forClient ? t('training.programs.emptyClientBody') : t('training.programs.emptyBody')}
            action={
              <Button icon="plus" variant="secondary" onClick={() => void blank()}>
                {t('training.programs.newProgram')}
              </Button>
            }
          />
        )
      )}

      {assigned.length > 0 && (
        <ListSection icon="users" title={forClient ? undefined : t('training.programs.clients')} count={forClient ? undefined : assigned.length}>
          {assigned.map(row)}
        </ListSection>
      )}
      {templates.length > 0 && (
        <ListSection icon="star" title={t('training.programs.mine')} count={templates.length}>
          {templates.map(row)}
        </ListSection>
      )}
      {loose.length > 0 && (
        <ListSection icon="box" title={t('training.programs.unassigned')} count={loose.length}>
          {loose.map(row)}
        </ListSection>
      )}
      {forClient && (
        <div className={styles.showAll}>
          <Button icon="list" variant="plain" onClick={() => navigate('/more/programs')}>
            {t('training.programs.showAll')}
          </Button>
        </div>
      )}
    </>
  );
}
