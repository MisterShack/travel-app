/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

/**
 * The service worker (PLAN.md §7, §8).
 *
 * `injectManifest` rather than `generateSW`, because push handlers cannot be
 * added to a generated worker — and push is the whole reason this file exists.
 * Everything workbox would have written is here explicitly instead.
 */

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * A navigation resolves to the app shell, which then reads the timeline out of
 * IndexedDB — so an installed app opens with no network.
 *
 * The API is deliberately never served from this cache: responses are
 * session-scoped, and a stale or wrong-account trip read off disk would be far
 * worse than an honest failure. Reading offline is the repository's job, which
 * knows what it is showing and labels it.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (/^\/(?:api|health)\b/.test(url.pathname)) return;

  event.respondWith(
    fetch(request).catch(async () => {
      // The precached shell. Its exact cache key carries a revision hash, so it
      // is matched through the Cache API rather than guessed at by name.
      const shell = await caches.match('/index.html', { ignoreSearch: true });
      return shell ?? new Response('Offline', { status: 503 });
    }),
  );
});

type PushPayload = { title: string; body: string; url?: string };

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: 'Waypoint', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Collapses repeats of the same reminder rather than stacking them.
      tag: `${payload.title}:${payload.body}`,
      data: { url: payload.url ?? '/' },
    }),
  );
});

/**
 * Focus an existing window if the app is already open, rather than opening a
 * second copy — a traveller tapping a reminder wants the app they were in.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
