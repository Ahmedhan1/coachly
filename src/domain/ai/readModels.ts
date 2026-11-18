import { daysBetween, subscriptionAttention, type Client, type MealPlan, type Payment, type Program, type ProgressEntry, type Recipe } from '../models';
import { mealItemText } from '../meals/mealItemText';
import type { Task } from './tasks';

/**
 * Compact, privacy-minimal views of the trainer's data for the assistant's read tools.
 * Never includes phone numbers, photos or image ids. Names can be cut to the first name.
 */

export interface PrivacyOptions {
  firstNamesOnly: boolean;
}

export function displayName(name: string, opts: PrivacyOptions): string {
  const n = name.trim();
  return opts.firstNamesOnly ? (n.split(/\s+/)[0] ?? n) : n;
}

const money = (minor: number) => Math.round(minor) / 100;

export function clientsView(clients: readonly Client[], today: string, opts: PrivacyOptions, query = '') {
  const q = query.trim();
  return clients
    .filter((c) => !q || c.name.includes(q))
    .slice(0, 80)
    .map((c) => {
      const a = subscriptionAttention(c, today);
      return { id: c.id, name: displayName(c.name, opts), goal: c.goal, sessionsLeft: c.package ? c.remainingSessions : null, endDate: c.endDate, status: a?.kind ?? 'ok' };
    });
}

export function clientDetailView(
  c: Client,
  rel: { programs: readonly Program[]; mealPlans: readonly MealPlan[]; payments: readonly Payment[]; progress: readonly ProgressEntry[] },
  today: string,
  opts: PrivacyOptions,
) {
  const due = rel.payments.filter((p) => p.status === 'due');
  const last = [...rel.progress].sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    id: c.id,
    name: displayName(c.name, opts),
    hasPhone: c.phone.trim().length > 0,
    gender: c.gender,
    birthDate: c.birthDate,
    goal: c.goal,
    goalNote: c.goalNote,
    injuries: c.injuries,
    measurements: c.measurements,
    package: c.package ? { name: c.package.name, totalSessions: c.package.totalSessions, price: money(c.package.priceMinor), currency: c.package.currency } : null,
    sessionsLeft: c.remainingSessions,
    startDate: c.startDate,
    endDate: c.endDate,
    status: subscriptionAttention(c, today)?.kind ?? 'ok',
    notes: c.notes.slice(0, 800),
    programs: rel.programs.map((p) => ({ id: p.id, name: p.name, days: p.days.length })),
    mealPlans: rel.mealPlans.map((m) => ({ id: m.id, name: m.name, targetKcal: m.targetKcal })),
    balanceDue: money(due.reduce((s, p) => s + p.amountMinor, 0)),
    lastCheckIn: last ? { date: last.date, weightKg: last.measurements.weightKg ?? null } : null,
  };
}

export interface LocalTime {
  date: string;
  time: string;
}

export function sessionsView(
  sessions: ReadonlyArray<{ id: string; clientId: string; startsAt: number; durationMin: number; attendance: string }>,
  clients: ReadonlyMap<string, Pick<Client, 'name'>>,
  toLocal: (ms: number) => LocalTime,
  opts: PrivacyOptions,
) {
  return [...sessions]
    .sort((a, b) => a.startsAt - b.startsAt)
    .flatMap((s) => {
      const c = clients.get(s.clientId);
      if (!c) return [];
      const l = toLocal(s.startsAt);
      return [{ id: s.id, clientId: s.clientId, client: displayName(c.name, opts), date: l.date, time: l.time, durationMin: s.durationMin, attendance: s.attendance }];
    });
}

