const CACHE_NAME = 'job-email-generator-v8';
const urlsToCache = [];

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

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
    const record = {
      ...shareData,
      id: shareData.shareId || 'pending',
      timestamp: Date.now()
    };
    const request = store.put(record);
    // Wait for the full transaction to commit, not just the request
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    request.onerror = () => reject(request.error);
  });
}

async function blobToDataUrl(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  const mimeType = blob.type || 'application/octet-stream';
  return `data:${mimeType};base64,${base64}`;
}

// ── Install ────────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  self.skipWaiting(); // activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' }))))
      .catch(err => console.log('[SW] Cache install failed:', err))
  );
});

// ── Activate ───────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(names =>
        Promise.all(names.map(name => name !== CACHE_NAME && caches.delete(name)))
      ),
      cleanupOldShareData()
    ]).then(() => {
      console.log('[SW] Activated v8');
      return self.clients.claim();
    })
  );
});

// ── Fetch / Share Target ───────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const reqUrl = new URL(event.request.url);

  // ── Handle Web Share Target POST ──
  if (event.request.method === 'POST' && reqUrl.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // ── Default: network-first, fallback to cache ──
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

async function handleShareTarget(request) {
  const scope = self.registration.scope;

  try {
    const formData = await request.formData();
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';
    const files = formData.getAll('files');

    console.log('[SW] Share received — title:', title, '| text length:', text.length,
      '| url:', url, '| files:', files.length);

    // Serialize image files to data URLs
    let serializedFiles = [];
    if (files.length) {
      const validFiles = files.filter(f => f.size <= 10 * 1024 * 1024);
      serializedFiles = (await Promise.all(
        validFiles.map(async (file, i) => {
          try {
            const dataUrl = await blobToDataUrl(file);
            console.log(`[SW] File ${i}: ${file.name} (${file.type}, ${file.size}B)`);
            return { name: file.name || `shared-${i + 1}`, type: file.type, size: file.size, dataUrl };
          } catch (err) {
            console.error(`[SW] Failed to serialize file ${i}:`, err);
            return null;
          }
        })
      )).filter(Boolean);
    }

    const shareId = 'share-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
    const shareData = { type: 'share-target', title, text, url, files: [], serializedFiles, shareId };

    // Try to find an already-open client
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    if (windowClients.length > 0) {
      // App is already open — post message directly, no IndexedDB needed
      const client = windowClients[0];
      if (client.focus) await client.focus();
      client.postMessage(shareData);
      console.log('[SW] Message posted to existing client');
      return Response.redirect(scope, 303);
    }

    // App is not open — persist to IndexedDB BEFORE redirecting
    try {
      const db = await openShareDB();
      await storeShareData(db, shareData); // waits for transaction.oncomplete
      console.log('[SW] Share data persisted to IndexedDB:', shareId);
    } catch (err) {
      console.error('[SW] IndexedDB write failed:', err);
      // Still redirect — app will show empty state rather than crash
    }

    const redirectUrl = scope + '?source=share&shareId=' + shareId;
    console.log('[SW] Redirecting to:', redirectUrl);
    return Response.redirect(redirectUrl, 303);

  } catch (err) {
    console.error('[SW] handleShareTarget error:', err);
    return Response.redirect(scope, 303);
  }
}

// ── IndexedDB cleanup ──────────────────────────────────────────────────────────

async function cleanupOldShareData() {
  try {
    const db = await openShareDB();
    const tx = db.transaction(['shares'], 'readwrite');
    const store = tx.objectStore('shares');
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      const cursor = store.openCursor();
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          if (c.value.timestamp && c.value.timestamp < oneHourAgo) {
            c.delete();
          }
          c.continue();
        } else {
          resolve();
        }
      };
      cursor.onerror = () => reject(cursor.error);
    });
  } catch (err) {
    console.warn('[SW] Cleanup error:', err);
  }
}
