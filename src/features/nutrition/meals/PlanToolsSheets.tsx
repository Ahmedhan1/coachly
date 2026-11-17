import { useMemo, useState } from 'react';
import { shoppingList, shoppingText } from '@/domain/meals';
import type { Client, MealPlan, Recipe } from '@/domain/models';
import { whatsappLink, renderTemplate } from '@/domain/whatsapp';
import { t } from '@/i18n';
import { Button, Num, Select, Sheet } from '@/ui';
import { useUiStore } from '@/app/uiStore';
import { defaultTemplate, useWhatsappTemplates } from '@/features/whatsapp/templatesStore';
import { templateValues } from '@/features/whatsapp/values';
import { templateFor } from '@/domain/whatsapp';
import common from '../shared/common.module.css';
import styles from './MealPlan.module.css';

/** Shopping list for the client's plan days × N days, shareable on WhatsApp or copied. */
export function ShoppingSheet({ client, plans, recipes, onClose }: { client: Client; plans: MealPlan[]; recipes: Recipe[]; onClose: () => void }) {
  const showToast = useUiStore((s) => s.showToast);
  const templates = useWhatsappTemplates();
  const [days, setDays] = useState('7');
  const list = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.id as string, { id: r.id as string, servings: r.servings, ingredients: r.ingredients }]));
    // The plan's days repeat over the period: N days ÷ number of plan days.
    const repeat = Number(days) / Math.max(1, plans.length);
    return shoppingList(plans, byId, repeat);
  }, [plans, recipes, days]);
  const header = t('nutrition.tools.shoppingHeader', { n: days });
  const text = shoppingText(header, list);
  const template = (templates && templateFor('shopping_list', templates)) ?? defaultTemplate('shopping_list');
  const intro = renderTemplate(template.body, templateValues(client)).text;
  const wa = client.phone ? whatsappLink(client.phone, `${intro}\n\n${text}`) : null;
  return (
    <Sheet open onClose={onClose} title={t('nutrition.tools.shoppingTitle')} cancelLabel={t('common.close')}>
      <div className={common.form}>
        <Select
          label={t('nutrition.tools.shoppingDays')}
          value={days}
          onChange={setDays}
          options={['1', '3', '7', '14'].map((n) => ({ value: n, label: t('nutrition.tools.shoppingDaysOption', { n }) }))}
        />
        {list.lines.length + list.extras.length === 0 ? (
          <p className={common.muted}>{t('nutrition.tools.shoppingEmpty')}</p>
        ) : (
          <ul className={styles.shopping}>
            {list.lines.map((l) => (
              <li key={`${l.name}|${l.unit}`}>
                <span>{l.name}</span>
                <span>
                  <Num>{l.quantity}</Num> {l.unit}
                </span>
              </li>
            ))}
            {list.extras.map((e) => (
              <li key={e}>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        )}
        {wa && (
          <a className={styles.waButton} href={wa} target="_blank" rel="noreferrer">
            {t('nutrition.tools.shoppingSend')}
          </a>
        )}
        <Button
          variant="secondary"
          icon="copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              showToast({ message: t('nutrition.tools.copied'), duration: 2000 });
            } catch {
              window.prompt(t('nutrition.tools.shoppingCopy'), text);
            }
          }}
        >
          {t('nutrition.tools.shoppingCopy')}
        </Button>
      </div>
    </Sheet>
  );
}
