import { progressTimeline } from '@/domain/clientHub';
import type { Client } from '@/domain/models';
import { t } from '@/i18n';
import { Badge, Button, Icon, ListRow, ListSection, Num, Tx } from '@/ui';
import { formatIsoDate, formatNumber } from '@/ui/format';
import { MeasurementsSection } from './sections';
import type { HubData } from './useHubData';
import styles from './Hub.module.css';

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNumber(n)}`;

/** Weight, measurements and check-ins over time; the full chart and photos live on the progress screen. */
export function ProgressTab({ client, hub, go }: { client: Client; hub: HubData; go: (to: string) => void }) {
  const items = progressTimeline(hub.progress);
  const url = `/clients/${client.id}/progress`;
  return (
    <>
      <div className={styles.actionsRow}>
        <Button icon="plus" onClick={() => go(url)}>
          {t('hub.progress.add')}
        </Button>
        <Button variant="secondary" icon="chart" onClick={() => go(url)}>
          {t('hub.progress.open')}
        </Button>
      </div>
      <MeasurementsSection client={client} />
      <ListSection icon="trend" title={t('hub.progress.timeline')} count={items.length || undefined}>
        {items.length === 0 ? (
          <div className={styles.emptyTile}>
            <p className={styles.emptyTitle}>{t('hub.progress.empty')}</p>
            <p className={styles.emptyBody}>{t('hub.progress.emptyBody')}</p>
          </div>
        ) : (
          items.slice(0, 30).map(({ entry, weightDeltaKg, waistDeltaCm, photos }) => {
            const m = entry.measurements;
            return (
              <ListRow
                key={entry.id}
                leading={<Icon name={photos > 0 ? 'image' : 'note'} />}
                title={
                  <>
                    {formatIsoDate(entry.date)} {entry.source === 'client' && <Badge tone="brand">{t('hub.progress.fromClient')}</Badge>}
                  </>
                }
                subtitle={
                  <>
                    {m.weightKg !== undefined && (
                      <>
                        <Tx k="hub.progress.weight" params={{ n: formatNumber(m.weightKg) }} />
                        {weightDeltaKg !== null && weightDeltaKg !== 0 && (
                          <span className={styles.delta}>
                            {' '}
                            (<Num>{signed(weightDeltaKg)}</Num>)
                          </span>
                        )}
                      </>
                    )}
                    {m.waistCm !== undefined && (
                      <>
                        {' · '}
                        <Tx k="hub.progress.waist" params={{ n: formatNumber(m.waistCm) }} />
                        {waistDeltaCm !== null && waistDeltaCm !== 0 && (
                          <span className={styles.delta}>
                            {' '}
                            (<Num>{signed(waistDeltaCm)}</Num>)
                          </span>
                        )}
                      </>
                    )}
                    {photos > 0 && (
                      <>
                        {' · '}
                        <Tx k="hub.progress.photos" params={{ n: photos }} />
                      </>
                    )}
                  </>
                }
                to={url}
              />
            );
          })
        )}
      </ListSection>
    </>
  );
}
