import { base64UrlDecode } from '../../../shared/bytes';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { PushItem } from '@/domain/notifications';
import type { CloudError } from '@/services/cloud/types';
import type { WorkerApi } from '@/services/cloud/workerApi';

export type PushError = CloudError | 'not_signed_in' | 'unsupported' | 'denied' | 'not_configured' | 'subscribe_failed';

/** Web Push through the Worker (docs/CLOUD.md §2). Works only for the home-screen app on iOS 16.4+. */
export interface PushService {
  supported(): boolean;
  permission(): NotificationPermission | 'unsupported';
  /** Asks for permission (must run from a tap), subscribes and registers the subscription with the Worker. */
  enable(): Promise<Result<true, PushError>>;
  /** Replaces this device's schedule on the server. */
  sync(items: readonly PushItem[]): Promise<Result<number, PushError>>;
  disable(): Promise<void>;
}

export class BrowserPushService implements PushService {
  constructor(private readonly api: WorkerApi) {}

  supported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  permission(): NotificationPermission | 'unsupported' {
    return this.supported() ? Notification.permission : 'unsupported';
  }

  async enable(): Promise<Result<true, PushError>> {
    if (!this.supported()) return err('unsupported');
    if (!this.api.configured) return err('not_configured');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return err('denied');
    const vapid = await this.api.json<{ publicKey?: string }>({ method: 'GET', path: '/api/push/vapid', auth: false });
    if (!vapid.ok) return vapid;
    const key = vapid.value.publicKey ? base64UrlDecode(vapid.value.publicKey) : null;
    if (!key) return err('not_configured');
    let subscription: PushSubscription;
    try {
      const reg = await navigator.serviceWorker.ready;
      subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    } catch {
      return err('subscribe_failed');
    }
    const r = await this.api.send({ method: 'POST', path: '/api/push/subscribe', json: { subscription: subscription.toJSON() } });
    return r.ok ? ok(true) : r;
  }

  async sync(items: readonly PushItem[]): Promise<Result<number, PushError>> {
    const r = await this.api.json<{ count?: number }>({ method: 'PUT', path: '/api/push/schedule', json: { items } });
    return r.ok ? ok(r.value.count ?? items.length) : r;
  }

  async disable(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.ready;
      await (await reg.pushManager.getSubscription())?.unsubscribe();
    } catch {
      // ignore: the server copy is removed below anyway
    }
    await this.api.send({ method: 'DELETE', path: '/api/push' });
  }
}
