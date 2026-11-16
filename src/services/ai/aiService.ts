import Anthropic from '@anthropic-ai/sdk';
import { err, ok, type Result } from '@/domain/nutrition/result';

export type AiError = 'no_key' | 'auth' | 'rate_limited' | 'offline' | 'refused' | 'bad_output' | 'failed';

export interface AiRequest {
  system: string;
  prompt: string;
  /** JSON schema for structured output. */
  schema: Record<string, unknown>;
}

/** Optional assistant (off by default). Returns the model's JSON text; the caller validates it. Never throws. */
export interface AiService {
  json(apiKey: string, req: AiRequest, signal?: AbortSignal): Promise<Result<string, AiError>>;
}

const MODEL = 'claude-opus-5-5';

/**
 * Calls Claude directly from the phone with the trainer's own key (stored only on the device). Refusals
 * fall back server-side (`fallbacks: "default"`).
 */
export class AnthropicAiService implements AiService {
  async json(apiKey: string, req: AiRequest, signal?: AbortSignal): Promise<Result<string, AiError>> {
    if (!apiKey) return err('no_key');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return err('offline');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 });
    try {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 32_000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: req.schema } },
          system: req.system,
          messages: [{ role: 'user', content: req.prompt }],
        },
        { signal },
      );
      const message = await stream.finalMessage();
      if (message.stop_reason === 'refusal') return err('refused');
      const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return text ? ok(text) : err('bad_output');
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return err('auth');
      if (e instanceof Anthropic.RateLimitError) return err('rate_limited');
      if (e instanceof Anthropic.APIConnectionError) return err('offline');
      return err('failed');
    }
  }
}
