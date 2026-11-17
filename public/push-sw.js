/* Imported by the generated service worker (vite.config.ts workbox.importScripts). Shows Web Push messages
   from the Worker cron ({v:1,id,title,body}, generic text only) and opens the app when tapped. */
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'كوتش';
  const body = typeof data.body === 'string' ? data.body : '';
  event.waitUntil(self.registration.showNotification(title, { body, tag: data.id || undefined, icon: '/icons/icon-192.png', lang: 'ar', dir: 'rtl' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('/schedule');
    }),
  );
});
