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
        <span class="hint">Select photos and use the Unhide button in the toolbar above</span>
      </div>

      <div class="photo-grid" (scroll)="onScroll($event)">
        @for (photo of photos; track photo.id) {
          <div
            class="photo-card"
            [class.selectable]="selection.isSelecting"
            [class.selected]="selection.isSelected(photo.id)"
            (click)="onPhotoClick(photo, $event)"
            (mouseenter)="photo.is_video === 1 ? onVideoHover($event, photo, true) : null"
            (mouseleave)="photo.is_video === 1 ? onVideoHover($event, photo, false) : null"
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

    this.selection.refresh$.subscribe(() => {
      this.photos = [];
      this.page = 1;
      this.hasMore = true;
      this.totalPhotos = 0;
      this.load();
      this.selection.enterSelectionMode();
    });
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
    // Handled by selection bar's bulkHide → notifyRefresh → refresh$ subscription
  }

  closeLightbox(): void { this.selectedPhoto = null; }
  navigatePhoto(d: number): void {
    if (!this.selectedPhoto) return;
    const i = this.photos.findIndex((p) => p.id === this.selectedPhoto!.id) + d;
    if (i >= 0 && i < this.photos.length) this.selectedPhoto = this.photos[i]!;
  }
  onImageError(e: Event): void { (e.target as HTMLImageElement).style.display = 'none'; }

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
