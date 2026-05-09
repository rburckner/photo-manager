import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { LightboxComponent } from '../lightbox/lightbox';
import { ThumbSizeSliderComponent } from '../thumb-size-slider/thumb-size-slider';
import type { Photo } from '../../models/photo.model';

type ScoredPhoto = Photo & { meme_score: number };

@Component({
  selector: 'app-screenshots',
  standalone: true,
  imports: [CommonModule, FormsModule, LightboxComponent, ThumbSizeSliderComponent],
  template: `
    <div class="screenshots-container">
      <div class="screenshots-header">
        <h2>Memes &amp; Screenshots</h2>
        @if (scanned) {
          <span class="count">{{ totalPhotos.toLocaleString() }} candidates · score &ge; {{ minScore }}</span>
        } @else {
          <span class="hint">Click Scan to find candidates by EXIF / dimension heuristics</span>
        }
        <div class="header-actions">
          <label class="score-label" title="Higher = more strict (fewer false positives)">
            min score
            <input
              type="number" min="3" max="7" step="1"
              class="number-input"
              [(ngModel)]="minScore"
              (change)="resetAndScan()"
            />
          </label>
          <app-thumb-size-slider />
          <button class="btn-scan" (click)="resetAndScan()" [disabled]="loading">
            {{ scanned ? 'Re-scan' : 'Scan' }}
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
              <div class="score-badge" title="Heuristic score">{{ photo.meme_score }}</div>
            </div>
          }
          @if (loading) { <div class="grid-loading">Loading...</div> }
          @if (scanned && !loading && photos.length === 0) {
            <div class="empty">No candidates at score &ge; {{ minScore }}. Try lowering min score.</div>
          }
          @if (!scanned) { <div class="empty">Click <strong>Scan</strong> to begin.</div> }
        </div>
      </div>
    </div>

    @if (selectedPhoto) {
      <app-lightbox [photo]="selectedPhoto" (close)="closeLightbox()" (prev)="navigatePhoto(-1)" (next)="navigatePhoto(1)" />
    }
  `,
  styles: [`
    .screenshots-container { height: 100vh; display: flex; flex-direction: column; padding: 20px; }
    .screenshots-header {
      display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
      h2 { margin: 0; font-size: 1.2rem; color: #ddd; }
      .count, .hint { font-size: 0.8rem; color: #888; }
      .hint { font-style: italic; }
      .header-actions { margin-left: auto; display: flex; gap: 12px; align-items: center; }
    }
    .score-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.8rem; color: #aaa;
    }
    .number-input {
      width: 50px; padding: 4px 6px;
      background: #1a1a1a; border: 1px solid #444; color: #ddd; border-radius: 4px;
      font-size: 0.85rem;
    }
    .btn-scan {
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
      background: #1a3a5a; border: 1px solid #2a5a8a; color: #ace;
      &:hover:not(:disabled) { background: #2a4a6a; }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
    /* Mirror timeline pattern: scroller is its own block, grid is plain. */
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
    .score-badge {
      position: absolute; bottom: 4px; right: 4px;
      font-size: 0.7rem; color: #ddd; background: rgba(0,0,0,0.6);
      padding: 1px 6px; border-radius: 3px;
    }
    .grid-loading, .empty {
      grid-column: 1/-1; text-align: center; padding: 40px; color: #666;
    }
  `],
})
export class ScreenshotsComponent implements OnInit, OnDestroy {
  photos: ScoredPhoto[] = [];
  loading = false;
  scanned = false;
  totalPhotos = 0;
  minScore = 5;
  page = 1;
  hasMore = true;
  selectedPhoto: Photo | null = null;

  private readonly subs: Subscription[] = [];

  constructor(
    public readonly api: ApiService,
    public readonly selection: SelectionService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.selection.exitSelectionMode();
    // Reload after a bulk action (delete) fires from the selection bar.
    this.subs.push(
      this.selection.refresh$.subscribe(() => {
        if (this.scanned) this.resetAndScan();
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
    this.scanned = true;
    this.load();
  }

  load(): void {
    if (this.loading || !this.hasMore) return;
    this.loading = true;
    this.api.getScreenshotCandidates(this.page, 60, this.minScore).subscribe({
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
      return;
    }
    if (this.selection.isSelecting) {
      this.selection.toggle(photo.id);
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
