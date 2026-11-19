// Service worker de CubaXnova Studio:
//  - permite instalar Studio como app (sin caché: siempre la versión actual del servidor)
//  - recibe los avisos (Web Push) aunque la app esté cerrada
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="background:#0e1116;color:#e6ebf1;font-family:sans-serif;padding:30px">'
    + '<h2>Sin conexión con Studio</h2><p>Abre tu app de SSH y conecta el túnel al VPS. Luego vuelve aquí y desliza para recargar.</p></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'CubaXnova Studio', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'CubaXnova Studio', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: d.url || '/' },
    tag: 'studio-tarea',
    renotify: true,
    vibrate: [120, 60, 120],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); w.postMessage({ type: 'open', url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
