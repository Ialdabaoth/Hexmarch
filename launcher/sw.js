// Retires the offline helper the Companion had when it lived at the site's root (before it moved to companion/,
// Heph 2026-11-10). A browser that still has it checks this file, installs this one, and this one removes itself and
// its offline copies, then reloads the open pages so they come from the network. The Launcher has no offline helper.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    for (const k of await caches.keys()) if (k.endsWith(scope)) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
