import type { Client } from '@/domain/models';
import { normalizePhoneForWhatsapp, renderTemplate, whatsappLink, type BuiltinKind } from '@/domain/whatsapp';
import { t } from '@/i18n';
import { Icon, Sheet, cx } from '@/ui';
import { templateValues } from './values';
import { useWhatsappTemplates } from './templatesStore';
import type { WhatsappExtra } from './useWhatsappLink';
import styles from './Whatsapp.module.css';

export interface WhatsappPickerSheetProps {
  open: boolean;
  onClose: () => void;
  client: Pick<Client, 'name' | 'phone' | 'package'>;
  extra?: WhatsappExtra;
  /** Shown first. */
  preferred?: BuiltinKind;
}

/** Pick a message for a client: each choice is a wa.me link with the rendered text (one tap sends). */
export function WhatsappPickerSheet({ open, onClose, client, extra = {}, preferred }: WhatsappPickerSheetProps) {
  const templates = useWhatsappTemplates() ?? [];
  const values = templateValues(client, extra);
  const ordered = preferred ? [...templates.filter((x) => x.kind === preferred), ...templates.filter((x) => x.kind !== preferred)] : templates;
  const hasPhone = normalizePhoneForWhatsapp(client.phone) !== null;
  return (
    <Sheet open={open} onClose={onClose} title={t('schedule.wa.pickTitle', { name: client.name })} cancelLabel={t('common.close')}>
      {!hasPhone && <p className={styles.notice}>{t('schedule.wa.noPhone')}</p>}
      <ul className={styles.pickList}>
        {ordered.map((tpl) => {
          const rendered = renderTemplate(tpl.body, values);
          return (
            <li key={tpl.id}>
              <a
                className={cx(styles.pick, tpl.kind === preferred && styles.preferred)}
                href={whatsappLink(client.phone, rendered.text)}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
              >
                <span className={styles.pickIcon}>
                  <Icon name="chat" />
                </span>
                <span className={styles.pickText}>
                  <span className={styles.pickTitle}>{tpl.title}</span>
                  <span className={styles.pickBody}>{rendered.text}</span>
                </span>
              </a>
            </li>
          );
        })}
        <li>
          <a className={styles.pick} href={whatsappLink(client.phone, '')} target="_blank" rel="noreferrer" onClick={onClose}>
            <span className={styles.pickIcon}>
              <Icon name="send" />
            </span>
            <span className={styles.pickText}>
              <span className={styles.pickTitle}>{t('schedule.wa.pickPlain')}</span>
            </span>
          </a>
        </li>
      </ul>
    </Sheet>
  );
}
