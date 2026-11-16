import type { Client } from '@/domain/models';
import { renderTemplate, templateFor, whatsappLink, type BuiltinKind, type WhatsappTemplate } from '@/domain/whatsapp';
import { templateValues } from './values';
import { defaultTemplate, useWhatsappTemplates } from './templatesStore';

export interface WhatsappExtra {
  startsAt?: number | null;
  amountMinor?: number | null;
  currency?: string;
}

/** wa.me link with the rendered template text for one client. */
export function linkFor(template: WhatsappTemplate, client: Pick<Client, 'name' | 'phone' | 'package'>, extra: WhatsappExtra = {}): string {
  return whatsappLink(client.phone, renderTemplate(template.body, templateValues(client, extra)).text);
}

/**
 * Returns a builder for one-tap WhatsApp buttons: `build(client, extra)` gives the wa.me link with the
 * trainer's (possibly edited) template of `kind`. Falls back to the default text while templates load.
 */
export function useWhatsappLinkBuilder(kind: BuiltinKind) {
  const templates = useWhatsappTemplates();
  const template = (templates && templateFor(kind, templates)) ?? defaultTemplate(kind);
  return (client: Pick<Client, 'name' | 'phone' | 'package'>, extra: WhatsappExtra = {}) => linkFor(template, client, extra);
}
