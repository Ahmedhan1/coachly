import { generateRawKey, openWithKey, sealWithKey } from '../../../shared/envelope';
import { base64UrlDecode, base64UrlEncode } from '../../../shared/bytes';
import { parseCheckin, type CheckinDocumentV1, type ShareDocumentV1 } from '@/domain/clientPage';
import { err, ok, type Result } from '@/domain/nutrition/result';
import type { CloudError } from '@/services/cloud/types';
import type { WorkerApi } from '@/services/cloud/workerApi';

/** A client's page: random id + 32-byte key. The key lives only in the link's #fragment and on this phone. */
export interface ClientShare {
  shareId: string;
  key: string;
}

export type ShareError = CloudError | 'not_signed_in' | 'revoked' | 'too_many_shares';

const enc = new TextEncoder();
const dec = new TextDecoder();

async function writeToken(raw: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', raw as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('pt-checkin-write') }, k, 256);
  return new Uint8Array(bits);
}

export function newClientShare(): ClientShare {
  return { shareId: base64UrlEncode(crypto.getRandomValues(new Uint8Array(18))), key: base64UrlEncode(generateRawKey()) };
}

export interface PendingCheckin {
  shareId: string;
  id: string;
  doc: CheckinDocumentV1;
}

/** Client page + weekly check-ins (docs/CLOUD.md §3). Every call fails quietly with a code. */
export class ClientPageService {
  constructor(private readonly api: WorkerApi) {}

  get available(): boolean {
    return this.api.configured;
  }

  link(share: ClientShare): string {
    return `${this.api.url(`/c/${share.shareId}`)}#k=${share.key}`;
  }

  async publish(share: ClientShare, doc: ShareDocumentV1): Promise<Result<true, ShareError>> {
    const raw = base64UrlDecode(share.key);
    if (!raw) return err('server');
    const envelope = await sealWithKey(raw, enc.encode(JSON.stringify(doc)));
    const token = await writeToken(raw);
    const checkinKey = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', token as BufferSource)));
    const r = await this.api.send({ method: 'PUT', path: `/api/share/${share.shareId}`, bytes: envelope, headers: { 'X-Checkin-Key': checkinKey } });
    return r.ok ? ok(true) : r;
  }

  async revoke(share: ClientShare): Promise<Result<true, ShareError>> {
    const r = await this.api.send({ method: 'DELETE', path: `/api/share/${share.shareId}` });
    return r.ok || (!r.ok && r.error === 'not_found') ? ok(true) : r;
  }

  /** Downloads and decrypts every pending check-in of the given pages. Undecryptable ones are skipped. */
  async pending(shares: readonly ClientShare[]): Promise<Result<PendingCheckin[], ShareError>> {
    const list = await this.api.json<{ checkins?: Array<{ id: string; shareId: string }> }>({ method: 'GET', path: '/api/checkins' });
    if (!list.ok) return list;
    const byId = new Map(shares.map((s) => [s.shareId, s]));
    const out: PendingCheckin[] = [];
    for (const c of list.value.checkins ?? []) {
      const share = byId.get(c.shareId);
      const raw = share ? base64UrlDecode(share.key) : null;
      if (!raw) continue;
      const bytes = await this.api.bytes({ method: 'GET', path: `/api/share/${c.shareId}/checkins/${c.id}` });
      if (!bytes.ok) continue;
      const opened = await openWithKey(raw, bytes.value);
      if (!opened.ok) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(dec.decode(opened.data));
      } catch {
        continue;
      }
      const doc = parseCheckin(parsed);
      if (doc) out.push({ shareId: c.shareId, id: c.id, doc });
    }
    return ok(out);
  }

  async acknowledge(c: Pick<PendingCheckin, 'shareId' | 'id'>): Promise<void> {
    await this.api.send({ method: 'DELETE', path: `/api/share/${c.shareId}/checkins/${c.id}` });
  }
}
