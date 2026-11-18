import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRepos, useServices } from '@/app/services';
import { useGo } from '@/app/nav';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { readAiKey } from '@/features/online/integrations';
import { clientPagesEnabled } from '@/features/online/prefs';
import { sessionForWorkout } from '@/domain/clientHub';
import { localDayRange, subscriptionAttention, type Client, type Payment, type Program } from '@/domain/models';
import type { BuiltinKind } from '@/domain/whatsapp';
import { t } from '@/i18n';
import { Badge, Button, EmptyState, Icon, IconButton, PageHeader } from '@/ui';
import { WhatsappPickerSheet } from '@/features/whatsapp/WhatsappPickerSheet';
import { useAssignProgram } from '@/features/programs/useAssignProgram';
import { attentionLabel, attentionTone } from './attention';
import { telUrl } from './contact';
import { ClientPageSheet } from './ClientPageSheet';
import { EditClientSheet } from './EditClientSheet';
import { PackageSheet } from './PackageSheet';
import { PaymentSheet } from './PaymentSheet';
import { useDeletePayment, useRenewPackage } from './useMoneyActions';
import { useDeleteClient } from './useDeleteClient';
import { ExerciseHistorySheet } from './hub/ExerciseHistorySheet';
import { HubTabs } from './hub/HubTabs';
import { exerciseUrl, programUrl, sessionUrl } from './hub/links';
import { NutritionTab } from './hub/NutritionTab';
import { OverviewTab } from './hub/OverviewTab';
import { PaymentsTab } from './hub/PaymentsTab';
import { ProgramChooserSheet, type ProgramChoice } from './hub/ProgramChooserSheet';
import { ProgressTab } from './hub/ProgressTab';
import { SessionsTab } from './hub/SessionsTab';
import { useHubTab } from './hub/tabs';
import { TrainingTab } from './hub/TrainingTab';
import { useHubData, type HubData } from './hub/useHubData';
import { ClientNoteSheet } from './tailor/ClientNoteSheet';
import styles from './ClientDetail.module.css';
import hubStyles from './hub/Hub.module.css';

/** The AI draft sheet is loaded only when the trainer opens it. */
const AiDraftSheet = lazy(() => import('./AiDraftSheet').then((m) => ({ default: m.AiDraftSheet })));

const BACK = { to: '/clients', label: t('clientDetail.back') };

/** /clients/:id — the client hub: everything about one client, in tabs, linked to every screen it touches. */
export function ClientDetailScreen() {
  const { clientId = '' } = useParams();
  const repos = useRepos();
  // null = loaded but missing; undefined = still loading
  const client = useLive(async () => (await repos.clients.get(clientId)) ?? null, [repos, clientId]);
  if (client === undefined) return <PageHeader title="" back={BACK} />;
  if (client === null) {
    return (
      <>
        <PageHeader title="" back={BACK} />
        <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />
      </>
    );
  }
  return <ClientHub client={client} />;
}

type SheetName = null | 'edit' | 'package' | 'page' | 'ai' | 'whatsapp' | 'program' | { payment: Payment | null } | { exercise: string } | { note: string };

