// Service worker mínimo para que Studio se pueda instalar como app.
// No guarda nada en caché: siempre pide la versión actual al servidor.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="background:#0e1116;color:#e6ebf1;font-family:sans-serif;padding:30px">'
    + '<h2>Sin conexión con Studio</h2><p>Abre tu app de SSH y conecta el túnel al VPS. Luego vuelve aquí y desliza para recargar.</p></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
