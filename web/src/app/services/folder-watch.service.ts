import { Injectable, signal } from '@angular/core';

const DB_NAME = 'pm-folder-watch';
const DB_VERSION = 1;
const STORE_HANDLE = 'handles';
const STORE_HASHES = 'hashes';
const HANDLE_KEY = 'watchedFolder';

const SUPPORTED_EXT = new Set([
  'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'tiff', 'tif', 'avif', 'bmp',
  'mp4', 'mov', 'avi', 'mkv', 'mts', 'm2ts', 'webm', 'wmv',
]);

/**
 * File System Access API integration for auto-detecting new photos in a
 * folder the user picks once. The directory handle persists across sessions
 * via IndexedDB. Hashes of already-seen files are also persisted so re-visits
 * to the page don't re-process the entire folder.
 *
 * Only supported on browsers that implement showDirectoryPicker (Chromium-
 * based browsers, including Chrome/Edge on Android desktop). iOS Safari and
 * Firefox fall back to the manual file picker.
 */
@Injectable({ providedIn: 'root' })
export class FolderWatchService {
  readonly hasWatchedFolder = signal<boolean>(false);

  constructor() {
    void this.checkExistingHandle();
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async pickFolder(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const handle = await (window as unknown as { showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'read' });
      await this.persistHandle(handle);
      this.hasWatchedFolder.set(true);
      return true;
    } catch {
      // User cancelled or permission denied
      return false;
    }
  }

  async clearWatchedFolder(): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_HANDLE, 'readwrite');
      tx.objectStore(STORE_HANDLE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
    this.hasWatchedFolder.set(false);
  }

  /**
   * Returns files in the watched folder whose hashes we have NOT yet seen.
   * If the user revoked permissions or no folder is set, returns null.
   */
  async getNewFiles(): Promise<File[] | null> {
    const handle = await this.loadHandle();
    if (!handle) return null;

    // Check + request permission. The browser may have revoked it.
    const permission = await this.requestReadPermission(handle);
    if (permission !== 'granted') return null;

    const seen = await this.loadSeenHashes();
    const candidates: File[] = [];
    await this.walk(handle, async (entry) => {
      const name = entry.name.toLowerCase();
      const dot = name.lastIndexOf('.');
      const ext = dot >= 0 ? name.slice(dot + 1) : '';
      if (!SUPPORTED_EXT.has(ext)) return;
      const file = await entry.getFile();
      // Quick fingerprint without hashing every byte: name + size + mtime.
      // Files matching are skipped optimistically; the upload pipeline
      // computes the real SHA-256 and contacts the server, so worst case
      // is one extra round-trip if this fingerprint collides.
      const fingerprint = `${file.name}|${String(file.size)}|${String(file.lastModified)}`;
      if (!seen.has(fingerprint)) {
        candidates.push(file);
      }
    });
    return candidates;
  }

  async markFingerprintSeen(file: File): Promise<void> {
    const fingerprint = `${file.name}|${String(file.size)}|${String(file.lastModified)}`;
    const db = await this.openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_HASHES, 'readwrite');
      tx.objectStore(STORE_HASHES).put(true, fingerprint);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  }

  private async checkExistingHandle(): Promise<void> {
    const handle = await this.loadHandle();
    this.hasWatchedFolder.set(handle !== null);
  }

  private async walk(
    handle: FileSystemDirectoryHandle,
    visit: (entry: FileSystemFileHandle) => Promise<void>,
  ): Promise<void> {
    // values() is iterable; cast to AsyncIterable for type safety.
    const iter = (handle as unknown as { values: () => AsyncIterableIterator<FileSystemHandle> }).values();
    for await (const child of iter) {
      if (child.kind === 'file') {
        await visit(child as FileSystemFileHandle);
      } else if (child.kind === 'directory') {
        await this.walk(child as FileSystemDirectoryHandle, visit);
      }
    }
  }

  private async requestReadPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    type PermHandle = FileSystemDirectoryHandle & {
      queryPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
      requestPermission?: (opts: { mode: 'read' }) => Promise<PermissionState>;
    };
    const h = handle as PermHandle;
    const queried = h.queryPermission ? await h.queryPermission({ mode: 'read' }) : 'granted';
    if (queried === 'granted') return 'granted';
    return h.requestPermission ? await h.requestPermission({ mode: 'read' }) : 'denied';
  }

  private async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_HANDLE)) db.createObjectStore(STORE_HANDLE);
        if (!db.objectStoreNames.contains(STORE_HASHES)) db.createObjectStore(STORE_HASHES);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
  }

  private async persistHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLE, 'readwrite');
      tx.objectStore(STORE_HANDLE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('handle persist failed'));
    });
    db.close();
  }

  private async loadHandle(): Promise<FileSystemDirectoryHandle | null> {
    const db = await this.openDb();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
      const tx = db.transaction(STORE_HANDLE, 'readonly');
      const req = tx.objectStore(STORE_HANDLE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return handle;
  }

  private async loadSeenHashes(): Promise<Set<string>> {
    const db = await this.openDb();
    const seen = await new Promise<Set<string>>((resolve) => {
      const tx = db.transaction(STORE_HASHES, 'readonly');
      const req = tx.objectStore(STORE_HASHES).getAllKeys();
      req.onsuccess = () => {
        const keys = (req.result ?? []).filter((k): k is string => typeof k === 'string');
        resolve(new Set(keys));
      };
      req.onerror = () => resolve(new Set());
    });
    db.close();
    return seen;
  }
}
