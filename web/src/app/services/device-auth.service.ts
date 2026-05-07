import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'pm.deviceApiKey';
const NAME_KEY = 'pm.deviceName';

/**
 * Holds the API key issued during device pairing. Persists in localStorage so
 * the PWA on a phone retains its credentials across launches.
 */
@Injectable({ providedIn: 'root' })
export class DeviceAuthService {
  private readonly _apiKey = signal<string | null>(this.load(STORAGE_KEY));
  private readonly _deviceName = signal<string | null>(this.load(NAME_KEY));

  readonly apiKey = this._apiKey.asReadonly();
  readonly deviceName = this._deviceName.asReadonly();
  readonly isPaired = (): boolean => this._apiKey() !== null;

  setCredentials(apiKey: string, deviceName: string): void {
    this._apiKey.set(apiKey);
    this._deviceName.set(deviceName);
    try {
      localStorage.setItem(STORAGE_KEY, apiKey);
      localStorage.setItem(NAME_KEY, deviceName);
    } catch {
      // localStorage may be unavailable (e.g., private mode) — keep in-memory state.
    }
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
  }

  private load(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}
