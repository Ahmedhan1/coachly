import { describe, expect, it } from 'vitest';
import type { AppServices } from '@/app/services';
import { AppDatabase, createDataLayer } from '@/data';
import { fakeIdbOptions, manualClock } from '@/data/testing';
import { planAction, validateToolCall, type ProposedAction, type ReadCall } from '@/domain/ai';
import { fixedOffsetClock } from '@/domain/schedule';
import { memoryMetaStore } from '@/services/license/metaStore';
import { readAiSettings, readTasks, AI_SETTINGS_KEY } from './aiSettings';
import { buildPlanContext, runReadTool } from './assistantData';
import { executeProposal } from './executor';
import { cardView } from './proposalView';

const clock = fixedOffsetClock(120);
const NOW = new Date(Date.UTC(2026, 10, 17, 8)); // 10:00 Cairo

async function setup() {
  const db = new AppDatabase(`assistant-${Math.random()}`, fakeIdbOptions());
  const data = createDataLayer(db, manualClock(NOW.getTime()));
  const meta = memoryMetaStore();
  const services = { data, meta } as unknown as AppServices;
  const client = await data.repos.clients.create({
    name: 'منى حسن', phone: '01012345678', gender: 'female', birthDate: null, goal: 'fat_loss', goalNote: '', injuries: [], measurements: {},
    package: { name: '', totalSessions: 12, priceMinor: 150000, currency: 'EGP' }, startDate: '2026-10-18', endDate: '2026-11-17',
    remainingSessions: 2, notes: 'قديم', photoId: null,
  });
  return { services, data, meta, client };
}

const exec = (services: AppServices, action: ProposedAction) => executeProposal(action, { services, clock, now: NOW });
const read = (name: string, args = '{}') => {
  const v = validateToolCall(name, args);
  if (!v.ok || v.value.kind !== 'read') throw new Error('bad call');
  return v.value as ReadCall;
};

