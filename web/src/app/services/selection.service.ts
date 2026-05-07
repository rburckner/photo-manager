import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly selectedIds = new Set<number>();
  private readonly selectionModeSubject = new BehaviorSubject<boolean>(false);
  private readonly selectionCountSubject = new BehaviorSubject<number>(0);

  readonly selectionMode$ = this.selectionModeSubject.asObservable();
  readonly selectionCount$ = this.selectionCountSubject.asObservable();

  get isSelecting(): boolean {
    return this.selectionModeSubject.value;
  }

  get count(): number {
    return this.selectedIds.size;
  }

  get ids(): number[] {
    return [...this.selectedIds];
  }

  enterSelectionMode(): void {
    this.selectionModeSubject.next(true);
  }

  exitSelectionMode(): void {
    this.selectedIds.clear();
    this.selectionModeSubject.next(false);
    this.selectionCountSubject.next(0);
  }

  toggle(id: number): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.selectionCountSubject.next(this.selectedIds.size);

    // Auto-enter selection mode on first select
    if (!this.selectionModeSubject.value && this.selectedIds.size > 0) {
      this.selectionModeSubject.next(true);
    }
    // Auto-exit if nothing selected
    if (this.selectedIds.size === 0) {
      this.selectionModeSubject.next(false);
    }
  }

  isSelected(id: number): boolean {
    return this.selectedIds.has(id);
  }

  selectAll(ids: number[]): void {
    for (const id of ids) {
      this.selectedIds.add(id);
    }
    this.selectionCountSubject.next(this.selectedIds.size);
    if (!this.selectionModeSubject.value) {
      this.selectionModeSubject.next(true);
    }
  }

  clear(): void {
    this.selectedIds.clear();
    this.selectionCountSubject.next(0);
  }
}
