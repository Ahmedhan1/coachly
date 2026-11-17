import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ZodError } from 'zod';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { clientGoalSchema, toIsoDate, type ClientGoal } from '@/domain/models';
import { cleanPhoneInput, phoneProblem } from '@/domain/whatsapp';
import { t } from '@/i18n';
import { SegmentedControl, Sheet, TextField } from '@/ui';
import styles from './AddClientSheet.module.css';

const GOALS = clientGoalSchema.options.map((value) => ({ value, label: t(`goals.${value}`) }));
const FORM_ID = 'add-client-form';
const NAME_ID = 'add-client-name';

/** Quick add: only the name is required, so adding a client is tap → type → save. */
export function AddClientSheet() {
  const open = useUiStore((s) => s.addClientOpen);
  const close = useUiStore((s) => s.closeAddClient);
  return open ? <AddClientForm onClose={close} /> : null;
}

function AddClientForm({ onClose }: { onClose: () => void }) {
  const repos = useRepos();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [goal, setGoal] = useState<ClientGoal>('fitness');
  const [sessions, setSessions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('addClient.nameRequired'));
      return;
    }
    const problem = phoneProblem(phone);
    if (problem) {
      setPhoneError(t(`addClient.phoneErrors.${problem}`));
      return;
    }
    setSaving(true);
    try {
      const settings = await repos.settings.get();
      const total = Number.parseInt(sessions, 10);
      const hasPackage = Number.isFinite(total) && total > 0;
      const client = await repos.clients.create({
        name: name.trim(),
        phone: phone.trim(),
        gender: null,
        birthDate: null,
        goal,
        goalNote: '',
        injuries: [],
        measurements: {},
        package: hasPackage ? { name: '', totalSessions: total, priceMinor: 0, currency: settings.currency } : null,
        startDate: hasPackage ? toIsoDate(new Date()) : null,
        endDate: null,
        remainingSessions: hasPackage ? total : 0,
        notes: '',
        photoId: null,
      });
      onClose();
      showToast({ message: t('addClient.saved', { name: client.name }) });
      navigate(`/clients/${client.id}`);
    } catch (err) {
      setSaving(false);
      setError(err instanceof ZodError ? t('addClient.invalid') : t('app.loadError'));
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('addClient.title')}
      cancelLabel={t('common.cancel')}
      initialFocusId={NAME_ID}
      primaryAction={
        <button type="submit" form={FORM_ID} className={styles.save} disabled={saving}>
          {t('common.save')}
        </button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <TextField
          id={NAME_ID}
          label={t('addClient.name')}
          placeholder={t('addClient.namePlaceholder')}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={error}
          maxLength={120}
          autoComplete="off"
          enterKeyHint="done"
          required
        />
        <TextField
          label={`${t('addClient.phone')} (${t('common.optional')})`}
          type="tel"
          inputMode="tel"
          maxLength={20}
          value={phone}
          onChange={(e) => (setPhone(cleanPhoneInput(e.target.value)), setPhoneError(null))}
          error={phoneError}
          hint={t('addClient.phoneHint')}
          autoComplete="off"
          ltr
        />
        <SegmentedControl label={t('addClient.goal')} options={GOALS} value={goal} onChange={setGoal} wrap />
        <TextField
          label={`${t('addClient.sessions')} (${t('common.optional')})`}
          inputMode="numeric"
          pattern="[0-9]*"
          value={sessions}
          onChange={(e) => setSessions(e.target.value.replace(/\D/g, '').slice(0, 3))}
          ltr
        />
      </form>
    </Sheet>
  );
}
