import { useServices } from "@/app/services";
import { useLive } from "@/app/useLive";
import { readActivity, seeActivity } from "@/data/prefs/activity";
import { unseenActivity } from "@/domain/notifications";
import { toIsoDate } from "@/domain/models";
import { ClientAvatar } from "@/features/clients/ClientAvatar";
import { clientUrl } from "@/features/clients/hub/links";
import { t } from "@/i18n";
import { ListRow, ListSection, SectionLink } from "@/ui";
import { formatIsoDate, formatTime } from "@/ui/format";
import styles from "./ActivityCard.module.css";

const SHOWN = 6;

/**
 * Home: what clients sent from their pages (check-ins with their questions, photos), who and when, until the
 * trainer opens that client (ClientDetailScreen marks them seen). Hidden when there is nothing new.
 */
export function ActivityCard() {
  const services = useServices();
  const data = useLive(async () => {
    const events = unseenActivity(await readActivity(services.meta));
    if (events.length === 0) return null;
    const clients = await services.data.repos.clients.list();
    return {
      events,
      clients: new Map(clients.map((c) => [c.id as string, c])),
    };
  }, [services]);
  if (!data) return null;
  const rows = data.events
    .filter((e) => data.clients.has(e.clientId))
    .slice(0, SHOWN);
  if (rows.length === 0) return null;
  return (
    <ListSection
      icon="bell"
      title={t("home.activity.title")}
      count={data.events.length}
      action={
        <SectionLink onClick={() => void seeActivity(services.meta, "all")}>
          {t("home.activity.seeAll")}
        </SectionLink>
      }
    >
      {rows.map((e) => {
        const client = data.clients.get(e.clientId);
        if (!client) return null;
        const when = t("home.activity.when", {
          date: formatIsoDate(toIsoDate(new Date(e.at))),
          time: formatTime(e.at),
        });
        return (
          <ListRow
            key={e.id}
            to={clientUrl(
              e.clientId,
              e.kind === "photo" ? undefined : "progress",
            )}
            leading={<ClientAvatar client={client} />}
            title={`${client.name} ${t(e.kind === "photo" ? "home.activity.photo" : "home.activity.checkin")}`}
            subtitle={
              <>
                {e.note && <span className={styles.note}>«{e.note}»</span>}
                <span className={styles.when}>{when}</span>
              </>
            }
          />
        );
      })}
    </ListSection>
  );
}
