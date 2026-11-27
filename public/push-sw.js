/* Imported by the generated service worker (vite.config.ts workbox.importScripts). Shows Web Push messages
   from the Worker cron ({v:1,id,title,body}, generic text only) and opens the app when tapped.
   Ids starting with "evt-" are client events (a check-in or photo from a client page): an open app is told at
   once so it pulls the item, and tapping the notification opens Home, where "new from your clients" lists it. */
function tellApp(type, id) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) c.postMessage({ type, id });
    return list;
  });
}

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const id = typeof data.id === 'string' ? data.id : '';
  const title = typeof data.title === 'string' && data.title ? data.title : 'Coachly';
  const body = typeof data.body === 'string' ? data.body : '';
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, { body, tag: id || undefined, data: { id }, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', lang: 'ar', dir: 'rtl' }),
      id.startsWith('evt-') ? tellApp('pt-push', id).catch(() => undefined) : Promise.resolve(),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = (event.notification.data && event.notification.data.id) || event.notification.tag || '';
  const isEvent = typeof id === 'string' && id.startsWith('evt-');
  event.waitUntil(
    tellApp(isEvent ? 'pt-push-open' : 'pt-push-tap', id).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(isEvent ? '/' : '/schedule');
    }),
  );
});
