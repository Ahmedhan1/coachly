import type { Repositories } from '@/data';
import {
  clientDetailView,
  clientsView,
  exercisesView,
  foodsView,
  mealPlansView,
  overdueView,
  programsView,
  progressView,
  resolveClient,
  sessionsView,
  tasksView,
  type ClientRef,
  type PlanContext,
  type PrivacyOptions,
  type ReadCall,
} from '@/domain/ai';
import { addDays, type Client } from '@/domain/models';
import type { ZonedClock } from '@/domain/schedule';
import { loadBuiltinCatalog } from '@/features/programs/catalog';
import type { MetaStore } from '@/services/meta/metaStore';
import { readTasks } from './aiSettings';

/**
 * The assistant's view of the trainer's data, read on the device. Read tools return compact JSON with no
 * phones or photos (domain readModels); only what the model asked for is sent.
 */

const DAY_MS = 86_400_000;

export interface LocalNow {
  today: string;
  time: string;
  /** 0 = Sunday. */
  weekday: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

export function localNow(clock: ZonedClock, now: Date): LocalNow {
  const l = clock.toLocal(now.getTime());
  const [y, m, d] = l.date.split('-').map(Number) as [number, number, number];
  return { today: l.date, time: hhmm(l.minute), weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

export function toEpoch(clock: ZonedClock, date: string, time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return clock.toEpochMs({ date, minute: h * 60 + m });
}

export const clientRef = (c: Client): ClientRef => ({
  id: c.id,
  name: c.name,
  notes: c.notes,
  pkg: c.package ? { totalSessions: c.package.totalSessions, priceMinor: c.package.priceMinor, currency: c.package.currency, startDate: c.startDate, endDate: c.endDate, remainingSessions: c.remainingSessions } : null,
});

export async function buildPlanContext(repos: Repositories, clock: ZonedClock, now: Date): Promise<PlanContext> {
  const [clients, sessions, settings] = await Promise.all([repos.clients.list(), repos.sessions.listBetween(now.getTime() - 7 * DAY_MS, now.getTime() + 90 * DAY_MS), repos.settings.get()]);
  return {
    clients: clients.map(clientRef),
    sessions: sessions.filter((s) => s.attendance !== 'cancelled').map((s) => ({ id: s.id, clientId: s.clientId, startsAt: s.startsAt, durationMin: s.durationMin })),
    currency: settings.currency,
    today: localNow(clock, now).today,
    toEpoch: (date, time) => toEpoch(clock, date, time),
    now: now.getTime(),
  };
}

export interface ReadEnv {
  repos: Repositories;
  meta: MetaStore;
  clock: ZonedClock;
  now: Date;
  privacy: PrivacyOptions;
}

async function findClient(repos: Repositories, ref: string): Promise<Client | null> {
  const direct = await repos.clients.get(ref);
  if (direct) return direct;
  const all = await repos.clients.list();
  const r = resolveClient(ref, all.map(clientRef));
  return r.ok ? (all.find((c) => c.id === r.value.id) ?? null) : null;
}

async function exerciseNames(): Promise<Map<string, string>> {
  const catalog = (await loadBuiltinCatalog()) ?? [];
  return new Map(catalog.map((e) => [e.id, e.nameAr || e.nameEn]));
}

/** Runs one read tool against the repositories. Errors become `{ error }` for the model. */
export async function runReadTool(call: ReadCall, env: ReadEnv): Promise<unknown> {
  const { repos, privacy } = env;
  const { today } = localNow(env.clock, env.now);
  switch (call.name) {
    case 'list_clients':
      return clientsView(await repos.clients.list(), today, privacy, call.args.query);
    case 'get_client': {
      const c = await findClient(repos, call.args.clientId);
      if (!c) return { error: 'unknown_client' };
      const [programs, mealPlans, payments, progress] = await Promise.all([repos.programs.listByClient(c.id), repos.mealPlans.listByClient(c.id), repos.payments.listByClient(c.id), repos.progress.listByClient(c.id)]);
      return clientDetailView(c, { programs, mealPlans, payments, progress }, today, privacy);
    }
    case 'list_sessions': {
      const startDay = call.args.range === 'tomorrow' ? addDays(today, 1) : today;
      const endDay = call.args.range === 'week' ? addDays(today, 7) : addDays(startDay, 1);
      const start = env.clock.toEpochMs({ date: startDay, minute: 0 });
      const end = env.clock.toEpochMs({ date: endDay, minute: 0 });
      const [sessions, clients] = await Promise.all([repos.sessions.listBetween(start, end), repos.clients.list()]);
      const toLocal = (ms: number) => {
        const l = env.clock.toLocal(ms);
        return { date: l.date, time: hhmm(l.minute) };
      };
      return sessionsView(
        sessions.filter((s) => s.attendance !== 'cancelled'),
        new Map(clients.map((c) => [c.id, c])),
        toLocal,
        privacy,
      );
    }
    case 'overdue_payments':
      return overdueView(await repos.clients.list(), await repos.payments.listDue(), today, privacy);
    case 'packages_ending':
      return overdueView(await repos.clients.list(), [], today, privacy).renewals;
    case 'list_programs': {
      const ref = call.args.clientId;
      const c = ref ? await findClient(repos, ref) : null;
      if (ref && !c) return { error: 'unknown_client' };
      const programs = c ? await repos.programs.listByClient(c.id) : await repos.programs.list();
      const names = await exerciseNames();
      return programsView(programs, (id) => names.get(id) ?? id);
    }
    case 'list_meal_plans': {
      const ref = call.args.clientId;
      const c = ref ? await findClient(repos, ref) : null;
      if (ref && !c) return { error: 'unknown_client' };
      const plans = c ? await repos.mealPlans.listByClient(c.id) : await repos.mealPlans.list();
      const recipes = new Map<string, string>((await repos.recipes.list()).map((r) => [r.id, r.name]));
      return mealPlansView(plans, (id) => recipes.get(id) ?? '');
    }
    case 'client_progress': {
      const c = await findClient(repos, call.args.clientId);
      if (!c) return { error: 'unknown_client' };
      return progressView(await repos.progress.listByClient(c.id));
    }
    case 'search_exercises': {
      const catalog = (await loadBuiltinCatalog()) ?? [];
      return exercisesView(catalog, call.args.query, call.args.muscle);
    }
    case 'list_foods':
      return foodsView(await repos.recipes.list(), [], call.args.query);
    case 'list_tasks':
      return tasksView(await readTasks(env.meta));
  }
}
