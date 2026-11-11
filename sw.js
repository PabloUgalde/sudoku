// Service worker de "Juegos" (Sudoku + Queens).
//
// Estrategia: RED PRIMERO. Con internet siempre se sirve la versión publicada y se
// actualiza la copia local; la copia solo se usa cuando no hay conexión.
// Antes era "caché primero": la app abría siempre la copia guardada y bajaba la
// versión nueva en segundo plano, así que en el teléfono a veces aparecía la versión
// anterior al volver a abrirla.
const CACHE_NAME = 'juegos-v6';
const ASSETS = [
  './',
  './index.html',
  './sudoku.html',
  './queens.html',
  './style.css',
  './theme.js',
  './pwa.js',
  './sudoku.js',
  './app.js',
  './queens.js',
  './queens-app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Todo se revalida con el servidor: no-cache = pregunta si cambió (respuesta corta si no)
  // en vez de usar la copia HTTP de hasta 10 minutos que permite GitHub Pages.
  // Las páginas (navegaciones) no aceptan opciones extra sobre la petición original,
  // por eso se piden de nuevo por su URL.
  const network = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((r) =>
        // Chrome no acepta una respuesta "redirigida" para abrir una página: se rearma.
        r.redirected ? r.blob().then((b) => new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers })) : r)
    : fetch(req, { cache: 'no-cache' });

  event.respondWith(
    network
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((cached) =>
          cached || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
