import { describe, expect, it } from 'vitest';
import { createTestData } from '@/data/testing';
import type { ClientId } from '@/domain/models';
import { createSession } from '@/domain/programs';
import { fixedOffsetClock } from '@/domain/schedule';
import { memoryMetaStore } from '@/data/metaStore';
import { createScheduleWriter } from '@/features/schedule/scheduleWriter';
import { saveWorkout } from './saveWorkout';

const clock = fixedOffsetClock(120);

async function setup() {
  const { repos } = createTestData();
  const writer = createScheduleWriter({ repos, meta: memoryMetaStore(), clock });
  const client = await repos.clients.create({
    name: 'سارة', phone: '', gender: null, birthDate: null, goal: 'fitness', goalNote: '', injuries: [], measurements: {},
    package: { name: '', totalSessions: 12, priceMinor: 0, currency: 'EGP' }, startDate: null, endDate: null,
    remainingSessions: 5, notes: '', photoId: null,
  });
  return { repos, writer, clientId: client.id as ClientId };
}

const stateFor = (clientId: string, startedAt: number, scheduleSessionId: string | null) => {
  const s = createSession({ key: 'k1', clientId, programId: null, day: null, scheduleSessionId, history: [], now: startedAt });
  return { ...s, exercises: [{ programItemId: null, exerciseId: 'squat', targetReps: '8', restSec: 60, tempo: '', rpe: null, supersetGroup: null, sets: [{ weightKg: 60, reps: 8, done: true, doneAt: startedAt, touched: true }], skipped: false, note: '' }] };
};

describe('saveWorkout', () => {
  it('marks the booking it was started from as attended and links the log to it', async () => {
    const { repos, writer, clientId } = await setup();
    const booked = await writer.book({ clientId, notes: '', date: '2026-11-17', startMinute: 600, durationMinutes: 60, repeat: null });
    if (!booked.ok) throw new Error(booked.error);
    const sid = booked.value.sessions[0]!.id;
    const startedAt = booked.value.sessions[0]!.startsAt;
    const r = await saveWorkout({ repos, writer, clock }, stateFor(clientId, startedAt, sid), '2026-11-17', new Date(startedAt + 3_600_000));
    expect(r.session?.id).toBe(sid);
    expect(r.log.sessionId).toBe(sid);
    expect((await repos.sessions.get(sid))?.attendance).toBe('attended');
    expect(r.client?.remainingSessions).toBe(4);
  });

  it('without a booking, books one at the start time and counts it', async () => {
    const { repos, writer, clientId } = await setup();
    const startedAt = Date.UTC(2026, 10, 17, 8, 0);
    const r = await saveWorkout({ repos, writer, clock }, stateFor(clientId, startedAt, null), '2026-11-17', new Date(startedAt + 50 * 60_000));
    expect(r.session?.startsAt).toBe(startedAt);
    expect(r.session?.durationMin).toBe(50);
    expect(r.client?.remainingSessions).toBe(4);
    expect(await repos.workoutLogs.listByClient(clientId)).toHaveLength(1);
  });

  it('does not count twice when the session was already marked', async () => {
    const { repos, writer, clientId } = await setup();
    const booked = await writer.book({ clientId, notes: '', date: '2026-11-17', startMinute: 600, durationMinutes: 60, repeat: null });
    if (!booked.ok) throw new Error(booked.error);
    const s = booked.value.sessions[0]!;
    await writer.mark(s, 'attended');
    const r = await saveWorkout({ repos, writer, clock }, stateFor(clientId, s.startsAt, s.id), '2026-11-17', new Date(s.startsAt + 3_600_000));
    expect(r.client?.remainingSessions).toBe(4);
  });
});
