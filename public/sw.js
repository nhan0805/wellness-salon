// Online-first service worker used only to enable tablet installation.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
});

self.addEventListener('fetch', (event) => {
  // Let requests pass through normally without caching.
});
