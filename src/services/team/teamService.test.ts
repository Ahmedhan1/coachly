import { describe, expect, it } from 'vitest';
import { base64UrlEncode } from '../../../shared/bytes';
import { readJoinFragment, type Roster } from '@/domain/team';
import { WorkerApi } from '@/services/cloud/workerApi';
import type { FetchFn } from '@/services/cloud/httpCloudBackupClient';
import { memoryMetaStore } from '@/data/metaStore';
import { TEAM_META_KEYS, TeamService } from './teamService';

const ROSTER: Roster = {
  v: 1,
  trainerName: 'كابتن كريم',
  generatedAt: 1,
  clients: [{ name: 'سارة', goal: 'fat_loss', packageName: null, totalSessions: 0, remainingSessions: 0, startDate: null, endDate: null, lastSessionAt: null, attention: null }],
};

/** A tiny in-memory team Worker: what the server stores is exactly what the app sent. */
function fakeWorker() {
  const stored = new Map<string, Uint8Array>();
  const fetchFn: FetchFn = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (path === '/api/team/invite') return json(200, { code: 'INVITECODE_abcdefgh' });
    if (path === '/api/team/join') {
      const { code } = JSON.parse(String(init?.body)) as { code: string };
      return code === 'INVITECODE_abcdefgh' ? json(200, { gym: { id: 'g', name: 'جيم الأبطال' } }) : json(404, { error: 'invalid_invite' });
    }
    if (path === '/api/team/roster') {
      stored.set('trainer', new Uint8Array(init?.body as Uint8Array));
      return json(200, { ok: true });
    }
    if (path === '/api/team/rosters') {
      return json(200, { rosters: [...stored].map(([userId, body]) => ({ userId, updatedAt: 5, body: base64UrlEncode(body) })) });
    }
    if (path.startsWith('/api/team/members/')) return json(409, { error: 'trainer_limit' });
    return json(404, { error: 'not_found' });
  };
  return { stored, api: new WorkerApi({ baseUrl: 'https://w.test', tokens: { getToken: async () => 'tok' }, fetchFn }) };
}

describe('TeamService', () => {
  it('manager invite → trainer joins with the link → trainer roster is sealed; manager reads it back', async () => {
    const worker = fakeWorker();
    const managerMeta = memoryMetaStore();
    const manager = new TeamService(worker.api, managerMeta, 'https://app.example');
    const link = await manager.createInvite();
    if (!link.ok) throw new Error(link.error);
    expect(link.value.startsWith('https://app.example/#join=INVITECODE_abcdefgh.')).toBe(true);

    const invite = readJoinFragment(new URL(link.value).hash);
    if (invite === null) throw new Error('no invite');
    const trainerMeta = memoryMetaStore({ [TEAM_META_KEYS.pendingJoin]: invite });
    const trainer = new TeamService(worker.api, trainerMeta, 'https://app.example');
    expect(await trainer.join(invite)).toEqual({ ok: true, value: { name: 'جيم الأبطال' } });
    expect(trainerMeta.dump()[TEAM_META_KEYS.key]).toBe(managerMeta.dump()[TEAM_META_KEYS.key]);
    expect(trainerMeta.dump()[TEAM_META_KEYS.pendingJoin]).toBeNull();

    expect(await trainer.uploadRoster(ROSTER, 1234)).toEqual({ ok: true, value: true });
    expect(trainerMeta.dump()[TEAM_META_KEYS.rosterAt]).toBe(1234);
    // The server only ever holds ciphertext.
    const onServer = new TextDecoder().decode(worker.stored.get('trainer'));
    expect(onServer.startsWith('PTK1')).toBe(true);
    expect(onServer).not.toContain('سارة');

    expect(await manager.rosters()).toEqual({ ok: true, value: [{ userId: 'trainer', updatedAt: 5, roster: ROSTER }] });
  });

  it('a phone without the team key cannot upload or read rosters', async () => {
    const worker = fakeWorker();
    const lost = new TeamService(worker.api, memoryMetaStore(), 'https://app.example');
    expect(await lost.uploadRoster(ROSTER, 1)).toEqual({ ok: false, error: 'no_key' });
    worker.stored.set('trainer', new Uint8Array(64));
    expect(await lost.rosters()).toEqual({ ok: true, value: [{ userId: 'trainer', updatedAt: 5, roster: null }] });
  });

  it('passes the Worker reason through (e.g. trainer_limit, invalid_invite)', async () => {
    const worker = fakeWorker();
    const service = new TeamService(worker.api, memoryMetaStore(), 'https://app.example');
    expect(await service.memberAction('u2', 'approve')).toEqual({ ok: false, error: 'trainer_limit' });
    const key = base64UrlEncode(new Uint8Array(32));
    expect(await service.join({ code: 'WRONGCODE_abcdefgh', key })).toEqual({ ok: false, error: 'invalid_invite' });
    expect(await service.join({ code: 'INVITECODE_abcdefgh', key: 'tooshort' })).toEqual({ ok: false, error: 'invalid_invite' });
  });
});
