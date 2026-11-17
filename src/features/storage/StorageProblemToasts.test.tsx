// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageProblem, StorageProblemListener } from '@/data';
import { useUiStore } from '@/app/uiStore';
import { t } from '@/i18n';
import { StorageProblemToasts } from './StorageProblemToasts';

afterEach(() => {
  cleanup();
  useUiStore.setState({ toasts: [] });
});

function setup() {
  let listener: StorageProblemListener = () => undefined;
  const subscribe = (l: StorageProblemListener) => {
    listener = l;
    return () => undefined;
  };
  const reload = vi.fn();
  render(<StorageProblemToasts subscribe={subscribe} reload={reload} now={() => 1000} />);
  const fire = (p: StorageProblem) => act(() => listener(p));
  return { fire, reload };
}

describe('StorageProblemToasts', () => {
  it('a full disk shows a toast instead of failing silently', () => {
    const { fire } = setup();
    fire('quota');
    expect(useUiStore.getState().toasts.map((x) => x.message)).toEqual([t('app.storageFull')]);
  });

  it('the same problem reported twice in a row (request + transaction) shows one toast', () => {
    const { fire } = setup();
    fire('quota');
    const first = useUiStore.getState().toasts[0]?.id;
    fire('quota');
    expect(useUiStore.getState().toasts[0]?.id).toBe(first);
  });

  it('a newer version in another tab offers a reload and stays up', () => {
    const { fire, reload } = setup();
    fire('version_change');
    const toast = useUiStore.getState().toasts[0];
    expect(toast?.message).toBe(t('app.newVersion'));
    expect(toast?.actionLabel).toBe(t('app.reload'));
    expect(toast?.duration).toBeGreaterThan(60_000);
    toast?.onAction?.();
    expect(reload).toHaveBeenCalled();
  });
});
