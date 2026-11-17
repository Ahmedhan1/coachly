import type { ProposedAction } from '@/domain/ai';
import type { ZonedClock } from '@/domain/schedule';
import { t, type TKey } from '@/i18n';
import { LIST_SEP } from '@/ui/format';
import { hhmm } from './assistantData';

/** What a confirmation card shows: a title, label/value rows (with before → after for changes) and a note. */
export interface CardRow {
  label: string;
  value?: string;
  before?: string;
  after?: string;
  /** Long text (messages, notes) shown in its own block. */
  long?: boolean;
}
export interface CardView {
  title: string;
  rows: CardRow[];
  note: string | null;
}

const money = (minor: number, currency: string) => `${(Math.round(minor) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
const orNone = (v: string | null) => v ?? t('common.none');

export function cardView(a: ProposedAction, clock: ZonedClock): CardView {
  const when = (ms: number) => {
    const l = clock.toLocal(ms);
    return `${l.date} ${hhmm(l.minute)}`;
  };
  const client = (name: string): CardRow => ({ label: t('assistant.card.client'), value: name });
  const title = t(`assistant.card.${a.type === 'record_payment' && a.status === 'due' ? 'record_due' : a.type}` as TKey);
  switch (a.type) {
    case 'add_client':
      return {
        title,
        rows: [
          { label: t('assistant.card.name'), value: a.name },
          ...(a.phone ? [{ label: t('assistant.card.phone'), value: a.phone }] : []),
          ...(a.goal ? [{ label: t('assistant.card.goal'), value: t(`assistant.goals.${a.goal}`) }] : []),
          ...(a.sessions ? [{ label: t('assistant.card.sessions'), value: String(a.sessions) }] : []),
        ],
        note: null,
      };
    case 'book_session':
      return { title, rows: [client(a.clientName), { label: t('assistant.card.when'), value: `${when(a.startsAt)} · ${t('assistant.card.duration', { n: a.durationMin })}` }], note: null };
    case 'move_session':
      return { title, rows: [client(a.clientName), { label: t('assistant.card.when'), before: when(a.from), after: when(a.to) }], note: null };
    case 'cancel_session':
      return { title, rows: [client(a.clientName), { label: t('assistant.card.when'), value: `${when(a.startsAt)} · ${t('assistant.card.duration', { n: a.durationMin })}` }], note: t('assistant.card.cancelNote') };
    case 'renew_package':
      return {
        title,
        rows: [
          client(a.clientName),
          { label: t('assistant.card.period'), before: `${orNone(a.before.startDate)} ← ${orNone(a.before.endDate)}`, after: `${orNone(a.after.startDate)} ← ${orNone(a.after.endDate)}` },
          { label: t('assistant.card.remaining'), before: String(a.before.remainingSessions), after: String(a.after.remainingSessions) },
          { label: t('assistant.card.charge'), value: a.chargeMinor ? money(a.chargeMinor, a.currency) : t('assistant.card.noCharge') },
        ],
        note: null,
      };
    case 'record_payment':
      return {
        title,
        rows: [
          client(a.clientName),
          { label: t('assistant.card.amount'), value: money(a.amountMinor, a.currency) },
          { label: t('assistant.card.method'), value: t(`assistant.methods.${a.method}`) },
          { label: t('assistant.card.date'), value: a.date },
        ],
        note: null,
      };
    case 'create_task':
      return {
        title,
        rows: [{ label: t('assistant.card.name'), value: a.title }, { label: t('assistant.card.due'), value: a.due ?? t('assistant.card.noDue') }, ...(a.clientName ? [client(a.clientName)] : [])],
        note: null,
      };
    case 'draft_whatsapp':
      return { title, rows: [client(a.clientName), { label: t('assistant.card.message'), value: a.text, long: true }], note: t('assistant.card.whatsappNote') };
    case 'create_program_draft':
      return {
        title,
        rows: [client(a.clientName), { label: t('assistant.card.days'), value: String(a.daysPerWeek) }, ...(a.notes ? [{ label: t('assistant.card.notes'), value: a.notes, long: true }] : [])],
        note: t('assistant.card.draftNote'),
      };
    case 'create_meal_plan_draft':
      return { title, rows: [client(a.clientName), ...(a.notes ? [{ label: t('assistant.card.notes'), value: a.notes, long: true }] : [])], note: t('assistant.card.draftNote') };
    case 'add_recipe':
      return {
        title,
        rows: [
          { label: t('assistant.card.name'), value: a.recipe.name },
          { label: t('assistant.card.servings'), value: String(a.recipe.servings) },
          { label: t('assistant.card.ingredients'), value: a.recipe.ingredients.map((i) => `${i.name} ${i.grams} ${t('assistant.card.gramUnit')}`).join(LIST_SEP), long: true },
        ],
        note: null,
      };
    case 'update_client_note':
      return { title, rows: [client(a.clientName), { label: t('assistant.card.notes'), before: a.before || t('common.none'), after: a.after, long: true }], note: null };
  }
}
