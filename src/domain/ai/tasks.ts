import { z } from 'zod';

/** A trainer to-do / reminder. Stored as one list in the meta key-value store (no schema change). */
export const taskSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  /** Local date YYYY-MM-DD, or null for "any time". */
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  clientId: z.string().max(64).nullable(),
  done: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});
export type Task = z.infer<typeof taskSchema>;

const listSchema = z.array(z.unknown());

/** Reads the stored list; drops rows that are not valid tasks instead of failing. */
export function parseTasks(raw: unknown): Task[] {
  const r = listSchema.safeParse(raw);
  if (!r.success) return [];
  return r.data.flatMap((row) => {
    const t = taskSchema.safeParse(row);
    return t.success ? [t.data] : [];
  });
}

export function addTask(list: readonly Task[], task: Task): Task[] {
  return [...list.filter((t) => t.id !== task.id), taskSchema.parse(task)].slice(-500);
}

export function toggleTask(list: readonly Task[], id: string): Task[] {
  return list.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

export function removeTask(list: readonly Task[], id: string): Task[] {
  return list.filter((t) => t.id !== id);
}

/** Open tasks first (soonest due first, undated last), then done ones (newest first). */
export function sortTasks(list: readonly Task[]): Task[] {
  const open = list.filter((t) => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt);
  const done = list.filter((t) => t.done).sort((a, b) => b.createdAt - a.createdAt);
  return [...open, ...done];
}
