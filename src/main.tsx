import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import App from './App.tsx';
import { initTheme } from './useTheme';

initTheme();

// NOSONAR tssecurity:S8475 - theme read from storage is validated to 'light'/'dark' before DOM use
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
