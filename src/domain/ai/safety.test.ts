import { describe, expect, it } from 'vitest';
import { planAction, type PlanContext } from './actions';
import { retryAfterSeconds } from './chat';
import { buildSystemPrompt } from './prompt';
import { mentionsSupplementDose, safeAssistantText } from './safety';
import { ACTION_TOOLS, READ_TOOLS, validateToolCall } from './tools';

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  clients: [
    { id: 'c1', name: 'منى حسن', notes: '', pkg: { totalSessions: 12, priceMinor: 150000, currency: 'EGP', startDate: '2026-10-18', endDate: '2026-11-17', remainingSessions: 2 } },
    { id: 'c2', name: 'كريم', notes: '', pkg: null },
  ],
  sessions: [{ id: 's1', clientId: 'c1', startsAt: Date.UTC(2026, 10, 18, 16), durationMin: 60 }],
  currency: 'EGP',
  today: '2026-11-17',
  toEpoch: (d, t) => Date.parse(`${d}T${t}:00Z`),
  now: Date.UTC(2026, 10, 17, 10),
  ...over,
});

describe('supplement dose filter', () => {
  it('flags supplement + dose in Arabic and English', () => {
    expect(mentionsSupplementDose('خد كرياتين 5 جرام كل يوم')).toBe(true);
    expect(mentionsSupplementDose('Take 5g of creatine daily')).toBe(true);
    expect(mentionsSupplementDose('2 سكوب واي بروتين بعد التمرين')).toBe(true);
    expect(mentionsSupplementDose('فيتامين د 5000 وحدة')).toBe(true);
    expect(mentionsSupplementDose('caffeine 200 mg pre-workout')).toBe(true);
  });

  it('leaves food grams, sets and plain supplement mentions alone', () => {
    expect(mentionsSupplementDose('200 جرام فراخ و 150 جرام رز')).toBe(false);
    expect(mentionsSupplementDose('بايسبس كيرل 3 مجموعات × 12')).toBe(false);
    expect(mentionsSupplementDose('الكرياتين؟ اسأل دكتور عن الجرعة')).toBe(false);
  });

  it('replaces an unsafe answer with a safe note', () => {
    expect(safeAssistantText('خد كرياتين 5 جرام')).toEqual({ text: null, blocked: true });
    expect(safeAssistantText('تمام يا كوتش')).toEqual({ text: 'تمام يا كوتش', blocked: false });
  });

  it('refuses a WhatsApp draft or note that carries a supplement dose', () => {
    expect(planAction('draft_whatsapp', { clientId: 'c1', text: 'ابدأ كرياتين 5 جرام يومياً' }, ctx())).toEqual({ ok: false, error: 'supplement_dose' });
    expect(planAction('update_client_note', { clientId: 'c1', note: 'whey 2 scoops', mode: 'append' }, ctx())).toEqual({ ok: false, error: 'supplement_dose' });
  });

  it('system prompt forbids doses and transliterates gym terms', () => {
    const p = buildSystemPrompt({ today: '2026-11-17', time: '10:00', weekday: 2, currency: 'EGP', focusClient: null });
    expect(p).toMatch(/Never suggest supplement/);
    expect(p).toContain('جلوتس');
    expect(p).toContain('ديدليفت');
    expect(p).toMatch(/only what the trainer asks/i);
  });
});

describe('cancel and renew', () => {
  it('validates the new tools', () => {
    expect(validateToolCall('cancel_session', '{"sessionId":"s1"}')).toMatchObject({ ok: true, value: { kind: 'action', name: 'cancel_session' } });
    expect(validateToolCall('renew_package', '{"clientId":"c1"}')).toMatchObject({ ok: true, value: { kind: 'action', name: 'renew_package' } });
    expect(validateToolCall('packages_ending', '{}')).toMatchObject({ ok: true, value: { kind: 'read' } });
    const names = [...READ_TOOLS, ...ACTION_TOOLS].map((t) => t.function.name);
    expect(names).toEqual(expect.arrayContaining(['cancel_session', 'renew_package', 'packages_ending']));
  });

  it('plans cancelling a known session with its client', () => {
    expect(planAction('cancel_session', { sessionId: 's1' }, ctx())).toEqual({
      ok: true,
      value: { type: 'cancel_session', sessionId: 's1', clientId: 'c1', clientName: 'منى حسن', startsAt: Date.UTC(2026, 10, 18, 16), durationMin: 60 },
    });
    expect(planAction('cancel_session', { sessionId: 'x' }, ctx())).toEqual({ ok: false, error: 'unknown_session' });
  });

  it('plans a renewal with before/after and the pending charge', () => {
    const r = planAction('renew_package', { clientId: 'c1' }, ctx());
    expect(r).toMatchObject({
      ok: true,
      value: {
        type: 'renew_package',
        clientId: 'c1',
        before: { endDate: '2026-11-17', remainingSessions: 2 },
        after: { startDate: '2026-11-18', remainingSessions: 14 },
        chargeMinor: 150000,
        currency: 'EGP',
      },
    });
    expect(planAction('renew_package', { clientId: 'c2' }, ctx())).toEqual({ ok: false, error: 'no_package' });
  });
});

describe('retry-after', () => {
  it('falls back to the Groq error message when there is no header', () => {
    expect(retryAfterSeconds(null, { error: { message: 'Rate limit reached ... Please try again in 7.66s.' } })).toBe(8);
    expect(retryAfterSeconds(null, { error: { message: 'Please try again in 1m2.5s' } })).toBe(63);
    expect(retryAfterSeconds('3', { error: { message: 'try again in 50s' } })).toBe(3);
  });
});
