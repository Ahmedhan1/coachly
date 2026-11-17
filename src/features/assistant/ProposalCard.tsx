import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { whatsappLink } from '@/domain/whatsapp/templates';
import { deviceZone } from '@/features/schedule/zone';
import { t } from '@/i18n';
import { Button } from '@/ui';
import type { ExecError } from './executor';
import type { ChatItem } from './useAssistant';
import { cardView } from './proposalView';
import styles from './Assistant.module.css';

type ProposalItem = Extract<ChatItem, { kind: 'proposal' }>;

interface Props {
  item: ProposalItem;
  onExecute: (item: ProposalItem) => void;
  onDismiss: (item: ProposalItem) => void;
  onUndo: (item: ProposalItem) => void;
  onOpened: (item: ProposalItem) => void;
}

/** One proposed change: what will change (before → after). Runs only on «نفّذ»; «الغي» drops it. */
export function ProposalCard({ item, onExecute, onDismiss, onUndo, onOpened }: Props) {
  const view = cardView(item.action, deviceZone().clock);
  const open = item.status === 'pending' || item.status === 'failed';
  return (
    <article className={styles.proposal} aria-label={view.title}>
      <h3 className={styles.cardTitle}>{view.title}</h3>
      <dl className={styles.rows}>
        {view.rows.map((row) => (
          <Row key={row.label} {...row} />
        ))}
      </dl>
      {view.note && <p className={styles.note}>{view.note}</p>}
      {item.status === 'failed' && item.error && (
        <p className={styles.failed} role="alert">
          {t('assistant.card.failed', { reason: reason(item.error) })}
        </p>
      )}
      {open && (
        <div className={styles.actions}>
          {item.action.type === 'draft_whatsapp' ? (
            <WhatsappButton clientId={item.action.clientId} text={item.action.text} onOpened={() => onOpened(item)} />
          ) : (
            <Button icon="check" onClick={() => onExecute(item)}>
              {t('assistant.card.execute')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => onDismiss(item)}>
            {t('assistant.card.dismiss')}
          </Button>
        </div>
      )}
      {item.status === 'running' && <p className={styles.note}>{t('assistant.card.running')}</p>}
      {item.status === 'done' && (
        <div className={styles.actions}>
          <p className={styles.status} role="status">
            {t('assistant.card.done')}
          </p>
          {item.undo && (
            <Button variant="plain" icon="undo" onClick={() => onUndo(item)}>
              {t('assistant.card.undo')}
            </Button>
          )}
        </div>
      )}
      {item.status === 'dismissed' && <p className={styles.note}>{t('assistant.card.dismissed')}</p>}
      {item.status === 'undone' && <p className={styles.note}>{t('assistant.card.undone')}</p>}
    </article>
  );
}

function Row({ label, value, before, after, long }: { label: string; value?: string; before?: string; after?: string; long?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      {before !== undefined ? (
        <dd className={long ? styles.long : undefined}>
          <span className={styles.before}>{before}</span>
          <br />
          <span className={styles.after}>{after}</span>
        </dd>
      ) : (
        <dd className={long ? styles.long : undefined}>{value}</dd>
      )}
    </>
  );
}

/** A real link, so the tap itself opens WhatsApp (iOS blocks windows opened after an await). Never sends. */
function WhatsappButton({ clientId, text, onOpened }: { clientId: string; text: string; onOpened: () => void }) {
  const { data } = useServices();
  const client = useLive(async () => (await data.repos.clients.get(clientId)) ?? null, [data, clientId]);
  if (client === undefined) return null;
  const phone = client?.phone ?? '';
  return (
    <>
      <a className={styles.linkButton} href={whatsappLink(phone, text)} target="_blank" rel="noopener noreferrer" onClick={onOpened}>
        {t('assistant.card.openWhatsapp')}
      </a>
      {!phone.trim() && <span className={styles.note}>{t('assistant.card.noPhone')}</span>}
    </>
  );
}

function reason(code: ExecError): string {
  if (code === 'not_found' || code === 'no_package' || code === 'invalid') return t(`assistant.execErrors.${code}`);
  return t(`assistant.errors.${code}`);
}
