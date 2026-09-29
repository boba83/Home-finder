import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isPushSupported, registerServiceWorker } from './lib/push';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (isPushSupported()) {
  registerServiceWorker().catch((err) => console.warn('Service worker nije registrovan', err));
}
