// The Discord browser test's web push check (discord-test.html): shows each push it gets, and tells the test page.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    await self.registration.showNotification('Hexmarch test push arrived', { body: 'The page sent it and this phone or computer woke up for it.', tag: 'hexmarch-push-test' });
    for (const c of await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })) c.postMessage({ hexmarchPushTest: true });
  })());
});
self.addEventListener('notificationclick', (e) => e.notification.close());
