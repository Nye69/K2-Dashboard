import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

import { registerServiceWorker } from './settings/push';

// Service worker propio: solo muestra notificaciones (no guarda caché). Reemplaza cualquiera viejo del dominio.
registerServiceWorker()?.catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
