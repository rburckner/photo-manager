import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface FilterState {
  fromDate: string;
  toDate: string;
  activeYear: number | null;
}

const STORAGE_KEY = 'pm_filters';

function loadFromStorage(): FilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FilterState;
  } catch { /* ignore */ }
  return { fromDate: '', toDate: '', activeYear: null };
}

@Injectable({ providedIn: 'root' })
export class FilterService {
  private readonly state = new BehaviorSubject<FilterState>(loadFromStorage());
  readonly filters$ = this.state.asObservable();

  get current(): FilterState {
    return this.state.value;
  }

  setDateRange(fromDate: string, toDate: string): void {
    this.update({ fromDate, toDate, activeYear: null });
  }

  setYear(year: number | null): void {
    if (year === null) {
      this.update({ ...this.state.value, activeYear: null });
    } else {
      this.update({ fromDate: `${year}-01`, toDate: `${year}-12`, activeYear: year });
    }
  }

  private update(state: FilterState): void {
    this.state.next(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }
}
