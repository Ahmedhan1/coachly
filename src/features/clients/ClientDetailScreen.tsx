import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import { subscriptionAttention, toIsoDate, type Client, type Payment } from '@/domain/models';
import { t } from '@/i18n';
import { Badge, Button, EmptyState, Icon, ListRow, ListSection, PageHeader } from '@/ui';
import { formatIsoDate, formatMoney, formatNumber } from '@/ui/format';
import { attentionLabel, attentionTone } from './attention';
import { useDeleteClient } from './useDeleteClient';
import styles from './Clients.module.css';

export function ClientDetailScreen() {
  const { clientId = '' } = useParams();
  const repos = useRepos();
  // null = loaded but missing; undefined = still loading
  const client = useLive(async () => (await repos.clients.get(clientId)) ?? null, [repos, clientId]);
  const payments = useLive(() => repos.payments.listByClient(clientId), [repos, clientId]);
  const back = { to: '/clients', label: t('clients.title') };

  if (client === undefined) return <PageHeader title="" back={back} />;
  if (client === null) {
    return (
      <>
        <PageHeader title="" back={back} />
        <EmptyState icon="user" title={t('clients.notFoundTitle')} body={t('clients.notFoundBody')} />
      </>
    );
  }
  return <ClientDetail client={client} payments={payments ?? []} back={back} />;
}

function ClientDetail({ client, payments, back }: { client: Client; payments: Payment[]; back: { to: string; label: string } }) {
  const navigate = useNavigate();
  const deleteClient = useDeleteClient();
  const [today] = useState(() => toIsoDate(new Date()));
  const attention = subscriptionAttention(client, today);
  const m = client.measurements;
  const measurements = [
    m.weightKg !== undefined && { label: t('clientDetail.weight'), value: t('clientDetail.kg', { n: formatNumber(m.weightKg) }) },
    m.heightCm !== undefined && { label: t('clientDetail.height'), value: t('clientDetail.cm', { n: formatNumber(m.heightCm) }) },
    m.bodyFatPercent !== undefined && {
      label: t('clientDetail.bodyFat'),
      value: t('clientDetail.percent', { n: formatNumber(m.bodyFatPercent) }),
    },
    m.waistCm !== undefined && { label: t('clientDetail.waist'), value: t('clientDetail.cm', { n: formatNumber(m.waistCm) }) },
  ].filter((x): x is { label: string; value: string } => Boolean(x));

  const onDelete = async () => {
    await deleteClient(client);
    navigate('/clients', { replace: true });
  };

  return (
    <>
      <PageHeader title={client.name} subtitle={t(`goals.${client.goal}`)} back={back} />
      <div className={styles.sections}>
        <ListSection title={t('clientDetail.package')}>
          <div className={styles.facts}>
            <div className={styles.fact}>
              <span className={styles.factLabel}>{t('clientDetail.remaining')}</span>
              <span className={styles.factValue}>
                {client.package ? `${client.remainingSessions} / ${client.package.totalSessions}` : t('common.none')}
              </span>
            </div>
            <div className={styles.fact}>
              <span className={styles.factLabel}>{t('clientDetail.period')}</span>
              <span className={styles.factValue}>
                {client.endDate ? formatIsoDate(client.endDate) : t('common.none')}
              </span>
            </div>
          </div>
          {attention && (
            <ListRow title={<Badge tone={attentionTone(attention)}>{attentionLabel(attention)}</Badge>} />
          )}
          {client.startDate && client.endDate && (
            <ListRow
              title={t('clientDetail.periodValue', {
                start: formatIsoDate(client.startDate),
                end: formatIsoDate(client.endDate),
              })}
            />
          )}
        </ListSection>

        {client.phone && (
          <ListSection title={t('clientDetail.phone')}>
            <a href={`tel:${client.phone.replace(/\s/g, '')}`} className={styles.link}>
              <ListRow
                leading={<Icon name="phone" />}
                title={<span className={styles.phone}>{client.phone}</span>}
                trailing={t('clientDetail.call')}
              />
            </a>
          </ListSection>
        )}

        <ListSection title={t('clientDetail.injuries')}>
          {client.injuries.length === 0 ? (
            <p className={`${styles.text} ${styles.muted}`}>{t('clientDetail.noInjuries')}</p>
          ) : (
            client.injuries.map((injury) => <ListRow key={injury} leading={<Icon name="alert" />} title={injury} />)
          )}
        </ListSection>

        {measurements.length > 0 && (
          <ListSection title={t('clientDetail.measurements')}>
            <div className={styles.facts}>
              {measurements.map((item) => (
                <div key={item.label} className={styles.fact}>
                  <span className={styles.factLabel}>{item.label}</span>
                  <span className={styles.factValue}>{item.value}</span>
                </div>
              ))}
            </div>
          </ListSection>
        )}

        <ListSection title={t('clientDetail.payments')}>
          {payments.length === 0 ? (
            <p className={`${styles.text} ${styles.muted}`}>{t('clientDetail.noPayments')}</p>
          ) : (
            payments.map((p) => (
              <ListRow
                key={p.id}
                title={formatMoney(p.amountMinor, p.currency)}
                subtitle={formatIsoDate(p.paidOn ?? p.dueOn ?? today)}
                trailing={
                  <Badge tone={p.status === 'paid' ? 'neutral' : 'warning'}>
                    {p.status === 'paid' ? t('clientDetail.paid') : t('clientDetail.due')}
                  </Badge>
                }
              />
            ))
          )}
        </ListSection>

        <ListSection title={t('clientDetail.notes')}>
          <p className={`${styles.text} ${client.notes ? '' : styles.muted}`}>{client.notes || t('clientDetail.noNotes')}</p>
        </ListSection>

        <Button variant="danger" icon="trash" className={styles.danger} onClick={() => void onDelete()}>
          {t('clientDetail.deleteClient')}
        </Button>
      </div>
    </>
  );
}
