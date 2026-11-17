import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { NutritionStore } from '@/data/nutritionStore';
import { MEAL_DRAFT_JSON_SCHEMA, mealDraftSchema, mealsFromDraft, parseDraft, PROGRAM_DRAFT_JSON_SCHEMA, programDraftSchema, programFromDraft } from '@/domain/ai';
import { ageInYears } from '@/domain/meals';
import { toIsoDate, type Client } from '@/domain/models';
import { t } from '@/i18n';
import { Button, SegmentedControl, Select, Sheet, TextArea } from '@/ui';
import { AnthropicAiService } from '@/services/ai/aiService';
import { readAiKey } from '@/features/online/integrations';
import { loadBuiltinCatalog } from '@/features/programs/catalog';
import { newLocalId } from '@/features/programs/ids';
import styles from './ClientDetail.module.css';

const SYSTEM = `You help an Egyptian personal trainer draft plans. The trainer reviews every draft before using it.
Write all names in Egyptian Arabic. Gym and muscle terms are transliterated, never translated (Glutes = جلوتس, Bench Press = بنش برس, Deadlift = ديدليفت).
Never suggest supplements or medication doses. Respect injuries by avoiding exercises that load them.`;

/** Client facts without the name (privacy): goal, sex, age, injuries, measurements. */
function clientFacts(c: Client, now: Date): string {
  const m = c.measurements;
  const age = ageInYears(c.birthDate, toIsoDate(now));
  return [
    `goal: ${c.goal}${c.goalNote ? ` (${c.goalNote})` : ''}`,
    c.gender ? `sex: ${c.gender}` : null,
    age ? `age: ${age}` : null,
    m.weightKg ? `weight: ${m.weightKg} kg` : null,
    m.heightCm ? `height: ${m.heightCm} cm` : null,
    m.bodyFatPercent ? `body fat: ${m.bodyFatPercent}%` : null,
    `injuries: ${c.injuries.length ? c.injuries.join('; ') : 'none'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function AiDraftSheet({ client, onClose }: { client: Client; onClose: () => void }) {
  const services = useServices();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [kind, setKind] = useState<'program' | 'meals'>('program');
  const [days, setDays] = useState('3');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ai = useRef(new AnthropicAiService());

  const run = async () => {
    const key = await readAiKey(services.meta);
    if (!key) return setError(t('settings.ai.noKey'));
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      if (kind === 'program') {
        const catalog = (await loadBuiltinCatalog()) ?? [];
        const list = catalog.map((e) => `${e.id}|${e.nameEn}|${e.primaryMuscles.join(',')}|${e.equipment}`).join('\n');
        const r = await ai.current.json(
          key,
          {
            system: SYSTEM,
            schema: PROGRAM_DRAFT_JSON_SCHEMA,
            prompt: `Draft a ${days}-day weekly training program.\nClient:\n${clientFacts(client, new Date())}\nTrainer notes: ${notes || '-'}\n\nUse ONLY exerciseId values from this list (id|name|muscles|equipment):\n${list}`,
          },
          abort.current.signal,
        );
        if (!r.ok) return setError(t(`settings.ai.errors.${r.error}`));
        const draft = parseDraft(programDraftSchema, r.value);
        if (!draft) return setError(t('settings.ai.errors.bad_output'));
        const { body, dropped } = programFromDraft(draft, { knownIds: new Set(catalog.map((e) => e.id)), clientId: client.id, newId: newLocalId });
        const created = await services.data.repos.programs.create(body);
        showToast({ message: dropped ? `${t('settings.ai.doneProgram')} ${t('settings.ai.dropped', { n: dropped })}` : t('settings.ai.doneProgram'), duration: 5000 });
        onClose();
        navigate(`/programs/${created.id}?from=client`);
      } else {
        const store = new NutritionStore(services.meta, services.data.repos);
        const calc = await store.getCalculation(client.id);
        const recipes = await services.data.repos.recipes.list();
        const target = calc ? `target: ${Math.round(calc.targetKcal)} kcal, protein ${Math.round(calc.proteinG)} g, carbs ${Math.round(calc.carbG)} g, fat ${Math.round(calc.fatG)} g` : 'no calorie target saved';
        const r = await ai.current.json(
          key,
          {
            system: SYSTEM,
            schema: MEAL_DRAFT_JSON_SCHEMA,
            prompt: `Draft one day of Egyptian meals (time as HH:MM, items with rough grams).\nClient:\n${clientFacts(client, new Date())}\n${target}\nTrainer notes: ${notes || '-'}\nTrainer's recipes you may use by name: ${recipes.map((x) => x.name).join('، ') || '-'}`,
          },
          abort.current.signal,
        );
        if (!r.ok) return setError(t(`settings.ai.errors.${r.error}`));
        const draft = parseDraft(mealDraftSchema, r.value);
        if (!draft) return setError(t('settings.ai.errors.bad_output'));
        const existing = await services.data.repos.mealPlans.listByClient(client.id);
        await services.data.repos.mealPlans.create({
          clientId: client.id,
          name: t('nutrition.plan.dayName', { n: existing.length + 1 }),
          targetKcal: calc ? Math.round(calc.targetKcal) : null,
          meals: mealsFromDraft(draft, () => crypto.randomUUID()),
          notes: draft.notes,
        });
        showToast({ message: t('settings.ai.doneMeals'), duration: 5000 });
        onClose();
        navigate(`/clients/${client.id}/meals`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      title={t('settings.ai.title')}
      cancelLabel={t('common.cancel')}
    >
      <div className={styles.sheetBody}>
        <p className={styles.sheetWarn}>{t('settings.ai.review')}</p>
        <SegmentedControl
          label={t('settings.ai.kind')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'program', label: t('settings.ai.program') },
            { value: 'meals', label: t('settings.ai.meals') },
          ]}
        />
        {kind === 'program' && (
          <Select label={t('settings.ai.days')} value={days} onChange={setDays} options={['2', '3', '4', '5', '6'].map((n) => ({ value: n, label: n }))} />
        )}
        <TextArea label={t('settings.ai.notes')} placeholder={t('settings.ai.notesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && (
          <p className={styles.sheetWarn} role="alert">
            {error}
          </p>
        )}
        <Button block icon="edit" disabled={busy} onClick={() => void run()}>
          {busy ? t('settings.ai.working') : t('settings.ai.generate')}
        </Button>
      </div>
    </Sheet>
  );
}
