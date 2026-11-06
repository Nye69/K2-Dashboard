import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Por si quedó el service worker de Fluidd registrado en este dominio: quitarlo.
navigator.serviceWorker?.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
