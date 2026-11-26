import { useCallback, useEffect, useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { toIsoDate } from '@/domain/models';
import { teamTotals, type Roster } from '@/domain/team';
import { t } from '@/i18n';
import type { MemberRoster, TeamMember, TeamView } from '@/services/team/teamService';
import { Avatar, Badge, Button, EmptyState, Icon, ListRow, ListSection, Num, PageHeader } from '@/ui';
import { formatIsoDate } from '@/ui/format';
import { syncRoster } from './rosterSync';
import { teamErrorText } from './teamErrors';
import styles from './TeamScreen.module.css';

const dayOf = (unixSeconds: number) => formatIsoDate(toIsoDate(new Date(unixSeconds * 1000)));

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; team: TeamView; rosters: Map<string, MemberRoster> };

/** Gym manager's screen: the plan, the invite link, trainers to approve, and each trainer's client summary. */
export function TeamScreen() {
  const services = useServices();
  const team = services.online?.team;
  const showToast = useUiStore((s) => s.showToast);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setLoad(await loadTeam(services)), [services]);

  useEffect(() => {
    let cancelled = false;
    void loadTeam(services).then((next) => !cancelled && setLoad(next));
    return () => {
      cancelled = true;
    };
  }, [services]);

  const act = async (run: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const r = await run();
    setBusy(false);
    if (!r.ok) showToast({ message: teamErrorText(r.error ?? 'server') });
    await refresh();
  };

  const createInvite = async () => {
    if (!team) return;
    setBusy(true);
    const r = await team.createInvite();
    setBusy(false);
    if (!r.ok) return showToast({ message: teamErrorText(r.error) });
    setLink(r.value);
  };

  const header = <PageHeader title={t('team.title')} back={{ to: '/more', label: t('screens.more.title') }} />;
  if (load.status !== 'ready') {
    return (
      <>
        {header}
        {load.status === 'loading' ? (
          <p className={styles.muted}>{t('app.loading')}</p>
        ) : (
          <EmptyState icon="offline" title={t('team.title')} body={load.message} action={<Button onClick={() => void refresh()}>{t('auth.gate.check')}</Button>} />
        )}
      </>
    );
  }

  const { team: view, rosters } = load;
  const pending = view.members.filter((m) => m.status === 'pending');
  const active = view.members.filter((m) => m.status === 'active');
  const readable = [...rosters.values()].map((r) => r.roster).filter((r): r is Roster => r !== null);
  const totals = teamTotals(readable);
  const gymName = view.gym.name;
  const wa = link === null ? null : `https://wa.me/?text=${encodeURIComponent(t('team.invite.message', { gym: gymName, link }))}`;
  const { plan } = view;

  return (
    <>
      {header}
      <ListSection icon="flag" title={gymName || t('team.plan.title')}>
        <ListRow
          leading={<Icon name="users" />}
          title={plan.maxTrainers === null ? t('team.plan.trainersOpen', { n: active.length }) : t('team.plan.trainers', { n: active.length, max: plan.maxTrainers })}
          subtitle={plan.maxClients === null ? t('team.plan.clientsOpen') : t('team.plan.clientsPerTrainer', { n: plan.maxClients })}
        />
        <ListRow leading={<Icon name="calendar" />} title={plan.expiresAt === null ? t('team.plan.open') : t('team.plan.until', { date: dayOf(plan.expiresAt - 1) })} />
      </ListSection>

      <ListSection icon="chart" title={t('team.totals.title')}>
        <div className={styles.totals}>
          <Total value={totals.trainers} label={t('team.totals.trainers')} />
          <Total value={totals.clients} label={t('team.totals.clients')} />
          <Total value={totals.needAttention} label={t('team.totals.attention')} warn={totals.needAttention > 0} />
        </div>
      </ListSection>

      <ListSection icon="userAdd" title={t('team.invite.title')}>
        <div className={styles.invite}>
          <p className={styles.muted}>{t('team.invite.lead')}</p>
          {link !== null && (
            <>
              <code className={styles.link} dir="ltr" data-testid="team-invite-link">
                {link}
              </code>
              {wa !== null && (
                <a className={styles.wa} href={wa} target="_blank" rel="noreferrer">
                  <Icon name="send" />
                  {t('team.invite.share')}
                </a>
              )}
              <Button
                block
                variant="secondary"
                icon="copy"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    showToast({ message: t('team.invite.copied'), duration: 2000 });
                  } catch {
                    window.prompt(t('team.invite.copy'), link);
                  }
                }}
              >
                {t('team.invite.copy')}
              </Button>
            </>
          )}
          <Button block variant={link === null ? 'primary' : 'plain'} icon="link" disabled={busy} onClick={() => void createInvite()}>
            {link === null && !view.gym.inviteOpen ? t('team.invite.create') : t('team.invite.renew')}
          </Button>
          <p className={styles.note}>{t('team.invite.keyNote')}</p>
        </div>
      </ListSection>

      {pending.length > 0 && (
        <ListSection icon="clock" title={t('team.members.pending')}>
          {pending.map((m) => (
            <div key={m.id} className={styles.pending}>
              <ListRow leading={<Avatar name={m.name} />} title={m.name} subtitle={<span dir="ltr">{m.email}</span>} />
              <div className={styles.actions}>
                <Button size="small" icon="check" disabled={busy} onClick={() => void act(() => team!.memberAction(m.id, 'approve'))}>
                  {t('team.members.approve')}
                </Button>
                <Button size="small" variant="plain" disabled={busy} onClick={() => void act(() => team!.memberAction(m.id, 'remove'))}>
                  {t('team.members.remove')}
                </Button>
              </div>
            </div>
          ))}
        </ListSection>
      )}

      <ListSection icon="users" title={t('team.members.active')}>
        {active.length === 0 ? (
          <p className={styles.muted}>{t('team.members.none')}</p>
        ) : (
          active.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              roster={rosters.get(m.id) ?? null}
              busy={busy}
              onRemove={() => {
                if (window.confirm(t('team.members.removeConfirm', { name: m.name }))) void act(() => team!.memberAction(m.id, 'remove'));
              }}
            />
          ))
        )}
      </ListSection>
    </>
  );
}

