import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import type { Client } from '@/domain/models';
import type { OutboxItem } from '@/domain/outbox';
import { t } from '@/i18n';
import { Avatar, Badge, Icon } from '@/ui';
import { useWhatsappTemplates, defaultTemplate } from '@/features/whatsapp/templatesStore';
import { linkFor } from '@/features/whatsapp/useWhatsappLink';
import { templateFor } from '@/domain/whatsapp';
import { markSent } from './useOutbox';
import styles from './Outbox.module.css';

/** One row per message: who, why, and a one-tap WhatsApp send that also marks it as sent. */
export function OutboxList({ items, clients, onChange, limit }: { items: OutboxItem[]; clients: ReadonlyMap<string, Client>; onChange: () => void; limit?: number }) {
  const { meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const templates = useWhatsappTemplates();
  const shown = limit ? items.slice(0, limit) : items;

  const mark = async (item: OutboxItem, name: string) => {
    await markSent(meta, item.id, true);
    onChange();
    showToast({
      message: `${t('outbox.sent')} · ${name}`,
      actionLabel: t('outbox.undo'),
      onAction: () => void markSent(meta, item.id, false).then(onChange),
      duration: 5000,
    });
  };

  return (
    <ul className={styles.list}>
      {shown.map((item) => {
        const client = clients.get(item.clientId);
        if (!client) return null;
        const template = (templates && templateFor(item.kind, templates)) ?? defaultTemplate(item.kind);
        const href = linkFor(template, client, { startsAt: item.startsAt ?? null, amountMinor: item.amountMinor ?? null });
        return (
          <li key={item.id} className={styles.row}>
            <Avatar name={client.name} />
            <div className={styles.text}>
              <p className={styles.name}>{client.name}</p>
              <p className={styles.reason}>
                {t(`outbox.kinds.${item.kind}`)}
                {item.daysLeft !== undefined && <Badge>{t('outbox.daysLeft', { n: item.daysLeft })}</Badge>}
              </p>
            </div>
            <button type="button" className={styles.skip} aria-label={t('outbox.skipLabel', { name: client.name })} onClick={() => void mark(item, client.name)}>
              <Icon name="close" />
            </button>
            <a
              className={styles.send}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={t('outbox.sendLabel', { name: client.name })}
              onClick={() => void mark(item, client.name)}
            >
              <Icon name="chat" />
              {t('outbox.send')}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
