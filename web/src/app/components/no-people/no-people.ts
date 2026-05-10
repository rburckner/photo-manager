import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { LightboxComponent } from '../lightbox/lightbox';
import { ThumbSizeSliderComponent } from '../thumb-size-slider/thumb-size-slider';
import type { Photo } from '../../models/photo.model';

@Component({
  selector: 'app-no-people',
  standalone: true,
  imports: [CommonModule, LightboxComponent, ThumbSizeSliderComponent],
  template: `
    <div class="container">
      <div class="header">
        <h2>Photos without people</h2>
        @if (loaded) {
          <span class="count">{{ totalPhotos.toLocaleString() }} photos · face-scanned, no faces detected</span>
        } @else {
          <span class="hint">Click Scan to load</span>
        }
        <div class="header-actions">
          <app-thumb-size-slider />
          <button class="btn-scan" (click)="resetAndScan()" [disabled]="loading">
            {{ loaded ? 'Refresh' : 'Scan' }}
          </button>
        </div>
      </div>

      <div class="scroll-container" (scroll)="onScroll($event)">
        <div class="photo-grid">
          @for (photo of photos; track photo.id; let pi = $index) {
            <div
              class="photo-card"
              [class.selectable]="selection.isSelectingSignal()"
              [class.selected]="selection.selectedIdsSignal().has(photo.id)"
              (click)="onPhotoClick(photo, $event)"
            >
              @if (selection.isSelectingSignal()) {
                <div class="select-check">&#10003;</div>
              }
              <img
                [src]="api.getThumbnailUrl(photo.id)"
                [loading]="pi < 12 ? 'eager' : 'lazy'"
                (error)="onImageError($event)"
              />
            </div>
          }
          @if (loading) { <div class="grid-loading">Loading...</div> }
          @if (loaded && !loading && photos.length === 0) {
            <div class="empty">No photos match — every face-scanned photo has at least one detected face.</div>
          }
          @if (!loaded) { <div class="empty">Click <strong>Scan</strong> to begin.</div> }
        </div>
      </div>
    </div>

    @if (selectedPhoto) {
      <app-lightbox [photo]="selectedPhoto" (close)="closeLightbox()" (prev)="navigatePhoto(-1)" (next)="navigatePhoto(1)" />
    }
  `,
  styles: [`
    .container { height: 100vh; display: flex; flex-direction: column; padding: 20px; }
    .header {
      display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
      h2 { margin: 0; font-size: 1.2rem; color: #ddd; }
      .count, .hint { font-size: 0.8rem; color: #888; }
      .hint { font-style: italic; }
      .header-actions { margin-left: auto; display: flex; gap: 12px; align-items: center; }
    }
    .btn-scan {
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
      background: #1a3a5a; border: 1px solid #2a5a8a; color: #ace;
      &:hover:not(:disabled) { background: #2a4a6a; }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
    .scroll-container { flex: 1; overflow-y: auto; }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--thumb-size, 160px), 1fr));
      gap: 4px;
    }
    .photo-card {
      position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 4px;
      cursor: pointer; background: #222;
      img { width: 100%; height: 100%; object-fit: cover; }
      &.selectable { cursor: pointer; }
      &.selected { outline: 3px solid #4af; outline-offset: -3px; }
    }
    .select-check {
      position: absolute; top: 6px; left: 6px;
      width: 20px; height: 20px; border-radius: 50%;
      background: rgba(0,0,0,0.6); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.8rem; z-index: 2;
    }
    .photo-card.selected .select-check { background: #4af; }
    .grid-loading, .empty {
      grid-column: 1/-1; text-align: center; padding: 40px; color: #666;
    }
  `],
})
export class NoPeopleComponent implements OnInit, OnDestroy {
  photos: Photo[] = [];
  loading = false;
  loaded = false;
  totalPhotos = 0;
  page = 1;
  hasMore = true;
  selectedPhoto: Photo | null = null;
  private lastClickedId: number | null = null;

  private readonly subs: Subscription[] = [];

  constructor(
    public readonly api: ApiService,
    public readonly selection: SelectionService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.selection.exitSelectionMode();
    this.subs.push(
      this.selection.refresh$.subscribe(() => {
        if (this.loaded) this.resetAndScan();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.selection.exitSelectionMode();
  }

  resetAndScan(): void {
    this.photos = [];
    this.page = 1;
    this.hasMore = true;
    this.loaded = true;
    this.load();
  }

  load(): void {
    if (this.loading || !this.hasMore) return;
    this.loading = true;
    this.api.getPhotosWithoutPeople(this.page, 60).subscribe({
      next: (r) => {
        this.photos.push(...r.photos);
        this.totalPhotos = r.pagination.total;
        this.hasMore = this.page < r.pagination.totalPages;
        this.page++;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
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
        this.selection.selectAll(this.photos.slice(from, to + 1).map((p) => p.id));
      }
      return;
    }
    if (this.selection.isSelecting) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }
    this.selectedPhoto = photo;
  }

  closeLightbox(): void { this.selectedPhoto = null; }
  navigatePhoto(d: number): void {
    if (!this.selectedPhoto) return;
    const i = this.photos.findIndex((p) => p.id === this.selectedPhoto!.id) + d;
    if (i >= 0 && i < this.photos.length) this.selectedPhoto = this.photos[i]!;
  }
  onImageError(e: Event): void {
    const img = e.target as HTMLImageElement;
    if (img.src.endsWith('/ladybug.svg')) return;
    img.src = '/ladybug.svg';
  }
}
