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
