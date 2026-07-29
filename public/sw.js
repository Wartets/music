const STATIC_CACHE = 'music-library-static-v4';
const ARTWORK_CACHE = 'music-library-artwork-v4';
const DATA_CACHE = 'music-library-data-v4';
const APP_SCOPE = new URL(self.registration.scope);
const APP_BASE_PATH = APP_SCOPE.pathname.endsWith('/') ? APP_SCOPE.pathname.slice(0, -1) : APP_SCOPE.pathname;
const toScopedPath = (path) => `${APP_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg',
  '/apple-touch-icon.svg',
  '/musicBib.json',
].map(toScopedPath);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== ARTWORK_CACHE && key !== DATA_CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.headers.has('range')) {
    event.respondWith(fetch(request));
    return;
  }

  // Only apply the network-first caching strategy to the primary library index
  // (`musicBib.json`). Do NOT broadly cache arbitrary same-origin `.json` files
  // which could include dynamic APIs or sensitive endpoints.
  if (url.pathname === toScopedPath('/musicBib.json')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        try {
          const network = await fetch(request);
          if (network.ok) {
            cache.put(request, network.clone());
          }
          return network;
        } catch {
          if (cached) {
            return cached;
          }
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      })
    );
    return;
  }

  // For other same-origin JSON files, prefer network-only and avoid caching by
  // the service worker to prevent stale data and inadvertent caching of APIs.
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(request).catch(() => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(
      caches.open(ARTWORK_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }

        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(toScopedPath('/index.html'));
        })
    );
    return;
  }

  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

