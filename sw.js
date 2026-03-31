const CACHE_NAME = 'profeges-cache-v25';
const urlsToCache = [
    './',
    './index.html',
    './style.css?v=25',
    './app.js?v=25',
    './icon.png',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
    'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css',
    'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            }).catch(err => console.error("Error caching on install", err))
    );
});

self.addEventListener('fetch', event => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') return;

    // Ignore firestore requests completely so service worker doesn't break firebase
    if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('google.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request).then(response => {
            // Check if we received a valid response
            if (!response || response.status !== 200) {
                return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
            });

            return response;
        }).catch(() => {
            // Network request failed, try cache
            return caches.match(event.request).then(response => {
                if (response) {
                    return response;
                }
                console.log("No internet connection and resource is not cached:", event.request.url);
            });
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});
