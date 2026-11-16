import { useState, type FormEvent } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { addDays, toIsoDate, type Client, type IsoDate } from '@/domain/models';
import { t } from '@/i18n';
import { Sheet, TextField } from '@/ui';
import { currencyLabel } from '@/ui/format';
import { moneyInputValue, parseMoneyInput } from './moneyInput';
import styles from './Money.module.css';

const FORM_ID = 'package-form';
const digits = (v: string, max = 3) => v.replace(/\D/g, '').slice(0, max);

/** Package: sessions, price and period. The remaining count is editable for packages that started earlier. */
export function PackageSheet({ client, currency, onClose }: { client: Client; currency: string; onClose: () => void }) {
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  const pkg = client.package;
  const today = toIsoDate(new Date());
  const [name, setName] = useState(pkg?.name ?? '');
  const [total, setTotal] = useState(pkg ? String(pkg.totalSessions) : '12');
  const [remaining, setRemaining] = useState(pkg ? String(client.remainingSessions) : '');
  const [price, setPrice] = useState(pkg ? moneyInputValue(pkg.priceMinor) : '');
  const [start, setStart] = useState<IsoDate>(client.startDate ?? today);
  const [end, setEnd] = useState<IsoDate>(client.endDate ?? addDays(client.startDate ?? today, 30));
  const [errors, setErrors] = useState<{ total?: string; end?: string }>({});
  const cur = pkg?.currency ?? currency;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const totalN = Number.parseInt(total, 10);
    const next = {
      total: Number.isFinite(totalN) && totalN > 0 ? undefined : t('schedule.pkg.sessionsRequired'),
      end: end >= start ? undefined : t('schedule.pkg.endBeforeStart'),
    };
    if (next.total || next.end) {
      setErrors(next);
      return;
    }
    const remainingN = pkg ? Number.parseInt(remaining, 10) : totalN;
    await repos.clients.update(client.id, {
      package: { name: name.trim(), totalSessions: totalN, priceMinor: parseMoneyInput(price) ?? 0, currency: cur },
      startDate: start,
      endDate: end,
      remainingSessions: Number.isFinite(remainingN) ? Math.max(0, remainingN) : totalN,
    });
    showToast({ message: t('schedule.pkg.saved') });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={pkg ? t('schedule.pkg.editTitle') : t('schedule.pkg.newTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form={FORM_ID} className={styles.save}>
          {t('common.save')}
        </button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={`${t('schedule.pkg.name')} (${t('common.optional')})`}
          placeholder={t('schedule.pkg.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <div className={styles.pair}>
          <TextField
            label={t('schedule.pkg.sessions')}
            inputMode="numeric"
            pattern="[0-9]*"
            value={total}
            error={errors.total}
            onChange={(e) => {
              setTotal(digits(e.target.value));
              setErrors((x) => ({ ...x, total: undefined }));
            }}
            ltr
          />
          {pkg && (
            <TextField
              label={t('schedule.pkg.remaining')}
              inputMode="numeric"
              pattern="[0-9]*"
              value={remaining}
              onChange={(e) => setRemaining(digits(e.target.value))}
              ltr
            />
          )}
        </div>
        <TextField
          label={`${t('schedule.pkg.price')} (${currencyLabel(cur)})`}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          ltr
        />
        <div className={styles.pair}>
          <TextField label={t('schedule.pkg.start')} type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} ltr />
          <TextField
            label={t('schedule.pkg.end')}
            type="date"
            value={end}
            min={start}
            error={errors.end}
            onChange={(e) => {
              if (e.target.value) setEnd(e.target.value);
              setErrors((x) => ({ ...x, end: undefined }));
            }}
            ltr
          />
        </div>
      </form>
    </Sheet>
  );
}
