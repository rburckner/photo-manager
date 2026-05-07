import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { LightboxComponent } from '../lightbox/lightbox';
import type { Photo } from '../../models/photo.model';

@Component({
  selector: 'app-hidden',
  standalone: true,
  imports: [CommonModule, LightboxComponent],
  template: `
    <div class="hidden-container">
      <div class="hidden-header">
        <h2>Hidden Photos</h2>
        <span class="count">{{ totalPhotos }} hidden</span>
        @if (selection.count > 0) {
          <button class="btn-unhide" (click)="unhideSelected()">Unhide {{ selection.count }} selected</button>
        }
      </div>

      <div class="photo-grid" (scroll)="onScroll($event)">
        @for (photo of photos; track photo.id) {
          <div
            class="photo-card"
            [class.selectable]="selection.isSelecting"
            [class.selected]="selection.isSelected(photo.id)"
            (click)="onPhotoClick(photo, $event)"
          >
            @if (selection.isSelecting) {
              <div class="select-check">&#10003;</div>
            }
            <img [src]="api.getThumbnailUrl(photo.id)" loading="lazy" (error)="onImageError($event)" />
          </div>
        }
        @if (loading) { <div class="grid-loading">Loading...</div> }
        @if (!loading && photos.length === 0) { <div class="empty">No hidden photos</div> }
      </div>
    </div>

    @if (selectedPhoto) {
      <app-lightbox [photo]="selectedPhoto" (close)="closeLightbox()" (prev)="navigatePhoto(-1)" (next)="navigatePhoto(1)" />
    }
  `,
  styles: [`
    .hidden-container { height: 100vh; display: flex; flex-direction: column; padding: 20px; }
    .hidden-header {
      display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px;
      h2 { margin: 0; font-size: 1.2rem; color: #ddd; }
      .count { font-size: 0.8rem; color: #888; }
    }
    .btn-unhide {
      background: #1a3a1a; border: 1px solid #2a5a2a; color: #8c8;
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; margin-left: auto;
      &:hover { background: #2a4a2a; }
    }
    .photo-grid {
      flex: 1; overflow-y: auto;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 4px; align-content: start;
    }
    .photo-card {
      position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 4px; cursor: pointer; background: #222;
      img { width: 100%; height: 100%; object-fit: cover; }
    }
    .grid-loading, .empty { grid-column: 1/-1; text-align: center; padding: 40px; color: #666; }
  `],
})
export class HiddenComponent implements OnInit, OnDestroy {
  photos: Photo[] = [];
  loading = false;
  totalPhotos = 0;
  page = 1;
  hasMore = true;
  selectedPhoto: Photo | null = null;

  constructor(
    public readonly api: ApiService,
    public readonly selection: SelectionService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.selection.enterSelectionMode();
    this.load();
  }

  ngOnDestroy(): void {
    this.selection.exitSelectionMode();
  }

  load(): void {
    if (this.loading || !this.hasMore) return;
    this.loading = true;
    this.api.getHiddenPhotos(this.page).subscribe({
      next: (r) => {
        this.photos.push(...r.photos);
        this.totalPhotos = r.pagination.total;
        this.hasMore = this.page < r.pagination.totalPages;
        this.page++;
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  onScroll(e: Event): void {
    const el = e.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) this.load();
  }

  onPhotoClick(photo: Photo, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey || this.selection.isSelecting) {
      this.selection.toggle(photo.id);
      return;
    }
    this.selectedPhoto = photo;
  }

  unhideSelected(): void {
    const ids = this.selection.ids;
    this.api.bulkHide(ids, false).subscribe({
      next: () => {
        this.selection.clear();
        this.selection.enterSelectionMode();
        // Reload the full list
        this.photos = [];
        this.page = 1;
        this.hasMore = true;
        this.totalPhotos = 0;
        this.load();
      },
    });
  }

  closeLightbox(): void { this.selectedPhoto = null; }
  navigatePhoto(d: number): void {
    if (!this.selectedPhoto) return;
    const i = this.photos.findIndex((p) => p.id === this.selectedPhoto!.id) + d;
    if (i >= 0 && i < this.photos.length) this.selectedPhoto = this.photos[i]!;
  }
  onImageError(e: Event): void { (e.target as HTMLImageElement).style.display = 'none'; }
}
