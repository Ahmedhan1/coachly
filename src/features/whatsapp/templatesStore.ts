import { z } from 'zod';
import { useServices } from '@/app/services';
import { useLive } from '@/app/useLive';
import { BUILTIN_KINDS, mergeTemplates, type BuiltinKind, type WhatsappTemplate } from '@/domain/whatsapp';
import { t } from '@/i18n';
import type { MetaStore } from '@/services/license/metaStore';

/** Edited built-ins and custom templates, in the meta table (travels inside backups). */
export const WHATSAPP_TEMPLATES_KEY = 'whatsapp.templates';

const templateSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum([...BUILTIN_KINDS, 'custom']),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2000),
});

export function defaultTemplate(kind: BuiltinKind): WhatsappTemplate {
  return { id: kind, kind, title: t(`schedule.wa.defaults.${kind}.title`), body: t(`schedule.wa.defaults.${kind}.body`) };
}

export const defaultTemplates = (): WhatsappTemplate[] => BUILTIN_KINDS.map(defaultTemplate);

export async function readStoredTemplates(meta: MetaStore): Promise<WhatsappTemplate[]> {
  const parsed = z.array(templateSchema).safeParse(await meta.get(WHATSAPP_TEMPLATES_KEY));
  return parsed.success ? parsed.data : [];
}

export async function readTemplates(meta: MetaStore): Promise<WhatsappTemplate[]> {
  return mergeTemplates(defaultTemplates(), await readStoredTemplates(meta));
}

/** Insert or replace by id (a built-in is stored under its kind). */
export async function saveTemplate(meta: MetaStore, template: WhatsappTemplate): Promise<void> {
  const valid = templateSchema.parse(template);
  const stored = await readStoredTemplates(meta);
  const at = stored.findIndex((s) => s.id === valid.id);
  const next = at >= 0 ? stored.map((s, i) => (i === at ? valid : s)) : [...stored, valid];
  await meta.set(WHATSAPP_TEMPLATES_KEY, next);
}

/** Removes a custom template, or resets a built-in to its default text. Returns the removed row for undo. */
export async function removeTemplate(meta: MetaStore, id: string): Promise<WhatsappTemplate | null> {
  const stored = await readStoredTemplates(meta);
  const removed = stored.find((s) => s.id === id) ?? null;
  await meta.set(
    WHATSAPP_TEMPLATES_KEY,
    stored.filter((s) => s.id !== id),
  );
  return removed;
}

export function useWhatsappTemplates(): WhatsappTemplate[] | undefined {
  const { meta } = useServices();
  return useLive(() => readTemplates(meta), [meta]);
}
