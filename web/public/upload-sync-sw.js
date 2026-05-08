/* eslint-disable */
// Background Sync service worker for queued photo uploads.
//
// Runs in a separate scope (/upload-sync/) from the main Angular service
// worker so it does not intercept any page or API requests. Its sole job
// is to listen for the 'pm-upload-flush' sync event and POST any queued
// uploads from IndexedDB to /api/upload.
//
// Survives app close: the browser wakes this worker when network returns,
// even with no tabs open.

const DB_NAME = 'pm-upload-queue';
const DB_VERSION = 2;
const STORE_PENDING = 'pending';
const STORE_CONFIG = 'config';
const SYNC_TAG = 'pm-upload-flush';
const MAX_ATTEMPTS = 5;

self.addEventListener('install', (event) => {
  // Take over immediately so the first sync registration after install works.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushQueue());
  }
});

// Manual trigger from the page (when sync API isn't available).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'flush') {
    event.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  try {
    const config = await readConfig();
    if (!config.apiKey || !config.baseUrl) return;

    const items = await readPending();
    for (const item of items) {
      if (item.attempts >= MAX_ATTEMPTS) {
        // Give up so the SW doesn't loop forever on persistent failures.
        // The user can manually retry from the page.
        continue;
      }

      try {
        const form = new FormData();
        form.append('file', item.blob, item.fileName);
        const res = await fetch(config.baseUrl + '/api/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + config.apiKey },
          body: form,
        });
        if (res.ok) {
          await deletePending(item.id);
        } else {
          await bumpAttempt(item.id, 'HTTP ' + res.status);
        }
      } catch (err) {
        await bumpAttempt(item.id, err && err.message ? err.message : 'network error');
      }
    }
  } catch (err) {
    // Swallow; retried by the next sync event.
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PENDING)) db.createObjectStore(STORE_PENDING);
      if (!db.objectStoreNames.contains(STORE_CONFIG)) db.createObjectStore(STORE_CONFIG);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function readConfig() {
  const db = await openDb();
  const result = await new Promise((resolve) => {
    const tx = db.transaction(STORE_CONFIG, 'readonly');
    const store = tx.objectStore(STORE_CONFIG);
    const apiKeyReq = store.get('apiKey');
    const baseUrlReq = store.get('baseUrl');
    tx.oncomplete = () => resolve({ apiKey: apiKeyReq.result, baseUrl: baseUrlReq.result });
    tx.onerror = () => resolve({ apiKey: undefined, baseUrl: undefined });
  });
  db.close();
  return result;
}

async function readPending() {
  const db = await openDb();
  const items = await new Promise((resolve) => {
    const tx = db.transaction(STORE_PENDING, 'readonly');
    const req = tx.objectStore(STORE_PENDING).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  db.close();
  return items;
}

async function deletePending(id) {
  const db = await openDb();
  await new Promise((resolve) => {
    const tx = db.transaction(STORE_PENDING, 'readwrite');
    tx.objectStore(STORE_PENDING).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

async function bumpAttempt(id, error) {
  const db = await openDb();
  await new Promise((resolve) => {
    const tx = db.transaction(STORE_PENDING, 'readwrite');
    const store = tx.objectStore(STORE_PENDING);
    const req = store.get(id);
    req.onsuccess = () => {
      const existing = req.result;
      if (existing) {
        existing.attempts = (existing.attempts || 0) + 1;
        existing.lastError = error;
        store.put(existing, id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
