import { useState, type FormEvent } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { PLACEHOLDERS, placeholderToken, renderTemplate, type Placeholder, type WhatsappTemplate } from '@/domain/whatsapp';
import { isEnglish, t } from '@/i18n';
import { Button, Chip, Sheet, TextArea, TextField } from '@/ui';
import { defaultTemplate, removeTemplate, saveTemplate } from './templatesStore';
import styles from './Whatsapp.module.css';

const FORM_ID = 'wa-template-form';
const BODY_ID = 'wa-template-body';

const SAMPLE = (): Record<Placeholder, string> => ({
  الاسم: t('schedule.wa.sample.name'),
  الموعد: t('schedule.wa.sample.when'),
  الباقة: t('schedule.wa.sample.package'),
  المبلغ: t('schedule.wa.sample.amount'),
});

export interface TemplateEditSheetProps {
  /** null = new custom template. */
  template: WhatsappTemplate | null;
  onClose: () => void;
  onDelete: (template: WhatsappTemplate) => void;
}

export function TemplateEditSheet({ template, onClose, onDelete }: TemplateEditSheetProps) {
  const { meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const [title, setTitle] = useState(template?.title ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [error, setError] = useState<{ title?: string; body?: string }>({});
  const isBuiltin = template !== null && template.kind !== 'custom';

  const insert = (p: Placeholder) => {
    const token = placeholderToken(p, isEnglish());
    const el = document.getElementById(BODY_ID) as HTMLTextAreaElement | null;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    setError((e) => ({ ...e, body: undefined }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nextError = {
      title: title.trim() ? undefined : t('schedule.wa.nameRequired'),
      body: body.trim() ? undefined : t('schedule.wa.bodyRequired'),
    };
    if (nextError.title || nextError.body) {
      setError(nextError);
      return;
    }
    await saveTemplate(meta, {
      id: template?.id ?? `custom-${crypto.randomUUID()}`,
      kind: template?.kind ?? 'custom',
      title: title.trim(),
      body: body.trim(),
    });
    showToast({ message: t('schedule.wa.saved') });
    onClose();
  };

  const reset = async () => {
    if (!template || template.kind === 'custom') return;
    await removeTemplate(meta, template.id);
    const d = defaultTemplate(template.kind);
    setTitle(d.title);
    setBody(d.body);
    showToast({ message: t('schedule.wa.resetDone') });
  };

  const preview = renderTemplate(body, SAMPLE()).text;

  return (
    <Sheet
      open
      onClose={onClose}
      title={template ? t('schedule.wa.editTitle') : t('schedule.wa.newTitle')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <Button size="small" type="submit" form={FORM_ID}>
          {t('common.save')}
        </Button>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={t('schedule.wa.name')}
          placeholder={t('schedule.wa.namePlaceholder')}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError((x) => ({ ...x, title: undefined }));
          }}
          error={error.title}
          autoComplete="off"
        />
        <div className={styles.bodyField}>
          <TextArea
            id={BODY_ID}
            label={t('schedule.wa.body')}
            value={body}
            rows={5}
            onChange={(e) => {
              setBody(e.target.value);
              setError((x) => ({ ...x, body: undefined }));
            }}
            error={error.body}
          />
          <div className={styles.chips} role="group" aria-label={t('schedule.wa.insert')}>
            {PLACEHOLDERS.map((p) => (
              <Chip key={p} aria-label={t('schedule.wa.insertNamed', { name: placeholderToken(p, isEnglish()) })} onClick={() => insert(p)}>
                {placeholderToken(p, isEnglish())}
              </Chip>
            ))}
          </div>
        </div>
        <section className={styles.preview} aria-label={t('schedule.wa.preview')}>
          <h3 className={styles.previewLabel}>{t('schedule.wa.preview')}</h3>
          <p className={styles.bubble}>{preview || '…'}</p>
        </section>
        {isBuiltin && (
          <Button variant="secondary" icon="undo" onClick={() => void reset()}>
            {t('schedule.wa.reset')}
          </Button>
        )}
        {template && !isBuiltin && (
          <Button variant="danger" icon="trash" onClick={() => onDelete(template)}>
            {t('schedule.wa.delete')}
          </Button>
        )}
      </form>
    </Sheet>
  );
}
