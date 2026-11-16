import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { NutritionStore } from '@/data/nutritionStore';
import { pdfSectionSchema, toIsoDate, type PdfSection } from '@/domain/models';
import { normalizeSections, PDF_PRESET_IDS, PDF_PRESETS, presetTemplate, type PdfPresetId } from '@/domain/pdf';
import { t } from '@/i18n';
import { Button, Icon, IconButton, PageHeader, Select, Sheet, TextArea, TextField, cx } from '@/ui';
import { createImageSource, HtmlPdfRenderer, type PdfRenderProgress, type RenderedPdf } from '@/services/pdf';
import { BrowserShareService } from '@/services/share';
import { useExerciseCatalog } from '@/features/programs/catalog';
import { buildPdfInput } from './buildPdfInput';
import { muscleMapRefs } from './muscleMapImage';
import { BrandingSheet } from './BrandingSheet';
import { readPdfBranding } from './pdfBranding';
import styles from './Pdf.module.css';

const ALL_SECTIONS = pdfSectionSchema.options;
const NONE = '__none__';

type Status = { kind: 'idle' } | { kind: 'working'; progress: PdfRenderProgress | null } | { kind: 'ready'; pdf: RenderedPdf; url: string } | { kind: 'failed' };

/** More → منشئ الـ PDF (or ?client= from the client screen). Rendered on the phone, shared via the share sheet. */
export function PdfBuilderScreen() {
  const services = useServices();
  const { data, meta } = services;
  const repos = data.repos;
  const showToast = useUiStore((s) => s.showToast);
  const [params] = useSearchParams();
  const catalog = useExerciseCatalog();
  const clients = useLive(() => repos.clients.list(), [repos]);
  const templates = useLive(() => repos.pdfTemplates.list(), [repos]);
  const settings = useLive(() => repos.settings.get(), [repos]);
  const [brandingVersion, setBrandingVersion] = useState(0);
  const branding = useLive(() => readPdfBranding(meta), [meta, brandingVersion]);

  const [clientId, setClientId] = useState<string>(params.get('client') ?? NONE);
  const [preset, setPreset] = useState<string>('full_program');
  const [enabled, setEnabled] = useState<PdfSection[]>([...PDF_PRESETS.full_program]);
  const [order, setOrder] = useState<PdfSection[]>(() => [...PDF_PRESETS.full_program, ...ALL_SECTIONS.filter((s) => !PDF_PRESETS.full_program.includes(s))]);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [sheet, setSheet] = useState<null | 'branding' | 'saveTemplate'>(null);
  const abort = useRef<AbortController | null>(null);

  const client = clients?.find((c) => c.id === clientId) ?? null;
  const programs = useLive(() => (client ? repos.programs.listByClient(client.id) : Promise.resolve([])), [repos, client]);
  const program = [...(programs ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

  const statusUrl = status.kind === 'ready' ? status.url : null;
  useEffect(() => () => void (statusUrl && URL.revokeObjectURL(statusUrl)), [statusUrl]);

  const share = useMemo(() => new BrowserShareService(), []);

  const applySections = (sections: readonly PdfSection[]) => {
    const list = normalizeSections(sections, ALL_SECTIONS);
    setEnabled(list);
    setOrder([...list, ...ALL_SECTIONS.filter((s) => !list.includes(s))]);
  };

  const choosePreset = (value: string) => {
    setPreset(value);
    if ((PDF_PRESET_IDS as string[]).includes(value)) applySections(PDF_PRESETS[value as PdfPresetId]);
    else {
      const tpl = templates?.find((x) => x.id === value);
      if (tpl) applySections(tpl.sections);
    }
  };

  const move = (s: PdfSection, delta: -1 | 1) => {
    setOrder((o) => {
      const i = o.indexOf(s);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j] as PdfSection, next[i] as PdfSection];
      return next;
    });
  };

  const sections = order.filter((s) => enabled.includes(s));

  const generate = async () => {
    if (!settings || !branding) return;
    if (sections.length === 0) return showToast({ message: t('pdf.noSections') });
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStatus({ kind: 'working', progress: null });
    const store = new NutritionStore(meta, repos);
    const [calculation, mealPlans, recipes, supplementRows, allSupplements, progress] = await Promise.all([
      client ? store.getCalculation(client.id) : Promise.resolve(null),
      client ? repos.mealPlans.listByClient(client.id) : Promise.resolve([]),
      repos.recipes.list(),
      client ? store.getClientSupplements(client.id) : Promise.resolve([]),
      repos.supplements.list(),
      client ? repos.progress.listByClient(client.id) : Promise.resolve([]),
    ]);
    const byId = new Map(allSupplements.map((s) => [s.id as string, s]));
    const supplements = supplementRows.flatMap((row) => {
      const s = byId.get(row.supplementId);
      return s ? [{ ...s, dose: row.dose, timing: row.timing, notes: row.notes || s.notes }] : [];
    });
    const used = [...new Set((program?.days ?? []).flatMap((d) => d.items.map((i) => i.exerciseId as string)))];
    const usedExercises = used.flatMap((id) => {
      const e = catalog?.byId.get(id);
      return e ? [e] : [];
    });
    const muscleMaps = program && sections.includes('muscle_map') ? await muscleMapRefs(usedExercises, settings.primaryColor) : undefined;
    const input = buildPdfInput({
      muscleMaps,
      sections: program ? sections : sections.filter((s) => s !== 'program' && s !== 'muscle_map'),
      title: title.trim() || (client ? t('pdf.defaultTitle', { name: client.name }) : t('pdf.defaultTitleNoClient')),
      subtitle: subtitle.trim(),
      notes: notes.trim(),
      today: toIsoDate(new Date()),
      settings,
      branding,
      client,
      program,
      catalog: catalog?.byId ?? new Map(),
      calculation,
      mealPlan: [...mealPlans].sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
      recipes,
      supplements,
      progress,
    });
    const renderer = new HtmlPdfRenderer({ images: createImageSource({ getStoredBlob: (id) => repos.images.getBlob(id), packBaseUrl: '' }) });
    const result = await renderer.render(input, { signal: ctrl.signal, onProgress: (p) => setStatus({ kind: 'working', progress: p }) });
    if (ctrl.signal.aborted) return setStatus({ kind: 'idle' });
    if (!result.ok) return setStatus({ kind: 'failed' });
    setStatus({ kind: 'ready', pdf: result.value, url: URL.createObjectURL(result.value.blob) });
  };

  const send = async (prefer: 'share' | 'download') => {
    if (status.kind !== 'ready') return;
    const r = await share.shareFile({ data: status.pdf.blob, fileName: status.pdf.fileName, mimeType: 'application/pdf', title: title || status.pdf.fileName }, { prefer });
    if (r.outcome === 'shared') showToast({ message: t('pdf.shared'), duration: 2500 });
    else if (r.outcome === 'downloaded') showToast({ message: t('pdf.downloaded'), duration: 2500 });
    else if (r.outcome === 'failed') showToast({ message: t('pdf.shareFailed') });
  };

  const back = client && params.get('client') ? { to: `/clients/${client.id}`, label: client.name } : { to: '/more', label: t('screens.more.title') };
  const progressText = (p: PdfRenderProgress | null) =>
    !p ? t('pdf.generating') : p.phase === 'pages' ? t('pdf.phases.pages', { done: p.done, total: p.total }) : t(`pdf.phases.${p.phase}`);

  return (
    <div className={styles.screen}>
      <PageHeader
        title={t('pdf.title')}
        back={back}
        actions={<IconButton icon="palette" label={t('pdf.design')} onClick={() => setSheet('branding')} />}
      />

      <section className={styles.block}>
        <Select
          label={t('pdf.client')}
          value={clientId}
          onChange={setClientId}
          options={[{ value: NONE, label: t('pdf.noClient') }, ...(clients ?? []).map((c) => ({ value: c.id as string, label: c.name }))]}
        />
        <Select
          label={t('pdf.preset')}
          value={preset}
          onChange={choosePreset}
          options={[
            ...PDF_PRESET_IDS.map((id) => ({ value: id as string, label: t(`pdf.presets.${id}`) })),
            ...(templates ?? []).map((tpl) => ({ value: tpl.id as string, label: `${t('pdf.savedTemplates')}: ${tpl.name}` })),
          ]}
        />
        {client && programs && !program && enabled.includes('program') && <p className={styles.warn}>{t('pdf.noProgram')}</p>}
      </section>

      <section className={styles.block} aria-labelledby="sec-title">
        <h2 id="sec-title" className={styles.title}>
          {t('pdf.sections')}
        </h2>
        <p className={styles.hint}>{t('pdf.sectionsHint')}</p>
        <ol className={styles.sections}>
          {order.map((s, i) => {
            const on = enabled.includes(s);
            const name = t(`pdf.doc.sections.${s}`);
            return (
              <li key={s} className={cx(styles.section, !on && styles.sectionOff)}>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={on} onChange={() => setEnabled((e) => (on ? e.filter((x) => x !== s) : [...e, s]))} />
                  <span>{name}</span>
                </label>
                <IconButton icon="chevronDown" tone="muted" className={styles.up} label={t('pdf.moveUp', { name })} disabled={i === 0} onClick={() => move(s, -1)} />
                <IconButton icon="chevronDown" tone="muted" label={t('pdf.moveDown', { name })} disabled={i === order.length - 1} onClick={() => move(s, 1)} />
              </li>
            );
          })}
        </ol>
        <Button size="small" variant="plain" icon="addSquare" onClick={() => setSheet('saveTemplate')}>
          {t('pdf.saveTemplate')}
        </Button>
      </section>

      <section className={styles.block}>
        <TextField label={`${t('pdf.docTitle')} (${t('common.optional')})`} placeholder={t('pdf.docTitlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label={`${t('pdf.subtitle')} (${t('common.optional')})`} placeholder={t('pdf.subtitlePlaceholder')} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        <TextArea label={`${t('pdf.notes')} (${t('common.optional')})`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {status.kind === 'ready' && (
        <section className={styles.block} aria-live="polite">
          <p className={styles.ready}>
            <Icon name="check" />
            {t('pdf.ready', { n: status.pdf.pageCount })}
          </p>
          <iframe className={styles.preview} src={status.url} title={t('pdf.preview')} />
        </section>
      )}
      {status.kind === 'failed' && <p className={styles.warn}>{t('pdf.failed')}</p>}

      <nav className={styles.actionbar} aria-label={t('pdf.title')}>
        {status.kind === 'working' ? (
          <>
            <p className={styles.progress} role="status">
              {progressText(status.progress)}
              {status.progress && status.progress.total > 0 && (
                <span className={styles.bar} aria-hidden="true">
                  <i style={{ inlineSize: `${Math.round((status.progress.done / status.progress.total) * 100)}%` }} />
                </span>
              )}
            </p>
            <Button variant="secondary" onClick={() => abort.current?.abort()}>
              {t('pdf.cancel')}
            </Button>
          </>
        ) : status.kind === 'ready' ? (
          <>
            <Button variant="secondary" icon="file" onClick={() => void send('download')}>
              {t('pdf.download')}
            </Button>
            <Button size="large" icon="share" className={styles.primary} onClick={() => void send('share')}>
              {t('pdf.share')}
            </Button>
          </>
        ) : (
          <Button size="large" icon="file" className={styles.primary} disabled={!settings || !branding || catalog === undefined} onClick={() => void generate()}>
            {t('pdf.generate')}
          </Button>
        )}
      </nav>

      {sheet === 'branding' && branding && (
        <BrandingSheet
          initial={branding}
          onClose={(changed) => {
            setSheet(null);
            if (changed) {
              setBrandingVersion((v) => v + 1);
              setStatus({ kind: 'idle' });
            }
          }}
        />
      )}
      {sheet === 'saveTemplate' && (
        <SaveTemplateSheet
          onClose={() => setSheet(null)}
          onSave={async (name) => {
            const created = await repos.pdfTemplates.create({ ...presetTemplate('full_program', name), sections: sections.length > 0 ? sections : ['cover'] });
            setPreset(created.id);
            setSheet(null);
            showToast({ message: t('pdf.templateSaved'), duration: 2500 });
          }}
        />
      )}
    </div>
  );
}

function SaveTemplateSheet({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('pdf.saveTemplate')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <button type="button" className={styles.sheetSave} disabled={!name.trim()} onClick={() => void onSave(name.trim())}>
          {t('common.save')}
        </button>
      }
    >
      <TextField label={t('pdf.templateName')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
    </Sheet>
  );
}

