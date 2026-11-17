import { z } from 'zod';

/**
 * Chat types in the OpenAI-compatible shape Groq speaks (POST /openai/v1/chat/completions).
 * Pure: no fetch here. The HTTP client in src/services/ai uses these to build requests and read replies.
 */

export type AiError = 'no_key' | 'disabled' | 'auth' | 'rate_limited' | 'offline' | 'timeout' | 'refused' | 'bad_output' | 'model_unavailable' | 'failed';

/** Groq's OpenAI-compatible endpoint (https://console.groq.com/docs/openai). */
export const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatReply {
  content: string | null;
  toolCalls: ToolCall[];
  model: string;
}

/**
 * Free Groq models that support tool calling. The first is the default; the rest are fallbacks.
 * Names as of 2026-11 — check console.groq.com/docs/models (and /docs/tool-use) before a release:
 * Groq retires models; a retired one answers 404/model_decommissioned and the chain moves on.
 */
export const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
export const FALLBACK_MODELS: readonly string[] = ['openai/gpt-oss-120b', 'llama-3.1-8b-instant'];
export const KNOWN_MODELS: readonly string[] = [DEFAULT_MODEL, ...FALLBACK_MODELS];

/** The chosen model first, then the fallbacks (no duplicates). */
export function modelChain(chosen: string): string[] {
  const first = chosen.trim() || DEFAULT_MODEL;
  return [first, ...KNOWN_MODELS.filter((m) => m !== first)];
}

const replySchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(z.object({ id: z.string(), type: z.literal('function').optional(), function: z.object({ name: z.string(), arguments: z.string() }) }))
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
});

/** Reads a chat completion body; null when it is not the expected shape. */
export function parseChatReply(body: unknown, requestedModel: string): ChatReply | null {
  const r = replySchema.safeParse(body);
  if (!r.success) return null;
  const choice = r.data.choices[0];
  if (!choice) return null;
  const toolCalls = (choice.message.tool_calls ?? []).map((c) => ({ id: c.id, type: 'function' as const, function: c.function }));
  const content = choice.message.content?.trim() ? choice.message.content : null;
  if (!content && toolCalls.length === 0) return null;
  return { content, toolCalls, model: r.data.model ?? requestedModel };
}

export type HttpVerdict = AiError | 'next_model';

/** Maps an HTTP error (status + parsed body) to what the client does next. */
export function classifyHttpError(status: number, body: unknown): HttpVerdict {
  const code = errorCode(body);
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status === 404 || code === 'model_not_found' || code === 'model_decommissioned') return 'next_model';
  if (status === 400 && (code === 'tool_use_failed' || code === 'json_validate_failed')) return 'bad_output';
  if (status === 400 && /model/i.test(errorMessage(body)) && /(decommission|not exist|not found|not supported)/i.test(errorMessage(body))) return 'next_model';
  if (status >= 500) return 'failed';
  return 'failed';
}

function errorObj(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) return {};
  const e = (body as Record<string, unknown>).error;
  return typeof e === 'object' && e !== null ? (e as Record<string, unknown>) : {};
}
function errorCode(body: unknown): string {
  const c = errorObj(body).code;
  return typeof c === 'string' ? c : '';
}
function errorMessage(body: unknown): string {
  const m = errorObj(body).message;
  return typeof m === 'string' ? m : '';
}

/**
 * Seconds to wait after a 429: the retry-after header, else Groq's "Please try again in 1m2.5s" message;
 * clamped to 1..120, default 20.
 */
export function retryAfterSeconds(header: string | null, body?: unknown): number {
  let n = header ? Number.parseFloat(header) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) n = fromMessage(errorMessage(body));
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(120, Math.max(1, Math.ceil(n)));
}

function fromMessage(message: string): number {
  const m = /try again in\s+(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i.exec(message);
  if (!m || (m[1] === undefined && m[2] === undefined)) return Number.NaN;
  return Number(m[1] ?? 0) * 60 + Number.parseFloat(m[2] ?? '0');
}

/** Keeps the last `max` messages without starting on an orphan tool result or tool-call reply. */
export function trimHistory(messages: readonly ChatMessage[], max: number): ChatMessage[] {
  if (messages.length <= max) return [...messages];
  let start = messages.length - max;
  while (start < messages.length && messages[start]?.role !== 'user') start++;
  return messages.slice(start);
}
