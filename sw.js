const CACHE_VERSION = 'v16';
const CACHE_NAME = `daylight-shell-${CACHE_VERSION}`;
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './supabase-config.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(APP_SHELL.map(async (asset) => {
    const response = await fetch(`${asset}?${CACHE_VERSION}`, { cache: 'reload' });
    if (!response.ok) throw new Error(`Unable to cache ${asset}: ${response.status}`);
    await cache.put(asset, response);
  }))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});
