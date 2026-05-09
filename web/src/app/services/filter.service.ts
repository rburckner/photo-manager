import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface FilterState {
  fromDate: string;
  toDate: string;
  activeYear: number | null;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

const STORAGE_KEY = 'pm_filters';

function loadFromStorage(): FilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FilterState;
  } catch { /* ignore */ }
  return { fromDate: '', toDate: '', activeYear: null, sortBy: 'date', sortOrder: 'desc' };
}

@Injectable({ providedIn: 'root' })
export class FilterService {
  private readonly state = new BehaviorSubject<FilterState>(loadFromStorage());
  readonly filters$ = this.state.asObservable();

  get current(): FilterState {
    return this.state.value;
  }

  setDateRange(fromDate: string, toDate: string): void {
    this.update({ ...this.state.value, fromDate, toDate, activeYear: null });
  }

  setYear(year: number | null): void {
    if (year === null) {
      // Clear the date range too — otherwise the previously-selected year's
      // bounds (e.g. 2024-01..2024-12) leak into "All" on next load and the
      // inputs render the old year filter even though the All pill is active.
      this.update({ ...this.state.value, fromDate: '', toDate: '', activeYear: null });
    } else {
      this.update({ ...this.state.value, fromDate: `${year}-01`, toDate: `${year}-12`, activeYear: year });
    }
  }

  setSort(sortBy: string, sortOrder: 'asc' | 'desc'): void {
    this.update({ ...this.state.value, sortBy, sortOrder });
  }

  private update(state: FilterState): void {
    this.state.next(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }
}