describe('assistant executor (runs only confirmed proposals) with undo', () => {
  it('books a session and undoes it', async () => {
    const { services, data, client } = await setup();
    const ctx = await buildPlanContext(data.repos, clock, NOW);
    const plan = planAction('book_session', { clientId: 'منى', date: '2026-11-18', time: '18:00', durationMin: null }, ctx);
    if (!plan.ok) throw new Error(plan.error);
    expect(cardView(plan.value, clock).rows[1]?.value).toContain('2026-11-18 18:00');
    const r = await exec(services, plan.value);
    if (!r.ok) throw new Error(r.error);
    const sessions = await data.repos.sessions.listByClient(client.id);
    expect(sessions).toHaveLength(1);
    expect(clock.toLocal(sessions[0]!.startsAt)).toEqual({ date: '2026-11-18', minute: 18 * 60 });
    await r.value.undo?.();
    expect(await data.repos.sessions.listByClient(client.id)).toHaveLength(0);
  });

  it('cancels a session, records a payment and renews a package, each undoable', async () => {
    const { services, data, client } = await setup();
    const booked = await exec(services, { type: 'book_session', clientId: client.id, clientName: client.name, startsAt: NOW.getTime() + 86_400_000, durationMin: 60 });
    if (!booked.ok) throw new Error(booked.error);
    const ctx = await buildPlanContext(data.repos, clock, NOW);
    const cancel = planAction('cancel_session', { sessionId: ctx.sessions[0]!.id }, ctx);
    if (!cancel.ok) throw new Error(cancel.error);
    const c = await exec(services, cancel.value);
    expect(await data.repos.sessions.listByClient(client.id)).toHaveLength(0);
    if (c.ok) await c.value.undo?.();
    expect(await data.repos.sessions.listByClient(client.id)).toHaveLength(1);

    const pay = await exec(services, { type: 'record_payment', clientId: client.id, clientName: client.name, amountMinor: 50000, currency: 'EGP', method: 'cash', status: 'paid', date: '2026-11-17' });
    expect(await data.repos.payments.listByClient(client.id)).toHaveLength(1);
    if (pay.ok) await pay.value.undo?.();
    expect(await data.repos.payments.listByClient(client.id)).toHaveLength(0);

    const renew = planAction('renew_package', { clientId: client.id }, await buildPlanContext(data.repos, clock, NOW));
    if (!renew.ok) throw new Error(renew.error);
    const rr = await exec(services, renew.value);
    expect((await data.repos.clients.require(client.id)).remainingSessions).toBe(14);
    if (rr.ok) await rr.value.undo?.();
    expect((await data.repos.clients.require(client.id)).remainingSessions).toBe(2);
  });

  it('adds a client, a task and a note; undo puts things back', async () => {
    const { services, data, meta, client } = await setup();
    const added = await exec(services, { type: 'add_client', name: 'كريم', phone: '', goal: null, sessions: 8 });
    if (!added.ok) throw new Error(added.error);
    expect((await data.repos.clients.list()).map((c) => c.name)).toContain('كريم');
    await added.value.undo?.();
    expect((await data.repos.clients.list()).map((c) => c.name)).not.toContain('كريم');

    const task = await exec(services, { type: 'create_task', title: 'كلّم منى', due: '2026-11-18', clientId: client.id, clientName: client.name });
    expect(await readTasks(meta)).toHaveLength(1);
    if (task.ok) await task.value.undo?.();
    expect(await readTasks(meta)).toHaveLength(0);

    const note = await exec(services, { type: 'update_client_note', clientId: client.id, clientName: client.name, before: 'قديم', after: 'قديم\nجديد', mode: 'append' });
    expect((await data.repos.clients.require(client.id)).notes).toBe('قديم\nجديد');
    if (note.ok) await note.value.undo?.();
    expect((await data.repos.clients.require(client.id)).notes).toBe('قديم');
  });

  it('program drafts need the AI config and never run without it', async () => {
    const { services, client } = await setup();
    expect(await exec(services, { type: 'create_program_draft', clientId: client.id, clientName: client.name, daysPerWeek: 3, notes: '' })).toEqual({ ok: false, error: 'no_key' });
  });
});

describe('assistant read tools', () => {
  it('lists clients and today/tomorrow sessions without phone numbers', async () => {
    const { services, data, meta, client } = await setup();
    await exec(services, { type: 'book_session', clientId: client.id, clientName: client.name, startsAt: Date.UTC(2026, 10, 18, 16), durationMin: 60 });
    const env = { repos: data.repos, meta, clock, now: NOW, privacy: { firstNamesOnly: true } };
    const clients = await runReadTool(read('list_clients'), env);
    expect(clients).toEqual([expect.objectContaining({ id: client.id, name: 'منى' })]);
    expect(JSON.stringify(clients)).not.toContain('0101');
    expect(await runReadTool(read('list_sessions', '{"range":"today"}'), env)).toEqual([]);
    expect(await runReadTool(read('list_sessions', '{"range":"tomorrow"}'), env)).toEqual([expect.objectContaining({ date: '2026-11-18', time: '18:00', client: 'منى' })]);
    expect(await runReadTool(read('packages_ending'), env)).toEqual([expect.objectContaining({ clientId: client.id })]);
    expect(await runReadTool(read('get_client', '{"clientId":"nobody"}'), env)).toEqual({ error: 'unknown_client' });
  });
});

describe('AI settings', () => {
  it('reads older stored settings without the privacy flag as not acknowledged', async () => {
    const meta = memoryMetaStore({ [AI_SETTINGS_KEY]: { enabled: true, model: 'llama-3.3-70b-versatile', firstNamesOnly: false } });
    expect(await readAiSettings(meta)).toEqual({ enabled: true, model: 'llama-3.3-70b-versatile', firstNamesOnly: false, privacyAck: false });
    expect(AI_SETTINGS_KEY.startsWith('backup.')).toBe(true);
  });
});
