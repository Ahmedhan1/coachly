import { useState } from 'react';
import { useRepos } from '@/app/services';
import { useLive } from '@/app/useLive';
import type { Client, Payment } from '@/domain/models';
import { PaymentSheet } from '@/features/clients/PaymentSheet';
import { useDeletePayment } from '@/features/clients/useMoneyActions';
import { ClientPicker } from '@/features/schedule/ClientPicker';
import { t } from '@/i18n';
import { Sheet } from '@/ui';
import styles from './QuickAddSheet.module.css';

/**
 * "+" → دفعة: pick the client, then the payment sheet. A client with an unpaid charge gets that charge
 * (amount filled, mark it paid or record part of it); otherwise a new payment at the package price.
 */
export function QuickPaymentFlow({ onClose }: { onClose: () => void }) {
  const repos = useRepos();
  const deletePayment = useDeletePayment();
  const clients = useLive(() => repos.clients.list(), [repos]);
  const settings = useLive(() => repos.settings.get(), [repos]);
  const [picked, setPicked] = useState<{ client: Client; payment: Payment | null } | null>(null);

  if (!clients || !settings) return null;
  if (picked) {
    return (
      <PaymentSheet
        client={picked.client}
        payment={picked.payment}
        currency={settings.currency}
        receiving
        onClose={onClose}
        onDelete={(p) => {
          onClose();
          void deletePayment(p);
        }}
      />
    );
  }

  const pick = async (id: string) => {
    const client = clients.find((c) => c.id === id);
    if (!client) return;
    const due = (await repos.payments.listByClient(id))
      .filter((p) => p.status === 'due')
      .sort((a, b) => ((a.dueOn ?? '') < (b.dueOn ?? '') ? -1 : 1))[0];
    setPicked({ client, payment: due ?? null });
  };

  return (
    <Sheet open onClose={onClose} title={t('quickAdd.paymentTitle')} cancelLabel={t('common.cancel')}>
      <div className={styles.flow}>
        <ClientPicker clients={clients} value={null} error={null} onChange={(id) => void pick(id)} />
      </div>
    </Sheet>
  );
}
