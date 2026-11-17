import { useState, type FormEvent } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { clientGoalSchema, type Client, type ClientGoal } from '@/domain/models';
import { cleanPhoneInput, phoneProblem } from '@/domain/whatsapp';
import { t } from '@/i18n';
import { Select, SegmentedControl, Sheet, TextArea, TextField } from '@/ui';
import styles from './AddClientSheet.module.css';

const FORM_ID = 'edit-client-form';
type Gender = 'male' | 'female' | 'none';

const num = (s: string): number | undefined => {
  const n = Number(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[٫,]/g, '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};
const text = (n: number | undefined) => (n === undefined ? '' : String(n));

/** Everything about a client besides package and payments. */
export function EditClientSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);
  const [gender, setGender] = useState<Gender>(client.gender ?? 'none');
  const [birthDate, setBirthDate] = useState(client.birthDate ?? '');
  const [goal, setGoal] = useState<ClientGoal>(client.goal);
  const [goalNote, setGoalNote] = useState(client.goalNote);
  const [injuries, setInjuries] = useState(client.injuries.join('\n'));
  const [weight, setWeight] = useState(text(client.measurements.weightKg));
  const [height, setHeight] = useState(text(client.measurements.heightCm));
  const [bodyFat, setBodyFat] = useState(text(client.measurements.bodyFatPercent));
  const [waist, setWaist] = useState(text(client.measurements.waistCm));
  const [notes, setNotes] = useState(client.notes);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('addClient.nameRequired'));
    const problem = phoneProblem(phone);
    if (problem) return setPhoneError(t(`addClient.phoneErrors.${problem}`));
    try {
      await repos.clients.update(client.id, {
        name: name.trim(),
        phone: phone.trim(),
        gender: gender === 'none' ? null : gender,
        birthDate: birthDate || null,
        goal,
        goalNote: goalNote.trim(),
        injuries: injuries
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        measurements: { ...client.measurements, weightKg: num(weight), heightCm: num(height), bodyFatPercent: num(bodyFat), waistCm: num(waist) },
        notes: notes.trim(),
      });
    } catch {
      return setError(t('clientDetail.invalid'));
    }
    showToast({ message: t('clientDetail.saved', { name: name.trim() }), duration: 2500 });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('clientDetail.editTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="submit" form={FORM_ID} className={styles.save}>
          {t('common.save')}
        </button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
        <TextField label={t('addClient.name')} value={name} error={error} maxLength={120} onChange={(e) => (setName(e.target.value), setError(null))} autoComplete="off" />
        <TextField label={t('addClient.phone')} type="tel" inputMode="tel" maxLength={20} value={phone} onChange={(e) => (setPhone(cleanPhoneInput(e.target.value)), setPhoneError(null))}
          error={phoneError}
          hint={t('addClient.phoneHint')} ltr />
        <SegmentedControl
          label={t('clientDetail.gender')}
          value={gender}
          onChange={setGender}
          options={[
            { value: 'male', label: t('clientDetail.male') },
            { value: 'female', label: t('clientDetail.female') },
            { value: 'none', label: t('clientDetail.unknown') },
          ]}
        />
        <TextField label={t('clientDetail.birthDate')} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} ltr />
        <Select label={t('addClient.goal')} value={goal} onChange={setGoal} options={clientGoalSchema.options.map((g) => ({ value: g, label: t(`goals.${g}`) }))} />
        <TextField label={`${t('clientDetail.goalNote')} (${t('common.optional')})`} value={goalNote} onChange={(e) => setGoalNote(e.target.value)} />
        <div className={styles.pair}>
          <TextField label={`${t('clientDetail.weight')} (${t('clientDetail.kg')})`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} ltr />
          <TextField label={`${t('clientDetail.height')} (${t('clientDetail.cm')})`} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} ltr />
        </div>
        <div className={styles.pair}>
          <TextField label={`${t('clientDetail.bodyFat')} (%)`} inputMode="decimal" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} ltr />
          <TextField label={`${t('clientDetail.waist')} (${t('clientDetail.cm')})`} inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} ltr />
        </div>
        <TextArea label={t('clientDetail.injuriesField')} hint={t('clientDetail.injuriesHint')} value={injuries} onChange={(e) => setInjuries(e.target.value)} />
        <TextArea label={t('clientDetail.notesField')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Sheet>
  );
}
