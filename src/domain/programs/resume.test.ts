import { describe, expect, it } from 'vitest';
import { resumeDecision, STALE_SESSION_MS } from './resume';
import type { SessionState } from './session';

const T0 = Date.UTC(2026, 10, 16, 15, 0, 0);

function saved(over: Partial<SessionState> = {}, doneSets = 1): SessionState {
  return {
    version: 1,
    key: 'k1',
    clientId: 'a',
    programId: 'p1',
    dayId: 'd1',
    scheduleSessionId: null,
    startedAt: T0,
    exercises: [
      {
        exerciseId: 'Squat',
        programItemId: null,
        targetReps: '10',
        skipped: false,
        sets: [0, 1].map((i) => ({ weightKg: 20, reps: 10, done: i < doneSets })),
      },
    ] as unknown as SessionState['exercises'],
    current: { exercise: 0, set: 0 },
    rest: null,
    lastRecord: null,
    records: [],
    ...over,
  };
}

const req = { routeKey: 'new', clientId: 'a', dayId: null as string | null };

describe('resumeDecision', () => {
  it('starts fresh when nothing is saved', () => {
    expect(resumeDecision(null, req, T0)).toBe('fresh');
  });

  it('resumes the same client\'s recent session', () => {
    expect(resumeDecision(saved(), req, T0 + 60_000)).toBe('resume');
    expect(resumeDecision(saved(), { ...req, dayId: 'd1' }, T0)).toBe('resume');
  });

  it('resumes by route key', () => {
    expect(resumeDecision(saved(), { ...req, routeKey: 'k1', clientId: 'a' }, T0 + STALE_SESSION_MS * 3)).toBe('resume');
  });

  it('asks before replacing another client\'s session that has sets done', () => {
    expect(resumeDecision(saved(), { ...req, clientId: 'b' }, T0)).toBe('ask');
  });

  it('asks when the same client\'s session is old or for another day', () => {
    expect(resumeDecision(saved(), req, T0 + STALE_SESSION_MS + 1)).toBe('ask');
    expect(resumeDecision(saved(), { ...req, dayId: 'd2' }, T0)).toBe('ask');
    expect(resumeDecision(saved(), { ...req, routeKey: 'other' }, T0)).toBe('ask');
  });

  it('silently replaces a session with nothing done', () => {
    expect(resumeDecision(saved({}, 0), { ...req, clientId: 'b' }, T0)).toBe('fresh');
    expect(resumeDecision(saved({}, 0), req, T0 + STALE_SESSION_MS + 1)).toBe('fresh');
  });
});
