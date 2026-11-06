import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo Vite hace lo que nginx hace en producción:
// - reenvía la API de Moonraker a la impresora (K2_URL, p. ej. http://192.168.1.50:7125)
// - reenvía /auth, /login y /setup al servidor Node (npm run dev:server)
// En desarrollo no se pide sesión para la app (eso lo hace nginx en el contenedor).
const K2 = process.env.K2_URL ?? 'http://127.0.0.1:7125';
const SERVER = process.env.SERVER_URL ?? 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/websocket': { target: K2, ws: true, changeOrigin: false },
      '/k2ws': { target: K2.replace(/:\d+$/, ':9999'), ws: true, changeOrigin: true, rewrite: () => '/' },
      '^/(server|printer|machine|access|api)/': { target: K2, changeOrigin: false },
      '^/(auth/|login$|setup$)': { target: SERVER, changeOrigin: false },
    },
  },
});
