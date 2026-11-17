import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { toIsoDate, type Client } from '@/domain/models';
import { t } from '@/i18n';
import { Button, Sheet } from '@/ui';
import { formatIsoDate, formatTime } from '@/ui/format';
import { readShare, saveShare } from '@/features/online/prefs';
import { publishClientPage } from '@/features/online/clientPagePublish';
import { whatsappLink } from '@/domain/whatsapp';
import styles from './ClientDetail.module.css';

/** Create / refresh / send / revoke the client's private page (encrypted on the phone, key in the link). */
export function ClientPageSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const services = useServices();
  const { meta } = services;
  const page = services.online?.clientPage;
  const showToast = useUiStore((s) => s.showToast);
  const [version, setVersion] = useState(0);
  const share = useLive(() => readShare(meta, client.id), [meta, client.id, version]);
  const [busy, setBusy] = useState(false);
  const [checkins, setCheckins] = useState<boolean | null>(null);
  const checkinsOn = checkins ?? share?.checkinsEnabled ?? true;

  const publish = async () => {
    if (!page) return;
    setBusy(true);
    try {
      const r = await publishClientPage(services, client, { checkinsEnabled: checkinsOn, force: true });
      if (r !== 'published') return showToast({ message: t('settings.clientPage.failed') });
      setVersion((v) => v + 1);
      showToast({ message: t('settings.clientPage.updated'), duration: 2500 });
    } finally {
      setBusy(false);
    }
  };

  const link = share && page ? page.link(share) : null;
  const wa = link && client.phone ? whatsappLink(client.phone, t('settings.clientPage.sendText', { name: client.name.split(/\s+/)[0] ?? client.name, link })) : null;

  return (
    <Sheet open onClose={onClose} title={t('settings.clientPage.title')} cancelLabel={t('common.close')}>
      <div className={styles.sheetBody}>
        <p className={styles.sheetLead}>{t('settings.clientPage.lead')}</p>
        {!page?.available ? (
          <p className={styles.sheetWarn}>{t('settings.clientPage.unavailable')}</p>
        ) : (
          <>
            <label className={styles.sheetCheck}>
              <input type="checkbox" checked={checkinsOn} onChange={(e) => setCheckins(e.target.checked)} />
              <span>
                {t('settings.clientPage.checkins')}
                <small>{t('settings.clientPage.checkinsHint')}</small>
              </span>
            </label>
            <p className={styles.sheetMeta}>
              {share?.publishedAt
                ? t('settings.clientPage.lastPublished', { date: `${formatIsoDate(toIsoDate(new Date(share.publishedAt)))} ${formatTime(share.publishedAt)}` })
                : t('settings.clientPage.notPublished')}
            </p>
            <Button block icon="send" disabled={busy} onClick={() => void publish()}>
              {share?.publishedAt ? t('settings.clientPage.update') : t('settings.clientPage.create')}
            </Button>
            {link && share?.publishedAt && (
              <>
                {wa && (
                  <a className={styles.sheetLink} href={wa} target="_blank" rel="noreferrer">
                    {t('settings.clientPage.send')}
                  </a>
                )}
                <Button
                  block
                  variant="secondary"
                  icon="copy"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      showToast({ message: t('settings.clientPage.copied'), duration: 2000 });
                    } catch {
                      window.prompt(t('settings.clientPage.copy'), link);
                    }
                  }}
                >
                  {t('settings.clientPage.copy')}
                </Button>
                <Button
                  block
                  variant="danger"
                  icon="trash"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(t('settings.clientPage.revokeConfirm'))) return;
                    setBusy(true);
                    const r = await page.revoke(share);
                    setBusy(false);
                    if (!r.ok) return showToast({ message: t('settings.clientPage.failed') });
                    await saveShare(meta, client.id, null);
                    setVersion((v) => v + 1);
                    showToast({ message: t('settings.clientPage.revoked'), duration: 2500 });
                  }}
                >
                  {t('settings.clientPage.revoke')}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
