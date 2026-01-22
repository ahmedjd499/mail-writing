const CACHE_NAME = 'job-email-generator-v6';
const urlsToCache = [

];

// IndexedDB helpers for storing share data
function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShareTargetDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('shares')) {
        db.createObjectStore('shares', { keyPath: 'id' });
      }
    };
  });
}

function storeShareData(db, shareData) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['shares'], 'readwrite');
    const store = transaction.objectStore('shares');
    
    // Store with timestamp to clean up old data
    const dataWithId = {
      ...shareData,
      id: 'pending',
      timestamp: Date.now()
    };
    
    const request = store.put(dataWithId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

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
        const url = formData.get('url');
        // `files` param may include one or more files
        const files = formData.getAll('files');
        let serializedFiles = [];

        console.log('[SW] Share received - files count:', files?.length, 'url:', url);

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

        // Store the shared data in a way that can be retrieved by the page
        const shareData = { type: 'share-target', title, text, url, files: [], serializedFiles };
        
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
          client.postMessage(shareData);
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          // Open a new window with share data stored in URL fragment
          console.log('[SW] Opening new window');
          
          // Store share data in IndexedDB for new window to retrieve
          const db = await openShareDB();
          await storeShareData(db, shareData);
          
          client = await clients.openWindow(self.registration.scope + '?source=share&shareId=pending');
          
          // If client opened, try posting message with retries
          if (client) {
            console.log('[SW] New client opened, attempting message delivery with retries');
            // Try multiple times with increasing delays to ensure message is received
            for (let attempt = 0; attempt < 5; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 500 + attempt * 300));
              try {
                client.postMessage(shareData);
                console.log(`[SW] Message posted (attempt ${attempt + 1})`);
              } catch (err) {
                console.error(`[SW] Failed to post message (attempt ${attempt + 1}):`, err);
              }
            }
          } else {
            console.error('[SW] Failed to open new window');
          }
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
