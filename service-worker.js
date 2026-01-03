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
  const url = new URL(event.request.url);
  
  // Skip Firebase requests - always go to network
  // Check hostname to ensure we're only matching legitimate Firebase/Google domains
  if (url.hostname.endsWith('.firebaseio.com') || 
      url.hostname.endsWith('.firebaseapp.com') ||
      url.hostname.endsWith('.firebasedatabase.app') ||
      url.hostname.endsWith('.googleapis.com') ||
      url.hostname.endsWith('.gstatic.com') ||
      url.hostname === 'firebaseio.com' ||
      url.hostname === 'firebaseapp.com' ||
      url.hostname === 'firebasedatabase.app' ||
      url.hostname === 'googleapis.com' ||
      url.hostname === 'gstatic.com') {
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
