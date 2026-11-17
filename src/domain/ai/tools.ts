import { z } from 'zod';
import type { ToolDefinition } from './chat';

/**
 * The assistant's tools. READ tools answer from the trainer's data on the device. ACTION tools never write:
 * they only PROPOSE a change, which the app shows as a confirmation card and runs after "نفّذ".
 * JSON schemas go to the model; zod validates what comes back (models send nulls, numbers as strings…).
 */

const optText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ?? '').trim().slice(0, max));
const id = z.string().trim().min(1).max(64);
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z
  .string()
  .trim()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/)
  .transform((v) => v.padStart(5, '0'));
const num = (min: number, max: number) => z.coerce.number().min(min).max(max);

export const readArgSchemas = {
  list_clients: z.object({ query: optText(60) }),
  get_client: z.object({ clientId: id }),
  list_sessions: z.object({ range: z.enum(['today', 'tomorrow', 'week']).catch('today') }),
  overdue_payments: z.object({}),
  list_programs: z.object({ clientId: id.nullish() }),
  list_meal_plans: z.object({ clientId: id.nullish() }),
  client_progress: z.object({ clientId: id }),
  search_exercises: z.object({ query: optText(60), muscle: optText(40) }),
  list_foods: z.object({ query: optText(60) }),
  list_tasks: z.object({}),
} as const;

export const goalValues = ['fat_loss', 'muscle_gain', 'strength', 'fitness', 'rehab', 'other'] as const;
export const methodValues = ['cash', 'instapay', 'wallet', 'bank', 'other'] as const;

export const actionArgSchemas = {
  add_client: z.object({
    name: z.string().trim().min(1).max(80),
    phone: optText(30),
    goal: z.enum(goalValues).nullish().catch(null),
    sessions: num(0, 200).int().nullish().catch(null),
  }),
  book_session: z.object({ clientId: id, date: isoDate, time: hhmm, durationMin: num(5, 480).int().nullish().catch(null) }),
  move_session: z.object({ sessionId: id, date: isoDate, time: hhmm }),
  record_payment: z.object({
    clientId: id,
    amount: num(0.01, 10_000_000),
    method: z.enum(methodValues).nullish().catch(null),
    status: z.enum(['paid', 'due']).nullish().catch(null),
    date: isoDate.nullish().catch(null),
  }),
  create_task: z.object({ title: z.string().trim().min(1).max(200), due: isoDate.nullish().catch(null), clientId: id.nullish().catch(null) }),
  draft_whatsapp: z.object({ clientId: id, text: z.string().trim().min(1).max(1500) }),
  create_program_draft: z.object({ clientId: id, daysPerWeek: num(2, 6).int().catch(3), notes: optText(400) }),
  create_meal_plan_draft: z.object({ clientId: id, notes: optText(400) }),
  add_recipe: z.object({
    name: z.string().trim().min(1).max(80),
    servings: num(1, 100).int().catch(1),
    ingredients: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          grams: num(0.1, 100_000),
          kcal: num(0, 100_000).nullish().catch(null),
          proteinG: num(0, 100_000).nullish().catch(null),
          carbsG: num(0, 100_000).nullish().catch(null),
          fatG: num(0, 100_000).nullish().catch(null),
        }),
      )
      .min(1)
      .max(40),
    instructions: optText(3000),
  }),
  update_client_note: z.object({ clientId: id, note: z.string().trim().min(1).max(1000), mode: z.enum(['append', 'replace']).catch('append') }),
} as const;

export type ReadToolName = keyof typeof readArgSchemas;
export type ActionToolName = keyof typeof actionArgSchemas;
export type ReadArgs<N extends ReadToolName> = z.output<(typeof readArgSchemas)[N]>;
export type ActionArgs<N extends ActionToolName> = z.output<(typeof actionArgSchemas)[N]>;

export type ValidatedCall =
  | { [N in ReadToolName]: { kind: 'read'; name: N; args: ReadArgs<N> } }[ReadToolName]
  | { [N in ActionToolName]: { kind: 'action'; name: N; args: ActionArgs<N> } }[ActionToolName];

export type CallError = 'unknown_tool' | 'bad_json' | 'bad_args';

const isRead = (n: string): n is ReadToolName => Object.hasOwn(readArgSchemas, n);
const isAction = (n: string): n is ActionToolName => Object.hasOwn(actionArgSchemas, n);

/** Validates a tool call from the model. */
export function validateToolCall(name: string, argsJson: string): { ok: true; value: ValidatedCall } | { ok: false; error: CallError } {
  if (!isRead(name) && !isAction(name)) return { ok: false, error: 'unknown_tool' };
  let raw: unknown;
  try {
    raw = argsJson.trim() ? JSON.parse(argsJson) : {};
  } catch {
    return { ok: false, error: 'bad_json' };
  }
  if (raw === null || typeof raw !== 'object') raw = {};
  const schema = isRead(name) ? readArgSchemas[name] : actionArgSchemas[name as ActionToolName];
  const r = (schema as z.ZodType).safeParse(raw);
  if (!r.success) return { ok: false, error: 'bad_args' };
  return { ok: true, value: { kind: isRead(name) ? 'read' : 'action', name, args: r.data } as ValidatedCall };
}

