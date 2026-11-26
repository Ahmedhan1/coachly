import type { AppServices } from '@/app/services';
import { NutritionStore } from '@/data/nutritionStore';
import { bestLifts, buildShareDocument, nextProgramDay, shareExtras, type ShareDocumentV1 } from '@/domain/clientPage';
import type { Client, MealPlan } from '@/domain/models';
import { getLocale, t } from '@/i18n';
import { newClientShare } from '@/services/clientPage/clientPageService';
import { ExerciseLibraryStore } from '@/data/exerciseLibraryStore';
import { mergeCatalog, type CatalogExercise } from '@/domain/exercises';
import { mealItemRows } from '@/domain/meals';
import { loadBuiltinCatalog } from '@/app/catalog';
import { exerciseName } from '@/i18n/programNames';
import { clientNoteText } from '@/domain/programs/tailor';
import { clientPageLogo, clientPageTrainerPhoto } from '@/features/identity/brandAssets';
import { readShare, saveShare, type ShareRecord } from '@/data/prefs/online';

/** Meal items as client-page lines: exact grams per food when the item came from the gram planner. */
const itemRows = (i: MealPlan['meals'][number]['items'][number], recipeName: ReadonlyMap<string, string>): string[] =>
  mealItemRows(i, { name: i.recipeId ? (recipeName.get(i.recipeId) ?? '') : '', units: { g: t('nutrition.units.g'), kcal: t('nutrition.units.kcal') }, english: getLocale() === 'en' });

const mealsOf = (plan: MealPlan, recipeName: ReadonlyMap<string, string>): ShareDocumentV1['meals'] =>
  plan.meals.slice(0, 12).map((m) => {
    const meal: ShareDocumentV1['meals'][number] = {
      title: m.name.slice(0, 80) || '—',
      items: m.items
        .flatMap((i) => itemRows(i, recipeName))
        .slice(0, 30)
        .map((s) => s.trim().slice(0, 200))
        .filter(Boolean),
    };
    if (m.time) meal.time = m.time;
    // The meal's random id (never a name) lets the client's pick come back in his check-in.
    meal.id = m.id;
    // Other ways to eat this meal (same numbers): the client picks one on his page.
    const options = (m.options ?? [])
      .slice(0, 3)
      .map((o) => ({ items: o.items.flatMap((i) => itemRows(i, recipeName)).slice(0, 30).map((s) => s.trim().slice(0, 200)).filter(Boolean) }))
      .filter((o) => o.items.length > 0);
    if (options.length > 0) {
      meal.options = options;
      // Lets the client's pick come back with his check-in (a random id, no personal data).
      meal.id = m.id.slice(0, 64);
    }
    return meal;
  });

/** The pack with the trainer's renames and custom exercises (hidden ones kept so old programs keep their names). */
async function loadClientCatalog(services: AppServices): Promise<CatalogExercise[] | null> {
  const store = new ExerciseLibraryStore(services.data.repos, services.meta);
  const [builtin, changes] = await Promise.all([loadBuiltinCatalog(), store.changes().catch(() => null)]);
  if (builtin === null || changes === null) return builtin;
  return mergeCatalog(builtin, { custom: changes.custom, overrides: changes.overrides.map((o) => ({ ...o, hidden: false })) });
}

/**
 * Everything the client's page shows, from this phone's data: program (with the next day), meals for each
 * plan, supplements as the trainer typed them, targets, progress series, sessions, streak, best lifts and
 * the client's own check-ins. Only the first name leaves the device, and only encrypted.
 */
