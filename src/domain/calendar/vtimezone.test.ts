import { describe, expect, it } from 'vitest';
import { clockFromOffsetFunction } from '../schedule/zone';
import { buildVTimezone, findTransitions } from './vtimezone';
import { formatOffset, formatUtc } from './format';

// Synthetic zone: +60 before 2030-03-10T01:00Z, +120 until 2030-10-20T01:00Z, then +60.
const dstStart = Date.parse('2030-03-10T01:00:00Z');
const dstEnd = Date.parse('2030-10-20T01:00:00Z');
const clock = clockFromOffsetFunction((t) => (t >= dstStart && t < dstEnd ? 120 : 60));

describe('findTransitions', () => {
  it('locates transitions to the minute', () => {
    expect(findTransitions(clock, Date.parse('2030-01-01T00:00:00Z'), Date.parse('2031-01-01T00:00:00Z'))).toEqual([
      { atMs: dstStart, fromMinutes: 60, toMinutes: 120 },
      { atMs: dstEnd, fromMinutes: 120, toMinutes: 60 },
    ]);
  });
});

describe('buildVTimezone', () => {
  it('emits base + DAYLIGHT + STANDARD with DTSTART in the pre-transition local time', () => {
    const lines = buildVTimezone('Test/Zone', clock, Date.parse('2030-01-01T00:00:00Z'), Date.parse('2031-01-01T00:00:00Z'));
    expect(lines).toEqual([
      'BEGIN:VTIMEZONE',
      'TZID:Test/Zone',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0100',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:20300310T020000', // 01:00Z at +01:00
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'DTSTART:20301020T030000', // 01:00Z at +02:00
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'END:STANDARD',
      'END:VTIMEZONE',
    ]);
  });
});

describe('format helpers', () => {
  it('offsets and UTC stamps', () => {
    expect(formatOffset(120)).toBe('+0200');
    expect(formatOffset(-210)).toBe('-0330');
    expect(formatOffset(0)).toBe('+0000');
    expect(formatUtc(Date.parse('2026-11-16T10:05:07Z'))).toBe('20261116T100507Z');
  });
});
