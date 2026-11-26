import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { t } from '@/i18n';
import { Button, SegmentedControl, Select, Sheet, TextArea, TextField } from '@/ui';
import { PhotoField } from '@/features/nutrition/shared/PhotoField';
import { Slider } from '@/features/nutrition/shared/Slider';
import { PDF_FONTS, savePdfBranding, type PdfBrandingSettings } from './pdfBranding';
import styles from './Pdf.module.css';

/** The PDF's look: logo placement and size, font, page background and opacity, cover, footer, contacts, disclaimer. */
export function BrandingSheet({ initial, onClose }: { initial: PdfBrandingSettings; onClose: (changed: boolean) => void }) {
  const { meta } = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const [v, setV] = useState(initial);
  const [contacts, setContacts] = useState(initial.contactLines.join('\n'));
  const set = <K extends keyof PdfBrandingSettings>(k: K, value: PdfBrandingSettings[K]) => setV((x) => ({ ...x, [k]: value }));

  const save = async () => {
    const contactLines = contacts
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6);
    await savePdfBranding(meta, { ...v, contactLines, footerText: v.footerText.trim(), disclaimer: v.disclaimer?.trim() ? v.disclaimer.trim() : null });
    showToast({ message: t('pdf.branding.saved'), duration: 2500 });
    onClose(true);
  };

  return (
    <Sheet
      open
      onClose={() => onClose(false)}
      title={t('pdf.branding.title')}
      cancelLabel={t('common.cancel')}
      primaryAction={
        <Button size="small" onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.form}>
        <p className={styles.hint}>{t('pdf.branding.logoHint')}</p>
        <SegmentedControl
          label={t('pdf.branding.placement')}
          value={v.logoPlacement}
          onChange={(x) => set('logoPlacement', x)}
          options={(['start', 'center', 'end'] as const).map((p) => ({ value: p, label: t(`pdf.branding.placements.${p}`) }))}
        />
        <SegmentedControl
          label={t('pdf.branding.logoSize')}
          value={v.logoSize}
          onChange={(x) => set('logoSize', x)}
          options={(['small', 'medium', 'large'] as const).map((p) => ({ value: p, label: t(`pdf.branding.logoSizes.${p}`) }))}
        />
        <Select label={t('pdf.branding.font')} value={v.fontFamily} onChange={(x) => set('fontFamily', x)} options={PDF_FONTS.map((f) => ({ value: f, label: f }))} />
        <PhotoField
          label={t('pdf.branding.background')}
          addLabel={t('pdf.branding.addImage')}
          removeLabel={t('pdf.branding.removeImage')}
          imageId={v.backgroundImageId}
          onChange={(id) => set('backgroundImageId', id)}
        />
        {v.backgroundImageId && (
          <Slider
            label={t('pdf.branding.backgroundOpacity')}
            value={Math.round(v.backgroundOpacity * 100)}
            min={0}
            max={100}
            step={5}
            onChange={(x) => set('backgroundOpacity', x / 100)}
            display={String(Math.round(v.backgroundOpacity * 100))}
            unit="%"
          />
        )}
        <PhotoField label={t('pdf.branding.cover')} addLabel={t('pdf.branding.addImage')} removeLabel={t('pdf.branding.removeImage')} imageId={v.coverImageId} onChange={(id) => set('coverImageId', id)} />
        <TextField label={t('pdf.branding.footer')} placeholder={t('pdf.branding.footerPlaceholder')} value={v.footerText} onChange={(e) => set('footerText', e.target.value)} />
        <TextArea label={t('pdf.branding.contact')} hint={t('pdf.branding.contactHint')} value={contacts} onChange={(e) => setContacts(e.target.value)} />
        <TextArea
          label={t('pdf.branding.disclaimer')}
          hint={t('pdf.branding.disclaimerHint')}
          value={v.disclaimer ?? t('pdf.disclaimerDefault')}
          onChange={(e) => set('disclaimer', e.target.value)}
        />
      </div>
    </Sheet>
  );
}
