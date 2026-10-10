// Online-first service worker used only to enable tablet installation.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
});

self.addEventListener('fetch', (event) => {
  // Không làm gì cả, cứ để request đi qua bình thường (không cache)
});
