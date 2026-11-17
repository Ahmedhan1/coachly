import { classifyHttpError, modelChain, parseChatReply, retryAfterSeconds, type AiError, type ChatMessage, type ChatReply, type ToolDefinition } from '@/domain/ai';
import { err, ok, type Result } from '@/domain/nutrition/result';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

export type ChatFailure = { error: AiError; retryAfterSec?: number };

/** Chat completions (Groq, OpenAI-compatible). Never throws; every failure is a typed error. */
export interface ChatService {
  complete(req: ChatRequest, signal?: AbortSignal): Promise<Result<ChatReply, AiError> & { retryAfterSec?: number }>;
}

type Fetch = typeof fetch;

/**
 * Calls Groq straight from the phone with the trainer's own free key (stored only on the device).
 * Short timeout, no automatic retries (the trainer taps retry). A decommissioned or unknown model falls
 * back to the next free model.
 */
export class GroqChatService implements ChatService {
  constructor(
    private readonly fetchFn: Fetch = (...a) => fetch(...a),
    private readonly timeoutMs = 45_000,
  ) {}

  async complete(req: ChatRequest, signal?: AbortSignal): Promise<Result<ChatReply, AiError> & { retryAfterSec?: number }> {
    if (!req.apiKey) return err('no_key');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return err('offline');
    let last: AiError = 'model_unavailable';
    for (const model of modelChain(req.model)) {
      const r = await this.once(model, req, signal);
      if (r.ok) return r;
      if (r.error !== 'next_model') return r.retryAfterSec !== undefined ? { ...err(r.error), retryAfterSec: r.retryAfterSec } : err(r.error);
      last = 'model_unavailable';
    }
    return err(last);
  }

  private async once(model: string, req: ChatRequest, outer?: AbortSignal): Promise<Result<ChatReply, AiError | 'next_model'> & { retryAfterSec?: number }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const onAbort = () => ctrl.abort();
    outer?.addEventListener('abort', onAbort);
    try {
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
      const res = await this.fetchFn(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const verdict = classifyHttpError(res.status, data);
        if (verdict === 'rate_limited') return { ...err('rate_limited'), retryAfterSec: retryAfterSeconds(res.headers.get('retry-after')) };
        return err(verdict);
      }
      const reply = parseChatReply(data, model);
      return reply ? ok(reply) : err('bad_output');
    } catch {
      if (outer?.aborted) return err('failed');
      return err('offline');
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  }
}

/** Scripted replies for tests: each call returns the next entry. */
export class FakeChatService implements ChatService {
  readonly requests: ChatRequest[] = [];
  constructor(private readonly script: Array<Result<ChatReply, AiError>>) {}
  async complete(req: ChatRequest): Promise<Result<ChatReply, AiError>> {
    this.requests.push(req);
    return this.script.shift() ?? err('failed');
  }
}
