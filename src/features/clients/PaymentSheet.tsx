import { useState, type FormEvent } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { toIsoDate, type Client, type IsoDate, type Payment, type PaymentMethod } from '@/domain/models';
import { t } from '@/i18n';
import { Button, SegmentedControl, Sheet, TextField } from '@/ui';
import { currencyLabel } from '@/ui/format';
import { moneyInputValue, parseMoneyInput } from './moneyInput';
import styles from './Money.module.css';

const FORM_ID = 'payment-form';
const METHODS: readonly PaymentMethod[] = ['cash', 'instapay', 'wallet', 'bank'];

export interface PaymentSheetProps {
  client: Client;
  /** null = new payment. */
  payment: Payment | null;
  currency: string;
  onClose: () => void;
  onDelete: (p: Payment) => void;
}

/** Record a payment: amount, كاش / إنستاباي / فودافون كاش / تحويل, paid or pending, and the date. */
export function PaymentSheet({ client, payment, currency, onClose, onDelete }: PaymentSheetProps) {
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  const today = toIsoDate(new Date());
  const cur = payment?.currency ?? client.package?.currency ?? currency;
  const [amount, setAmount] = useState(moneyInputValue(payment?.amountMinor ?? client.package?.priceMinor ?? 0));
  const [method, setMethod] = useState<PaymentMethod>(payment?.method ?? 'cash');
  const [status, setStatus] = useState<'paid' | 'due'>(payment?.status ?? 'paid');
  const [date, setDate] = useState<IsoDate>((payment?.status === 'due' ? payment.dueOn : payment?.paidOn) ?? today);
  const [note, setNote] = useState(payment?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const minor = parseMoneyInput(amount);
    if (minor === null) {
      setError(t('schedule.pay.amountRequired'));
      return;
    }
    const fields = {
      amountMinor: minor,
      currency: cur,
      method,
      status,
      paidOn: status === 'paid' ? date : null,
      dueOn: status === 'due' ? date : (payment?.dueOn ?? null),
      note: note.trim(),
    };
    if (payment) await repos.payments.update(payment.id, fields);
    else await repos.payments.create({ clientId: client.id, ...fields });
    showToast({ message: t('schedule.pay.saved') });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={payment ? t('schedule.pay.editTitle') : t('schedule.pay.newTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form={FORM_ID} className={styles.save}>
          {t('common.save')}
        </button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={`${t('schedule.pay.amount')} (${currencyLabel(cur)})`}
          inputMode="decimal"
          value={amount}
          error={error}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
          ltr
        />
        <SegmentedControl
          label={t('schedule.pay.method')}
          options={METHODS.map((m) => ({ value: m, label: t(`schedule.pay.methods.${m}`) }))}
          value={method}
          onChange={setMethod}
          wrap
        />
        <SegmentedControl
          label={t('schedule.pay.status')}
          options={[
            { value: 'paid', label: t('schedule.pay.paid') },
            { value: 'due', label: t('schedule.pay.pending') },
          ]}
          value={status}
          onChange={setStatus}
        />
        <TextField
          label={status === 'paid' ? t('schedule.pay.paidOn') : t('schedule.pay.dueOn')}
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          ltr
        />
        <TextField label={`${t('schedule.pay.note')} (${t('common.optional')})`} value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
        {payment && (
          <Button variant="danger" icon="trash" onClick={() => onDelete(payment)}>
            {t('schedule.pay.delete')}
          </Button>
        )}
      </form>
    </Sheet>
  );
}
