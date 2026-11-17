import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { deviceZone } from '@/features/schedule/zone';
import { t, type TKey } from '@/i18n';
import { Button, IconButton, PageHeader } from '@/ui';
import { readAiSettings, readGroqKey, saveAiSettings } from './aiSettings';
import { localNow } from './assistantData';
import { ProposalCard } from './ProposalCard';
import { TasksSheet } from './TasksSheet';
import { useAssistant, type AssistantError, type ChatItem } from './useAssistant';
import styles from './Assistant.module.css';

const SETTINGS_PATH = '/more/settings/integrations';
const CHIPS = ['today', 'late', 'week', 'reminder', 'tasks'] as const;

function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** «المساعد»: chat in Egyptian Arabic. Reads data on request; every change waits for «نفّذ». */
export function AssistantScreen() {
  const { meta, data } = useServices();
  const [params] = useSearchParams();
  const clientId = params.get('client');
  const settings = useLive(() => readAiSettings(meta), [meta]);
  const key = useLive(async () => (await readGroqKey(meta)) ?? '', [meta]);
  const focus = useLive(async () => (clientId ? ((await data.repos.clients.get(clientId)) ?? null) : null), [data, clientId]);
  const back = { to: '/more', label: t('screens.more.title') };

  if (settings === undefined || key === undefined || focus === undefined) return <PageHeader title={t('assistant.title')} back={back} />;
  if (!settings.enabled || !key) {
    return (
      <>
        <PageHeader title={t('assistant.title')} back={back} />
        <div className={styles.screen}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('assistant.settings.setupTitle')}</h2>
            <p className={styles.body}>{t('assistant.settings.setupBody')}</p>
            <Link className={styles.linkButton} to={SETTINGS_PATH}>
              {t('assistant.settings.openSettings')}
            </Link>
          </section>
        </div>
      </>
    );
  }
  if (!settings.privacyAck) {
    return (
      <>
        <PageHeader title={t('assistant.title')} back={back} />
        <div className={styles.screen}>
          <section className={styles.card} aria-labelledby="ai-privacy">
            <h2 id="ai-privacy" className={styles.cardTitle}>
              {t('assistant.privacyNotice.title')}
            </h2>
            <p className={styles.body}>{t('assistant.privacyNotice.body')}</p>
            <Button block onClick={() => void saveAiSettings(meta, { ...settings, privacyAck: true })}>
              {t('assistant.privacyNotice.ack')}
            </Button>
          </section>
        </div>
      </>
    );
  }
  return <Chat focus={focus ? { id: focus.id, name: focus.name } : null} back={back} />;
}

function Chat({ focus, back }: { focus: { id: string; name: string } | null; back: { to: string; label: string } }) {
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const online = useOnline();
  const a = useAssistant(focus);
  const [text, setText] = useState('');
  const [tasksOpen, setTasksOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const today = localNow(deviceZone().clock, new Date()).today;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [a.items.length, a.busy]);

  const submit = (value: string) => {
    if (!online || a.busy || !value.trim()) return;
    setText('');
    void a.send(value);
  };

  const execute = async (item: Extract<ChatItem, { kind: 'proposal' }>) => {
    const r = await a.execute(item);
    if (!r.ok) return;
    showToast({
      message: r.dropped ? `${t('assistant.doneToast')}. ${t('assistant.droppedToast', { n: r.dropped })}` : t('assistant.doneToast'),
      duration: 4000,
    });
    if (r.navigateTo) navigate(r.navigateTo);
  };

  return (
    <>
      <PageHeader
        title={t('assistant.title')}
        subtitle={focus ? focus.name : undefined}
        back={back}
        actions={
          <>
            <IconButton icon="list" label={t('assistant.tasksLink')} onClick={() => setTasksOpen(true)} />
            <IconButton icon="edit" label={t('assistant.newChat')} onClick={a.reset} />
          </>
        }
      />
      <div className={styles.screen}>
        {!online && (
          <p className={styles.banner} role="status">
            {t('assistant.offlineBanner')}
          </p>
        )}
        {a.items.length === 0 && (
          <>
            <p className={`${styles.bubble} ${styles.bot}`}>{t('assistant.intro')}</p>
            <div className={styles.chips}>
              {focus && (
                <button type="button" className={styles.chip} onClick={() => setText(t('assistant.chips.bulkFor', { name: focus.name }))}>
                  {t('assistant.chips.bulkFor', { name: focus.name })}
                </button>
              )}
              {CHIPS.map((c) => (
                <button key={c} type="button" className={styles.chip} disabled={!online} onClick={() => submit(t(`assistant.chipPrompts.${c}` as TKey))}>
                  {t(`assistant.chips.${c}` as TKey)}
                </button>
              ))}
            </div>
          </>
        )}
        {a.items.map((item) => (
          <ItemView key={item.id} item={item} onExecute={(i) => void execute(i)} onDismiss={a.dismiss} onUndo={(i) => void a.undo(i).then(() => showToast({ message: t('assistant.undoneToast') }))} onOpened={a.markOpened} />
        ))}
        {a.busy && (
          <p className={styles.thinking} role="status">
            {t('assistant.thinking')}
          </p>
        )}
        {a.error && <ErrorBox error={a.error} onRetry={() => void a.retry()} online={online} />}
        <div ref={endRef} />
      </div>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <label htmlFor="assistant-input" className={styles.visuallyHidden}>
          {t('assistant.inputLabel')}
        </label>
        <textarea
          id="assistant-input"
          className={styles.input}
          rows={1}
          dir="auto"
          placeholder={t('assistant.inputPlaceholder')}
          value={text}
          maxLength={2000}
          disabled={!online}
          onChange={(e) => setText(e.target.value)}
        />
        <IconButton icon="send" tone="brand" type="submit" label={t('assistant.send')} disabled={!online || a.busy || !text.trim()} />
      </form>
      {tasksOpen && <TasksSheet today={today} onClose={() => setTasksOpen(false)} />}
    </>
  );
}

function ItemView({ item, ...handlers }: { item: ChatItem } & Omit<Parameters<typeof ProposalCard>[0], 'item'>) {
  if (item.kind === 'user') return <p className={`${styles.bubble} ${styles.user}`}>{item.text}</p>;
  if (item.kind === 'bot') return <p className={`${styles.bubble} ${styles.bot}`}>{item.text}</p>;
  if (item.kind === 'blocked') return <p className={`${styles.bubble} ${styles.bot}`}>{t('assistant.blocked')}</p>;
  return <ProposalCard item={item} {...handlers} />;
}

/** Errors never block the app; rate limits count down before retry («استنى دقيقة»). */
function ErrorBox({ error, onRetry, online }: { error: AssistantError; onRetry: () => void; online: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!error.retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [error.retryAt]);
  const wait = error.retryAt ? Math.max(0, Math.ceil((error.retryAt - now) / 1000)) : 0;
  const needsSettings = error.code === 'no_key' || error.code === 'disabled' || error.code === 'auth' || error.code === 'model_unavailable';
  return (
    <div className={styles.error} role="alert">
      <span>{t(`assistant.errors.${error.code}`)}</span>
      {needsSettings ? (
        <Link to={SETTINGS_PATH}>{t('assistant.settings.openSettings')}</Link>
      ) : (
        <Button size="small" variant="secondary" icon="undo" disabled={wait > 0 || !online} onClick={onRetry}>
          {wait > 0 ? t('assistant.retryIn', { n: wait }) : t('assistant.retry')}
        </Button>
      )}
    </div>
  );
}
