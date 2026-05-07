import { Injectable, signal } from '@angular/core';

const QUEUE_KEY = 'pm.uploadFailedHashes';

/**
 * Tracks which file hashes have failed to upload. Persists to localStorage so
 * the user can retry after closing the app. The queue stores hashes (not file
 * bytes) — the user re-selects the originals on retry; we use the hashes to
 * remind them which files failed last time.
 *
 * For a true offline-queue with byte storage we'd use IndexedDB and Background
 * Sync API; that's a future enhancement.
 */
@Injectable({ providedIn: 'root' })
export class UploadQueueService {
  private readonly _failed = signal<string[]>(this.load());
  readonly failed = this._failed.asReadonly();

  recordFailure(hash: string): void {
    const next = Array.from(new Set([...this._failed(), hash]));
    this._failed.set(next);
    this.persist(next);
  }

  recordSuccess(hash: string): void {
    const next = this._failed().filter((h) => h !== hash);
    this._failed.set(next);
    this.persist(next);
  }

  clear(): void {
    this._failed.set([]);
    this.persist([]);
  }

  private load(): string[] {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private persist(items: string[]): void {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    } catch {
      // ignore quota/private-mode errors
    }
  }
}
