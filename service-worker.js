const CACHE_NAME = 'job-email-generator-v4';
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

        console.log('[SW] Share received - files count:', files?.length);

        if (files && files.length) {
          console.log('[SW] Converting files to data URLs...');
          serializedFiles = await Promise.all(
            files.map(async (file, index) => {
              const dataUrl = await blobToDataUrl(file);
              console.log(`[SW] File ${index}: ${file.name}, type: ${file.type}, size: ${file.size}, dataUrl length: ${dataUrl?.length}`);
              return {
                name: file.name || `shared-file-${index + 1}`,
                type: file.type || 'application/octet-stream',
                size: file.size || 0,
                dataUrl: dataUrl
              };
            })
          );
        }

        // Find an existing client window, or open a new one
        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        let client = windowClients[0];
        
        console.log('[SW] Existing clients:', windowClients.length);
        
        if (client) {
          // Focus existing client
          if (client.focus) {
            await client.focus();
          }
          console.log('[SW] Posting message to existing client');
        } else {
          // Open a new window
          console.log('[SW] Opening new window');
          client = await clients.openWindow(self.registration.scope + '?source=share');
          // Wait a bit for the new window to be ready
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Post the shared data to the client
        if (client) {
          const message = { type: 'share-target', title, text, files: [], serializedFiles };
          console.log('[SW] Posting message:', { ...message, serializedFiles: `${serializedFiles.length} files` });
          client.postMessage(message);
          
          // Wait a bit before redirecting to ensure message is received
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.error('[SW] No client available to post message');
        }
      } catch (err) {
        console.error('[SW] Error handling /share-target POST:', err);
      }

      // Redirect to the scope root (homepage) after handling share
      console.log('[SW] Redirecting to app');
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
