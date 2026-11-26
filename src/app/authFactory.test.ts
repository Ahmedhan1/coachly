import { describe, expect, it } from 'vitest';
import { guestAllowedIn } from './authFactory';

describe('guestAllowedIn', () => {
  it('allows the guest button in dev and e2e builds only, never in production', () => {
    expect(guestAllowedIn({ dev: true, e2e: false })).toBe(true);
    expect(guestAllowedIn({ dev: false, e2e: true })).toBe(true);
    expect(guestAllowedIn({ dev: false, e2e: false })).toBe(false);
  });
});
