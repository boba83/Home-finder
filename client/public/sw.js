/* Home Finder - Service Worker za Web Push obaveštenja */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Home Finder', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Home Finder';
  const options = {
    body: data.body || 'Pronađen je nov oglas',
    icon: '/icon.svg',
    badge: '/icon.svg',
    image: data.image || undefined,
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
    actions: [{ action: 'open', title: 'Otvori oglas' }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  const isInternal = target.startsWith(self.location.origin);

  event.waitUntil(
    (async () => {
      if (isInternal) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = windows.find((w) => w.url.startsWith(self.location.origin));
        if (existing) {
          await existing.focus();
          return existing.navigate(target);
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
