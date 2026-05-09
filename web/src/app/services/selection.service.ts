import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  // ── Signal-based state (preferred for templates) ──
  private readonly _selectedIds = signal<ReadonlySet<number>>(new Set());
  readonly selectedIdsSignal = this._selectedIds.asReadonly();
  readonly isSelectingSignal = computed(() => this._selectedIds().size > 0 || this._modeForced());
  private readonly _modeForced = signal<boolean>(false);
  readonly selectionCountSignal = computed(() => this._selectedIds().size);

  // ── Legacy Observable mirrors (for code paths not yet migrated) ──
  private readonly selectionModeSubject = new BehaviorSubject<boolean>(false);
  private readonly selectionCountSubject = new BehaviorSubject<number>(0);

  readonly selectionMode$ = this.selectionModeSubject.asObservable();
  readonly selectionCount$ = this.selectionCountSubject.asObservable();

  // Emits when a bulk action changes photo visibility (hide/unhide/delete)
  private readonly refreshSubject = new Subject<void>();
  readonly refresh$ = this.refreshSubject.asObservable();

  notifyRefresh(): void {
    this.refreshSubject.next();
  }

  // Tracks the currently-open album in the Albums detail view. The selection
  // bar reads this to decide whether to show the "Remove from Album" button.
  // null when not inside any album detail view.
  private readonly currentAlbumIdSubject = new BehaviorSubject<number | null>(null);
  readonly currentAlbumId$ = this.currentAlbumIdSubject.asObservable();

  setCurrentAlbumId(albumId: number | null): void {
    this.currentAlbumIdSubject.next(albumId);
  }

  get currentAlbumId(): number | null {
    return this.currentAlbumIdSubject.value;
  }

  // Tracks the currently-open person on /people. Selection bar reads this to
  // show the "Reassign to..." action and lightbox shows the per-photo
  // reassign button. null when not inside a person detail view.
  private readonly currentPersonIdSubject = new BehaviorSubject<number | null>(null);
  readonly currentPersonId$ = this.currentPersonIdSubject.asObservable();

  setCurrentPersonId(personId: number | null): void {
    this.currentPersonIdSubject.next(personId);
  }

  get currentPersonId(): number | null {
    return this.currentPersonIdSubject.value;
  }

  get isSelecting(): boolean {
    return this.isSelectingSignal();
  }

  get count(): number {
    return this._selectedIds().size;
  }

  get ids(): number[] {
    return [...this._selectedIds()];
  }

  enterSelectionMode(): void {
    this._modeForced.set(true);
    this.selectionModeSubject.next(true);
  }

  exitSelectionMode(): void {
    this._selectedIds.set(new Set());
    this._modeForced.set(false);
    this.selectionModeSubject.next(false);
    this.selectionCountSubject.next(0);
  }

  toggle(id: number): void {
    const next = new Set(this._selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._selectedIds.set(next);
    this.selectionCountSubject.next(next.size);
    if (next.size > 0) {
      if (!this.selectionModeSubject.value) this.selectionModeSubject.next(true);
    } else {
      this._modeForced.set(false);
      this.selectionModeSubject.next(false);
    }
  }

  isSelected(id: number): boolean {
    return this._selectedIds().has(id);
  }

  selectAll(ids: number[]): void {
    const next = new Set(this._selectedIds());
    for (const id of ids) next.add(id);
    this._selectedIds.set(next);
    this.selectionCountSubject.next(next.size);
    if (!this.selectionModeSubject.value) this.selectionModeSubject.next(true);
  }

  clear(): void {
    this._selectedIds.set(new Set());
    this.selectionCountSubject.next(0);
  }
}
