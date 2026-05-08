import { Injectable, inject, signal } from '@angular/core';
import { UploadQueueService } from './upload-queue.service';

const STORAGE_KEY = 'pm.deviceApiKey';
const NAME_KEY = 'pm.deviceName';

/**
 * Holds the API key issued during device pairing. Persists in localStorage so
 * the PWA on a phone retains its credentials across launches. Also mirrors
 * the credentials into the upload-queue IndexedDB so the Background Sync
 * service worker can authenticate when draining the queue.
 */
@Injectable({ providedIn: 'root' })
export class DeviceAuthService {
  private readonly _apiKey = signal<string | null>(this.load(STORAGE_KEY));
  private readonly _deviceName = signal<string | null>(this.load(NAME_KEY));
  private readonly queue = inject(UploadQueueService);

  readonly apiKey = this._apiKey.asReadonly();
  readonly deviceName = this._deviceName.asReadonly();
  readonly isPaired = (): boolean => this._apiKey() !== null;

  constructor() {
    // Mirror any already-persisted credentials into the queue's config store.
    void this.queue.setConfig(this._apiKey(), this.baseUrl());
  }

  setCredentials(apiKey: string, deviceName: string): void {
    this._apiKey.set(apiKey);
    this._deviceName.set(deviceName);
    try {
      localStorage.setItem(STORAGE_KEY, apiKey);
      localStorage.setItem(NAME_KEY, deviceName);
    } catch {
      // localStorage may be unavailable (e.g., private mode) — keep in-memory state.
    }
    void this.queue.setConfig(apiKey, this.baseUrl());
  }

  clear(): void {
    this._apiKey.set(null);
    this._deviceName.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(NAME_KEY);
    } catch {
      // ignore
    }
    void this.queue.setConfig(null, this.baseUrl());
  }

  private baseUrl(): string {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  private load(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}
