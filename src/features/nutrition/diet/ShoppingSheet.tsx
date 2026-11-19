import { useMemo } from 'react';
import { useUiStore } from '@/app/uiStore';
import { weekShopping, type GramDay } from '@/domain/meals';
import { t } from '@/i18n';
import { pick } from '@/i18n/locale';
import { Button, Sheet } from '@/ui';
import common from '../shared/common.module.css';
import styles from './Cal.module.css';

/** One shopping line as text: "3 بيضة · 150 جم", "1.2 كجم" or "350 جم". */
function amountText(l: ReturnType<typeof weekShopping>[number]): string {
  if (l.units !== null && l.unitLabel) return t('nutrition.cal.shopUnits', { n: l.units, unit: pick(l.unitLabel, l.unitLabelEn), g: l.grams });
  if (l.grams >= 1000) return t('nutrition.cal.shopKg', { kg: Math.round(l.grams / 100) / 10 });
  return t('nutrition.cal.shopGrams', { g: l.grams });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Prints only the list (a hidden frame with plain HTML), not the whole screen. */
function printList(title: string, rows: readonly [string, string][]): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset-inline-start:-9999px;inline-size:0;block-size:0;border:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return frame.remove();
  const dir = document.documentElement.dir || 'rtl';
  doc.open();
  doc.write(
    `<!doctype html><html dir="${dir}" lang="${document.documentElement.lang}"><meta charset="utf-8"><title>${esc(title)}</title>` +
      `<style>body{font:16px/1.5 system-ui,sans-serif;margin:24px}h1{font-size:20px}table{inline-size:100%;border-collapse:collapse}td{padding:6px 4px;border-block-end:1px solid #ccc}td:last-child{text-align:end;white-space:nowrap}</style>` +
      `<h1>${esc(title)}</h1><table>${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></html>`,
  );
  doc.close();
  win.focus();
  win.print();
  setTimeout(() => frame.remove(), 60_000);
}

/** The planned week's food added up in grams; send on WhatsApp / share, copy, or print. */
export function ShoppingSheet({ days, clientName, onClose }: { days: readonly GramDay[]; clientName: string; onClose: () => void }) {
  const showToast = useUiStore((s) => s.showToast);
  const lines = useMemo(() => weekShopping(days), [days]);
  const header = t('nutrition.cal.shopHeader', { n: days.length, name: clientName });
  const text = [header, ...lines.map((l) => `• ${pick(l.name, l.nameEn)}: ${amountText(l)}`)].join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ message: t('nutrition.cal.shopCopied'), duration: 2000 });
    } catch {
      window.prompt(t('nutrition.cal.shopCopy'), text);
    }
  };
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Cancelled or not allowed: fall back to WhatsApp.
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <Sheet open onClose={onClose} title={t('nutrition.cal.shopTitle')} cancelLabel={t('common.close')}>
      <p className={common.caption}>{t('nutrition.cal.shopHint')}</p>
      <h3 className={common.sectionTitle}>{header}</h3>
      <ul className={styles.shopList}>
        {lines.map((l) => (
          <li key={l.foodId ?? l.name}>
            <span>{pick(l.name, l.nameEn)}</span>
            <span className="num">{amountText(l)}</span>
          </li>
        ))}
      </ul>
      <div className={`${common.actions} ${styles.noPrint}`}>
        <Button icon="share" onClick={() => void share()}>
          {t('nutrition.cal.shopShare')}
        </Button>
        <Button icon="copy" variant="secondary" onClick={() => void copy()}>
          {t('nutrition.cal.shopCopy')}
        </Button>
        <Button icon="printer" variant="secondary" onClick={() => printList(header, lines.map((l) => [pick(l.name, l.nameEn), amountText(l)]))}>
          {t('nutrition.cal.shopPrint')}
        </Button>
      </div>
    </Sheet>
  );
}
