import type { Client } from '@/domain/models';
import { useStoredImageUrl } from '@/app/useStoredImageUrl';
import { Avatar } from '@/ui';

/** The client's photo (small copy) or the first letter of their name. */
export function ClientAvatar({ client }: { client: Pick<Client, 'name' | 'photoId' | 'photoThumbId'> }) {
  const src = useStoredImageUrl(client.photoThumbId ?? client.photoId);
  return <Avatar name={client.name} src={src} />;
}
