import { wallMsToLocal, type LocalDateTime } from '../schedule/zone';

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** Local DATE-TIME form `YYYYMMDDTHHMMSS` (used with TZID). */
export function formatLocal(local: LocalDateTime): string {
  const h = Math.floor(local.minute / 60);
  const m = local.minute % 60;
  return `${local.date.replace(/-/g, '')}T${pad(h)}${pad(m)}00`;
}

/** UTC DATE-TIME form `YYYYMMDDTHHMMSSZ` (seconds kept). */
export function formatUtc(epochMs: number): string {
  const local = wallMsToLocal(epochMs);
  const sec = Math.floor((((epochMs % 60_000) + 60_000) % 60_000) / 1000);
  return `${formatLocal(local).slice(0, -2)}${pad(sec)}Z`;
}

/** UTC offset `+0200` / `-0330`. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const a = Math.abs(minutes);
  return `${sign}${pad(Math.floor(a / 60))}${pad(a % 60)}`;
}
