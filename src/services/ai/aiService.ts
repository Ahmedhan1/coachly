import { withSchema, type AiError } from '@/domain/ai';
import { err, ok, type Result } from '@/domain/nutrition/result';
import { GroqChatService, type ChatService } from './chatService';

export type { AiError } from '@/domain/ai';

export interface AiConfig {
  apiKey: string;
  model: string;
}

export interface AiRequest {
  system: string;
  prompt: string;
  /** JSON schema for structured output (spelled out in the request; zod validates the answer). */
  schema: Record<string, unknown>;
}

/** Optional assistant (off by default). Returns the model's JSON text; the caller validates it. Never throws. */
export interface AiService {
  json(cfg: AiConfig, req: AiRequest, signal?: AbortSignal): Promise<Result<string, AiError>>;
}

/** Structured drafts over Groq JSON mode. */
export class GroqAiService implements AiService {
  constructor(private readonly chat: ChatService = new GroqChatService()) {}

  async json(cfg: AiConfig, req: AiRequest, signal?: AbortSignal): Promise<Result<string, AiError>> {
    const r = await this.chat.complete(
      {
        apiKey: cfg.apiKey,
        model: cfg.model,
        json: true,
        maxTokens: 6000,
        temperature: 0.4,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: withSchema(req.prompt, req.schema) },
        ],
      },
      signal,
    );
    if (!r.ok) return err(r.error);
    return r.value.content ? ok(r.value.content) : err('bad_output');
  }
}
