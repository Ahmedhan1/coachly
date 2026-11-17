import { describe, expect, it } from 'vitest';
import type { Client, ClientId, Payment, PaymentId } from '../models';
import { meta } from '../models/testFixtures';
import { planAction, resolveClient, type PlanContext } from './actions';
import { runAgentTurn, type AgentDeps } from './agent';
import { classifyHttpError, modelChain, parseChatReply, retryAfterSeconds, trimHistory, type ChatMessage, type ChatReply } from './chat';
import { buildSystemPrompt, withAppNotes } from './prompt';
import { clientDetailView, clientsView, displayName, overdueView, sessionsView } from './readModels';
import { addTask, parseTasks, removeTask, sortTasks, toggleTask, type Task } from './tasks';
import { ALL_TOOLS, validateToolCall } from './tools';

const client = (id: string, name: string, extra: Partial<Client> = {}): Client => ({
  id: id as ClientId,
  name,
  phone: '01012345678',
  gender: 'male',
  birthDate: null,
  goal: 'muscle_gain',
  goalNote: '',
  injuries: [],
  measurements: { weightKg: 80 },
  package: null,
  startDate: null,
  endDate: null,
  remainingSessions: 0,
  notes: 'ركبته بتوجعه',
  photoId: null,
  ...meta(),
  ...extra,
});

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  clients: [
    { id: 'c1', name: 'أحمد علي', notes: 'قديم' },
    { id: 'c2', name: 'أحمد سمير', notes: '' },
    { id: 'c3', name: 'منى حسن', notes: '' },
  ],
  sessions: [{ id: 's1', clientId: 'c3', startsAt: Date.UTC(2026, 10, 17, 16), durationMin: 60 }],
  currency: 'EGP',
  today: '2026-11-17',
  toEpoch: (d, t) => Date.parse(`${d}T${t}:00Z`),
  now: Date.UTC(2026, 10, 17, 10),
  ...over,
});

describe('chat helpers', () => {
  it('builds the model chain: chosen first, fallbacks after, no duplicates', () => {
    expect(modelChain('')[0]).toBe('llama-3.3-70b-versatile');
    const chain = modelChain('openai/gpt-oss-120b');
    expect(chain[0]).toBe('openai/gpt-oss-120b');
    expect(new Set(chain).size).toBe(chain.length);
    expect(chain).toContain('llama-3.3-70b-versatile');
  });

  it('parses a reply with tool calls and rejects empty/odd bodies', () => {
    const r = parseChatReply({ model: 'm', choices: [{ message: { content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'list_clients', arguments: '{}' } }] } }] }, 'x');
    expect(r?.toolCalls[0]?.function.name).toBe('list_clients');
    expect(r?.model).toBe('m');
    expect(parseChatReply({ choices: [{ message: { content: '  ' } }] }, 'x')).toBeNull();
    expect(parseChatReply({ nope: 1 }, 'x')).toBeNull();
    expect(parseChatReply({ choices: [{ message: { content: 'أهلاً' } }] }, 'x')?.content).toBe('أهلاً');
  });

  it('classifies HTTP errors', () => {
    expect(classifyHttpError(401, {})).toBe('auth');
    expect(classifyHttpError(429, {})).toBe('rate_limited');
    expect(classifyHttpError(404, {})).toBe('next_model');
    expect(classifyHttpError(400, { error: { code: 'model_decommissioned', message: 'x' } })).toBe('next_model');
    expect(classifyHttpError(400, { error: { message: 'The model `x` does not exist' } })).toBe('next_model');
    expect(classifyHttpError(400, { error: { code: 'tool_use_failed' } })).toBe('bad_output');
    expect(classifyHttpError(503, null)).toBe('failed');
  });

  it('reads retry-after safely', () => {
    expect(retryAfterSeconds('7.2')).toBe(8);
    expect(retryAfterSeconds(null)).toBe(20);
    expect(retryAfterSeconds('9999')).toBe(120);
  });

  it('trims history to start on a user message', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '1', content: '[]' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ];
    expect(trimHistory(msgs, 4)).toEqual(msgs.slice(4));
    expect(trimHistory(msgs, 10)).toHaveLength(6);
  });
});

