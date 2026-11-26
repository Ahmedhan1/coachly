import type { MetaStore } from '@/services/meta/metaStore';
import { REMINDERS_PROMPT_KEY } from './prefs';

/**
 * True exactly once: after the trainer's first booking, so the screen can explain reminders.
 * Records that the prompt was shown (meta key `schedule.remindersPromptShownAt`).
 */
export async function shouldShowRemindersPrompt(meta: MetaStore, now: Date): Promise<boolean> {
  if (await meta.get(REMINDERS_PROMPT_KEY)) return false;
  await meta.set(REMINDERS_PROMPT_KEY, now.getTime());
  return true;
}

/**
 * HOOK FOR LATER: Web Push is wired by the Worker/push agent. When it lands, request
 * `Notification.requestPermission()` here (from the tap on «تمام») and register the push subscription.
 * Until then the button only closes the explanation.
 */
export async function onRemindersPromptAccepted(): Promise<void> {
  // Intentionally empty until push notifications are wired (see docs/MANUAL_QA.md).
}
