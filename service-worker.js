const CACHE_NAME = 'job-email-generator-v3';
const urlsToCache = [
  './',
  './index.html',
  './app.js'
];

async function blobToDataUrl(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  const base64 = btoa(binary);
  const mimeType = blob.type || 'application/octet-stream';
  return `data:${mimeType};base64,${base64}`;
}

// Install service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch(err => console.log('Cache install failed:', err))
  );
});

// Fetch from network first, fallback to cache
self.addEventListener('fetch', event => {
  const reqUrl = new URL(event.request.url);

  // Handle Web Share Target POST from Android (PWA share)
  // Use endsWith so this works when the site is hosted under a repo subpath (GitHub Pages)
  if (event.request.method === 'POST' && reqUrl.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const title = formData.get('title');
        const text = formData.get('text');
        // `files` param may include one or more files
        const files = formData.getAll('files');
        let serializedFiles = [];

        if (files && files.length) {
          serializedFiles = await Promise.all(
            files.map(async (file, index) => ({
              name: file.name || `shared-file-${index + 1}`,
              type: file.type || 'application/octet-stream',
              size: file.size || 0,
              dataUrl: await blobToDataUrl(file)
            }))
          );
        }

        // Find an existing client window, or open a new one
        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        let client = windowClients[0];
        if (!client) {
          // Open a window within the service worker scope (works on project pages)
          client = await clients.openWindow(self.registration.scope + '?source=share');
        }

        // Post the shared data to the client. File objects are structured-cloneable.
        if (client) {
          client.postMessage({ type: 'share-target', title, text, files, serializedFiles });
        }
      } catch (err) {
        console.error('Error handling /share-target POST:', err);
      }

      // Redirect to the scope root (homepage) after handling share
      return Response.redirect(self.registration.scope, 303);
    })());

    return; // we've handled this request
  }

  // Default network-first strategy for other requests
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200) {
          return response;
        }

        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Update service worker and clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service worker activated, old caches cleared');
      return self.clients.claim(); // Take control immediately
    })
  );
});
