import { describe, expect, it } from 'vitest';
import { sessionForWorkout, splitClientSessions } from './sessions';

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 17, 12);
const s = (id: string, startOffsetH: number, attendance: 'scheduled' | 'attended' | 'missed' | 'cancelled' = 'scheduled') => ({
  id,
  startsAt: NOW + startOffsetH * H,
  durationMin: 60,
  attendance,
});

describe('splitClientSessions', () => {
  it('upcoming (soonest first, running one included), past newest first, with attendance counts', () => {
    const r = splitClientSessions([s('past1', -48, 'attended'), s('soon', 24), s('running', -0.5), s('past2', -24, 'missed'), s('c', 5, 'cancelled'), s('forgot', -72)], NOW);
    expect(r.upcoming.map((x) => x.id)).toEqual(['running', 'soon']);
    expect(r.past.map((x) => x.id)).toEqual(['c', 'past2', 'past1', 'forgot']);
    expect(r.counts).toEqual({ attended: 1, missed: 1, cancelled: 1, unmarked: 1 });
  });
});

describe('sessionForWorkout', () => {
  const dayStart = Date.UTC(2026, 10, 17);
  const dayEnd = dayStart + 24 * H;
  it('picks the still-scheduled session today nearest to now', () => {
    const r = sessionForWorkout([s('morning', -4), s('noon', -0.25), s('done', -1, 'attended'), s('tomorrow', 20)], dayStart, dayEnd, NOW);
    expect(r?.id).toBe('noon');
  });
  it('is null when nothing is scheduled today', () => {
    expect(sessionForWorkout([s('done', -1, 'attended'), s('tomorrow', 20)], dayStart, dayEnd, NOW)).toBeNull();
  });
});
