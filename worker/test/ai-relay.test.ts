import { describe, expect, it } from 'vitest';
import { AI_RELAY_MAX_BODY, AI_RULES, GROQ_CHAT_URL, handleAiRelay, pickBody, type Upstream } from '../src/ai/relay';
import { BASE, freshIp, harness, readJson, type Harness } from './helpers';
import { TEST_APP_ORIGIN } from './fixtures';

const KEY = 'gsk_abcdefghijklmnopqrstuvwxyz0123';
const BODY = { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'أهلاً' }], max_tokens: 50, stream: true, user: 'x' };

type Seen = { url: string; auth: string | null; body: Record<string, unknown> };

function fakeUpstream(seen: Seen[], reply: () => Response | Promise<Response> = () => Response.json({ choices: [{ message: { content: 'تمام' } }] })): Upstream {
  return async (url, init) => {
    seen.push({ url, auth: new Headers(init.headers).get('Authorization'), body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return reply();
  };
}

async function relay(h: Harness, token: string | null, upstream: Upstream, init: { body?: string; key?: string | null; ip?: string } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'CF-Connecting-IP': init.ip ?? h.ip });
  if (token !== null) headers.set('Authorization', `Bearer ${token}`);
  if (init.key !== null) headers.set('X-Groq-Key', init.key ?? KEY);
  const request = new Request(`${BASE}/api/ai/relay`, { method: 'POST', headers, body: init.body ?? JSON.stringify(BODY) });
  return handleAiRelay(request, h.deps, await h.deps.crypto.hashClient(init.ip ?? h.ip), upstream);
}

describe('POST /api/ai/relay', () => {
  it('is registered and needs an account session (never calls Groq without one)', async () => {
    const h = await harness();
    const res = await h.send('/api/ai/relay', { method: 'POST', headers: { 'X-Groq-Key': KEY }, body: '{}' });
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'invalid' });
    const seen: Seen[] = [];
    expect((await relay(h, null, fakeUpstream(seen))).status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it('forwards only known fields with the trainer key and returns Groq answer as is', async () => {
    const h = await harness();
    const token = await h.account();
    const seen: Seen[] = [];
    const res = await relay(h, token, fakeUpstream(seen));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ choices: [{ message: { content: 'تمام' } }] });
    expect(seen[0]).toEqual({
      url: GROQ_CHAT_URL,
      auth: `Bearer ${KEY}`,
      body: { stream: false, model: BODY.model, messages: BODY.messages, max_tokens: 50 },
    });
  });

  it('passes Groq errors and retry-after through', async () => {
    const h = await harness();
    const token = await h.account();
    const res = await relay(h, token, fakeUpstream([], () => Response.json({ error: { message: 'Rate limit', code: 'rate_limit_exceeded' } }, { status: 429, headers: { 'retry-after': '12' } })));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('12');
    expect(await readJson(res)).toEqual({ error: { message: 'Rate limit', code: 'rate_limit_exceeded' } });
  });

  it('refuses a missing or odd Groq key, a bad body and a body over 64 KB', async () => {
    const h = await harness();
    const token = await h.account();
    const seen: Seen[] = [];
    expect(await readJson(await relay(h, token, fakeUpstream(seen), { key: null }))).toEqual({ error: 'bad_key' });
    expect(await readJson(await relay(h, token, fakeUpstream(seen), { key: 'sk-ant-xyz' }))).toEqual({ error: 'bad_key' });
    expect((await relay(h, token, fakeUpstream(seen), { body: '{"model":"m"}' })).status).toBe(400);
    expect((await relay(h, token, fakeUpstream(seen), { body: 'not json' })).status).toBe(400);
    const big = JSON.stringify({ ...BODY, messages: [{ role: 'user', content: 'x'.repeat(AI_RELAY_MAX_BODY) }] });
    expect((await relay(h, token, fakeUpstream(seen), { body: big })).status).toBe(413);
    expect(seen).toHaveLength(0);
  });

  it('answers 502 upstream when Groq cannot be reached', async () => {
    const h = await harness();
    const token = await h.account();
    const res = await relay(h, token, async () => {
      throw new TypeError('network');
    });
    expect(res.status).toBe(502);
    expect(await readJson(res)).toEqual({ error: 'upstream' });
  });

  it('rate limits per account (per minute, in memory)', async () => {
    const h = await harness();
    const token = await h.account();
    const seen: Seen[] = [];
    let last: Response | null = null;
    for (let i = 0; i <= AI_RULES.minute.limit; i++) last = await relay(h, token, fakeUpstream(seen), { ip: freshIp() });
    expect(last?.status).toBe(429);
    expect(await readJson(last as Response)).toEqual({ error: 'rate_limited' });
    expect(Number(last?.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(seen).toHaveLength(AI_RULES.minute.limit);
  });

  it('refuses a disabled account', async () => {
    const h = await harness();
    const token = await h.account();
    await h.disable(token);
    expect((await relay(h, token, fakeUpstream([]))).status).toBe(403);
  });

  it('allows the X-Groq-Key header in CORS preflight and exposes Retry-After', async () => {
    const h = await harness();
    const pre = await h.send('/api/ai/relay', { method: 'OPTIONS', headers: { Origin: TEST_APP_ORIGIN } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('X-Groq-Key');
    expect(pre.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After');
  });
});

describe('pickBody', () => {
  it('keeps only chat-completion fields and forces no streaming', () => {
    expect(pickBody(JSON.stringify({ model: 'm', messages: [{}], tools: [], evil: 1, stream: true }))).toEqual({ stream: false, model: 'm', messages: [{}], tools: [] });
    expect(pickBody('[]')).toBeNull();
    expect(pickBody(JSON.stringify({ model: 'm', messages: [] }))).toBeNull();
  });
});
