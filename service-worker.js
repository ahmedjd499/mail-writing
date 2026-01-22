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
    
    // shareData already has an id (shareId), timestamp for cleanup
    const dataWithTimestamp = {
      ...shareData,
      id: shareData.shareId || 'pending',
      timestamp: Date.now()
    };
    
    const request = store.put(dataWithTimestamp);
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
          
          // Filter out files that are too large (>10MB) to prevent memory issues
          const validFiles = files.filter(file => {
            if (file.size > 10 * 1024 * 1024) {
              console.warn(`[SW] File ${file.name} is too large (${file.size} bytes), skipping`);
              return false;
            }
            return true;
          });
          
          if (validFiles.length > 0) {
            try {
              serializedFiles = await Promise.all(
                validFiles.map(async (file, index) => {
                  try {
                    const dataUrl = await blobToDataUrl(file);
                    console.log(`[SW] File ${index}: ${file.name}, type: ${file.type}, size: ${file.size}, dataUrl length: ${dataUrl?.length}`);
                    return {
                      name: file.name || `shared-file-${index + 1}`,
                      type: file.type || 'application/octet-stream',
                      size: file.size || 0,
                      dataUrl: dataUrl
                    };
                  } catch (err) {
                    console.error(`[SW] Failed to convert file ${index}:`, err);
                    return null; // Return null for failed conversions
                  }
                })
              );
              // Filter out null results from failed conversions
              serializedFiles = serializedFiles.filter(f => f !== null);
            } catch (err) {
              console.error('[SW] Error converting files:', err);
              serializedFiles = []; // Fallback to empty array
            }
          }
        }

        // Generate unique ID for this share
        const shareId = 'share-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
        const shareData = { type: 'share-target', title, text, url, files: [], serializedFiles, shareId };
        
        // Find an existing client window, or open a new one
        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        let client = windowClients[0];
        
        console.log('[SW] Existing clients:', windowClients.length);
        
        if (client) {
          // For existing clients, just post message (no IndexedDB needed)
          if (client.focus) {
            await client.focus();
          }
          console.log('[SW] Posting message to existing client');
          client.postMessage(shareData);
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          // For new windows, store in IndexedDB as fallback
          console.log('[SW] Opening new window');
          
          try {
            const db = await openShareDB();
            await storeShareData(db, shareData);
            console.log(`[SW] Share data stored in IndexedDB with ID: ${shareId}`);
          } catch (err) {
            console.error('[SW] Failed to store share data in IndexedDB:', err);
            // Continue anyway, message posting might still work
          }
          
          client = await clients.openWindow(self.registration.scope + '?source=share&shareId=' + shareId);
          
          // Note: We stored in IndexedDB, so the new window will check there on load
          // Message posting here is unreliable for new windows, so we don't retry
          if (!client) {
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
    Promise.all([
      // Clear old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Clean up old share data from IndexedDB (older than 1 hour)
      cleanupOldShareData()
    ]).then(() => {
      console.log('Service worker activated, old caches and share data cleared');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Clean up old IndexedDB share entries
async function cleanupOldShareData() {
  try {
    const db = await openShareDB();
    const transaction = db.transaction(['shares'], 'readwrite');
    const store = transaction.objectStore('shares');
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Get all records
    const getAllRequest = store.openCursor();
    
    return new Promise((resolve, reject) => {
      getAllRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const data = cursor.value;
          // Delete if older than 1 hour
          if (data.timestamp && data.timestamp < oneHourAgo) {
            console.log(`[SW] Deleting old share data: ${data.id}`);
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  } catch (err) {
    console.warn('[SW] Error cleaning up share data:', err);
    // Don't fail activation on cleanup errors
  }
}