async function loadTeam(services: ReturnType<typeof useServices>): Promise<Load> {
  const team = services.online?.team;
  if (!team) return { status: 'error', message: t('team.errors.generic') };
  // The manager's own clients count too: send the current summary first (quietly).
  await syncRoster(services, new Date(), true).catch(() => false);
  const [view, rosters] = await Promise.all([team.team(), team.rosters()]);
  if (!view.ok) return { status: 'error', message: teamErrorText(view.error) };
  const byUser = new Map((rosters.ok ? rosters.value : []).map((r) => [r.userId, r]));
  return { status: 'ready', team: view.value, rosters: byUser };
}

function Total({ value, label, warn = false }: { value: number; label: string; warn?: boolean }) {
  return (
    <div className={warn ? styles.totalWarn : styles.total}>
      <Num className={styles.totalValue}>{value}</Num>
      <span>{label}</span>
    </div>
  );
}

function MemberCard({ member, roster, busy, onRemove }: { member: TeamMember; roster: MemberRoster | null; busy: boolean; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const clients = roster?.roster?.clients ?? [];
  const attention = clients.filter((c) => c.attention !== null).length;
  const subtitle =
    roster === null
      ? t('team.members.noRoster')
      : roster.roster === null
        ? t('team.members.rosterLocked')
        : `${t('team.members.clients', { n: clients.length })}${attention > 0 ? ` · ${t('team.members.attention', { n: attention })}` : ''} · ${t('team.members.updated', { date: dayOf(roster.updatedAt) })}`;
  return (
    <div className={styles.member}>
      <ListRow
        leading={<Avatar name={member.name} />}
        title={member.name}
        subtitle={subtitle}
        trailing={attention > 0 ? <Badge tone="warning">{attention}</Badge> : undefined}
        onClick={clients.length > 0 ? () => setOpen((v) => !v) : undefined}
      />
      {open && (
        <ul className={styles.clients}>
          {clients.map((c, i) => (
            <li key={`${c.name}-${i}`} className={styles.client}>
              <span className={styles.clientName}>{c.name}</span>
              <span className={styles.clientMeta}>
                {c.totalSessions > 0 ? t('team.client.sessionsLeft', { n: c.remainingSessions, total: c.totalSessions }) : t('team.client.noPackage')}
                {' · '}
                {c.lastSessionAt === null ? t('team.client.never') : t('team.client.lastSession', { date: dayOf(c.lastSessionAt / 1000) })}
              </span>
              {c.attention !== null && <Badge tone={c.attention === 'ended' ? 'danger' : 'warning'}>{t(`team.client.attention.${c.attention}`)}</Badge>}
            </li>
          ))}
          <li>
            <Button size="small" variant="danger" disabled={busy} onClick={onRemove}>
              {t('team.members.remove')}
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}
