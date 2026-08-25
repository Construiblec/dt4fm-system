/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

type PushPayload = {
  title?: string;
  body?: string;
  deepLink?: string | null;
  tag?: string;
  type?: string;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/_vercel\//],
  }),
);

// No se llama a skipWaiting() al instalar: el SW nuevo espera a que el usuario
// acepte desde UpdateAppToast, para no recargar a un operario a mitad de un
// checklist. `virtual:pwa-register` manda este mensaje cuando el usuario acepta.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// Tampoco se llama a clientsClaim(): el SW nuevo no secuestra pestañas que ya
// cargaron el index.html viejo. Suscribirse a push no lo necesita.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: PushPayload = {};
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'DT4F', {
      body: payload.body ?? '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      // Agrupa por entidad: un reaviso sustituye al anterior en vez de apilarse.
      tag: payload.tag,
      data: { deepLink: payload.deepLink ?? null, type: payload.type },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const deepLink = (event.notification.data as { deepLink?: string | null })
    ?.deepLink;
  const target = deepLink ?? '/dashboard';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Si la app ya está abierta se reutiliza esa ventana en lugar de abrir
      // otra, que en móvil deja dos instancias de la PWA conviviendo.
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(target);
          }
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});
