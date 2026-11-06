// Este dominio antes servía Fluidd, que instaló un service worker con su app en caché.
// Este archivo lo reemplaza: borra las cachés, se desinstala y recarga las pestañas abiertas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    })(),
  );
});
