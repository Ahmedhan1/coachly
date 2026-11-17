import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { startAppUpdates } from '@/app/appUpdate';
import '@/ui/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');
startAppUpdates();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
