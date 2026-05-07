import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly settingsSubject = new BehaviorSubject<Record<string, string>>({});
  readonly settings$ = this.settingsSubject.asObservable();

  constructor(private readonly api: ApiService) {
    this.load();
  }

  private load(): void {
    this.api.getSettings().subscribe({
      next: (s) => this.settingsSubject.next(s),
    });
  }

  get(key: string): string | undefined {
    return this.settingsSubject.value[key];
  }

  set(key: string, value: string): void {
    const current = { ...this.settingsSubject.value, [key]: value };
    this.settingsSubject.next(current);
    this.api.updateSettings({ [key]: value }).subscribe();
  }
}
