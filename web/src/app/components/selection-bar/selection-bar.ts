import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { SelectionService } from '../../services/selection.service';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import type { Album, PersonSummary } from '../../models/photo.model';

@Component({
  selector: 'app-selection-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (selectionMode) {
      <div class="selection-bar">
        <div class="selection-info">
          <span class="count">{{ count }} selected</span>
          <button class="bar-btn" (click)="clearSelection()">Clear</button>
        </div>
        <div class="selection-actions">
          <button class="bar-btn" (click)="bulkFavorite(true)">&#9733; Favorite</button>
          <button class="bar-btn" (click)="bulkFavorite(false)">&#9734; Unfavorite</button>
          <button class="bar-btn" (click)="exportSelected()">&#8615; Export Zip</button>
          @if (isHiddenView) {
            <button class="bar-btn" (click)="bulkHide(false)">&#128065; Unhide</button>
          } @else {
            <button class="bar-btn" (click)="bulkHide(true)">&#128065; Hide</button>
          }
          <div class="date-picker-wrap">
            <button class="bar-btn" (click)="showDatePicker = !showDatePicker">&#128197; Set Date</button>
            @if (showDatePicker) {
              <div class="dropdown-menu">
                <input
                  type="month"
                  class="date-pick-input"
                  (change)="bulkSetDate($event)"
                />
              </div>
            }
          </div>
          <div class="album-dropdown">
            <button class="bar-btn" (click)="toggleAlbumDropdown()">+ Add to Album</button>
            @if (showAlbumDropdown) {
              <div class="dropdown-menu">
                @for (album of albums; track album.id) {
                  <button class="dropdown-item" (click)="addToAlbum(album.id)">
                    {{ album.name }}
                  </button>
                }
                @if (albums.length === 0) {
                  <div class="dropdown-empty">No albums</div>
                }
              </div>
            }
          </div>
          @if (activeAlbumId) {
            <button class="bar-btn btn-danger" (click)="removeFromAlbum()">Remove from Album</button>
          }
          @if (activePersonId) {
            <div class="reassign-dropdown">
              <button class="bar-btn" (click)="toggleReassignDropdown()">&#8644; Reassign to&hellip;</button>
              @if (showReassignDropdown) {
                <div class="dropdown-menu">
                  <div class="dropdown-section">Existing people</div>
                  @for (person of getReassignTargets(); track person.id) {
                    <button class="dropdown-item" (click)="reassignToExisting(person.id, person.name)">
                      {{ person.name ?? 'Unknown' }} ({{ person.photo_count }})
                    </button>
                  }
                  @if (getReassignTargets().length === 0) {
                    <div class="dropdown-empty">No other people</div>
                  }
                  <div class="dropdown-section">New person</div>
                  <div class="new-person-row">
                    <input
                      type="text"
                      class="new-person-input"
                      placeholder="Name (optional)"
                      [(ngModel)]="newPersonName"
                      (keydown.enter)="splitToNewPerson()"
                    />
                    <button class="dropdown-item-action" (click)="splitToNewPerson()">Create &amp; move</button>
                  </div>
                </div>
              }
            </div>
          }
          <button class="bar-btn btn-danger" (click)="bulkDelete()">&#128465; Delete</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .selection-bar {
      position: fixed;
      top: 0;
      left: 220px;
      right: 0;
      height: 48px;
      background: #2a3a5a;
      border-bottom: 1px solid #3a5a8a;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 12px;
      z-index: 100;
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .count {
      color: #fff;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .selection-actions {
      display: flex;
      gap: 6px;
      flex: 1;
    }

    .bar-btn {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #ddd;
      padding: 5px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      white-space: nowrap;

      &:hover { background: rgba(255,255,255,0.2); }
    }

    .btn-danger {
      color: #e88;
      border-color: #844;
      &:hover { background: rgba(255,100,100,0.15); }
    }

    .date-picker-wrap, .album-dropdown, .reassign-dropdown {
      position: relative;
    }

    .date-pick-input {
      padding: 8px;
      background: #1a1a1a;
      border: 1px solid #444;
      color: #ddd;
      border-radius: 4px;
      &::-webkit-calendar-picker-indicator { filter: invert(0.7); }
    }

    .dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 4px;
      background: #222;
      border: 1px solid #444;
      border-radius: 6px;
      min-width: 180px;
      max-height: 250px;
      overflow-y: auto;
      z-index: 200;
    }

    .dropdown-item {
      display: block;
      width: 100%;
      padding: 8px 12px;
      background: none;
      border: none;
      color: #ccc;
      text-align: left;
      cursor: pointer;
      font-size: 0.85rem;

      &:hover { background: #2a2a2a; }
    }

    .dropdown-empty {
      padding: 12px;
      color: #666;
      text-align: center;
      font-size: 0.8rem;
    }

    .dropdown-section {
      padding: 6px 12px 4px;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #777;
      background: #1a1a1a;
      border-top: 1px solid #2a2a2a;

      &:first-child { border-top: none; }
    }

    .new-person-row {
      display: flex;
      gap: 4px;
      padding: 6px 8px 8px;
      align-items: center;
    }

    .new-person-input {
      flex: 1;
      min-width: 0;
      padding: 6px 8px;
      background: #1a1a1a;
      border: 1px solid #444;
      color: #ddd;
      border-radius: 4px;
      font-size: 0.8rem;

      &:focus { outline: none; border-color: #666; }
    }

    .dropdown-item-action {
      padding: 6px 10px;
      background: #2a3a5a;
      border: 1px solid #3a5a8a;
      color: #cde;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      white-space: nowrap;

      &:hover { background: #3a5a8a; }
    }
  `],
})
export class SelectionBarComponent implements OnInit, OnDestroy {
  selectionMode = false;
  count = 0;
  showAlbumDropdown = false;
  showDatePicker = false;
  showReassignDropdown = false;
  albums: Album[] = [];
  activeAlbumId: number | null = null;
  activePersonId: number | null = null;
  peopleList: PersonSummary[] = [];
  newPersonName = '';
  isHiddenView = false;

  private subs: Subscription[] = [];

  constructor(
    public readonly selection: SelectionService,
    private readonly router: Router,
    private readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.selection.selectionMode$.subscribe((v) => {
        this.selectionMode = v;
        this.isHiddenView = this.router.url === '/hidden';
        if (v && this.albums.length === 0) {
          this.api.getAlbums().subscribe({ next: (a) => { this.albums = a; this.cdr.detectChanges(); } });
        }
        this.cdr.detectChanges();
      }),
      this.selection.selectionCount$.subscribe((c) => {
        this.count = c;
        this.cdr.detectChanges();
      }),
      // Track the active album so the "Remove from Album" button shows up
      // only inside an album detail view.
      this.selection.currentAlbumId$.subscribe((id) => {
        this.activeAlbumId = id;
        this.cdr.detectChanges();
      }),
      // Track the active person so the "Reassign to..." dropdown only
      // shows up inside a person detail view on /people. Also pre-load the
      // people list since we'll need it for the dropdown targets.
      this.selection.currentPersonId$.subscribe((id) => {
        this.activePersonId = id;
        if (id !== null && this.peopleList.length === 0) {
          this.api.getPeople(true).subscribe({
            next: (people) => { this.peopleList = people; this.cdr.detectChanges(); },
          });
        }
        this.cdr.detectChanges();
      }),
      // Clear selection + close any open dropdowns whenever the user
      // navigates between pages. A selection from /timeline shouldn't
      // carry into /albums or /people.
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd))
        .subscribe(() => {
          if (this.selection.isSelecting) {
            this.selection.exitSelectionMode();
          }
          this.showAlbumDropdown = false;
          this.showDatePicker = false;
          this.showReassignDropdown = false;
          // Force a fresh albums fetch on next selection — counts may have changed
          this.albums = [];
          this.peopleList = [];
        }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  clearSelection(): void {
    this.selection.exitSelectionMode();
    this.showAlbumDropdown = false;
  }

  bulkHide(hidden: boolean): void {
    const ids = this.selection.ids;
    this.api.bulkHide(ids, hidden).subscribe({
      next: () => {
        this.selection.exitSelectionMode();
        this.selection.notifyRefresh();
        this.toast.success(`${hidden ? 'Hidden' : 'Unhidden'} ${ids.length} photos`);
      },
      error: () => this.toast.error(`${hidden ? 'Hide' : 'Unhide'} failed`),
    });
  }

  bulkSetDate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const month = input.value; // "2024-01"
    if (!month) return;
    const date = `${month}-15T12:00:00.000Z`; // Mid-month as a reasonable default
    const ids = this.selection.ids;
    this.api.bulkSetDate(ids, date).subscribe({
      next: () => {
        this.showDatePicker = false;
        this.toast.success(`Set date to ${month} for ${ids.length} photos`);
      },
      error: () => this.toast.error('Set date failed'),
    });
  }

  exportSelected(): void {
    const ids = this.selection.ids;
    this.api.exportPhotos(ids);
    this.toast.info(`Preparing zip of ${ids.length} photos...`);
  }

  bulkFavorite(value: boolean): void {
    const ids = this.selection.ids;
    this.api.bulkFavorite(ids, value).subscribe({
      next: () => this.toast.success(`${value ? 'Favorited' : 'Unfavorited'} ${ids.length} photos`),
      error: () => this.toast.error(`${value ? 'Favorite' : 'Unfavorite'} failed`),
    });
  }

  toggleAlbumDropdown(): void {
    this.showAlbumDropdown = !this.showAlbumDropdown;
  }

  addToAlbum(albumId: number): void {
    const ids = this.selection.ids;
    this.api.addPhotosToAlbum(albumId, ids).subscribe({
      next: () => {
        this.showAlbumDropdown = false;
        const album = this.albums.find((a) => a.id === albumId);
        this.toast.success(`Added ${ids.length} photos to "${album?.name ?? 'album'}"`);
      },
      error: () => this.toast.error('Add to album failed'),
    });
  }

  toggleReassignDropdown(): void {
    this.showReassignDropdown = !this.showReassignDropdown;
    this.newPersonName = '';
  }

  /** Existing people the current person could be reassigned to (excludes self). */
  getReassignTargets(): PersonSummary[] {
    if (!this.activePersonId) return [];
    return this.peopleList.filter((p) => p.id !== this.activePersonId);
  }

  reassignToExisting(toPersonId: number, toName: string | null): void {
    if (!this.activePersonId) return;
    const ids = this.selection.ids;
    if (ids.length === 0) return;
    this.api.reassignFaces(this.activePersonId, toPersonId, ids).subscribe({
      next: (res) => {
        this.showReassignDropdown = false;
        this.selection.exitSelectionMode();
        this.selection.notifyRefresh();
        const target = toName ?? 'Unknown';
        this.toast.success(`Reassigned ${res.reassigned} face(s) to "${target}"`);
      },
      error: () => this.toast.error('Reassign failed'),
    });
  }

  splitToNewPerson(): void {
    if (!this.activePersonId) return;
    const ids = this.selection.ids;
    if (ids.length === 0) return;
    const name = this.newPersonName.trim() || null;
    this.api.splitFacesToNewPerson(this.activePersonId, ids, name).subscribe({
      next: (res) => {
        this.showReassignDropdown = false;
        this.newPersonName = '';
        this.selection.exitSelectionMode();
        this.selection.notifyRefresh();
        this.toast.success(`Split ${res.reassigned} face(s) to ${name ? `"${name}"` : 'a new person'}`);
      },
      error: () => this.toast.error('Split failed'),
    });
  }

  removeFromAlbum(): void {
    if (!this.activeAlbumId) return;
    const ids = this.selection.ids;
    if (ids.length === 0) return;
    this.api.removePhotosFromAlbum(this.activeAlbumId, ids).subscribe({
      next: () => {
        this.selection.exitSelectionMode();
        this.selection.notifyRefresh();
        const noun = ids.length === 1 ? 'photo' : 'photos';
        this.toast.success(`Removed ${ids.length} ${noun} from album`);
      },
      error: () => this.toast.error('Remove from album failed'),
    });
  }

  bulkDelete(): void {
    const ids = this.selection.ids;
    if (ids.length === 0) return;
    this.api.bulkTrash(ids).subscribe({
      next: (res) => {
        this.selection.exitSelectionMode();
        this.selection.notifyRefresh();
        const noun = res.moved === 1 ? 'item' : 'items';
        this.toast.withAction(
          `Moved ${res.moved} ${noun} to trash`,
          'Undo',
          () => {
            this.api.bulkRestore(ids).subscribe({
              next: () => this.selection.notifyRefresh(),
              error: () => this.toast.error('Restore failed'),
            });
          },
        );
      },
      error: () => this.toast.error('Delete failed'),
    });
  }
}
