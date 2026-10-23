const CACHE_NAME = 'tabuada-divertida-v11';
const ASSETS = [
  './',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/data.js',
  './js/exercises.js',
  './js/assessment.js',
  './js/review.js',
  './js/report.js',
  './js/confetti.js',
  './js/audio.js',
  './js/config.js',
  './js/cloud-sync.js',
  './js/placement.js',
  './js/facts.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // O servidor redireciona index.html para "./", e o browser recusa abrir uma
  // página redirecionada que venha da cache. Quem instalou a app quando ela
  // ainda abria em index.html recebe a página inicial diretamente.
  const url = new URL(event.request.url);
  const request = event.request.mode === 'navigate' && url.pathname.endsWith('/index.html')
    ? new Request(new URL('./', self.registration.scope))
    : event.request;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
