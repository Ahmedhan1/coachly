import type { AppServices } from '@/app/services';
import { setClientPhotoFromImage } from '@/features/clients/clientPhoto';
import { readShare } from '@/features/online/prefs';

/**
 * Brings in profile photos clients uploaded from their page and makes each the client's photo (which also
 * queues the trainer's own encrypted copy). Returns the names of the clients whose photo changed.
 */
export async function pullClientPhotos(services: AppServices): Promise<string[]> {
  const files = services.online?.files;
  if (!files) return [];
  const repos = services.data.repos;
  const clients = await repos.clients.list();
  const links = (
    await Promise.all(
      clients.map(async (c) => {
        const share = await readShare(services.meta, c.id);
        return share ? { shareId: share.shareId, key: share.key, clientId: c.id as string } : null;
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);
  const imported = await files.pullClientPhotos(links);
  const names: string[] = [];
  for (const { clientId, imageId } of imported) {
    const client = clients.find((c) => c.id === clientId);
    if (!client) continue;
    await setClientPhotoFromImage(services, client, imageId);
    names.push(client.name);
  }
  return names;
}