export async function buildClientShareDoc(services: AppServices, client: Client, checkinsEnabled: boolean, now: number): Promise<ShareDocumentV1> {
  const { meta } = services;
  const repos = services.data.repos;
  const store = new NutritionStore(meta, repos);
  const [settings, programs, plans, recipes, rows, supplements, catalog, progress, sessions, logs, calc, logo, trainerPhoto] = await Promise.all([
    repos.settings.get(),
    repos.programs.listByClient(client.id),
    repos.mealPlans.listByClient(client.id),
    repos.recipes.list(),
    store.getClientSupplements(client.id),
    repos.supplements.list(),
    loadClientCatalog(services),
    repos.progress.listByClient(client.id),
    repos.sessions.listByClient(client.id),
    repos.workoutLogs.listByClient(client.id),
    store.getCalculation(client.id).catch(() => null),
    clientPageLogo(services).catch(() => null),
    clientPageTrainerPhoto(services).catch(() => null),
  ]);
  const program = [...programs].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  const byEx = new Map((catalog ?? []).map((e) => [e.id, e]));
  const exName = (id: string) => exerciseName(byEx.get(id), id);
  const recipeName = new Map(recipes.map((r) => [r.id as string, getLocale() === 'en' && r.nameEn ? r.nameEn : r.name]));
  const supp = new Map(supplements.map((s) => [s.id as string, s]));
  const sortedPlans = [...plans].sort((a, b) => a.createdAt - b.createdAt);
  const goalTitle = t(`pdf.doc.client.goals.${client.goal}`);
  return buildShareDocument({
    now,
    trainerName: settings.name,
    color: settings.primaryColor,
    logo,
    trainerPhoto,
    client,
    program,
    exercise: (id) => {
      const img = byEx.get(id)?.images[0];
      const note = clientNoteText(client.exerciseNotes?.[id], t('clientDetail.kg'));
      return { name: exName(id), imageFile: img?.kind === 'pack' ? (img.path.split('/').pop() ?? null) : null, ...(note ? { note } : {}) };
    },
    dayTitle: (i, name) => `${t('training.programs.builder.dayDefault', { n: i + 1 })}${name ? ` — ${name}` : ''}`,
    mealPlan: sortedPlans[0] ?? null,
    mealItem: (item) => itemRows(item, recipeName).join(' · '),
    supplements: rows.flatMap((r) => {
      const s = supp.get(r.supplementId);
      return s ? [{ name: s.name, dose: r.dose, timing: r.timing, notes: r.notes }] : [];
    }),
    notes: program?.notes ?? '',
    checkinsEnabled,
    extras: {
      ...shareExtras({ now, progress, sessions }),
      ...(getLocale() === 'en' ? { lang: 'en' as const } : {}),
      goal: client.goalNote ? { title: goalTitle, note: client.goalNote } : { title: goalTitle },
      ...(calc
        ? { targets: { kcal: calc.targetKcal, proteinG: calc.proteinG, carbG: calc.carbG, fatG: calc.fatG, waterMinMl: calc.waterMinMl, waterMaxMl: calc.waterMaxMl } }
        : {}),
      ...(sortedPlans.length > 1
        ? { mealDays: sortedPlans.slice(0, 7).map((p) => ({ title: p.name, ...(p.targetKcal !== null ? { kcal: p.targetKcal } : {}), meals: mealsOf(p, recipeName) })) }
        : {}),
      records: bestLifts(logs, exName),
      ...(client.package ? { package: { left: client.remainingSessions, total: client.package.totalSessions, ...(client.endDate ? { endDate: client.endDate } : {}) } } : {}),
      ...(program ? { nextDay: nextProgramDay(program, logs) } : {}),
    },
  });
}

/** Stable fingerprint of a document, ignoring its timestamp (so an unchanged page is not re-uploaded). */
export async function docFingerprint(doc: ShareDocumentV1): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...doc, updatedAt: 0 }));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export type PublishResult = 'published' | 'unchanged' | 'failed' | 'unavailable';

/** Builds and uploads one client's page (creating the link on first use). Never throws. */
export async function publishClientPage(services: AppServices, client: Client, options: { checkinsEnabled?: boolean; force?: boolean; now?: number } = {}): Promise<PublishResult> {
  const page = services.online?.clientPage;
  if (!page?.available) return 'unavailable';
  try {
    const now = options.now ?? Date.now();
    const existing = await readShare(services.meta, client.id);
    const checkinsEnabled = options.checkinsEnabled ?? existing?.checkinsEnabled ?? true;
    const record: ShareRecord = existing ?? { ...newClientShare(), checkinsEnabled, publishedAt: null };
    const doc = await buildClientShareDoc(services, client, checkinsEnabled, now);
    const hash = await docFingerprint(doc);
    if (!options.force && existing?.publishedAt && existing.docHash === hash && existing.checkinsEnabled === checkinsEnabled) return 'unchanged';
    const r = await page.publish(record, doc);
    if (!r.ok) return 'failed';
    await saveShare(services.meta, client.id, { ...record, checkinsEnabled, publishedAt: now, docHash: hash });
    return 'published';
  } catch {
    return 'failed';
  }
}

/**
 * Re-uploads every published page whose content changed (program, meals, progress, sessions, logo…).
 * Pages that fail stay as they were and are retried on the next run (golden rule: quiet, retried later).
 */
export async function republishChangedPages(services: AppServices, now = Date.now()): Promise<number> {
  if (!services.online?.clientPage.available) return 0;
  const clients = await services.data.repos.clients.list();
  let published = 0;
  for (const client of clients) {
    const share = await readShare(services.meta, client.id);
    if (!share?.publishedAt) continue;
    if ((await publishClientPage(services, client, { now })) === 'published') published++;
  }
  return published;
}

/**
 * Cheap signature of the data a published page shows, for a live query: when it changes the app republishes
 * (debounced). Reads only the clients that have a page.
 */
export async function pagesSignature(services: AppServices): Promise<string> {
  const repos = services.data.repos;
  const clients = await repos.clients.list();
  const parts: string[] = [];
  const settings = await repos.settings.get();
  parts.push(`${settings.name}|${settings.primaryColor}|${settings.logoImageId ?? ''}|${settings.photoImageId ?? ''}`);
  for (const c of clients) {
    const share = await readShare(services.meta, c.id);
    if (!share?.publishedAt) continue;
    const [programs, plans, progress, sessions, logs] = await Promise.all([
      repos.programs.listByClient(c.id),
      repos.mealPlans.listByClient(c.id),
      repos.progress.listByClient(c.id),
      repos.sessions.listByClient(c.id),
      repos.workoutLogs.listByClient(c.id),
    ]);
    const latest = (xs: ReadonlyArray<{ updatedAt: number }>) => xs.reduce((m, x) => Math.max(m, x.updatedAt), 0);
    parts.push(`${c.id}:${c.updatedAt}:${latest(programs)}:${latest(plans)}:${progress.length}/${latest(progress)}:${sessions.length}/${latest(sessions)}:${logs.length}/${latest(logs)}`);
  }
  return parts.join(';');
}
