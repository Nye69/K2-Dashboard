// Service worker del K2 Dashboard: solo recibe y muestra las notificaciones push.
// No guarda nada en caché (la app siempre se carga del servidor), así que nunca sirve una versión vieja.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Borra cachés que pudieran quedar de versiones antiguas o de otras apps del dominio.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'K2', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'K2', {
      body: data.body || '',
      tag: data.tag,
      renotify: !!data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-64.png',
      data: { url: data.url || '/' },
    }),
  );
});

// Al tocar la notificación: abrir el dashboard (o enfocarlo si ya está abierto).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const same = wins.find((w) => new URL(w.url).origin === target.origin);
      if (same) return same.focus();
      return self.clients.openWindow(target.href);
    })(),
  );
});

// Si el navegador renueva la suscripción por su cuenta, avisar al servidor para no perder los avisos.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const res = await fetch('/auth/api/push', { credentials: 'include' });
      if (!res.ok) return;
      const { publicKey } = await res.json();
      const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const sub = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      await fetch('/auth/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), label: 'Dispositivo (renovado)' }),
      });
      if (old) {
        await fetch('/auth/api/push/unsubscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: old.endpoint }),
        });
      }
    })(),
  );
});
