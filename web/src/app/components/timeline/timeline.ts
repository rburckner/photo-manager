import { Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { FilterService } from '../../services/filter.service';
import { LightboxComponent } from '../lightbox/lightbox';
import type { TimelineGroup, PhotoSummary, Photo } from '../../models/photo.model';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule, LightboxComponent],
  template: `
    <div class="timeline-container">
      <!-- Date range filter bar -->
      <div class="filter-bar">
        <div class="date-range">
          <label>
            <span class="filter-label">From</span>
            <input
              type="month"
              [value]="fromDate"
              [min]="minDate"
              [max]="toDate"
              (change)="onFromDateChange($event)"
              class="date-input"
            />
          </label>
          <span class="range-separator">-</span>
          <label>
            <span class="filter-label">To</span>
            <input
              type="month"
              [value]="toDate"
              [min]="fromDate"
              [max]="maxDate"
              (change)="onToDateChange($event)"
              class="date-input"
            />
          </label>
          @if (dateError) {
            <span class="date-error">{{ dateError }}</span>
          }
        </div>

        <!-- Year quick-select pills -->
        <div class="year-pills">
          <button
            class="year-pill"
            [class.active]="!activeYear"
            (click)="clearYearFilter()"
          >
            All
          </button>
          @for (year of availableYears; track year) {
            <button
              class="year-pill"
              [class.active]="activeYear === year"
              (click)="filterByYear(year)"
            >
              {{ year }}
            </button>
          }
        </div>
      </div>

      <!-- Video hover preview uses mouseenter/leave on video cards -->
      <!-- Photo grid -->
      <div class="timeline" #scrollContainer (scroll)="onScroll()">
        @if (loading && groups.length === 0) {
          <div class="loading">Loading photos...</div>
        }

        @for (group of groups; track group.date; let gi = $index) {
          <div class="date-group">
            <h2 class="date-header">{{ formatDate(group.date) }}</h2>
            <div class="photo-grid">
              @for (photo of group.photos; track photo.id; let pi = $index) {
                <div
                  class="photo-card"
                  [class.video]="photo.is_video === 1"
                  [class.selectable]="selection.isSelecting"
                  [class.selected]="selection.isSelected(photo.id)"
                  (click)="onPhotoClick(photo, $event)"
                  (mouseenter)="photo.is_video === 1 ? onVideoHover($event, photo, true) : null"
                  (mouseleave)="photo.is_video === 1 ? onVideoHover($event, photo, false) : null"
                >
                  @if (selection.isSelecting) {
                    <div class="select-check">&#10003;</div>
                  }
                  <img
                    [src]="getThumbnailUrl(photo.id)"
                    [alt]="photo.file_name"
                    [loading]="gi === 0 && pi < 12 ? 'eager' : 'lazy'"
                    (error)="onImageError($event)"
                  />
                  @if (photo.is_video === 1) {
                    <div class="video-badge">&#9654;</div>
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (loading && groups.length > 0) {
          <div class="loading-more">Loading more...</div>
        }

        @if (!hasMore && groups.length > 0) {
          <div class="end-marker">That's everything</div>
        }

        @if (!loading && groups.length === 0) {
          <div class="empty">No photos found for this date range</div>
        }
      </div>
    </div>

    @if (selectedPhoto) {
      <app-lightbox
        [photo]="selectedPhotoFull"
        (close)="closeLightbox()"
        (prev)="navigatePhoto(-1)"
        (next)="navigatePhoto(1)"
      />
    }
  `,
  styles: [`
    .timeline-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    /* ── Filter bar ── */
    .filter-bar {
      padding: 12px 20px;
      background: #111;
      border-bottom: 1px solid #333;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex-shrink: 0;
    }

    .date-error {
      color: #e88;
      font-size: 0.8rem;
      margin-left: 8px;
    }

    .date-range {
      display: flex;
      align-items: center;
      gap: 10px;

      label {
        display: flex;
        align-items: center;
        gap: 6px;
      }
    }

    .filter-label {
      font-size: 0.8rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .date-input {
      background: #222;
      border: 1px solid #444;
      color: #e0e0e0;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 0.85rem;
      cursor: pointer;

      &:focus {
        outline: none;
        border-color: #666;
      }

      &::-webkit-calendar-picker-indicator {
        filter: invert(0.7);
      }
    }

    .range-separator {
      color: #555;
      font-size: 1.1rem;
    }

    .year-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .year-pill {
      background: #222;
      border: 1px solid #333;
      color: #aaa;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        background: #333;
        color: #fff;
      }

      &.active {
        background: #444;
        color: #fff;
        border-color: #666;
      }
    }

    /* ── Timeline ── */
    .timeline {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .date-group {
      margin-bottom: 24px;
    }

    .date-header {
      font-size: 1rem;
      font-weight: 600;
      color: #ccc;
      margin: 0 0 10px 4px;
      position: sticky;
      top: 0;
      background: #1a1a1a;
      padding: 8px 0;
      z-index: 10;
    }

    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 4px;
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

      &:hover img {
        transform: scale(1.05);
      }
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

    .loading, .loading-more, .end-marker, .empty {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .loading { font-size: 1.1rem; }
    .end-marker { font-size: 0.85rem; padding-bottom: 60px; }
    .empty { font-size: 1rem; color: #555; }

  `],
})
export class TimelineComponent implements OnInit, OnDestroy {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  groups: TimelineGroup[] = [];
  loading = false;
  hasMore = true;
  selectedPhoto: PhotoSummary | null = null;
  selectedPhotoFull!: Photo;

  dateError = '';

  // Date range filter — populated dynamically from collection stats
  minDate = '';
  maxDate = new Date().toISOString().slice(0, 7);
  fromDate = '';
  toDate = this.maxDate;
  activeYear: number | null = null;
  availableYears: number[] = [];

