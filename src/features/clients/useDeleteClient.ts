import { useCallback } from 'react';
import { useRepos } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import type { Client } from '@/domain/models';
import { t } from '@/i18n';

/** Soft-deletes a client and offers "undo" in a toast. */
export function useDeleteClient() {
  const repos = useRepos();
  const showToast = useUiStore((s) => s.showToast);
  return useCallback(
    async (client: Pick<Client, 'id' | 'name'>) => {
      await repos.clients.softDelete(client.id);
      showToast({
        message: t('clients.deleted', { name: client.name }),
        actionLabel: t('common.undo'),
        onAction: () => void repos.clients.restore(client.id),
        duration: 6000,
      });
    },
    [repos, showToast],
  );
}
