import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { LightboxComponent } from '../lightbox/lightbox';
import { ThumbSizeSliderComponent } from '../thumb-size-slider/thumb-size-slider';
import type { Photo } from '../../models/photo.model';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule, LightboxComponent, ThumbSizeSliderComponent],
  template: `
    <div class="search-container">
      <div class="search-bar">
        <input
          type="text"
          [(ngModel)]="query"
          placeholder="Search by folder, camera, filename..."
          class="search-input"
          (keydown.enter)="doSearch()"
          autofocus
        />
        <button class="search-btn" (click)="doSearch()" [disabled]="!query.trim()">Search</button>
      </div>

      @if (hasSearched) {
        <div class="results-header">
          <span class="result-count">{{ totalResults }} results</span>
          @if (query) {
            <span class="result-query">for "{{ lastQuery }}"</span>
          }
          <app-thumb-size-slider />
        </div>
      }

      <div class="photo-grid" (scroll)="onScroll($event)">
        @for (photo of photos; track photo.id) {
          <div
            class="photo-card"
            [class.selectable]="selection.isSelectingSignal()"
            [class.selected]="selection.selectedIdsSignal().has(photo.id)"
            (click)="onPhotoClick(photo, $event)"
            (mouseenter)="photo.is_video === 1 ? onVideoHover($event, photo, true) : null"
            (mouseleave)="photo.is_video === 1 ? onVideoHover($event, photo, false) : null"
          >
            @if (selection.isSelectingSignal()) {
              <div class="select-check">&#10003;</div>
            }
            <img
              [src]="api.getThumbnailUrl(photo.id)"
              [alt]="photo.file_name"
              loading="lazy"
              (error)="onImageError($event)"
            />
            @if (photo.is_video === 1) {
              <div class="video-badge">&#9654;</div>
            }
          </div>
        }

        @if (loading) {
          <div class="grid-loading">Searching...</div>
        }

        @if (hasSearched && !loading && photos.length === 0) {
          <div class="no-results">No photos found</div>
        }
      </div>
    </div>

    @if (selectedPhoto) {
      <app-lightbox
        [photo]="selectedPhoto"
        (close)="closeLightbox()"
        (prev)="navigatePhoto(-1)"
        (next)="navigatePhoto(1)"
      />
    }
  `,
  styles: [`
    .search-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 20px;
    }

    .search-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-shrink: 0;
    }

    .search-input {
      flex: 1;
      background: #222;
      border: 1px solid #444;
      color: #e0e0e0;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 0.95rem;

      &:focus { outline: none; border-color: #666; }
      &::placeholder { color: #666; }
    }

    .search-btn {
      background: #333;
      border: 1px solid #555;
      color: #ddd;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9rem;

      &:hover { background: #444; }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    .results-header {
      margin-bottom: 12px;
      font-size: 0.85rem;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 4px;

      .result-count { color: #aaa; }
      .result-query { color: #666; margin-left: 4px; }
      app-thumb-size-slider { margin-left: auto; }
    }

    .photo-grid {
      flex: 1;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--thumb-size, 160px), 1fr));
      gap: 4px;
      align-content: start;
    }

    .photo-card {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 4px;
      cursor: pointer;
      background: #222;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.2s;
      }

      &:hover img { transform: scale(1.05); }
    }

    .video-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .grid-loading, .no-results {
      grid-column: 1 / -1;
      text-align: center;
      padding: 40px;
      color: #666;
    }
  `],
})
export class SearchComponent {
  query = '';
  lastQuery = '';
  photos: Photo[] = [];
  loading = false;
  hasSearched = false;
  totalResults = 0;
  currentPage = 1;
  hasMore = true;
  selectedPhoto: Photo | null = null;

  private lastClickedId: number | null = null;

  constructor(
    public readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    public readonly selection: SelectionService,
  ) {}

  doSearch(): void {
    const q = this.query.trim();
    if (!q) return;

    this.lastQuery = q;
    this.photos = [];
    this.currentPage = 1;
    this.hasMore = true;
    this.hasSearched = true;
    this.loadResults();
  }

  loadResults(): void {
    if (this.loading || !this.hasMore) return;

    this.loading = true;
    this.api.searchPhotos(this.lastQuery, this.currentPage).subscribe({
      next: (response) => {
        this.photos.push(...response.photos);
        this.totalResults = response.pagination.total;
        this.hasMore = this.currentPage < response.pagination.totalPages;
        this.currentPage++;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) {
      this.loadResults();
    }
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

  openPhoto(photo: Photo): void {
    this.selectedPhoto = photo;
  }

  closeLightbox(): void {
    this.selectedPhoto = null;
  }

  navigatePhoto(direction: number): void {
    if (!this.selectedPhoto) return;
    const idx = this.photos.findIndex((p) => p.id === this.selectedPhoto!.id);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < this.photos.length) {
      this.selectedPhoto = this.photos[newIdx]!;
    }
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.src.endsWith('/ladybug.svg')) return;
    img.src = '/ladybug.svg';
  }

  onVideoHover(event: Event, photo: { id: number }, enter: boolean): void {
    const card = (event.target as HTMLElement).closest('.photo-card') as HTMLElement;
    if (!card) return;

    if (enter) {
      const video = document.createElement('video');
      video.src = `/api/photos/${photo.id}/video-preview`;
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.className = 'video-preview';
      video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2';
      card.appendChild(video);
    } else {
      const video = card.querySelector('.video-preview');
      if (video) {
        (video as HTMLVideoElement).pause();
        video.remove();
      }
    }
  }
}