  private currentPage = 0;
  private readonly pageSize = 100;

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    public readonly selection: SelectionService,
    private readonly filterService: FilterService,
  ) {}

  ngOnInit(): void {
    // Restore saved filters
    const saved = this.filterService.current;
    if (saved.fromDate) this.fromDate = saved.fromDate;
    if (saved.toDate) this.toDate = saved.toDate;
    if (saved.activeYear) this.activeYear = saved.activeYear;

    // Fetch distinct years from DB (filtered, no bogus dates)
    this.api.getDistinctYears().subscribe({
      next: (years) => {
        this.availableYears = [...years].reverse(); // newest first
        if (years.length > 0) {
          this.minDate = `${years[0]}-01`;
          // Only set fromDate if no saved filter
          if (!this.fromDate) this.fromDate = this.minDate;
        }
      },
    });

    this.loadMore();

    this.selection.refresh$.subscribe(() => this.resetAndReload());
  }

  ngOnDestroy(): void {
    // Lightbox handles its own keyboard events
  }

  onFromDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fromDate = input.value;
    this.activeYear = null;
    if (!this.validateDateRange()) return;
    this.filterService.setDateRange(this.fromDate, this.toDate);
    this.resetAndReload();
  }

  onToDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.toDate = input.value;
    this.activeYear = null;
    if (!this.validateDateRange()) return;
    this.filterService.setDateRange(this.fromDate, this.toDate);
    this.resetAndReload();
  }

  private validateDateRange(): boolean {
    if (this.fromDate && this.toDate && this.fromDate > this.toDate) {
      this.dateError = 'From date must be before To date';
      return false;
    }
    this.dateError = '';
    return true;
  }

  filterByYear(year: number): void {
    this.activeYear = year;
    this.fromDate = `${year}-01`;
    this.toDate = `${year}-12`;
    this.filterService.setYear(year);
    this.resetAndReload();
  }

  clearYearFilter(): void {
    this.activeYear = null;
    this.fromDate = this.minDate;
    this.toDate = this.maxDate;
    this.filterService.setYear(null);
    this.resetAndReload();
  }

  private resetAndReload(): void {
    this.groups = [];
    this.currentPage = 0;
    this.hasMore = true;
    this.loadMore();
  }

  loadMore(): void {
    console.debug('[Timeline] loadMore called', { loading: this.loading, hasMore: this.hasMore, page: this.currentPage });
    if (this.loading || !this.hasMore) return;

    this.loading = true;

    // Build ISO date range for server-side filtering
    const after = this.fromDate ? `${this.fromDate}-01T00:00:00.000Z` : undefined;
    let before: string | undefined;
    if (this.toDate) {
      const d = new Date(`${this.toDate}-01`);
      d.setMonth(d.getMonth() + 1);
      before = d.toISOString();
    }

    this.api.getTimeline(this.currentPage, this.pageSize, after, before).subscribe({
      next: (response) => {
        for (const newGroup of response.groups) {
          const existing = this.groups.find((g) => g.date === newGroup.date);
          if (existing) {
            // Deduplicate: only add photos not already in the group
            const existingIds = new Set(existing.photos.map((p) => p.id));
            const newPhotos = newGroup.photos.filter((p) => !existingIds.has(p.id));
            existing.photos.push(...newPhotos);
            existing.count = existing.photos.length;
          } else {
            this.groups.push(newGroup);
          }
        }
        this.hasMore = response.hasMore;
        this.currentPage++;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  onScroll(): void {
    const el = this.scrollContainer.nativeElement;
    const threshold = 500;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      this.loadMore();
    }
  }

  private lastClickedId: number | null = null;

  onPhotoClick(photo: PhotoSummary, event: MouseEvent): void {
    // Ctrl/Cmd+click: toggle single selection
    if (event.ctrlKey || event.metaKey) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }

    // Shift+click: range select from last clicked
    if (event.shiftKey && this.lastClickedId !== null && this.selection.isSelecting) {
      const allPhotos = this.groups.flatMap((g) => g.photos);
      const startIdx = allPhotos.findIndex((p) => p.id === this.lastClickedId);
      const endIdx = allPhotos.findIndex((p) => p.id === photo.id);
      if (startIdx >= 0 && endIdx >= 0) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const rangeIds = allPhotos.slice(from, to + 1).map((p) => p.id);
        this.selection.selectAll(rangeIds);
      }
      return;
    }

    // In selection mode: toggle
    if (this.selection.isSelecting) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }

    // Normal click: open lightbox
    this.openPhoto(photo);
  }

  openPhoto(photo: PhotoSummary): void {
    this.selectedPhoto = photo;
    this.selectedPhotoFull = photo as Photo;
  }

  closeLightbox(): void {
    this.selectedPhoto = null;
  }

  navigatePhoto(direction: number): void {
    if (!this.selectedPhoto) return;

    const allPhotos = this.groups.flatMap((g) => g.photos);
    const currentIdx = allPhotos.findIndex((p) => p.id === this.selectedPhoto!.id);
    const newIdx = currentIdx + direction;

    if (newIdx >= 0 && newIdx < allPhotos.length) {
      const photo = allPhotos[newIdx]!;
      this.selectedPhoto = photo;
      this.selectedPhotoFull = photo as Photo;
    }
  }

  onVideoHover(event: Event, photo: { id: number }, enter: boolean): void {
    const card = (event.target as HTMLElement).closest('.photo-card') as HTMLElement;
    if (!card) return;

    if (enter) {
      // Create video element for preview
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

  getThumbnailUrl(id: number): string {
    return this.api.getThumbnailUrl(id);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
