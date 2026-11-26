import { describe, expect, it } from 'vitest';
import { harness, readJson } from './helpers';

describe('without an R2 bucket (owner has not enabled R2 yet)', () => {
  it('storage routes answer 503 storage_unavailable while activation still works', async () => {
    const h = await harness();
    const token = await h.account();
    (h.deps.cloud as { bucket: unknown }).bucket = undefined;
    const backup = await h.authed('/api/backup', token);
    expect(backup.status).toBe(503);
    expect(await readJson(backup)).toEqual({ error: 'storage_unavailable' });
    expect((await h.send('/c/abcdefghijklmnopqrstuv')).status).toBe(503);
    expect((await h.authed('/api/account', token)).status).toBe(200);
  });
});