// ---------- JSON schemas sent to the model ----------

type Prop = Record<string, unknown>;
const s = (description: string): Prop => ({ type: 'string', description });
const n = (description: string): Prop => ({ type: 'number', description });
const e = (values: readonly string[], description: string): Prop => ({ type: 'string', enum: [...values], description });
const tool = (name: string, description: string, properties: Record<string, Prop> = {}, required: string[] = []): ToolDefinition => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});
const CLIENT_ID = s('Client id from list_clients / get_client');
const DATE = s('Local date YYYY-MM-DD');

export const READ_TOOLS: readonly ToolDefinition[] = [
  tool('list_clients', 'List the trainer clients (id, name, goal, sessions left, subscription end, status). Optional name filter.', { query: s('Part of a name') }),
  tool('get_client', 'Full details of one client: goal, injuries, measurements, package, notes, programs, meal plans, balance due.', { clientId: CLIENT_ID }, ['clientId']),
  tool('list_sessions', 'Booked sessions for today, tomorrow or the next 7 days (id, client, date, time, attendance).', { range: e(['today', 'tomorrow', 'week'], 'Which days') }, ['range']),
  tool('overdue_payments', 'Clients with unpaid charges (amount, days late) and subscriptions that ended or end soon.'),
  tool('list_programs', 'Training programs (all or for one client).', { clientId: CLIENT_ID }),
  tool('list_meal_plans', 'Meal plans (all or for one client).', { clientId: CLIENT_ID }),
  tool('client_progress', 'Last weigh-ins and measurements of a client.', { clientId: CLIENT_ID }, ['clientId']),
  tool('search_exercises', 'Search the exercise library by name or muscle (id, Arabic name, muscles, equipment).', { query: s('Name in Arabic or English'), muscle: s('Muscle id, e.g. chest, glutes, quadriceps') }),
  tool('list_foods', 'The trainer recipes and foods with calories and macros.', { query: s('Part of a name') }),
  tool('list_tasks', 'The trainer to-do list and reminders.'),
];

export const ACTION_TOOLS: readonly ToolDefinition[] = [
  tool('add_client', 'PROPOSE adding a new client. The trainer confirms first.', { name: s('Client name'), phone: s('Mobile, only if the trainer gave it'), goal: e(goalValues, 'Goal'), sessions: n('Sessions in the package') }, ['name']),
  tool('book_session', 'PROPOSE booking a session. The trainer confirms first.', { clientId: CLIENT_ID, date: DATE, time: s('24h HH:MM'), durationMin: n('Minutes, default 60') }, ['clientId', 'date', 'time']),
  tool('move_session', 'PROPOSE moving a booked session to a new date/time.', { sessionId: s('Session id from list_sessions'), date: DATE, time: s('24h HH:MM') }, ['sessionId', 'date', 'time']),
  tool('record_payment', 'PROPOSE recording a payment (paid now) or a due charge.', { clientId: CLIENT_ID, amount: n('Amount in the trainer currency (not minor units)'), method: e(methodValues, 'Payment method'), status: e(['paid', 'due'], 'paid or due'), date: DATE }, ['clientId', 'amount']),
  tool('create_task', 'PROPOSE a to-do or reminder for the trainer.', { title: s('Short task in Egyptian Arabic'), due: DATE, clientId: CLIENT_ID }, ['title']),
  tool('draft_whatsapp', 'PROPOSE a WhatsApp message to a client. The app adds the phone number itself and opens WhatsApp only after the trainer confirms.', { clientId: CLIENT_ID, text: s('Message in friendly Egyptian Arabic') }, ['clientId', 'text']),
  tool('create_program_draft', 'PROPOSE generating a training program draft for a client.', { clientId: CLIENT_ID, daysPerWeek: n('2 to 6'), notes: s('Focus, e.g. bulking, equipment, time') }, ['clientId', 'daysPerWeek']),
  tool('create_meal_plan_draft', 'PROPOSE generating a one-day meal plan draft for a client.', { clientId: CLIENT_ID, notes: s('e.g. cutting, foods to avoid') }, ['clientId']),
  tool(
    'add_recipe',
    'PROPOSE adding a recipe/food to the trainer recipe book.',
    {
      name: s('Recipe name in Arabic'),
      servings: n('Servings'),
      ingredients: {
        type: 'array',
        items: { type: 'object', properties: { name: s('Ingredient'), grams: n('Grams'), kcal: n('kcal for that amount'), proteinG: n('Protein g'), carbsG: n('Carbs g'), fatG: n('Fat g') }, required: ['name', 'grams'] },
      },
      instructions: s('Steps'),
    },
    ['name', 'servings', 'ingredients'],
  ),
  tool('update_client_note', 'PROPOSE adding to (or replacing) the trainer notes of a client.', { clientId: CLIENT_ID, note: s('Note text'), mode: e(['append', 'replace'], 'append (default) or replace') }, ['clientId', 'note']),
];

export const ALL_TOOLS: readonly ToolDefinition[] = [...READ_TOOLS, ...ACTION_TOOLS];
