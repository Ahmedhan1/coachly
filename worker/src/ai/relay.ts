import { authenticate } from '../cloud/auth';
import { json, readLimitedText } from '../http';
import type { Deps, RateRule } from '../ports';

/**
 * POST /api/ai/relay — fallback for the in-app assistant when Safari cannot reach Groq directly.
 *
 * - Needs a valid license token (`Authorization: Bearer`), like every cloud endpoint.
 * - The trainer's own Groq key arrives in `X-Groq-Key` and is only forwarded: never logged, stored or echoed.
 * - Body ≤ 64 KB, only known chat-completion fields are forwarded (no streaming).
 * - Rate limited per license: a per-minute cap in memory (no D1 write) plus a daily cap via authenticate().
 * - Answers with Groq's own status and body, so the app reads them exactly like a direct call.
 * Relay-own refusals use a string error ({ error: 'rate_limited' }); Groq's errors are objects.
 */

export const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const AI_RELAY_PATH = '/api/ai/relay';
export const AI_RELAY_MAX_BODY = 64 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;

export const AI_RULES = {
  /** Per license, per isolate (memory only). Groq's free tier itself allows about 30 requests a minute. */
  minute: { name: 'ai-relay-min', limit: 30, windowSeconds: 60 },
  /** Per license, durable (memory pre-filter + D1). */
  day: { name: 'ai-relay-day', limit: 2000, windowSeconds: 86_400 },
} as const satisfies Record<string, RateRule>;

const GROQ_KEY = /^gsk_[A-Za-z0-9]{20,200}$/;
const FORWARDED = ['model', 'messages', 'tools', 'tool_choice', 'temperature', 'max_tokens', 'top_p', 'response_format', 'parallel_tool_calls'] as const;

export type Upstream = (input: string, init: RequestInit) => Promise<Response>;
const defaultUpstream: Upstream = (input, init) => fetch(input, init);

export async function handleAiRelay(request: Request, deps: Deps, clientKey: string, upstream: Upstream = defaultUpstream): Promise<Response> {
  const auth = await authenticate(request, deps, clientKey, AI_RULES.day);
  if (!auth.ok) return auth.response;

  const now = deps.now();
  if (!(await deps.localLimiter.hit(AI_RULES.minute, auth.who.lid, now))) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(AI_RULES.minute.windowSeconds - (now % AI_RULES.minute.windowSeconds)) });
  }

  const key = (request.headers.get('X-Groq-Key') ?? '').trim();
  if (!GROQ_KEY.test(key)) return json({ error: 'bad_key' }, 400);

  const text = await readLimitedText(request, AI_RELAY_MAX_BODY);
  if (text === null) return json({ error: 'too_large' }, 413);
  const body = pickBody(text);
  if (body === null) return json({ error: 'bad_request' }, 400);

  let res: Response;
  try {
    res = await upstream(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json({ error: 'upstream' }, 502);
  }
  const out = await readCapped(res);
  if (out === null) return json({ error: 'upstream' }, 502);
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter !== null && /^\d+(\.\d+)?$/.test(retryAfter)) headers['Retry-After'] = retryAfter;
  return new Response(out, { status: res.status, headers });
}

/** Only known chat-completion fields; `model` and `messages` are required. Streaming is never relayed. */
export function pickBody(text: string): Record<string, unknown> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  if (typeof src.model !== 'string' || src.model.length === 0 || src.model.length > 100) return null;
  if (!Array.isArray(src.messages) || src.messages.length === 0 || src.messages.length > 200) return null;
  const out: Record<string, unknown> = { stream: false };
  for (const k of FORWARDED) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

async function readCapped(res: Response): Promise<string | null> {
  try {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_RESPONSE_BYTES) return null;
    return new TextDecoder().decode(buf);
  } catch {
    return null;
  }
}
