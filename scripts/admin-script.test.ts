import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ADMIN_SCRIPT } from '../worker/src/admin/script';

describe('admin page script (worker/src/admin/script.ts)', () => {
  it('is valid JavaScript (a syntax error silently turns off dialogs, quick actions and copy buttons)', () => {
    expect(() => new Script(ADMIN_SCRIPT)).not.toThrow();
  });
});
