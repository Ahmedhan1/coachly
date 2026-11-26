import { reachedClientLimit } from '@/features/clients/clientLimit';
import type { AppServices } from '@/app/services';
import type { AiError, ProposedAction } from '@/domain/ai';
import type { ClientId } from '@/domain/models';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { ZonedClock } from '@/domain/schedule';
import { createScheduleWriter } from '@/features/schedule/scheduleWriter';
import { t } from '@/i18n';
import type { AiConfig, AiService } from '@/services/ai/aiService';
import { tasksRepo } from './aiSettings';
import { localNow } from './assistantData';
import { draftMealDay, draftProgram } from './drafts';

/**
 * Runs ONE proposal the trainer confirmed with «نفّذ». Nothing else in the assistant writes data.
 * Every write returns an undo where the data layer supports it (soft delete / restore / previous values).
 */

export type Undo = () => Promise<void>;
export type ExecError = 'not_found' | 'no_package' | 'invalid' | 'client_limit' | AiError;

export interface Executed {
  undo: Undo | null;
  /** Screen to open afterwards (drafts the trainer reviews). */
  navigateTo: string | null;
  /** Fact for the model's next turn (English, ids only, no names). */
  note: string;
  /** Exercises the program draft dropped because they are not in the library. */
  dropped: number;
}

export interface ExecDeps {
  services: AppServices;
  clock: ZonedClock;
  now: Date;
  /** Only needed for program / meal drafts. */
  ai?: { service: AiService; cfg: AiConfig };
  signal?: AbortSignal;
}

const done = (note: string, undo: Undo | null, navigateTo: string | null = null, dropped = 0): Result<Executed, ExecError> => ok({ undo, navigateTo, note, dropped });

export async function executeProposal(action: ProposedAction, d: ExecDeps): Promise<Result<Executed, ExecError>> {
  const { repos } = d.services.data;
  const writer = createScheduleWriter({ repos, meta: d.services.meta, clock: d.clock });
  const today = localNow(d.clock, d.now).today;
  try {
    switch (action.type) {
      case 'add_client': {
        if ((await reachedClientLimit(d.services)) !== null) return err('client_limit');
        const settings = await repos.settings.get();
        const total = action.sessions ?? 0;
        const c = await repos.clients.create({
          name: action.name,
          phone: action.phone.slice(0, 30),
          gender: null,
          birthDate: null,
          goal: action.goal ?? 'fitness',
          goalNote: '',
          injuries: [],
          measurements: {},
          package: total > 0 ? { name: '', totalSessions: total, priceMinor: 0, currency: settings.currency } : null,
          startDate: total > 0 ? today : null,
          endDate: null,
          remainingSessions: total,
          notes: '',
          photoId: null,
        });
        return done(`added client id ${c.id}`, () => repos.clients.softDelete(c.id), `/clients/${c.id}`);
      }
      case 'book_session': {
        const l = d.clock.toLocal(action.startsAt);
        const r = await writer.book({ clientId: action.clientId as ClientId, notes: '', date: l.date, startMinute: l.minute, durationMinutes: action.durationMin, repeat: null });
        if (!r.ok) return err('invalid');
        return done(`booked session id ${r.value.sessions[0]?.id ?? ''}`, r.value.undo);
      }
      case 'move_session': {
        const s = await repos.sessions.get(action.sessionId);
        if (!s) return err('not_found');
        const l = d.clock.toLocal(action.to);
        const r = await writer.edit(s, { clientId: s.clientId, notes: s.notes, date: l.date, startMinute: l.minute, durationMinutes: s.durationMin, repeat: null }, 'one');
        if (!r.ok) return err('invalid');
        return done(`moved session id ${s.id}`, r.value.undo);
      }
      case 'cancel_session': {
        const s = await repos.sessions.get(action.sessionId);
        if (!s) return err('not_found');
        return done(`cancelled session id ${s.id}`, await writer.remove([s]));
      }
      case 'record_payment': {
        const p = await repos.payments.create({
          clientId: action.clientId as ClientId,
          amountMinor: action.amountMinor,
          currency: action.currency,
          status: action.status,
          paidOn: action.status === 'paid' ? action.date : null,
          dueOn: action.status === 'due' ? action.date : null,
          method: action.method,
          note: '',
        });
        return done(`recorded payment id ${p.id}`, () => repos.payments.softDelete(p.id));
      }
      case 'renew_package': {
        const r = await d.services.data.renewPackage(action.clientId, today);
        if (!r) return err('no_package');
        return done(`renewed package of client id ${action.clientId}`, () => d.services.data.undoRenewal(action.clientId, r));
      }
      case 'create_task': {
        const tasks = tasksRepo(d.services.meta);
        const id = crypto.randomUUID();
        await tasks.add({ id, title: action.title, due: action.due, clientId: action.clientId, done: false, createdAt: d.now.getTime() });
        return done(`created task id ${id}`, () => tasks.remove(id));
      }
      case 'draft_whatsapp':
        // Opened by the card's own link (a tap must open WhatsApp directly on iOS); nothing is saved.
        return done(`opened WhatsApp draft for client id ${action.clientId} (trainer sends it)`, null);
      case 'create_program_draft':
      case 'create_meal_plan_draft': {
        if (!d.ai) return err('no_key');
        const client = await repos.clients.get(action.clientId);
        if (!client) return err('not_found');
        const deps = { services: d.services, ai: d.ai.service, cfg: d.ai.cfg, signal: d.signal };
        if (action.type === 'create_program_draft') {
          const r = await draftProgram(deps, client, action.daysPerWeek, action.notes, today);
          if (!r.ok) return r;
          const id = r.value.programId;
          return done(`created program draft id ${id}`, () => repos.programs.softDelete(id), `/programs/${id}?from=client`, r.value.dropped);
        }
        const r = await draftMealDay(deps, client, action.notes, today);
        if (!r.ok) return r;
        const id = r.value.mealPlanId;
        return done(`created meal plan draft id ${id}`, () => repos.mealPlans.softDelete(id), `/clients/${client.id}/meals`);
      }
      case 'add_recipe': {
        const x = action.recipe;
        const recipe = await repos.recipes.create({
          name: x.name,
          servings: x.servings,
          ingredients: x.ingredients.map((i) => ({ name: i.name, quantity: i.grams, unit: t('assistant.card.gramUnit'), kcal: i.kcal ?? null, proteinG: i.proteinG ?? null, carbsG: i.carbsG ?? null, fatG: i.fatG ?? null })),
          instructions: x.instructions,
          imageId: null,
          tags: [],
        });
        return done(`added recipe id ${recipe.id}`, () => repos.recipes.softDelete(recipe.id));
      }
      case 'update_client_note': {
        const c = await repos.clients.get(action.clientId);
        if (!c) return err('not_found');
        const before = c.notes;
        await repos.clients.update(c.id, { notes: action.after });
        return done(`updated notes of client id ${c.id}`, async () => {
          await repos.clients.update(c.id, { notes: before });
        });
      }
    }
  } catch {
    return err('invalid');
  }
}
