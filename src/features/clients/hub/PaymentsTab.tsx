import type { Client, Payment } from '@/domain/models';
import { PackageSection, PaymentsSection } from './sections';
import type { HubData } from './useHubData';

export function PaymentsTab(props: { client: Client; hub: HubData; onEditPackage: () => void; onRenew: () => void; onAdd: () => void; onOpen: (p: Payment) => void }) {
  const { client, hub } = props;
  return (
    <>
      <PackageSection client={client} next={hub.overview.next} onEdit={props.onEditPackage} onRenew={props.onRenew} />
      <PaymentsSection payments={hub.payments} today={hub.today} owed={hub.overview.owedMinor} packagePaid={hub.overview.packagePaid} currency={hub.currency} onAdd={props.onAdd} onOpen={props.onOpen} />
    </>
  );
}
