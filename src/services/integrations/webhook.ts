export interface WebhookEvent {
  event: 'client_created' | 'subscription_ending' | 'test';
  at: string;
  client?: { id: string; name: string; phone: string; endDate: string | null };
  daysLeft?: number;
}

/** POSTs JSON to the trainer's own webhook (n8n, Make…). Short timeout, never throws: true = delivered. */
export async function postWebhook(url: string, payload: WebhookEvent, fetchFn: typeof fetch = (i, init) => fetch(i, init)): Promise<boolean> {
  if (!/^https:\/\//.test(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
