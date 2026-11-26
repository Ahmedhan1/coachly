import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { NutritionStore } from '@/data/nutritionStore';
import { pdfSectionSchema, toIsoDate, type PdfSection } from '@/domain/models';
import { normalizeSections, PDF_PRESET_IDS, PDF_PRESETS, presetTemplate, type PdfPresetId } from '@/domain/pdf';
import { whatsappLink } from '@/domain/whatsapp';
import { t } from '@/i18n';
import { formatBytes } from '@/ui/format';
import { Button, Icon, IconButton, PageHeader, Select, Sheet, TextArea, TextField, TitleIcon, cx } from '@/ui';
import { createImageSource, HtmlPdfRenderer, type PdfRenderProgress, type RenderedPdf } from '@/services/pdf';
import { BrowserShareService } from '@/services/share';
import { useExerciseCatalog } from '@/features/programs/catalog';
import { buildPdfInput } from './buildPdfInput';
import { muscleMapRefs } from './muscleMapImage';
import { BrandingSheet } from './BrandingSheet';
import { readPdfBranding } from './pdfBranding';
import styles from './Pdf.module.css';
import { PdfArchive } from './PdfArchive';
import { queueBytesCopy } from '@/features/files/cloudCopies';

const ALL_SECTIONS = pdfSectionSchema.options;
const NONE = '__none__';

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; progress: PdfRenderProgress | null }
  | { kind: 'ready'; pdf: RenderedPdf; url: string; previews: string[] }
  | { kind: 'failed' };

