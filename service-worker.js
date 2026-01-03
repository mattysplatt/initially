const CACHE_NAME = 'initial-contact-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/main.js',
  '/initials_db.js',
  '/stylev2b.css',
  '/manifest.json',
  '/initiallyicon.png',
  '/icon-192.png',
  '/Initiallylogo.png',
  '/Initiallylogonew.png',
  '/DeckBackground.png',
  '/DeckBackgroundwhite.png',
  '/ScreenBackground.png',
  '/ScreenBackground 2.png',
  '/ScreenBackground 3.png',
  '/ScreenBackground 4.png'
];

// Install service worker and cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache install error:', err);
      })
  );
});

// Fetch from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip Firebase requests - always go to network
  if (event.request.url.includes('firebaseio.com') || 
      event.request.url.includes('firebaseapp.com') ||
      event.request.url.includes('firebasedatabase.app') ||
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Activate service worker and remove old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
