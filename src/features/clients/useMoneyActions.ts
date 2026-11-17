import { useCallback } from 'react';
import { useRepos, useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { toIsoDate, type Client, type Payment } from '@/domain/models';
import { t } from '@/i18n';
import { formatIsoDate, formatMoney } from '@/ui/format';

/**
 * "جدّد" in one tap: the last package copied forward with new dates (domain/attendance planRenewal) and its
 * price recorded as a pending payment. The toast offers undo.
 */
export function useRenewPackage() {
  const { data } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  return useCallback(
    async (client: Client) => {
      const pkg = client.package;
      if (!pkg || pkg.totalSessions <= 0) {
        showToast({ message: t('schedule.pkg.noPackageToRenew', { name: client.name }) });
        return null;
      }
      const result = await data.renewPackage(client.id, toIsoDate(new Date()));
      if (!result) {
        showToast({ message: t('schedule.pkg.noPackageToRenew', { name: client.name }) });
        return null;
      }
      const { plan, payment } = result;
      showToast({
        message: payment
          ? t('schedule.pkg.renewedPending', { name: client.name, amount: formatMoney(payment.amountMinor, payment.currency) })
          : t('schedule.pkg.renewed', { name: client.name, date: formatIsoDate(plan.endDate) }),
        actionLabel: t('common.undo'),
        onAction: () => {
          void data.undoRenewal(client.id, result);
        },
        duration: 6000,
      });
      return plan;
    },
    [data, showToast],
  );
}

/** Marks a pending payment as paid today, with undo. */
export function useMarkPaid() {
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  return useCallback(
    async (payment: Payment) => {
      await repos.payments.update(payment.id, { status: 'paid', paidOn: toIsoDate(new Date()), dueOn: payment.dueOn ?? payment.paidOn });
      showToast({
        message: t('schedule.pay.markedPaid'),
        actionLabel: t('common.undo'),
        onAction: () => void repos.payments.update(payment.id, { status: payment.status, paidOn: payment.paidOn, dueOn: payment.dueOn }),
      });
    },
    [repos, showToast],
  );
}

/** Soft-deletes a payment with undo. */
export function useDeletePayment() {
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  return useCallback(
    async (payment: Payment) => {
      await repos.payments.softDelete(payment.id);
      showToast({
        message: t('schedule.pay.deleted'),
        actionLabel: t('common.undo'),
        onAction: () => void repos.payments.restore(payment.id),
        duration: 6000,
      });
    },
    [repos, showToast],
  );
}