/** What happened after "send": a download the trainer has to attach in WhatsApp themselves. */
type Sent = null | { kind: 'fallback' | 'downloaded'; fileName: string };

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
  const [rawStatus, setStatus] = useState<Status>({ kind: 'idle' });
  /** The options the current file was made from. */
  const [madeFor, setMadeFor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'branding' | 'saveTemplate'>(null);
  const abort = useRef<AbortController | null>(null);

  const client = clients?.find((c) => c.id === clientId) ?? null;
  const sections = order.filter((s) => enabled.includes(s));
  // A change of client, sections, texts or design makes a ready (or failed) file stale: «اعمل الملف» shows again.
  const optionsKey = JSON.stringify([clientId, sections, title, subtitle, notes, brandingVersion]);
  const status: Status = (rawStatus.kind === 'ready' || rawStatus.kind === 'failed') && madeFor !== optionsKey ? { kind: 'idle' } : rawStatus;
  const programs = useLive(() => (client ? repos.programs.listByClient(client.id) : Promise.resolve([])), [repos, client]);
  const program = [...(programs ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

  const statusUrl = status.kind === 'ready' ? status.url : null;
  const statusPreviews = status.kind === 'ready' ? status.previews : null;
  useEffect(() => () => void (statusUrl && URL.revokeObjectURL(statusUrl)), [statusUrl]);
  useEffect(() => () => statusPreviews?.forEach((u) => URL.revokeObjectURL(u)), [statusPreviews]);
  const [sent, setSent] = useState<Sent>(null);

  const share = useMemo(() => new BrowserShareService(), []);
  const archived = useRef(new WeakSet<RenderedPdf>());
  // Android Chrome (and desktop browsers) often cannot hand a PDF to the share sheet: say so up front.
  const canSharePdf = useMemo(
    () => share.canShareFiles({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), fileName: 'probe.pdf', mimeType: 'application/pdf' }),
    [share],
  );

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

  const generate = async () => {
    if (!settings || !branding) return;
    if (sections.length === 0) return showToast({ message: t('pdf.noSections') });
    // Without a program the exercise sections are dropped; nothing left would only end in a vague failure.
    const usable = program ? sections : sections.filter((s) => s !== 'program' && s !== 'muscle_map');
    if (usable.length === 0) return showToast({ message: t('pdf.noProgram') });
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setMadeFor(optionsKey);
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
    // Muscle pictures for the muscle-map column, and always for exercises without a photo (they stand in for it).
    const withMaps = sections.includes('muscle_map');
    const needMaps = withMaps ? usedExercises : usedExercises.filter((e) => e.images.length === 0);
    const muscleMaps = program && needMaps.length > 0 ? await muscleMapRefs(needMaps, settings.primaryColor) : undefined;
    const input = buildPdfInput({
      muscleMaps,
      sections: usable,
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
    if (!result.ok) {
      // Nothing to print (e.g. only sections this client has no data for yet): say so instead of a vague failure.
      if (result.error === 'no_pages') {
        setStatus({ kind: 'idle' });
        return showToast({ message: t('pdf.emptySections') });
      }
      return setStatus({ kind: 'failed' });
    }
    setSent(null);
    setStatus({
      kind: 'ready',
      pdf: result.value,
      url: URL.createObjectURL(result.value.blob),
      previews: (result.value.previews ?? []).map((b) => URL.createObjectURL(b)),
    });
  };

  const send = async (prefer: 'share' | 'download') => {
    if (status.kind !== 'ready') return;
    const r = await share.shareFile(
      {
        data: status.pdf.blob,
        fileName: status.pdf.fileName,
        mimeType: 'application/pdf',
        title: title || status.pdf.fileName,
        downloadName: `pt-program-${toIsoDate(new Date())}.pdf`,
      },
      { prefer },
    );
    if (r.outcome === 'shared' || r.outcome === 'downloaded') {
      // Sent to the client: keep an encrypted cloud copy (once per rendered file).
      if (!archived.current.has(status.pdf)) {
        archived.current.add(status.pdf);
        const bytes = new Uint8Array(await status.pdf.blob.arrayBuffer());
        await queueBytesCopy(services, 'pdf', crypto.randomUUID().replace(/-/g, ''), bytes, 'application/pdf', status.pdf.fileName).catch(() => undefined);
      }
    }
    if (r.outcome === 'shared') {
      setSent(null);
      showToast({ message: t('pdf.shared'), duration: 2500 });
    } else if (r.outcome === 'downloaded') {
      setSent({ kind: r.fallback ? 'fallback' : 'downloaded', fileName: r.fileName ?? status.pdf.fileName });
      showToast({ message: t('pdf.downloaded'), duration: 2500 });
    } else if (r.outcome === 'failed') showToast({ message: t('pdf.shareFailed') });
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
        <h2 id="sec-title" className={styles.title}><TitleIcon name="list" />
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
            <span className={styles.size}>{t('pdf.readySize', { size: formatBytes(status.pdf.blob.size) })}</span>
          </p>
          {status.previews.length > 0 ? (
            <ol className={styles.pages} aria-label={t('pdf.preview')}>
              {status.previews.map((u, i) => (
                <li key={u}>
                  <img src={u} alt={t('pdf.previewPage', { n: i + 1 })} loading="lazy" decoding="async" />
                </li>
              ))}
            </ol>
          ) : (
            <a className={styles.openLink} href={status.url} target="_blank" rel="noopener">
              {t('pdf.open')}
            </a>
          )}
          {sent && (
            <div className={styles.help} role="status">
              <p className={styles.helpTitle}>{sent.kind === 'fallback' ? t('pdf.fallbackTitle') : t('pdf.downloaded')}</p>
              <p>{sent.kind === 'fallback' ? t('pdf.fallbackBody', { name: sent.fileName }) : t('pdf.downloadedBody', { name: sent.fileName })}</p>
              <p>{t('pdf.fallbackSteps')}</p>
              <a className={styles.whatsapp} href={whatsappLink(client?.phone ?? '', client ? t('pdf.whatsappText', { name: client.name.split(/\s+/)[0] ?? '' }) : '')} target="_blank" rel="noopener">
                <Icon name="share" />
                {client ? t('pdf.openWhatsapp', { name: client.name }) : t('pdf.openWhatsappNoClient')}
              </a>
            </div>
          )}
        </section>
      )}
      {status.kind === 'failed' && <p className={styles.warn}>{t('pdf.failed')}</p>}

      <PdfArchive share={share} />

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
              {canSharePdf ? t('pdf.share') : t('pdf.downloadAndSend')}
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
        <Button size="small" disabled={!name.trim()} onClick={() => void onSave(name.trim())}>
          {t('common.save')}
        </Button>
      }
    >
      <TextField label={t('pdf.templateName')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
    </Sheet>
  );
}

