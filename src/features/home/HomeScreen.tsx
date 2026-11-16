import { useNavigate } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { attentionLabel, attentionTone } from '@/features/clients/attention';
import { t } from '@/i18n';
import { Avatar, Badge, Button, Icon, ListRow, ListSection, PageHeader } from '@/ui';
import { formatLongDate, formatTime } from '@/ui/format';
import { useHomeData } from './useHomeData';
import styles from './HomeScreen.module.css';

export function HomeScreen() {
  const home = useHomeData();
  const { data } = useServices();
  const navigate = useNavigate();
  const openAddClient = useUiStore((s) => s.openAddClient);
  const showToast = useUiStore((s) => s.showToast);

  if (!home) return <PageHeader title={t('home.greeting')} />;

  const removeDemo = async () => {
    await data.removeDemoData();
    showToast({ message: t('home.demoRemoved') });
  };

  return (
    <>
      <PageHeader
        title={home.trainerName ? t('home.greetingNamed', { name: home.trainerName }) : t('home.greeting')}
        subtitle={formatLongDate(home.now)}
      />
      <div className={styles.body}>
        <div className={styles.actions}>
          <Button icon="plus" onClick={openAddClient}>
            {t('home.addClient')}
          </Button>
          <Button icon="calendar" variant="secondary" onClick={() => navigate('/schedule')}>
            {t('home.addSession')}
          </Button>
        </div>

        {home.hasDemo && (
          <section className={styles.demo} aria-labelledby="demo-title">
            <h2 id="demo-title" className={styles.demoTitle}>
              {t('home.demoTitle')}
            </h2>
            <p className={styles.demoBody}>{t('home.demoBody')}</p>
            <Button variant="plain" className={styles.demoButton} onClick={() => void removeDemo()}>
              {t('home.demoRemove')}
            </Button>
          </section>
        )}

        <ListSection title={t('home.todaySessions')}>
          {home.todaySessions.length === 0 ? (
            <ListRow
              leading={<Icon name="calendar" />}
              title={t('home.noSessionsTitle')}
              subtitle={t('home.noSessionsBody')}
            />
          ) : (
            home.todaySessions.map(({ session, client }) => (
              <ListRow
                key={session.id}
                to={`/clients/${client.id}`}
                leading={<span className={styles.time}>{formatTime(session.startsAt)}</span>}
                title={client.name}
                subtitle={t('home.duration', { min: session.durationMin })}
              />
            ))
          )}
        </ListSection>

        <ListSection title={t('home.endingSoon')}>
          {home.attention.length === 0 ? (
            <ListRow leading={<Icon name="check" />} title={t('home.nothingEnding')} />
          ) : (
            home.attention.map(({ client, attention }) => (
              <ListRow
                key={client.id}
                to={`/clients/${client.id}`}
                leading={<Avatar name={client.name} />}
                title={client.name}
                trailing={<Badge tone={attentionTone(attention)}>{attentionLabel(attention)}</Badge>}
              />
            ))
          )}
        </ListSection>

        <ListSection title={t('home.followUp')} footer={home.followUp.length > 0 ? t('home.followUpHint') : undefined}>
          {home.followUp.length === 0 ? (
            <ListRow leading={<Icon name="check" />} title={t('home.nobodyToFollow')} />
          ) : (
            home.followUp.map((client) => (
              <ListRow key={client.id} to={`/clients/${client.id}`} leading={<Avatar name={client.name} />} title={client.name} />
            ))
          )}
        </ListSection>

        <ListSection title={t('home.lastBackup')}>
          <ListRow leading={<Icon name="database" />} title={t('home.noBackupYet')} subtitle={t('home.backupHint')} />
        </ListSection>
      </div>
    </>
  );
}