function ClientHub({ client }: { client: Client }) {
  const hub = useHubData(client);
  const [tab, setTab] = useHubTab();
  const navigate = useNavigate();
  const go = useGo();
  const showToast = useUiStore((s) => s.showToast);
  const deleteClient = useDeleteClient();
  const renew = useRenewPackage();
  const deletePayment = useDeletePayment();
  const assign = useAssignProgram();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<SheetName>(() => (params.get('pay') === '1' ? { payment: null } : null));
  const { meta } = useServices();
  const pagesOn = useLive(() => clientPagesEnabled(meta), [meta]) ?? false;
  const aiOn = (useLive(() => readAiKey(meta), [meta]) ?? null) !== null;
  const [today] = useState(() => new Date());
  const attention = subscriptionAttention(client, hub?.today ?? '');

  // "/clients/:id?renew=1" (Home «جدّد») renews once on arrival; "?pay=1" (Home «حصّل») opens a payment.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const renewing = params.get('renew') === '1';
    const paying = params.get('pay') === '1';
    if ((!renewing && !paying) || handled.current === client.id) return;
    handled.current = client.id;
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        out.delete('renew');
        out.delete('pay');
        return out;
      },
      { replace: true, state: null },
    );
    if (renewing) void renew(client);
  }, [params, setParams, renew, client]);

  if (!hub) return <PageHeader title="" back={BACK} />;

  const program = hub.programs.active;
  const { start, end } = localDayRange(today);
  const todays = sessionForWorkout(hub.sessions, start, end, today.getTime());
  const startUrl = sessionUrl({ clientId: client.id, programId: program?.id, dayId: hub.nextDay?.dayId, scheduleId: todays?.id });
  const owed = hub.overview.owedMinor;
  const firstDue = hub.payments.filter((p) => p.status === 'due').sort((a, b) => ((a.dueOn ?? '') < (b.dueOn ?? '') ? -1 : 1))[0];
  // The message the trainer most likely wants first: what is late, then what ends, then the next session.
  const waPreferred: BuiltinKind = owed > 0 ? 'payment_due' : attention ? 'renewal' : 'session_reminder';

  const onDelete = async () => {
    await deleteClient(client);
    navigate('/clients', { replace: true });
  };

  const pickProgram = async (choice: ProgramChoice) => {
    setSheet(null);
    let result: Program;
    if (choice.kind === 'builtin') result = await assign.fromBuiltin(choice.template, client);
    else if (choice.kind === 'copy') result = await assign.copyFor(choice.program, client);
    else if (choice.kind === 'adopt') result = await assign.adopt(choice.program, client);
    else result = await assign.activate(choice.program, client.id);
    showToast({ message: t('hub.training.activated', { name: result.name }), duration: 2500 });
    if (choice.kind !== 'activate') go(programUrl(result.id));
  };

  const newProgram = () => go(`/more/programs?client=${client.id}`);

  return (
    <>
      <PageHeader
        title=""
        back={BACK}
        actions={
          <>
            <IconButton icon="edit" label={t('clientDetail.editClient')} onClick={() => setSheet('edit')} />
            {client.phone && (
              <a className={styles.roundLink} href={telUrl(client.phone)} aria-label={t('clientDetail.call')} title={t('clientDetail.call')}>
                <Icon name="phone" />
              </a>
            )}
          </>
        }
      />
      <header className={styles.who}>
        <div className={styles.photo} aria-hidden="true">
          <Icon name="user" />
        </div>
        <div className={styles.whoText}>
          <h1 className={styles.name}>{client.name}</h1>
          <p className={styles.meta}>
            {t(`goals.${client.goal}`)}
            {client.phone && (
              <>
                {' · '}
                <bdi className="num">{client.phone}</bdi>
              </>
            )}
          </p>
          {attention && (
            <p className={styles.attention}>
              <Badge tone={attentionTone(attention)}>{attentionLabel(attention)}</Badge>
            </p>
          )}
        </div>
      </header>

      <HubTabs value={tab} onChange={setTab} />
      <div id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab}`} className={hubStyles.panel}>
        <TabPanel
          tab={tab}
          client={client}
          hub={hub}
          go={go}
          startUrl={startUrl}
          scheduleId={todays?.id ?? null}
          onTab={setTab}
          onSheet={setSheet}
          onRenew={() => void renew(client)}
          onNewProgram={newProgram}
          onMakeActive={(p) => void pickProgram({ kind: 'activate', program: p })}
          pagesOn={pagesOn}
          aiOn={aiOn}
        />
        {tab === 'overview' && (
          <div className={styles.dangerZone}>
            <Button variant="danger" icon="trash" onClick={() => void onDelete()}>
              {t('clientDetail.deleteClient')}
            </Button>
          </div>
        )}
      </div>

      <nav className={styles.actionbar} aria-label={t('clientDetail.actions')}>
        <button type="button" className={styles.stack} onClick={() => setSheet('whatsapp')}>
          <Icon name="chat" />
          {t('clientDetail.whatsapp')}
        </button>
        <button type="button" className={styles.stack} aria-label={t('clientDetail.bookLabel')} onClick={() => go(`/schedule?book=1&client=${client.id}`)}>
          <Icon name="calendarPlus" />
          {t('clientDetail.book')}
        </button>
        <Button size="large" icon="send" className={styles.primary} onClick={() => go(`/more/pdf?client=${client.id}`)}>
          {t('clientDetail.sendProgram')}
        </Button>
      </nav>

      {sheet === 'ai' && (
        <Suspense fallback={null}>
          <AiDraftSheet client={client} onClose={() => setSheet(null)} />
        </Suspense>
      )}
      {sheet === 'whatsapp' && (
        <WhatsappPickerSheet
          open
          onClose={() => setSheet(null)}
          client={client}
          preferred={waPreferred}
          extra={{ startsAt: hub.overview.next?.startsAt ?? null, amountMinor: owed > 0 ? (firstDue?.amountMinor ?? owed) : null, currency: hub.currency }}
        />
      )}
      {sheet === 'page' && <ClientPageSheet client={client} onClose={() => setSheet(null)} />}
      {sheet === 'edit' && <EditClientSheet client={client} onClose={() => setSheet(null)} />}
      {sheet === 'package' && <PackageSheet client={client} currency={hub.currency} onClose={() => setSheet(null)} />}
      {sheet === 'program' && <ProgramChooserSheet client={client} activeId={program?.id ?? null} onClose={() => setSheet(null)} onPick={(c) => void pickProgram(c)} />}
      {sheet !== null && typeof sheet === 'object' && 'exercise' in sheet && (
        <ExerciseHistorySheet
          exerciseId={sheet.exercise}
          logs={hub.logs}
          unit={hub.unit}
          onClose={() => setSheet(null)}
          onOpenDetail={() => {
            setSheet(null);
            go(exerciseUrl(sheet.exercise));
          }}
          client={client}
          onNote={() => setSheet({ note: sheet.exercise })}
        />
      )}
      {sheet !== null && typeof sheet === 'object' && 'note' in sheet && (
        <ClientNoteSheet client={client} exerciseId={sheet.note} onClose={() => setSheet(null)} />
      )}
      {sheet !== null && typeof sheet === 'object' && 'payment' in sheet && (
        <PaymentSheet
          client={client}
          payment={sheet.payment}
          currency={hub.currency}
          onClose={() => setSheet(null)}
          onDelete={(p) => {
            setSheet(null);
            void deletePayment(p);
          }}
        />
      )}
    </>
  );
}

interface TabPanelProps {
  tab: ReturnType<typeof useHubTab>[0];
  client: Client;
  hub: HubData;
  go: (to: string) => void;
  startUrl: string;
  scheduleId: string | null;
  onTab: ReturnType<typeof useHubTab>[1];
  onSheet: (sheet: SheetName) => void;
  onRenew: () => void;
  onNewProgram: () => void;
  onMakeActive: (p: Program) => void;
  pagesOn: boolean;
  aiOn: boolean;
}

function TabPanel(p: TabPanelProps) {
  const { client, hub, go } = p;
  switch (p.tab) {
    case 'overview':
      return (
        <OverviewTab
          client={client}
          hub={hub}
          go={go}
          actions={{
            startUrl: p.startUrl,
            onPay: () => p.onSheet({ payment: null }),
            onRenew: p.onRenew,
            onEditPackage: () => p.onSheet('package'),
            onPage: p.pagesOn ? () => p.onSheet('page') : null,
            onAi: p.aiOn ? () => p.onSheet('ai') : null,
            onTab: p.onTab,
          }}
        />
      );
    case 'training':
      return (
        <TrainingTab
          client={client}
          hub={hub}
          scheduleId={p.scheduleId}
          go={go}
          onChooseProgram={() => p.onSheet('program')}
          onNewProgram={p.onNewProgram}
          onMakeActive={p.onMakeActive}
          onOpenExercise={(id) => p.onSheet({ exercise: id })}
        />
      );
    case 'nutrition':
      return <NutritionTab client={client} go={go} />;
    case 'progress':
      return <ProgressTab client={client} hub={hub} go={go} />;
    case 'sessions':
      return <SessionsTab client={client} hub={hub} go={go} />;
    case 'payments':
      return <PaymentsTab client={client} hub={hub} onEditPackage={() => p.onSheet('package')} onRenew={p.onRenew} onAdd={() => p.onSheet({ payment: null })} onOpen={(pay) => p.onSheet({ payment: pay })} />;
  }
}
