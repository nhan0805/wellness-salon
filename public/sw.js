// Dummy Service Worker để kích hoạt tính năng Install PWA
self.addEventListener('install', (event) => {
  console.log('PWA Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('PWA Service Worker activated...');
});

self.addEventListener('fetch', (event) => {
  // Không làm gì cả, cứ để request đi qua bình thường (không cache)
});
