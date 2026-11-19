import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { useLive } from '@/app/useLive';
import { t } from '@/i18n';
import type { ShareService } from '@/services/share';
import { ListRow, ListSection, Icon } from '@/ui';
import { formatIsoDate } from '@/ui/format';
import { toIsoDate } from '@/domain/models';

/**
 * PDFs sent to clients, newest first. Each one is kept as an encrypted cloud copy (iDrive e2); opening one that
 * is no longer on this phone downloads and decrypts it, then hands it to the share sheet again.
 */
export function PdfArchive({ share }: { share: ShareService }) {
  const services = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const [opening, setOpening] = useState<string | null>(null);
  const rows = useLive(
    async () => (await services.data.repos.cloudFiles.list()).filter((r) => r.kind === 'pdf' && r.state !== 'deleting').sort((a, b) => b.createdAt - a.createdAt).slice(0, 20),
    [services],
  );
  if (!rows || rows.length === 0) return null;

  const open = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setOpening(id);
    try {
      let bytes: Uint8Array | null = row.bytes ? new Uint8Array(row.bytes) : null;
      if (!bytes && row.remoteId && services.online?.files) bytes = (await services.online.files.open(row.remoteId))?.bytes ?? null;
      if (!bytes) return showToast({ message: t('files.pdfArchive.openFailed') });
      const fileName = row.name ?? 'program.pdf';
      await share.shareFile({ data: new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName, mimeType: 'application/pdf', title: fileName }, { prefer: 'share' });
    } finally {
      setOpening(null);
    }
  };

  return (
    <ListSection icon="file" title={t('files.pdfArchive.title')}>
      {rows.map((r) => (
        <ListRow leading={<Icon name="file" />}
          key={r.id}
          title={r.name ?? 'PDF'}
          subtitle={opening === r.id ? t('files.pdfArchive.opening') : r.state === 'pending' ? t('files.pdfArchive.pending') : formatIsoDate(toIsoDate(new Date(r.createdAt)))}
          onClick={() => void open(r.id)}
        />
      ))}
    </ListSection>
  );
}
