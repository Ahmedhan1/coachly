import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import type { AiError } from '@/domain/ai';
import type { Client } from '@/domain/models';
import { aiClients } from '@/features/assistant/aiClient';
import { readAiConfig } from '@/features/assistant/aiSettings';
import { localNow } from '@/features/assistant/assistantData';
import { draftMealDay, draftProgram } from '@/features/assistant/drafts';
import { deviceZone } from '@/app/deviceZone';
import { t } from '@/i18n';
import { Button, SegmentedControl, Select, Sheet, TextArea } from '@/ui';
import styles from './ClientDetail.module.css';

/**
 * Program / meal-day draft for one client over Groq (the trainer's own key). Lazy-loaded by the client
 * screen. Sends client facts without name or phone; the result is a draft the trainer reviews.
 */
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

  const fail = (code: AiError) => setError(t(`assistant.errors.${code}`));

  const run = async () => {
    const cfg = await readAiConfig(services.meta);
    if (!cfg.ok) return fail(cfg.error);
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    const deps = { services, ai: aiClients(services.meta).drafts, cfg: { apiKey: cfg.apiKey, model: cfg.settings.model }, signal: abort.current.signal };
    const today = localNow(deviceZone().clock, new Date()).today;
    try {
      if (kind === 'program') {
        const r = await draftProgram(deps, client, Number(days), notes, today);
        if (!r.ok) return fail(r.error);
        const message = r.value.dropped ? `${t('settings.ai.doneProgram')} ${t('settings.ai.dropped', { n: r.value.dropped })}` : t('settings.ai.doneProgram');
        showToast({ message, duration: 5000 });
        onClose();
        navigate(`/programs/${r.value.programId}?from=client`);
      } else {
        const r = await draftMealDay(deps, client, notes, today);
        if (!r.ok) return fail(r.error);
        showToast({ message: t('settings.ai.doneMeals'), duration: 5000 });
        onClose();
        navigate(`/clients/${client.id}/meals`);
      }
    } catch {
      fail('failed');
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
