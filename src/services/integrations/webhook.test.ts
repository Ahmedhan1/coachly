import { describe, expect, it } from 'vitest';
import { postWebhook } from './webhook';

describe('postWebhook', () => {
  it('posts JSON to https only and reports delivery without throwing', async () => {
    const calls: string[] = [];
    const ok = (async (url: string) => (calls.push(url), new Response(null, { status: 200 }))) as unknown as typeof fetch;
    const boom = (async () => {
      throw new Error('net');
    }) as unknown as typeof fetch;
    expect(await postWebhook('https://n8n.example/hook', { event: 'test', at: 'now' }, ok)).toBe(true);
    expect(await postWebhook('http://insecure.example', { event: 'test', at: 'now' }, ok)).toBe(false);
    expect(await postWebhook('https://n8n.example/hook', { event: 'test', at: 'now' }, boom)).toBe(false);
    expect(calls).toEqual(['https://n8n.example/hook']);
  });
});
