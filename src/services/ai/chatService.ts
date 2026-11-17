import { classifyHttpError, GROQ_CHAT_URL, modelChain, parseChatReply, retryAfterSeconds, type AiError, type ChatMessage, type ChatReply, type ToolDefinition } from '@/domain/ai';
import { err, ok, type Result } from '@/domain/nutrition/result';

export const GROQ_URL = GROQ_CHAT_URL;
/** Path of the fallback relay on our Worker (worker/src/ai/relay.ts). */
export const RELAY_PATH = '/api/ai/relay';

export interface ChatRequest {
  apiKey: string;
  model: string;
  messages: readonly ChatMessage[];
  tools?: readonly ToolDefinition[];
  /** Ask for one JSON object (Groq JSON mode). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export type ChatResult = Result<ChatReply, AiError> & { retryAfterSec?: number };

/** Chat completions (Groq, OpenAI-compatible). Never throws; every failure is a typed error. */
export interface ChatService {
  complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;
  /** Settings "test connection": one tiny request with this key and model. Resolves to the model that answered. */
  ping(apiKey: string, model: string, signal?: AbortSignal): Promise<Result<string, AiError> & { retryAfterSec?: number }>;
}

/** Our Worker relays the request when Safari cannot reach Groq directly (CORS / blocked network path). */
export interface RelayConfig {
  /** Worker base URL (no trailing slash). */
  baseUrl: string;
  /** License token for `Authorization: Bearer`; null = not activated (relay unavailable). */
  getToken(): Promise<string | null>;
}

export interface GroqChatOptions {
  timeoutMs?: number;
  relay?: RelayConfig | null;
  isOnline?: () => boolean;
}

type Fetch = typeof fetch;
type Raw = { kind: 'http'; status: number; data: unknown; retryAfter: string | null; viaRelay: boolean } | { kind: 'network' } | { kind: 'timeout' } | { kind: 'aborted' };
type Verdict = Result<ChatReply, AiError | 'next_model'> & { retryAfterSec?: number };

const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * Calls Groq straight from the phone with the trainer's own free key (stored only on the device). If the
 * direct call fails at the network level (CORS or a blocked path — not an HTTP error) it retries once through
 * the Worker relay, and keeps using the relay for the rest of the session. Short timeout, no automatic retry
 * loops (the trainer taps retry). A decommissioned or unknown model falls back to the next free model.
 */
export class GroqChatService implements ChatService {
  private preferRelay = false;
  private readonly timeoutMs: number;
  private readonly relay: RelayConfig | null;
  private readonly isOnline: () => boolean;

  constructor(
    private readonly fetchFn: Fetch = (...a) => fetch(...a),
    opts: GroqChatOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 45_000;
    this.relay = opts.relay ?? null;
    this.isOnline = opts.isOnline ?? browserOnline;
  }

  async complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
    if (!req.apiKey) return err('no_key');
    if (!this.isOnline()) return err('offline');
    for (const model of modelChain(req.model)) {
      const r = this.verdict(await this.post(req.apiKey, bodyFor(model, req), signal), model);
      if (r.ok) return r;
      if (r.error !== 'next_model') return r.retryAfterSec !== undefined ? { ...err(r.error), retryAfterSec: r.retryAfterSec } : err(r.error);
    }
    return err('model_unavailable');
  }

  async ping(apiKey: string, model: string, signal?: AbortSignal): Promise<Result<string, AiError> & { retryAfterSec?: number }> {
    if (!apiKey) return err('no_key');
    if (!this.isOnline()) return err('offline');
    const raw = await this.post(apiKey, { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, temperature: 0 }, signal);
    if (raw.kind !== 'http') return err(raw.kind === 'timeout' ? 'timeout' : raw.kind === 'aborted' ? 'failed' : 'offline');
    if (raw.status >= 200 && raw.status < 300) return ok(model);
    const v = this.httpError(raw);
    if (v.error === 'next_model') return err('model_unavailable');
    return v.retryAfterSec !== undefined ? { ...err(v.error), retryAfterSec: v.retryAfterSec } : err(v.error);
  }

  private verdict(raw: Raw, model: string): Verdict {
    if (raw.kind === 'timeout') return err('timeout');
    if (raw.kind === 'aborted') return err('failed');
    if (raw.kind === 'network') return err('offline');
    if (raw.status < 200 || raw.status >= 300) return this.httpError(raw);
    const reply = parseChatReply(raw.data, model);
    return reply ? ok(reply) : err('bad_output');
  }

  private httpError(raw: Extract<Raw, { kind: 'http' }>): { ok: false; error: AiError | 'next_model'; retryAfterSec?: number } {
    // The relay's own refusals carry a string error ({ error: 'rate_limited' }); Groq's carry an object.
    const own = raw.viaRelay ? relayError(raw.data) : null;
    if (own === 'rate_limited' || (own === null && raw.status === 429)) return { ok: false, error: 'rate_limited', retryAfterSec: retryAfterSeconds(raw.retryAfter, raw.data) };
    if (own === 'upstream') return err('offline');
    if (own !== null) return err('failed');
    return err(classifyHttpError(raw.status, raw.data));
  }

  /** Direct first; on a network-level failure, the relay (when configured and activated). */
  private async post(apiKey: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Raw> {
    if (!this.preferRelay) {
      const direct = await this.send(GROQ_URL, { Authorization: `Bearer ${apiKey}` }, body, signal, false);
      if (direct.kind !== 'network' || !this.relay) return direct;
    }
    const relayed = await this.viaRelay(apiKey, body, signal);
    if (relayed.kind === 'http') this.preferRelay = true;
    return relayed;
  }

  private async viaRelay(apiKey: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Raw> {
    if (!this.relay) return { kind: 'network' };
    const token = await this.relay.getToken().catch(() => null);
    if (!token) return { kind: 'network' };
    return this.send(`${this.relay.baseUrl.replace(/\/+$/, '')}${RELAY_PATH}`, { Authorization: `Bearer ${token}`, 'X-Groq-Key': apiKey }, body, signal, true);
  }

  private async send(url: string, headers: Record<string, string>, body: Record<string, unknown>, outer: AbortSignal | undefined, viaRelay: boolean): Promise<Raw> {
    if (outer?.aborted) return { kind: 'aborted' };
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, this.timeoutMs);
    const onAbort = () => ctrl.abort();
    outer?.addEventListener('abort', onAbort);
    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
      const data: unknown = await res.json().catch(() => null);
      return { kind: 'http', status: res.status, data, retryAfter: res.headers.get('retry-after'), viaRelay };
    } catch {
      if (outer?.aborted) return { kind: 'aborted' };
      return timedOut ? { kind: 'timeout' } : { kind: 'network' };
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  }
}

function bodyFor(model: string, req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    temperature: req.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? 2048,
  };
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = 'auto';
  }
  if (req.json) body.response_format = { type: 'json_object' };
  return body;
}

function relayError(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const e = (data as Record<string, unknown>).error;
  return typeof e === 'string' ? e : null;
}

/** Scripted replies for tests: each call returns the next entry. */
export class FakeChatService implements ChatService {
  readonly requests: ChatRequest[] = [];
  constructor(private readonly script: ChatResult[]) {}
  async complete(req: ChatRequest): Promise<ChatResult> {
    this.requests.push(req);
    return this.script.shift() ?? err('failed');
  }
  async ping(apiKey: string, model: string): Promise<Result<string, AiError>> {
    return apiKey ? ok(model) : err('no_key');
  }
}
