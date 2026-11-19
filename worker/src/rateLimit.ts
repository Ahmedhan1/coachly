import type { RateLimiter, RateRule } from './ports';

export const RULES = {
  activate: { name: 'activate', limit: 10, windowSeconds: 600 },
  activateGlobal: { name: 'activate-all', limit: 300, windowSeconds: 3600 },
  status: { name: 'status', limit: 120, windowSeconds: 3600 },
  login: { name: 'login', limit: 5, windowSeconds: 900 },
  loginGlobal: { name: 'login-all', limit: 30, windowSeconds: 3600 },
  admin: { name: 'admin', limit: 300, windowSeconds: 3600 },
  preflight: { name: 'preflight', limit: 120, windowSeconds: 600 },
  other: { name: 'other', limit: 60, windowSeconds: 600 },

  // ---- phase 9 (per license / device unless noted) ----
  /** Per IP, memory only: caps signature checks before any D1 write is spent. */
  cloudIp: { name: 'cloud-ip', limit: 600, windowSeconds: 600 },
  backupWrite: { name: 'backup-write', limit: 24, windowSeconds: 86_400 },
  backupPart: { name: 'backup-part', limit: 300, windowSeconds: 86_400 },
  backupRead: { name: 'backup-read', limit: 120, windowSeconds: 86_400 },
  pushSubscribe: { name: 'push-sub', limit: 20, windowSeconds: 3600 },
  pushSchedule: { name: 'push-schedule', limit: 60, windowSeconds: 3600 },
  shareWrite: { name: 'share-write', limit: 300, windowSeconds: 86_400 },
  checkinOwner: { name: 'checkin-owner', limit: 600, windowSeconds: 3600 },
  /** Public client-page reads: per page id and per IP. */
  shareReadPage: { name: 'share-read', limit: 120, windowSeconds: 3600 },
  shareReadIp: { name: 'share-read-ip', limit: 300, windowSeconds: 3600 },
  /** Public check-in posts: strict per IP, plus per page id. */
  checkinIpHour: { name: 'checkin-ip-h', limit: 6, windowSeconds: 3600 },
  checkinIpDay: { name: 'checkin-ip-d', limit: 20, windowSeconds: 86_400 },
  checkinPage: { name: 'checkin-page', limit: 10, windowSeconds: 86_400 },
  /** Cloud files: per license. */
  filesWrite: { name: 'files-write', limit: 400, windowSeconds: 86_400 },
  filesRead: { name: 'files-read', limit: 2000, windowSeconds: 86_400 },
  /** Client-page uploads (public, write token): per IP and per page. */
  clientFileIpHour: { name: 'client-file-ip-h', limit: 10, windowSeconds: 3600 },
  clientFilePage: { name: 'client-file-page', limit: 20, windowSeconds: 86_400 },
  /** Memory only (no D1 write): the static viewer page and the public VAPID key. */
  viewerPage: { name: 'viewer', limit: 120, windowSeconds: 600 },
  vapidKey: { name: 'vapid', limit: 60, windowSeconds: 600 },
} as const satisfies Record<string, RateRule>;

/**
 * Per-isolate counters. Free (no D1 write) but only sees requests that land on this isolate, so it is a
 * pre-filter in front of D1 and the only limiter for CORS preflights.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, { windowStart: number; count: number }>();

  constructor(private readonly maxEntries = 5000) {}

  async hit(rule: RateRule, key: string, now: number): Promise<boolean> {
    const windowStart = now - (now % rule.windowSeconds);
    const id = `${rule.name}:${key}`;
    const entry = this.counters.get(id);
    if (entry === undefined || entry.windowStart !== windowStart) {
      if (this.counters.size >= this.maxEntries) this.counters.clear();
      this.counters.set(id, { windowStart, count: 1 });
      return 1 <= rule.limit;
    }
    entry.count += 1;
    return entry.count <= rule.limit;
  }
}

/** Memory first (blocks floods without spending D1 writes), then the durable limiter decides. */
export class LayeredRateLimiter implements RateLimiter {
  constructor(
    private readonly first: RateLimiter,
    private readonly second: RateLimiter,
  ) {}

  async hit(rule: RateRule, key: string, now: number): Promise<boolean> {
    if (!(await this.first.hit(rule, key, now))) return false;
    return this.second.hit(rule, key, now);
  }
}
