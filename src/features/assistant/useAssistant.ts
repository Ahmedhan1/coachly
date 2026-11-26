import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '@/app/services';
import {
  ALL_TOOLS,
  buildSystemPrompt,
  planAction,
  runAgentTurn,
  safeAssistantText,
  trimHistory,
  withAppNotes,
  type AiError,
  type ChatMessage,
  type PlanError,
  type ProposedAction,
} from '@/domain/ai';
import { getLocale } from '@/i18n';
import { deviceZone } from '@/app/deviceZone';
import { aiClients } from './aiClient';
import { readAiConfig } from './aiSettings';
import { buildPlanContext, localNow, runReadTool } from './assistantData';
import { executeProposal, type ExecError, type Undo } from './executor';

/**
 * Conversation state for the assistant screen. Only the trainer's own message starts a request; nothing
 * runs in the background. Proposals change nothing until `execute(id)` (the «نفّذ» tap).
 */

export type ProposalStatus = 'pending' | 'running' | 'done' | 'dismissed' | 'undone' | 'failed';

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'bot'; id: string; text: string }
  | { kind: 'blocked'; id: string }
  | { kind: 'proposal'; id: string; action: ProposedAction; status: ProposalStatus; error: ExecError | null; undo: Undo | null };

export interface AssistantError {
  code: AiError;
  /** Epoch ms after which retry makes sense (rate limit). */
  retryAt: number | null;
}

export interface ExecOutcome {
  ok: boolean;
  navigateTo: string | null;
  dropped: number;
}

const HISTORY_LIMIT = 30;
let seq = 0;
const nextId = () => `i${++seq}`;

export function useAssistant(focusClient: { id: string; name: string } | null) {
  const services = useServices();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AssistantError | null>(null);
  const history = useRef<ChatMessage[]>([]);
  const notes = useRef<string[]>([]);
  const lastText = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const patch = (id: string, change: Partial<Extract<ChatItem, { kind: 'proposal' }>>) =>
    setItems((list) => list.map((it) => (it.id === id && it.kind === 'proposal' ? { ...it, ...change } : it)));

  const run = useCallback(
    async (text: string, echo: boolean) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      if (echo) setItems((list) => [...list, { kind: 'user', id: nextId(), text: trimmed }]);
      lastText.current = trimmed;
      setError(null);
      const cfg = await readAiConfig(services.meta);
      if (!cfg.ok) return setError({ code: cfg.error, retryAt: null });
      setBusy(true);
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      const now = new Date();
      const { clock } = deviceZone();
      const settings = await services.data.repos.settings.get();
      const local = localNow(clock, now);
      const system: ChatMessage = { role: 'system', content: buildSystemPrompt({ ...local, currency: settings.currency, focusClient, language: getLocale() }) };
      const sentNotes = [...notes.current];
      const user: ChatMessage = { role: 'user', content: withAppNotes(trimmed, sentNotes) };
      const { chat } = aiClients(services.meta);
      let retryAfterSec: number | undefined;
      const r = await runAgentTurn([system, ...trimHistory(history.current, HISTORY_LIMIT), user], {
        chat: async (messages) => {
          const res = await chat.complete({ apiKey: cfg.apiKey, model: cfg.settings.model, messages, tools: ALL_TOOLS }, ctrl.signal);
          retryAfterSec = res.retryAfterSec;
          return res;
        },
        read: (call) => runReadTool(call, { repos: services.data.repos, meta: services.meta, clock, now, privacy: { firstNamesOnly: cfg.settings.firstNamesOnly } }),
        plan: async (call): Promise<{ ok: true; value: ProposedAction } | { ok: false; error: PlanError }> => planAction(call.name, call.args, await buildPlanContext(services.data.repos, clock, now)),
      });
      if (ctrl.signal.aborted) return;
      setBusy(false);
      if (!r.ok) return setError({ code: r.error, retryAt: r.error === 'rate_limited' ? Date.now() + (retryAfterSec ?? 20) * 1000 : null });
      notes.current = notes.current.slice(sentNotes.length);
      const safe = safeAssistantText(r.value.text);
      // Never keep an unsafe answer in the history the model sees next time.
      history.current = r.value.messages.slice(1).map((m) => (safe.blocked && m.role === 'assistant' && m.content === r.value.text ? { ...m, content: '[removed by the app: supplement dose]' } : m));
      const added: ChatItem[] = [];
      if (safe.blocked) added.push({ kind: 'blocked', id: nextId() });
      else if (safe.text) added.push({ kind: 'bot', id: nextId(), text: safe.text });
      for (const p of r.value.proposals) added.push({ kind: 'proposal', id: nextId(), action: p.action, status: 'pending', error: null, undo: null });
      if (added.length === 0) setError({ code: 'bad_output', retryAt: null });
      setItems((list) => [...list, ...added]);
    },
    [busy, focusClient, services],
  );

  const send = useCallback((text: string) => run(text, true), [run]);
  const retry = useCallback(() => (lastText.current ? run(lastText.current, false) : Promise.resolve()), [run]);

  const execute = useCallback(
    async (item: Extract<ChatItem, { kind: 'proposal' }>): Promise<ExecOutcome> => {
      if (item.status !== 'pending' && item.status !== 'failed') return { ok: false, navigateTo: null, dropped: 0 };
      patch(item.id, { status: 'running', error: null });
      const cfg = await readAiConfig(services.meta);
      const { drafts } = aiClients(services.meta);
      const r = await executeProposal(item.action, {
        services,
        clock: deviceZone().clock,
        now: new Date(),
        ai: cfg.ok ? { service: drafts, cfg: { apiKey: cfg.apiKey, model: cfg.settings.model } } : undefined,
      });
      if (!r.ok) {
        patch(item.id, { status: 'failed', error: r.error });
        return { ok: false, navigateTo: null, dropped: 0 };
      }
      notes.current.push(`trainer confirmed: ${r.value.note}`);
      patch(item.id, { status: 'done', undo: r.value.undo });
      return { ok: true, navigateTo: r.value.navigateTo, dropped: r.value.dropped };
    },
    [services],
  );

  const dismiss = useCallback((item: Extract<ChatItem, { kind: 'proposal' }>) => {
    notes.current.push(`trainer dismissed the proposed ${item.action.type}`);
    patch(item.id, { status: 'dismissed' });
  }, []);

  const undo = useCallback(async (item: Extract<ChatItem, { kind: 'proposal' }>) => {
    if (!item.undo) return;
    await item.undo();
    notes.current.push(`trainer undid the ${item.action.type}`);
    patch(item.id, { status: 'undone', undo: null });
  }, []);

  /** WhatsApp cards open wa.me from the tap itself; this only records it. */
  const markOpened = useCallback((item: Extract<ChatItem, { kind: 'proposal' }>) => {
    notes.current.push(`trainer opened the WhatsApp draft (sending is up to the trainer)`);
    patch(item.id, { status: 'done' });
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    history.current = [];
    notes.current = [];
    lastText.current = null;
    setItems([]);
    setError(null);
    setBusy(false);
  }, []);

  return { items, busy, error, send, retry, execute, dismiss, undo, markOpened, reset };
}