/** Unpaid charges grouped by client (most late first) plus subscriptions needing renewal. */
export function overdueView(clients: readonly Client[], payments: readonly Payment[], today: string, opts: PrivacyOptions) {
  const byClient = new Map<string, Payment[]>();
  for (const p of payments) if (p.status === 'due') byClient.set(p.clientId, [...(byClient.get(p.clientId) ?? []), p]);
  const unpaid = clients
    .flatMap((c) => {
      const list = byClient.get(c.id);
      if (!list?.length) return [];
      const oldest = list.map((p) => p.dueOn ?? today).sort()[0] ?? today;
      return [{ clientId: c.id, client: displayName(c.name, opts), amountDue: money(list.reduce((s, p) => s + p.amountMinor, 0)), currency: list[0]?.currency ?? '', oldestDueOn: oldest, daysLate: Math.max(0, daysBetween(oldest, today)) }];
    })
    .sort((a, b) => b.daysLate - a.daysLate || b.amountDue - a.amountDue);
  const renewals = clients.flatMap((c) => {
    const a = subscriptionAttention(c, today);
    return a ? [{ clientId: c.id, client: displayName(c.name, opts), ...a }] : [];
  });
  return { unpaid, renewals };
}

export function programsView(programs: readonly Program[], exerciseName: (id: string) => string) {
  return programs.slice(0, 40).map((p) => ({
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    isTemplate: p.isTemplate,
    days: p.days.map((d) => ({ name: d.name, exercises: d.items.map((i) => `${exerciseName(i.exerciseId)} ${i.sets}x${i.reps}`) })),
  }));
}

export function mealPlansView(plans: readonly MealPlan[], recipeName: (id: string) => string) {
  return plans.slice(0, 30).map((m) => ({
    id: m.id,
    name: m.name,
    clientId: m.clientId,
    targetKcal: m.targetKcal,
    // Items from the gram planner carry exact grams per food; the assistant sees them ("رز أبيض مطبوخ 150 g").
    meals: m.meals.map((meal) => ({
      name: meal.name,
      time: meal.time,
      items: meal.items.map((i) => (i.lines?.length ? mealItemText(i, { name: i.recipeId ? recipeName(i.recipeId) : '', units: { g: 'g', kcal: 'kcal' } }) : i.recipeId ? recipeName(i.recipeId) : i.text)),
    })),
  }));
}

export function progressView(entries: readonly ProgressEntry[]) {
  return [...entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12)
    .map((e) => ({ date: e.date, ...e.measurements, notes: e.notes.slice(0, 200) }));
}

export interface ExerciseLite {
  id: string;
  nameAr: string;
  nameEn: string;
  primaryMuscles: readonly string[];
  equipment: string;
}

export function exercisesView(catalog: readonly ExerciseLite[], query: string, muscle: string, limit = 30) {
  const q = query.trim().toLowerCase();
  const m = muscle.trim().toLowerCase();
  return catalog
    .filter((e) => (!q || e.nameAr.includes(q) || e.nameEn.toLowerCase().includes(q)) && (!m || e.primaryMuscles.some((x) => x.toLowerCase().includes(m))))
    .slice(0, limit)
    .map((e) => ({ id: e.id, nameAr: e.nameAr, nameEn: e.nameEn, muscles: e.primaryMuscles, equipment: e.equipment }));
}

export function foodsView(recipes: readonly Recipe[], ingredients: ReadonlyArray<{ name: string; per100g: { kcal: number; proteinG: number; carbG: number; fatG: number } }>, query: string, limit = 40) {
  const q = query.trim();
  const sum = (r: Recipe, k: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') => Math.round(r.ingredients.reduce((s, i) => s + (i[k] ?? 0), 0) / r.servings);
  return {
    recipes: recipes
      .filter((r) => !q || r.name.includes(q))
      .slice(0, limit)
      .map((r) => ({ id: r.id, name: r.name, servings: r.servings, perServing: { kcal: sum(r, 'kcal'), proteinG: sum(r, 'proteinG'), carbsG: sum(r, 'carbsG'), fatG: sum(r, 'fatG') } })),
    foodsPer100g: ingredients
      .filter((i) => !q || i.name.includes(q))
      .slice(0, limit)
      .map((i) => ({ name: i.name, ...i.per100g })),
  };
}

export function tasksView(tasks: readonly Task[]) {
  return tasks.slice(-60).map((t) => ({ id: t.id, title: t.title, due: t.due, done: t.done }));
}
