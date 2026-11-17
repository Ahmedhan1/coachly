import { describe, expect, it } from 'vitest';
import { bucketByDay, bucketByWeek, weekDates } from './buckets';
import { fixedOffsetClock } from './zone';

const clock = fixedOffsetClock(120);
const at = (iso: string, id: string) => ({ id, startMs: Date.parse(iso) });

describe('bucketByDay', () => {
  it('uses the local date, not the UTC date', () => {
    // 22:30Z on the 16th is 00:30 on the 17th in +02:00
    const r = bucketByDay([at('2026-11-16T22:30:00Z', 'late'), at('2026-11-16T08:00:00Z', 'b'), at('2026-11-16T06:00:00Z', 'a')], clock);
    expect(r.map((d) => [d.date, d.items.map((x) => x.id)])).toEqual([
      ['2026-11-16', ['a', 'b']],
      ['2026-11-17', ['late']],
    ]);
  });
});

describe('weekDates / bucketByWeek', () => {
  it('Saturday-first week', () => {
    expect(weekDates('2026-11-18')).toEqual([
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ]);
  });

  it('groups into weeks with all 7 days present', () => {
    const r = bucketByWeek([at('2026-11-16T08:00:00Z', 'mon'), at('2026-11-21T08:00:00Z', 'nextSat')], clock);
    expect(r.map((w) => w.weekStart)).toEqual(['2026-11-14', '2026-11-21']);
    expect(r[0]?.days).toHaveLength(7);
    expect(r[0]?.days[2]).toEqual({ date: '2026-11-16', items: [{ id: 'mon', startMs: Date.parse('2026-11-16T08:00:00Z') }] });
    expect(r[1]?.days[0]?.items.map((x) => x.id)).toEqual(['nextSat']);
  });
});
