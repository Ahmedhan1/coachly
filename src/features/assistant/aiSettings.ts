import { z } from 'zod';
import { DEFAULT_MODEL, addTask, parseTasks, removeTask, toggleTask, type Task } from '@/domain/ai';
import { AI_KEY } from '@/features/online/integrations';
import type { MetaStore } from '@/services/license/metaStore';

/** Device-local (`backup.` prefix: never inside a backup file, never synced). */
export const AI_SETTINGS_KEY = 'backup.ai.settings';
/** Trainer data (goes into backups like other meta). */
export const TASKS_KEY = 'assistant.tasks';

const settingsSchema = z.object({
  enabled: z.boolean(),
  model: z.string().trim().min(1).max(80),
  firstNamesOnly: z.boolean(),
  /** The trainer read the one-time notice: requests (client names included) go to Groq with their own key. */
  privacyAck: z.boolean().catch(false),
});
export type AiSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: false, model: DEFAULT_MODEL, firstNamesOnly: true, privacyAck: false };

export async function readAiSettings(meta: MetaStore): Promise<AiSettings> {
  const raw = await meta.get(AI_SETTINGS_KEY);
  const r = settingsSchema.safeParse(typeof raw === 'object' && raw !== null ? { ...DEFAULT_AI_SETTINGS, ...raw } : raw);
  return r.success ? r.data : DEFAULT_AI_SETTINGS;
}
export async function saveAiSettings(meta: MetaStore, s: AiSettings): Promise<void> {
  await meta.set(AI_SETTINGS_KEY, settingsSchema.parse(s));
}

/** The trainer's Groq key (device-local, `backup.` prefix). An old Anthropic key (sk-ant-…) from the previous version counts as none. */
export async function readGroqKey(meta: MetaStore): Promise<string | null> {
  const v = await meta.get(AI_KEY);
  return typeof v === 'string' && v.trim() && !v.startsWith('sk-ant-') ? v.trim() : null;
}
export async function saveGroqKey(meta: MetaStore, key: string): Promise<void> {
  await meta.set(AI_KEY, key.trim() || null);
}
export const looksLikeGroqKey = (k: string) => /^gsk_[A-Za-z0-9]{20,200}$/.test(k.trim());

/** Everything a call needs, or why the assistant cannot run. */
export async function readAiConfig(meta: MetaStore): Promise<{ ok: true; apiKey: string; settings: AiSettings } | { ok: false; error: 'disabled' | 'no_key' }> {
  const [settings, apiKey] = await Promise.all([readAiSettings(meta), readGroqKey(meta)]);
  if (!settings.enabled) return { ok: false, error: 'disabled' };
  if (!apiKey) return { ok: false, error: 'no_key' };
  return { ok: true, apiKey, settings };
}

export async function readTasks(meta: MetaStore): Promise<Task[]> {
  return parseTasks(await meta.get(TASKS_KEY));
}
async function writeTasks(meta: MetaStore, change: (list: Task[]) => Task[]): Promise<void> {
  await meta.set(TASKS_KEY, change(await readTasks(meta)));
}
export const tasksRepo = (meta: MetaStore) => ({
  add: (task: Task) => writeTasks(meta, (l) => addTask(l, task)),
  toggle: (id: string) => writeTasks(meta, (l) => toggleTask(l, id)),
  remove: (id: string) => writeTasks(meta, (l) => removeTask(l, id)),
});
