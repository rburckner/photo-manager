import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { LightboxComponent } from '../lightbox/lightbox';
import type { Photo } from '../../models/photo.model';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [CommonModule, LightboxComponent],
  template: `
    <div class="favorites-container">
      <h2>Favorites</h2>

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
            <img [src]="api.getThumbnailUrl(photo.id)" [alt]="photo.file_name" loading="lazy" (error)="onImageError($event)" />
            @if (photo.is_video === 1) { <div class="video-badge">&#9654;</div> }
          </div>
        }
        @if (loading) { <div class="grid-loading">Loading...</div> }
        @if (!loading && photos.length === 0) { <div class="empty">No favorites yet. Open a photo and press the star.</div> }
      </div>
    </div>

    @if (selectedPhoto) {
      <app-lightbox [photo]="selectedPhoto" (close)="closeLightbox()" (prev)="navigatePhoto(-1)" (next)="navigatePhoto(1)" />
    }
  `,
  styles: [`
    .favorites-container {
      height: 100vh; display: flex; flex-direction: column; padding: 20px;
      h2 { margin: 0 0 16px; color: #ddd; font-size: 1.2rem; }
    }
    .photo-grid {
      flex: 1; overflow-y: auto;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 4px; align-content: start;
    }
    .photo-card {
      position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 4px; cursor: pointer; background: #222;
      img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
      &:hover img { transform: scale(1.05); }
    }
    .video-badge {
      position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.7); color: #fff;
      border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 12px;
    }
    .grid-loading, .empty { grid-column: 1/-1; text-align: center; padding: 40px; color: #666; }
  `],
})
export class FavoritesComponent implements OnInit {
  photos: Photo[] = [];
  loading = false;
  hasMore = true;
  page = 1;
  selectedPhoto: Photo | null = null;

  private lastClickedId: number | null = null;

  constructor(public readonly api: ApiService, private readonly cdr: ChangeDetectorRef, public readonly selection: SelectionService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    if (this.loading || !this.hasMore) return;
    this.loading = true;
    this.api.getFavorites(this.page).subscribe({
      next: (r) => {
        this.photos.push(...r.photos);
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
    if (event.ctrlKey || event.metaKey) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }
    if (event.shiftKey && this.lastClickedId !== null && this.selection.isSelecting) {
      const startIdx = this.photos.findIndex((p) => p.id === this.lastClickedId);
      const endIdx = this.photos.findIndex((p) => p.id === photo.id);
      if (startIdx >= 0 && endIdx >= 0) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const rangeIds = this.photos.slice(from, to + 1).map((p) => p.id);
        this.selection.selectAll(rangeIds);
      }
      return;
    }
    if (this.selection.isSelecting) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }
    this.openPhoto(photo);
  }

  openPhoto(p: Photo): void { this.selectedPhoto = p; }
  closeLightbox(): void { this.selectedPhoto = null; }
  navigatePhoto(d: number): void {
    if (!this.selectedPhoto) return;
    const i = this.photos.findIndex((p) => p.id === this.selectedPhoto!.id) + d;
    if (i >= 0 && i < this.photos.length) this.selectedPhoto = this.photos[i]!;
  }
  onImageError(e: Event): void { (e.target as HTMLImageElement).style.display = 'none'; }
}
