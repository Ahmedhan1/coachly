import type { Result } from '../nutrition/result';
import type { PlanError, ProposedAction } from './actions';
import type { AiError, ChatMessage, ChatReply } from './chat';
import { validateToolCall, type ValidatedCall } from './tools';

export type ReadCall = Extract<ValidatedCall, { kind: 'read' }>;
export type ActionCall = Extract<ValidatedCall, { kind: 'action' }>;

export interface Proposal {
  /** The tool call id (unique within the conversation). */
  id: string;
  action: ProposedAction;
}

export interface AgentDeps {
  chat(messages: ChatMessage[]): Promise<Result<ChatReply, AiError>>;
  /** Runs a read tool on the device and returns JSON-able data. */
  read(call: ReadCall): Promise<unknown>;
  /** Turns an action call into a proposal (never writes). */
  plan(call: ActionCall): Promise<{ ok: true; value: ProposedAction } | { ok: false; error: PlanError }>;
}

export interface TurnResult {
  /** The conversation after this turn (history + new assistant/tool messages). */
  messages: ChatMessage[];
  text: string | null;
  proposals: Proposal[];
}

const MAX_TOOL_RESULT = 12_000;

const toolMessage = (id: string, data: unknown): ChatMessage => {
  const s = JSON.stringify(data) ?? 'null';
  return { role: 'tool', tool_call_id: id, content: s.length > MAX_TOOL_RESULT ? `${s.slice(0, MAX_TOOL_RESULT)}…(truncated)` : s };
};

/**
 * One trainer message → model ⇄ read tools (up to `maxSteps` round trips) → answer text and/or proposals.
 * Action tools stop the loop: the proposals go to the trainer as confirmation cards.
 * On an error the caller keeps its history unchanged and can retry.
 */
export async function runAgentTurn(history: readonly ChatMessage[], deps: AgentDeps, maxSteps = 5): Promise<Result<TurnResult, AiError>> {
  const messages = [...history];
  for (let step = 0; step < maxSteps; step++) {
    const r = await deps.chat(messages);
    if (!r.ok) return r;
    const reply = r.value;
    messages.push({ role: 'assistant', content: reply.content, ...(reply.toolCalls.length ? { tool_calls: reply.toolCalls } : {}) });
    if (reply.toolCalls.length === 0) return { ok: true, value: { messages, text: reply.content, proposals: [] } };

    const proposals: Proposal[] = [];
    for (const call of reply.toolCalls) {
      const v = validateToolCall(call.function.name, call.function.arguments);
      if (!v.ok) {
        messages.push(toolMessage(call.id, { error: v.error }));
        continue;
      }
      if (v.value.kind === 'read') {
        let data: unknown;
        try {
          data = await deps.read(v.value);
        } catch {
          data = { error: 'read_failed' };
        }
        messages.push(toolMessage(call.id, data));
      } else {
        const p = await deps.plan(v.value);
        if (p.ok) {
          proposals.push({ id: call.id, action: p.value });
          messages.push(toolMessage(call.id, { status: 'shown_to_trainer', note: 'Not done yet. It runs only if the trainer taps confirm.' }));
        } else {
          messages.push(toolMessage(call.id, { error: p.error }));
        }
      }
    }
    if (proposals.length) return { ok: true, value: { messages, text: reply.content, proposals } };
  }
  return { ok: true, value: { messages, text: null, proposals: [] } };
}
