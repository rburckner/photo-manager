import { Injectable, signal, effect } from '@angular/core';

const STORAGE_KEY = 'pm-thumb-size';
const MIN = 80;
const MAX = 320;
const DEFAULT = 160;

@Injectable({ providedIn: 'root' })
export class ThumbnailSizeService {
  readonly min = MIN;
  readonly max = MAX;
  readonly size = signal<number>(this.load());

  constructor() {
    effect(() => {
      const v = this.size();
      try {
        localStorage.setItem(STORAGE_KEY, String(v));
      } catch {
        // ignore quota / privacy mode
      }
      document.documentElement.style.setProperty('--thumb-size', `${v}px`);
    });
  }

  set(value: number): void {
    if (!Number.isFinite(value)) return;
    const clamped = Math.max(MIN, Math.min(MAX, Math.round(value)));
    this.size.set(clamped);
  }

  private load(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw === null ? NaN : parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= MIN && parsed <= MAX) return parsed;
    } catch {
      // ignore
    }
    return DEFAULT;
  }
}
