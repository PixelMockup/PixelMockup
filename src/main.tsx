import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import App from './App.tsx';
import { initTheme } from './useTheme';

initTheme();

(
  window as unknown as { __MS_BOOT_PROGRESS__?: { stop?: () => void } }
).__MS_BOOT_PROGRESS__?.stop?.();

// NOSONAR tssecurity:S8475 - theme read from storage is validated to 'light'/'dark' before DOM use
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
