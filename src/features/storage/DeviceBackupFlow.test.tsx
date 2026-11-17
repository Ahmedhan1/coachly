// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesProvider, type AppServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { FILE_PASSWORD_KEY } from '@/data/backupMeta';
import { t } from '@/i18n';
import { FakeBackupService, FakeDeviceFileSaver, type SaveResult } from '@/services/backup';
import { DeviceBackupFlow } from './DeviceBackupFlow';

afterEach(() => {
  cleanup();
  useUiStore.setState({ toasts: [] });
});

function setup(next: SaveResult, fileEncrypted: boolean | null = false) {
  const local = new FakeBackupService(() => 1000);
  local.state.fileEncrypted = fileEncrypted;
  const store = new Map<string, unknown>();
  const meta = { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) };
  const services = { backup: { local }, meta } as unknown as AppServices;
  const saver = new FakeDeviceFileSaver(next);
  render(
    <ServicesProvider services={services}>
      <DeviceBackupFlow saver={saver} />
    </ServicesProvider>,
  );
  return { local, saver, store };
}

const tap = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  });
};

describe('DeviceBackupFlow', () => {
  it('one tap: makes, verifies and shares the file; records the backup only after the share finished', async () => {
    const { local, saver } = setup({ outcome: 'shared' });
    await tap(t('storage.device.button'));
    expect(saver.saved).toHaveLength(1);
    expect(local.state.lastLocalAt).not.toBeNull();
    expect(local.state.lastLocalHow).toBe('shared');
  });

  it('iOS refused the late share: shows «ابعت النسخة لنفسك», nothing recorded until that tap succeeds', async () => {
    const { local, saver } = setup({ outcome: 'failed', failure: 'not_allowed' });
    await tap(t('storage.device.button'));
    expect(local.state.lastLocalAt).toBeNull();
    saver.next = { outcome: 'shared' };
    await tap(t('storage.device.sendToSelf'));
    expect(local.state.lastLocalAt).not.toBeNull();
  });

  it('a download is recorded only after the trainer confirms it landed', async () => {
    const { local } = setup({ outcome: 'downloaded' });
    await tap(t('storage.device.button'));
    expect(local.state.lastLocalAt).toBeNull();
    await tap(t('storage.device.confirmNo'));
    expect(local.state.lastLocalAt).toBeNull();
  });

  it('download confirmed → recorded as downloaded', async () => {
    const { local } = setup({ outcome: 'downloaded' });
    await tap(t('storage.device.button'));
    await tap(t('storage.device.confirmYes'));
    expect(local.state.lastLocalHow).toBe('downloaded');
  });

  it('first time asks for a password, remembers it on this device only when asked', async () => {
    const { store, local } = setup({ outcome: 'shared' }, null);
    await tap(t('storage.device.button'));
    const fields = screen.getAllByLabelText(/كلمة السر|اكتبها تاني/);
    fireEvent.change(fields[0]!, { target: { value: 'long-password' } });
    fireEvent.change(fields[1]!, { target: { value: 'long-password' } });
    await tap(t('storage.device.start'));
    expect(store.get(FILE_PASSWORD_KEY)).toBe('long-password');
    expect(local.state.fileEncrypted).toBe(true);
    expect(local.state.lastLocalAt).not.toBeNull();
  });
});