describe('tools', () => {
  it('exposes unique tool names with object parameters', () => {
    const names = ALL_TOOLS.map((t) => t.function.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('record_payment');
  });

  it('validates arguments, coercing what models usually send', () => {
    const r = validateToolCall('book_session', '{"clientId":"c1","date":"2026-11-18","time":"7:30","durationMin":"45"}');
    expect(r.ok && r.value).toMatchObject({ kind: 'action', name: 'book_session', args: { time: '07:30', durationMin: 45 } });
    expect(validateToolCall('list_sessions', '{"range":"nonsense"}')).toMatchObject({ ok: true, value: { args: { range: 'today' } } });
    expect(validateToolCall('list_clients', '')).toMatchObject({ ok: true, value: { kind: 'read' } });
    expect(validateToolCall('delete_everything', '{}')).toEqual({ ok: false, error: 'unknown_tool' });
    expect(validateToolCall('get_client', '{oops')).toEqual({ ok: false, error: 'bad_json' });
    expect(validateToolCall('book_session', '{"clientId":"c1","date":"tomorrow","time":"7:30"}')).toEqual({ ok: false, error: 'bad_args' });
    expect(validateToolCall('add_client', '{"name":"سامي","goal":"weird","phone":null}')).toMatchObject({ ok: true, value: { args: { goal: null, phone: '' } } });
  });
});

describe('planAction', () => {
  it('resolves clients by id, exact name or unique partial name', () => {
    expect(resolveClient('c3', ctx().clients)).toMatchObject({ ok: true, value: { id: 'c3' } });
    expect(resolveClient('منى', ctx().clients)).toMatchObject({ ok: true, value: { id: 'c3' } });
    expect(resolveClient('احمد', ctx().clients)).toEqual({ ok: false, error: 'ambiguous_client' });
    expect(resolveClient('كريم', ctx().clients)).toEqual({ ok: false, error: 'unknown_client' });
  });

  it('plans a booking with default duration and rejects the past', () => {
    expect(planAction('book_session', { clientId: 'c3', date: '2026-11-18', time: '18:00', durationMin: null }, ctx())).toEqual({
      ok: true,
      value: { type: 'book_session', clientId: 'c3', clientName: 'منى حسن', startsAt: Date.UTC(2026, 10, 18, 18), durationMin: 60 },
    });
    expect(planAction('book_session', { clientId: 'c3', date: '2026-11-10', time: '18:00', durationMin: 60 }, ctx())).toEqual({ ok: false, error: 'in_past' });
  });

  it('plans moving a known session only', () => {
    expect(planAction('move_session', { sessionId: 's1', date: '2026-11-19', time: '09:00' }, ctx())).toMatchObject({ ok: true, value: { from: Date.UTC(2026, 10, 17, 16), to: Date.UTC(2026, 10, 19, 9) } });
    expect(planAction('move_session', { sessionId: 'nope', date: '2026-11-19', time: '09:00' }, ctx())).toEqual({ ok: false, error: 'unknown_session' });
  });

  it('converts money to minor units and fills defaults', () => {
    expect(planAction('record_payment', { clientId: 'c3', amount: 1500.5, method: null, status: null, date: null }, ctx())).toMatchObject({
      ok: true,
      value: { amountMinor: 150050, currency: 'EGP', method: 'cash', status: 'paid', date: '2026-11-17' },
    });
  });

  it('appends notes by default and shows before/after', () => {
    expect(planAction('update_client_note', { clientId: 'c1', note: 'جديد', mode: 'append' }, ctx())).toMatchObject({ ok: true, value: { before: 'قديم', after: 'قديم\nجديد' } });
    expect(planAction('update_client_note', { clientId: 'c1', note: 'بس كده', mode: 'replace' }, ctx())).toMatchObject({ ok: true, value: { after: 'بس كده' } });
  });

  it('keeps a task even when its client is unknown', () => {
    expect(planAction('create_task', { title: 'كلّم الجيم', due: null, clientId: 'xx' }, ctx())).toEqual({ ok: true, value: { type: 'create_task', title: 'كلّم الجيم', due: null, clientId: null, clientName: null } });
  });
});

describe('runAgentTurn', () => {
  const reply = (r: Partial<ChatReply>): ChatReply => ({ content: null, toolCalls: [], model: 'm', ...r });
  const deps = (replies: ChatReply[], reads: string[] = []): AgentDeps => ({
    chat: async () => {
      const next = replies.shift();
      return next ? { ok: true, value: next } : { ok: false, error: 'failed' };
    },
    read: async (call) => {
      reads.push(call.name);
      return [{ id: 'c3', name: 'منى' }];
    },
    plan: async (call) => planAction(call.name, call.args, ctx()),
  });

  it('runs read tools then returns the answer', async () => {
    const reads: string[] = [];
    const r = await runAgentTurn(
      [{ role: 'user', content: 'مين عملائي؟' }],
      deps([reply({ toolCalls: [{ id: 't1', type: 'function', function: { name: 'list_clients', arguments: '{}' } }] }), reply({ content: 'عندك منى' })], reads),
    );
    expect(r.ok && r.value.text).toBe('عندك منى');
    expect(reads).toEqual(['list_clients']);
    expect(r.ok && r.value.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('stops at action tools and returns proposals without writing', async () => {
    const r = await runAgentTurn(
      [{ role: 'user', content: 'احجز لمنى بكرة 6' }],
      deps([reply({ content: 'تمام', toolCalls: [{ id: 'a1', type: 'function', function: { name: 'book_session', arguments: '{"clientId":"c3","date":"2026-11-18","time":"18:00"}' } }] })]),
    );
    expect(r.ok && r.value.proposals).toEqual([{ id: 'a1', action: expect.objectContaining({ type: 'book_session', clientId: 'c3' }) }]);
    const last = r.ok ? r.value.messages.at(-1) : undefined;
    expect(last?.role).toBe('tool');
  });

  it('feeds validation/plan errors back to the model', async () => {
    const r = await runAgentTurn(
      [{ role: 'user', content: 'x' }],
      deps([reply({ toolCalls: [{ id: 'a1', type: 'function', function: { name: 'book_session', arguments: '{"clientId":"احمد","date":"2026-11-18","time":"18:00"}' } }] }), reply({ content: 'أنهي أحمد؟' })]),
    );
    expect(r.ok && r.value.text).toBe('أنهي أحمد؟');
    expect(r.ok && r.value.messages[2]).toMatchObject({ role: 'tool', content: '{"error":"ambiguous_client"}' });
  });

  it('returns the chat error so the caller can retry', async () => {
    expect(await runAgentTurn([{ role: 'user', content: 'x' }], deps([]))).toEqual({ ok: false, error: 'failed' });
  });
});

describe('read models', () => {
  const a = client('c1', 'أحمد علي محمود', { endDate: '2026-11-10' });
  const b = client('c2', 'منى حسن');
  const due = (id: string, clientId: string, amountMinor: number, dueOn: string): Payment => ({
    id: id as PaymentId,
    clientId: clientId as ClientId,
    amountMinor,
    currency: 'EGP',
    status: 'due',
    paidOn: null,
    dueOn,
    method: 'cash',
    note: '',
    ...meta(),
  });

  it('can cut names to the first name and never includes phones', () => {
    expect(displayName('أحمد علي', { firstNamesOnly: true })).toBe('أحمد');
    const view = clientsView([a, b], '2026-11-17', { firstNamesOnly: true });
    expect(view[0]).toMatchObject({ id: 'c1', name: 'أحمد', status: 'ended' });
    expect(JSON.stringify(view)).not.toContain('0101');
    const detail = clientDetailView(a, { programs: [], mealPlans: [], payments: [], progress: [] }, '2026-11-17', { firstNamesOnly: false });
    expect(detail.hasPhone).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('0101');
  });

  it('lists who is late paying, most late first, in major units', () => {
    const v = overdueView([a, b], [due('p1', 'c2', 50000, '2026-11-15'), due('p2', 'c1', 10000, '2026-11-01'), due('p3', 'c1', 5000, '2026-11-12')], '2026-11-17', { firstNamesOnly: false });
    expect(v.unpaid).toEqual([
      { clientId: 'c1', client: 'أحمد علي محمود', amountDue: 150, currency: 'EGP', oldestDueOn: '2026-11-01', daysLate: 16 },
      { clientId: 'c2', client: 'منى حسن', amountDue: 500, currency: 'EGP', oldestDueOn: '2026-11-15', daysLate: 2 },
    ]);
    expect(v.renewals[0]).toMatchObject({ clientId: 'c1', kind: 'ended' });
  });

  it('shows sessions in order with local times', () => {
    const v = sessionsView(
      [
        { id: 's2', clientId: 'c2', startsAt: 2000, durationMin: 60, attendance: 'scheduled' },
        { id: 's1', clientId: 'c1', startsAt: 1000, durationMin: 45, attendance: 'attended' },
        { id: 's3', clientId: 'gone', startsAt: 3000, durationMin: 45, attendance: 'scheduled' },
      ],
      new Map([['c1', a], ['c2', b]]),
      (ms) => ({ date: '2026-11-17', time: ms === 1000 ? '09:00' : '10:00' }),
      { firstNamesOnly: true },
    );
    expect(v.map((s) => [s.id, s.client, s.time])).toEqual([
      ['s1', 'أحمد', '09:00'],
      ['s2', 'منى', '10:00'],
    ]);
  });
});

describe('tasks', () => {
  const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: `t${id}`, due: null, clientId: null, done: false, createdAt: Number(id), ...over });

  it('adds, toggles, removes and drops invalid stored rows', () => {
    let list = addTask([], task('1'));
    list = addTask(list, task('2', { due: '2026-11-18' }));
    list = toggleTask(list, '1');
    expect(list.find((t) => t.id === '1')?.done).toBe(true);
    expect(removeTask(list, '1').map((t) => t.id)).toEqual(['2']);
    expect(parseTasks([task('3'), { bad: true }, null])).toHaveLength(1);
    expect(parseTasks('nope')).toEqual([]);
  });

  it('sorts open (dated first) before done', () => {
    const list = [task('1', { done: true }), task('2'), task('3', { due: '2026-11-20' })];
    expect(sortTasks(list).map((t) => t.id)).toEqual(['3', '2', '1']);
  });
});

describe('prompt', () => {
  it('passes time in, mentions the focus client, and holds no client data otherwise', () => {
    const p = buildSystemPrompt({ today: '2026-11-17', time: '10:05', weekday: 2, currency: 'EGP', focusClient: null });
    expect(p).toContain('Tuesday 2026-11-17');
    expect(p).toContain('Egyptian Arabic');
    expect(p).not.toContain('client "');
    expect(buildSystemPrompt({ today: '2026-11-17', time: '10:05', weekday: 2, currency: 'EGP', focusClient: { id: 'c1', name: 'منى' } })).toContain('id c1');
    expect(withAppNotes('hi', [])).toBe('hi');
    expect(withAppNotes('hi', ['done X'])).toBe('[App note: done X]\nhi');
  });
});
