import { getLocale, setLocale, t, type Locale } from '@/i18n';
import { SegmentedControl } from '@/ui';

/** العربية / English. Switching saves the choice and reloads, so every string and the direction follow at once. */
export function LanguageSwitch({ label = t('settings.language.title') }: { label?: string }) {
  const options = [
    { value: 'ar' as const, label: t('settings.language.ar') },
    { value: 'en' as const, label: t('settings.language.en') },
  ];
  return (
    <div data-testid="language-switch">
      <SegmentedControl<Locale>
        label={label}
        options={options}
        value={getLocale()}
        onChange={(v) => {
          if (v !== getLocale()) setLocale(v);
        }}
      />
    </div>
  );
}
