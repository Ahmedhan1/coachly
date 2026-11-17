import { describe, expect, it } from 'vitest';
import { SENT_LOG_MAX_ENTRIES } from '@/domain/outbox';
import { memoryMetaStore } from '@/services/license/metaStore';
import { markSent, readSent } from './useOutbox';

const NOW = new Date('2026-11-17T10:00:00Z');

describe('outbox sent log', () => {
  it('keeps the newest entries when the stored log is over the cap, instead of dropping it', async () => {
    const big = Array.from({ length: 6000 }, (_, i) => ({ id: `m${i}`, at: NOW.getTime() - 1000 }));
    const meta = memoryMetaStore({ 'outbox.sent': big });
    const sent = await readSent(meta);
    expect(sent).toHaveLength(SENT_LOG_MAX_ENTRIES);
    expect(sent.at(-1)?.id).toBe('m5999');
  });

  it('skips malformed entries but keeps the valid ones', async () => {
    const meta = memoryMetaStore({ 'outbox.sent': [{ id: 'a', at: 1 }, { id: 2 }, 'x', { id: 'b', at: 2 }] });
    expect((await readSent(meta)).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('marks and unmarks at the given time', async () => {
    const meta = memoryMetaStore();
    await markSent(meta, 'k1', true, NOW);
    expect(await readSent(meta)).toEqual([{ id: 'k1', at: NOW.getTime() }]);
    await markSent(meta, 'k1', false, NOW);
    expect(await readSent(meta)).toEqual([]);
  });
});
