import { describe, expect, it } from 'vitest';
import { GroqAiService } from './aiService';
import { FakeChatService, GROQ_URL, GroqChatService } from './chatService';

type Call = { url: string; body: Record<string, unknown>; auth: string };

function fakeFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> } | 'network'>, calls: Call[]): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown>, auth: headers.get('Authorization') ?? '' });
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

describe('GroqAiService', () => {
  it('asks for JSON mode with the schema spelled out', async () => {
    const fake = new FakeChatService([{ ok: true, value: { content: '{"a":1}', toolCalls: [], model: 'm' } }]);
    const r = await new GroqAiService(fake).json({ apiKey: 'k', model: 'm' }, { system: 's', prompt: 'p', schema: { type: 'object' } });
    expect(r).toEqual({ ok: true, value: '{"a":1}' });
    expect(fake.requests[0]?.json).toBe(true);
    expect(fake.requests[0]?.messages[1]?.content).toContain('{"type":"object"}');
  });
});
