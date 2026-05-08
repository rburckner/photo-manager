import { Injectable, signal } from '@angular/core';

const DB_NAME = 'pm-upload-queue';
const DB_VERSION = 2;
const STORE = 'pending';
const STORE_CONFIG = 'config';
const SYNC_TAG = 'pm-upload-flush';
const SW_PATH = '/upload-sync-sw.js';
const SW_SCOPE = '/upload-sync/';

export interface QueuedUpload {
  id: string;             // unique id (SHA-256 hash, or random fallback)
  hash: string;
  fileName: string;
  blob: Blob;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

/**
 * Persistent upload queue backed by IndexedDB.
 *
 * Stores actual file blobs (not just hashes) so failed uploads can be retried
 * after the app is closed and reopened, and so the Background Sync service
 * worker can drain the queue without page involvement.
 *
 * On platforms that support Background Sync (Chromium-based), the page
 * registers a sync event after enqueuing — the browser wakes a service
 * worker when the network is available, even with the tab closed.
 * Other platforms fall back to "retry on next app visit".
 */
@Injectable({ providedIn: 'root' })
export class UploadQueueService {
  readonly pendingCount = signal<number>(0);
  private syncRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    void this.refreshCount();
    void this.registerSyncWorker();
  }

  /**
   * Persist the API key and base URL so the Background Sync SW can drain the
   * queue without page involvement. Called when the device is paired/unpaired.
   */
  async setConfig(apiKey: string | null, baseUrl: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_CONFIG, 'readwrite');
      const store = tx.objectStore(STORE_CONFIG);
      if (apiKey) {
        store.put(apiKey, 'apiKey');
      } else {
        store.delete('apiKey');
      }
      store.put(baseUrl, 'baseUrl');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  }

  async enqueue(file: File, hash: string): Promise<void> {
    const item: QueuedUpload = {
      id: hash,
      hash,
      fileName: file.name,
      blob: file,
      queuedAt: Date.now(),
      attempts: 0,
    };
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item, item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('enqueue failed'));
    });
    db.close();
    await this.refreshCount();
    void this.requestBackgroundSync();
  }

  async dequeue(hash: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(hash);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
    await this.refreshCount();
  }

  async getAll(): Promise<QueuedUpload[]> {
    const db = await this.openDb();
    const items = await new Promise<QueuedUpload[]>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as QueuedUpload[] | undefined) ?? []);
      req.onerror = () => resolve([]);
    });
    db.close();
    return items;
  }

  async incrementAttempt(hash: string, error: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(hash);
      req.onsuccess = () => {
        const existing = req.result as QueuedUpload | undefined;
        if (existing) {
          existing.attempts++;
          existing.lastError = error;
          store.put(existing, hash);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  }

  /**
   * Register a custom service worker (separate scope from Angular SW) that
   * handles Background Sync events. We use a sub-path scope so the SW does
   * not intercept any page navigations or API calls — its only job is to
   * receive sync events and drain the IndexedDB queue.
   */
  private async registerSyncWorker(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      this.syncRegistration = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
    } catch {
      // SW registration may fail in dev mode or restricted contexts — that's fine.
    }
  }

  /**
   * Tell the browser to wake the upload-sync worker once the network is
   * available. No-op on browsers without Background Sync support; the
   * IndexedDB queue is still drained on next app visit.
   */
  private async requestBackgroundSync(): Promise<void> {
    const reg = this.syncRegistration;
    if (!reg) return;
    try {
      const syncReg = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
      if (syncReg) await syncReg.register(SYNC_TAG);
    } catch {
      // Background Sync not available or permission denied.
    }
  }

  private async refreshCount(): Promise<void> {
    const db = await this.openDb();
    const count = await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
    db.close();
    this.pendingCount.set(count);
  }

  private async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(STORE_CONFIG)) db.createObjectStore(STORE_CONFIG);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
  }
}
