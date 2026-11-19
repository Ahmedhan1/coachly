import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { startAppUpdates } from '@/app/pwa/appUpdate';
import { applyHeadIcons, hideBootSplashWhenReady, readBrandCache, showBootSplash } from '@/app/pwa/BootSplash';
import { t } from '@/i18n';
import { applyDocumentLocale } from '@/i18n/locale';
import '@/ui/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');
// Trainer's logo as launch picture and home-screen icon (cached copy; see src/features/identity/brandAssets.ts).
applyDocumentLocale();
const brand = readBrandCache();
applyHeadIcons(brand);
showBootSplash(brand);
hideBootSplashWhenReady(root, t('app.loading'));
startAppUpdates();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
