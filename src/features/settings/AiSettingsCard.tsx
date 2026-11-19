import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { KNOWN_MODELS } from '@/domain/ai';
import { aiClients } from '@/features/assistant/aiClient';
import { looksLikeGroqKey, readAiSettings, readGroqKey, saveAiSettings, saveGroqKey, type AiSettings } from '@/features/assistant/aiSettings';
import { t } from '@/i18n';
import { Button, Select, TextField } from '@/ui';
import styles from './Settings.module.css';

const CUSTOM = '__custom__';

/**
 * الإعدادات ← المساعد الذكي (Groq): on/off with the privacy text, the trainer's own free key (device-local,
 * never in backups), show/hide, test connection, model picker. Off by default.
 */
export function AiSettingsCard() {
  const { meta } = useServices();
  const settings = useLive(() => readAiSettings(meta), [meta]);
  const key = useLive(async () => (await readGroqKey(meta)) ?? '', [meta]);
  if (settings === undefined || key === undefined) return null;
  return <AiForm initial={settings} initialKey={key} />;
}

function AiForm({ initial, initialKey }: { initial: AiSettings; initialKey: string }) {
  const { meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const [s, setS] = useState(initial);
  const [key, setKey] = useState(initialKey);
  const [show, setShow] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const known = KNOWN_MODELS.includes(s.model);
  const [custom, setCustom] = useState(!known);

  const validKey = () => {
    const v = key.trim();
    if (v && !looksLikeGroqKey(v)) {
      setKeyError(t('assistant.settings.keyInvalid'));
      return null;
    }
    return v;
  };

  const save = async () => {
    const v = validKey();
    if (v === null) return;
    const model = s.model.trim() || KNOWN_MODELS[0] || '';
    // Turning it on here, with the privacy text in view, counts as reading the notice.
    await saveAiSettings(meta, { ...s, model, privacyAck: s.privacyAck || s.enabled });
    await saveGroqKey(meta, v);
    showToast({ message: t('assistant.settings.saved'), duration: 2500 });
  };

  const test = async () => {
    const v = validKey();
    if (!v) return setKeyError(t('assistant.errors.no_key'));
    setTesting(true);
    setResult(null);
    const r = await aiClients(meta).chat.ping(v, s.model.trim());
    setTesting(false);
    setResult(r.ok ? { ok: true, text: t('assistant.settings.testOk', { model: r.value }) } : { ok: false, text: r.error === 'rate_limited' && r.retryAfterSec ? `${t('assistant.errors.rate_limited')} ${t('assistant.retryIn', { n: r.retryAfterSec })}` : t(`assistant.errors.${r.error}`) });
  };

  return (
    <section className={styles.card} aria-labelledby="ai-settings-title">
      <h2 id="ai-settings-title" className={styles.cardTitle}>
        {t('assistant.settings.title')}
      </h2>
      <p className={styles.body}>{t('assistant.settings.body')}</p>
      <div className={styles.warnBox}>
        <p>{t('assistant.settings.privacyTitle')}</p>
        <ul>
          <li>{t('assistant.settings.privacy1')}</li>
          <li>{t('assistant.settings.privacy2')}</li>
          <li>{t('assistant.settings.privacy3')}</li>
          <li>{t('assistant.settings.privacy4')}</li>
        </ul>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
        <span>{t('assistant.settings.enable')}</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={s.firstNamesOnly} onChange={(e) => setS({ ...s, firstNamesOnly: e.target.checked })} />
        <span>{t('assistant.settings.firstNames')}</span>
      </label>

      <TextField
        label={t('assistant.settings.key')}
        hint={t('assistant.settings.keyHint')}
        type={show ? 'text' : 'password'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={key}
        error={keyError}
        onChange={(e) => {
          setKey(e.target.value);
          setKeyError(null);
          setResult(null);
        }}
        ltr
      />
      <Button size="small" variant="plain" icon="key" onClick={() => setShow((v) => !v)}>
        {show ? t('assistant.settings.hideKey') : t('assistant.settings.showKey')}
      </Button>
      <div className={styles.meta}>
        <p>{t('assistant.settings.howTitle')}</p>
        <ol>
          <li>{t('assistant.settings.how1')}</li>
          <li>{t('assistant.settings.how2')}</li>
          <li>{t('assistant.settings.how3')}</li>
        </ol>
      </div>

      <Select
        label={t('assistant.settings.model')}
        value={custom ? CUSTOM : s.model}
        onChange={(v) => {
          if (v === CUSTOM) return setCustom(true);
          setCustom(false);
          setS({ ...s, model: v });
        }}
        options={[...KNOWN_MODELS.map((m) => ({ value: m, label: m })), { value: CUSTOM, label: t('assistant.settings.modelCustom') }]}
      />
      {custom && <TextField label={t('assistant.settings.modelCustomLabel')} value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} autoCapitalize="off" spellCheck={false} ltr />}
      <p className={styles.meta}>{t('assistant.settings.modelHint')}</p>

      <Button icon="check" block onClick={() => void save()}>
        {t('assistant.settings.save')}
      </Button>
      <Button icon="send" block variant="secondary" disabled={testing || !key.trim()} onClick={() => void test()}>
        {testing ? t('assistant.settings.testing') : t('assistant.settings.test')}
      </Button>
      {result && (
        <p className={result.ok ? styles.meta : styles.warn} role="status">
          {result.text}
        </p>
      )}
      {initialKey && (
        <Button
          block
          variant="plain"
          icon="trash"
          onClick={async () => {
            await saveGroqKey(meta, '');
            setKey('');
            showToast({ message: t('assistant.settings.removed'), duration: 2500 });
          }}
        >
          {t('assistant.settings.removeKey')}
        </Button>
      )}
    </section>
  );
}
