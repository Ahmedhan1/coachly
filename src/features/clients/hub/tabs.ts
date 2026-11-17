import { useSearchParams } from 'react-router-dom';

export const HUB_TABS = ['overview', 'training', 'nutrition', 'progress', 'sessions', 'payments'] as const;
export type HubTab = (typeof HUB_TABS)[number];

const isTab = (v: string | null): v is HubTab => (HUB_TABS as readonly string[]).includes(v ?? '');

/** The open hub tab lives in the URL (`?tab=`), so back from a program or exercise returns to the same tab. */
export function useHubTab(): [HubTab, (tab: HubTab) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: HubTab = isTab(raw) ? raw : 'overview';
  const setTab = (next: HubTab) =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (next === 'overview') out.delete('tab');
        else out.set('tab', next);
        return out;
      },
      { replace: true, preventScrollReset: true },
    );
  return [tab, setTab];
}
