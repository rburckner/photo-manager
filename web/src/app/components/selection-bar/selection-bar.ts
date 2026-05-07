import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SelectionService } from '../../services/selection.service';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import type { Album } from '../../models/photo.model';

@Component({
  selector: 'app-selection-bar',
  standalone: true,
  imports: [CommonModule],
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
          <button class="bar-btn btn-danger" (click)="bulkDelete()">&#128465; Delete</button>
        </div>
        @if (actionMessage) {
          <span class="action-msg">{{ actionMessage }}</span>
        }
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

    .date-picker-wrap, .album-dropdown {
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

    .action-msg {
      color: #8c8;
      font-size: 0.8rem;
      margin-left: auto;
    }
  `],
})
export class SelectionBarComponent implements OnInit, OnDestroy {
  selectionMode = false;
  count = 0;
  showAlbumDropdown = false;
  showDatePicker = false;
  albums: Album[] = [];
  activeAlbumId: number | null = null;
  actionMessage = '';
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
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  clearSelection(): void {
    this.selection.exitSelectionMode();
    this.showAlbumDropdown = false;
    this.actionMessage = '';
  }

  bulkHide(hidden: boolean): void {
    const ids = this.selection.ids;
    this.api.bulkHide(ids, hidden).subscribe({
      next: () => {
        this.actionMessage = `${hidden ? 'Hidden' : 'Unhidden'} ${ids.length} photos`;
        this.selection.exitSelectionMode();
        this.selection.notifyRefresh();
        this.cdr.detectChanges();
        setTimeout(() => { this.actionMessage = ''; this.cdr.detectChanges(); }, 2000);
      },
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
        this.actionMessage = `Set date to ${month} for ${ids.length} photos`;
        this.cdr.detectChanges();
        setTimeout(() => { this.actionMessage = ''; this.cdr.detectChanges(); }, 2000);
      },
    });
  }

  exportSelected(): void {
    const ids = this.selection.ids;
    this.api.exportPhotos(ids);
    this.actionMessage = `Preparing zip of ${ids.length} photos...`;
    this.cdr.detectChanges();
    setTimeout(() => { this.actionMessage = ''; this.cdr.detectChanges(); }, 3000);
  }

  bulkFavorite(value: boolean): void {
    const ids = this.selection.ids;
    this.api.bulkFavorite(ids, value).subscribe({
      next: () => {
        this.actionMessage = `${value ? 'Favorited' : 'Unfavorited'} ${ids.length} photos`;
        this.cdr.detectChanges();
        setTimeout(() => { this.actionMessage = ''; this.cdr.detectChanges(); }, 2000);
      },
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
        this.actionMessage = `Added ${ids.length} photos to "${album?.name}"`;
        this.cdr.detectChanges();
        setTimeout(() => { this.actionMessage = ''; this.cdr.detectChanges(); }, 2000);
      },
    });
  }

  removeFromAlbum(): void {
    if (!this.activeAlbumId) return;
    const ids = this.selection.ids;
    this.api.removePhotosFromAlbum(this.activeAlbumId, ids).subscribe({
      next: () => {
        this.actionMessage = `Removed ${ids.length} photos from album`;
        this.cdr.detectChanges();
        setTimeout(() => { this.actionMessage = ''; this.cdr.detectChanges(); }, 2000);
      },
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
