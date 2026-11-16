import type { Client } from './client';
import type { IsoDate } from './common';
import { daysBetween } from './dates';

export type ClientAttention =
  | { kind: 'ending_soon'; daysLeft: number }
  | { kind: 'ended'; daysAgo: number }
  | { kind: 'low_sessions'; remaining: number };

/**
 * Why a client's subscription needs the trainer's attention today, or null.
 * Thresholds are parameters so they can become trainer settings later.
 */
export function subscriptionAttention(
  client: Pick<Client, 'endDate' | 'remainingSessions' | 'package'>,
  today: IsoDate,
  withinDays = 7,
  lowSessions = 2,
): ClientAttention | null {
  if (client.endDate) {
    const left = daysBetween(today, client.endDate);
    if (left < 0) return { kind: 'ended', daysAgo: -left };
    if (left <= withinDays) return { kind: 'ending_soon', daysLeft: left };
  }
  if (client.package && client.package.totalSessions > 0 && client.remainingSessions <= lowSessions) {
    return { kind: 'low_sessions', remaining: client.remainingSessions };
  }
  return null;
}

/** True when the client has no progress check-in within `afterDays` (or never). */
export function needsFollowUp(lastCheckIn: IsoDate | null, today: IsoDate, afterDays = 14): boolean {
  if (lastCheckIn === null) return true;
  return daysBetween(lastCheckIn, today) > afterDays;
}
