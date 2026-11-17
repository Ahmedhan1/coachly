import { describe, expect, it } from 'vitest';
import { GroqAiService } from './aiService';
import { FakeChatService, GROQ_URL, GroqChatService } from './chatService';

type Call = { url: string; body: Record<string, unknown>; auth: string; groqKey: string | null };

function fakeFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> } | 'network'>, calls: Call[]): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown>, auth: headers.get('Authorization') ?? '', groqKey: headers.get('X-Groq-Key') });
    const r = responses.shift();
    if (!r || r === 'network') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
}

const okBody = (content: string) => ({ model: 'llama-3.3-70b-versatile', choices: [{ message: { content } }] });
const req = { apiKey: 'gsk_test', model: 'llama-3.3-70b-versatile', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('GroqChatService', () => {
  it('posts an OpenAI-compatible request with the bearer key and tools', async () => {
    const calls: Call[] = [];
    const svc = new GroqChatService(fakeFetch([{ status: 200, body: okBody('أهلاً') }], calls));
    const r = await svc.complete({ ...req, tools: [{ type: 'function', function: { name: 'x', description: 'd', parameters: {} } }] });
    expect(r).toMatchObject({ ok: true, value: { content: 'أهلاً' } });
    expect(calls[0]?.url).toBe(GROQ_URL);
    expect(calls[0]?.auth).toBe('Bearer gsk_test');
    expect(calls[0]?.body).toMatchObject({ model: 'llama-3.3-70b-versatile', tool_choice: 'auto' });
  });

  it('falls back to the next free model when the chosen one is gone', async () => {
    const calls: Call[] = [];
    const svc = new GroqChatService(fakeFetch([{ status: 400, body: { error: { code: 'model_decommissioned', message: 'gone' } } }, { status: 200, body: okBody('تمام') }], calls));
    const r = await svc.complete(req);
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.body.model)).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
  });

  it('maps 429 with retry-after, 401, network errors and missing key', async () => {
    const calls: Call[] = [];
    expect(await new GroqChatService(fakeFetch([{ status: 429, body: {}, headers: { 'retry-after': '12' } }], calls)).complete(req)).toEqual({ ok: false, error: 'rate_limited', retryAfterSec: 12 });
    expect(await new GroqChatService(fakeFetch([{ status: 401, body: {} }], calls)).complete(req)).toEqual({ ok: false, error: 'auth' });
    expect(await new GroqChatService(fakeFetch(['network'], calls)).complete(req)).toEqual({ ok: false, error: 'offline' });
    expect(await new GroqChatService(fakeFetch([], calls)).complete({ ...req, apiKey: '' })).toEqual({ ok: false, error: 'no_key' });
  });

  it('reports bad output for an unreadable body', async () => {
    const calls: Call[] = [];
    expect(await new GroqChatService(fakeFetch([{ status: 200, body: { choices: [] } }], calls)).complete(req)).toEqual({ ok: false, error: 'bad_output' });
  });
});

describe('GroqChatService relay fallback', () => {
  const relay = (token: string | null = 'lic.tok') => ({ baseUrl: 'https://worker.example/', getToken: async () => token });

  it('retries a CORS/network failure through the Worker relay and then keeps using it', async () => {
    const calls: Call[] = [];
    const svc = new GroqChatService(fakeFetch(['network', { status: 200, body: okBody('أهلاً') }, { status: 200, body: okBody('تاني') }], calls), { relay: relay() });
    expect(await svc.complete(req)).toMatchObject({ ok: true, value: { content: 'أهلاً' } });
    expect(calls[1]).toMatchObject({ url: 'https://worker.example/api/ai/relay', auth: 'Bearer lic.tok', groqKey: 'gsk_test' });
    await svc.complete(req);
    expect(calls[2]?.url).toBe('https://worker.example/api/ai/relay');
  });

  it('does not relay HTTP errors or timeouts, and needs an activated license', async () => {
    const calls: Call[] = [];
    const svc = new GroqChatService(fakeFetch([{ status: 401, body: { error: { message: 'Invalid API Key' } } }], calls), { relay: relay() });
    expect(await svc.complete(req)).toEqual({ ok: false, error: 'auth' });
    expect(calls).toHaveLength(1);
    const noLicense = new GroqChatService(fakeFetch(['network'], calls), { relay: relay(null) });
    expect(await noLicense.complete(req)).toEqual({ ok: false, error: 'offline' });
    const slow = new GroqChatService(
      ((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch,
      { relay: relay(), timeoutMs: 5 },
    );
    expect(await slow.complete(req)).toEqual({ ok: false, error: 'timeout' });
  });

  it('maps the relay own refusals and Groq 429 passed through it', async () => {
    const calls: Call[] = [];
    const own = new GroqChatService(fakeFetch(['network', { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '30' } }], calls), { relay: relay() });
    expect(await own.complete(req)).toEqual({ ok: false, error: 'rate_limited', retryAfterSec: 30 });
    const upstream = new GroqChatService(fakeFetch(['network', { status: 502, body: { error: 'upstream' } }], calls), { relay: relay() });
    expect(await upstream.complete(req)).toEqual({ ok: false, error: 'offline' });
    const groq429 = new GroqChatService(fakeFetch(['network', { status: 429, body: { error: { message: 'Please try again in 7.2s' } } }], calls), { relay: relay() });
    expect(await groq429.complete(req)).toEqual({ ok: false, error: 'rate_limited', retryAfterSec: 8 });
  });

  it('is silently offline when the browser says so (no request)', async () => {
    const calls: Call[] = [];
    expect(await new GroqChatService(fakeFetch([], calls), { isOnline: () => false }).complete(req)).toEqual({ ok: false, error: 'offline' });
    expect(calls).toHaveLength(0);
  });

  it('pings with one token and reports a missing model', async () => {
    const calls: Call[] = [];
    expect(await new GroqChatService(fakeFetch([{ status: 200, body: { choices: [] } }], calls)).ping('gsk_x', 'm1')).toEqual({ ok: true, value: 'm1' });
    expect(calls[0]?.body).toMatchObject({ model: 'm1', max_tokens: 1 });
    expect(await new GroqChatService(fakeFetch([{ status: 404, body: { error: { code: 'model_not_found' } } }], calls)).ping('gsk_x', 'gone')).toEqual({ ok: false, error: 'model_unavailable' });
  });
});

describe('GroqAiService', () => {
  it('asks for JSON mode with the schema spelled out', async () => {
    const fake = new FakeChatService([{ ok: true, value: { content: '{"a":1}', toolCalls: [], model: 'm' } }]);
    const r = await new GroqAiService(fake).json({ apiKey: 'k', model: 'm' }, { system: 's', prompt: 'p', schema: { type: 'object' } });
    expect(r).toEqual({ ok: true, value: '{"a":1}' });
    expect(fake.requests[0]?.json).toBe(true);
    expect(fake.requests[0]?.messages[1]?.content).toContain('{"type":"object"}');
  });
});
