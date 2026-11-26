import { buildEnv } from '@/app/authFactory';
import { metaTokenProvider } from '@/services/cloud/networkStatus';
import { GroqAiService } from '@/services/ai/aiService';
import { GroqChatService, type ChatService } from '@/services/ai/chatService';
import { AUTH_META_KEYS } from '@/services/auth/workerAuthService';
import type { MetaStore } from '@/data/metaStore';

/**
 * One Groq client per app session (so "use the relay" is remembered after the first CORS failure).
 * Direct to Groq first; the Worker relay (account session) is the fallback.
 */
let cached: { meta: MetaStore; chat: GroqChatService; drafts: GroqAiService } | null = null;

function build(meta: MetaStore) {
  const tokens = metaTokenProvider(meta, AUTH_META_KEYS.token);
  const chat = new GroqChatService(undefined, { relay: buildEnv.workerUrl ? { baseUrl: buildEnv.workerUrl, getToken: () => tokens.getToken() } : null });
  return { meta, chat, drafts: new GroqAiService(chat) };
}

export function aiClients(meta: MetaStore): { chat: ChatService; drafts: GroqAiService } {
  if (cached?.meta !== meta) cached = build(meta);
  return cached;
}
