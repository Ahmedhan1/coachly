import { useEffect, useRef } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import type { StorageProblem, StorageProblemListener } from '@/data';
import { t, type TKey } from '@/i18n';

const MESSAGE: Record<StorageProblem, TKey> = {
  quota: 'app.storageFull',
  write_failed: 'app.writeFailed',
  version_change: 'app.newVersion',
  blocked: 'app.blocked',
};

/** One failure is often reported twice (the request, then the aborted transaction): show it once. */
const REPEAT_WINDOW_MS = 3000;
/** Problems that need the trainer to act stay up (practically) until they do. */
const STICKY_MS = 10 * 60_000;

const reloadPage = () => window.location.reload();

interface Props {
  subscribe: (listener: StorageProblemListener) => () => void;
  reload?: () => void;
  now?: () => number;
}

/** Turns database-level problems into toasts. Renders nothing itself. */
export function StorageProblemToasts({ subscribe, reload = reloadPage, now = Date.now }: Props) {
  const showToast = useUiStore((s) => s.showToast);
  const last = useRef<{ problem: StorageProblem; at: number } | null>(null);

  useEffect(
    () =>
      subscribe((problem) => {
        const at = now();
        if (last.current && last.current.problem === problem && at - last.current.at < REPEAT_WINDOW_MS) return;
        last.current = { problem, at };
        const sticky = problem === 'version_change' || problem === 'blocked';
        showToast({
          message: t(MESSAGE[problem]),
          duration: sticky ? STICKY_MS : 8000,
          ...(problem === 'version_change' ? { actionLabel: t('app.reload'), onAction: reload } : {}),
        });
      }),
    [subscribe, showToast, reload, now],
  );
  return null;
}

/** For the app shell: listens to the app's own data layer. */
export function AppStorageProblemToasts() {
  const { data } = useServices();
  return <StorageProblemToasts subscribe={data.onStorageProblem} />;
}
