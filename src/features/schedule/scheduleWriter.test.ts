import { describe, expect, it } from 'vitest';
import { createTestData } from '@/data/testing';
import type { ClientId } from '@/domain/models';
import { fixedOffsetClock } from '@/domain/schedule';
import { memoryMetaStore } from '@/services/license/metaStore';
import { DEFAULT_SCHEDULE_PREFS, LATE_CANCEL_KEY, parsePrefs, savePrefs } from './prefs';
import { createScheduleWriter } from './scheduleWriter';

async function setup() {
  const { repos } = createTestData();
  const meta = memoryMetaStore();
  const writer = createScheduleWriter({ repos, meta, clock: fixedOffsetClock(120) });
  const client = await repos.clients.create({
    name: 'سارة', phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [], measurements: {},
    package: { name: '', totalSessions: 12, priceMinor: 0, currency: 'EGP' }, startDate: null, endDate: null,
    remainingSessions: 5, notes: '', photoId: null,
  });
  return { repos, meta, writer, clientId: client.id as ClientId };
}

const weekly = { weekdays: [6, 2] as const, intervalWeeks: 1, until: null, count: 4 };

describe('schedule writer', () => {
  it('books a weekly series: one head with the rule, all sharing the series id; undo removes them', async () => {
    const { repos, writer, clientId } = await setup();
    const r = await writer.book({ clientId, notes: '', date: '2026-11-21', startMinute: 540, durationMinutes: 60, repeat: { ...weekly, weekdays: [...weekly.weekdays] } });
    if (!r.ok) throw new Error(r.error);
    const all = await repos.sessions.listByClient(clientId);
    expect(all).toHaveLength(4);
    const head = all[0]!;
    expect(head.recurrence).toMatchObject({ byWeekday: [2, 6], count: 4 });
    expect(all.every((s) => s.seriesId === head.id)).toBe(true);
    expect(all.slice(1).every((s) => s.recurrence === null)).toBe(true);
    await r.value.undo();
    expect(await repos.sessions.listByClient(clientId)).toHaveLength(0);
  });

  it('marks attendance, updates remaining sessions, and undoes it', async () => {
    const { repos, meta, writer, clientId } = await setup();
    const r = await writer.book({ clientId, notes: '', date: '2026-11-21', startMinute: 540, durationMinutes: 60, repeat: null });
    if (!r.ok) throw new Error(r.error);
    const s = r.value.sessions[0]!;
    const marked = await writer.mark(s, 'attended');
    expect(marked.client?.remainingSessions).toBe(4);
    const late = await writer.mark((await repos.sessions.get(s.id))!, 'lateCancel');
    expect(late.client?.remainingSessions).toBe(4);
    expect(await meta.get(LATE_CANCEL_KEY)).toEqual([s.id]);
    expect((await repos.sessions.get(s.id))?.attendance).toBe('missed');
    const cleared = await writer.mark((await repos.sessions.get(s.id))!, null);
    expect(cleared.client?.remainingSessions).toBe(5);
    await cleared.undo();
    expect((await repos.clients.get(clientId))?.remainingSessions).toBe(4);
    expect(await meta.get(LATE_CANCEL_KEY)).toEqual([s.id]);
  });

  it('deleting an attended session gives the session back; undo takes it again', async () => {
    const { repos, writer, clientId } = await setup();
    const r = await writer.book({ clientId, notes: '', date: '2026-11-21', startMinute: 540, durationMinutes: 60, repeat: null });
    if (!r.ok) throw new Error(r.error);
    await writer.mark(r.value.sessions[0]!, 'attended');
    const undo = await writer.remove([(await repos.sessions.get(r.value.sessions[0]!.id))!]);
    expect((await repos.clients.get(clientId))?.remainingSessions).toBe(5);
    await undo();
    expect((await repos.clients.get(clientId))?.remainingSessions).toBe(4);
    expect(await repos.sessions.listByClient(clientId)).toHaveLength(1);
  });

  it('edits the rest of a series from the middle: earlier rule is cut, later ones move; undo restores', async () => {
    const { repos, writer, clientId } = await setup();
    const r = await writer.book({ clientId, notes: '', date: '2026-11-21', startMinute: 540, durationMinutes: 60, repeat: { weekdays: [6], intervalWeeks: 1, until: null, count: 4 } });
    if (!r.ok) throw new Error(r.error);
    const third = r.value.sessions[2]!;
    const e = await writer.edit(third, { clientId, notes: 'x', date: '2026-12-05', startMinute: 600, durationMinutes: 45, repeat: { weekdays: [6], intervalWeeks: 1, until: null, count: 2 } }, 'series');
    if (!e.ok) throw new Error(e.error);
    const all = await repos.sessions.listByClient(clientId);
    expect(all).toHaveLength(4);
    expect(all[0]!.recurrence).toMatchObject({ until: '2026-12-04', count: null });
    expect(all.slice(2).map((s) => s.durationMin)).toEqual([45, 45]);
    expect(all[2]!.recurrence).toMatchObject({ count: 2 });
    await e.value.undo();
    const back = await repos.sessions.listByClient(clientId);
    expect(back.map((s) => s.durationMin)).toEqual([60, 60, 60, 60]);
    expect(back[0]!.recurrence).toMatchObject({ count: 4, until: null });
  });

  it('editing one occurrence takes it out of the series', async () => {
    const { repos, writer, clientId } = await setup();
    const r = await writer.book({ clientId, notes: '', date: '2026-11-21', startMinute: 540, durationMinutes: 60, repeat: { weekdays: [6], intervalWeeks: 1, until: null, count: 3 } });
    if (!r.ok) throw new Error(r.error);
    const second = r.value.sessions[1]!;
    const e = await writer.edit(second, { clientId, notes: '', date: '2026-11-29', startMinute: 600, durationMinutes: 60, repeat: { weekdays: [6], intervalWeeks: 1, until: null, count: 3 } }, 'one');
    if (!e.ok) throw new Error(e.error);
    const moved = await repos.sessions.get(second.id);
    expect(moved?.seriesId).toBeNull();
    expect(await repos.sessions.listByClient(clientId)).toHaveLength(3);
  });

  it('follows the trainer policy: a no-show or late cancel can be set not to use a session', async () => {
    const { repos, meta, writer, clientId } = await setup();
    await savePrefs(meta, { ...DEFAULT_SCHEDULE_PREFS, noShowUsesSession: false, lateCancelUsesSession: false });
    const r = await writer.book({ clientId, notes: '', date: '2026-11-21', startMinute: 540, durationMinutes: 60, repeat: null });
    if (!r.ok) throw new Error(r.error);
    const s = r.value.sessions[0]!;
    expect((await writer.mark(s, 'noShow')).client?.remainingSessions).toBe(5);
    expect((await writer.mark((await repos.sessions.get(s.id))!, 'lateCancel')).client?.remainingSessions).toBe(5);
    expect((await writer.mark((await repos.sessions.get(s.id))!, 'attended')).client?.remainingSessions).toBe(4);
  });
});

describe('schedule prefs', () => {
  it('old stored prefs without the policy fields read as "both use a session"', () => {
    expect(parsePrefs({ defaultDurationMin: 45, alarmMinutesBefore: null })).toEqual({
      defaultDurationMin: 45,
      alarmMinutesBefore: null,
      noShowUsesSession: true,
      lateCancelUsesSession: true,
    });
  });
});
