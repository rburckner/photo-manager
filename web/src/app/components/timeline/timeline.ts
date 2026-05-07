import { Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import type { TimelineGroup, PhotoSummary } from '../../models/photo.model';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

      <!-- Photo grid -->
      <div class="timeline" #scrollContainer (scroll)="onScroll()">
        @if (loading && groups.length === 0) {
          <div class="loading">Loading photos...</div>
        }

        @for (group of groups; track group.date) {
          <div class="date-group">
            <h2 class="date-header">{{ formatDate(group.date) }}</h2>
            <div class="photo-grid">
              @for (photo of group.photos; track photo.id) {
                <div
                  class="photo-card"
                  [class.video]="photo.is_video === 1"
                  (click)="openPhoto(photo)"
                >
                  <img
                    [src]="getThumbnailUrl(photo.id)"
                    [alt]="photo.file_name"
                    loading="lazy"
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

    <!-- Lightbox -->
    @if (selectedPhoto) {
      <div class="lightbox" (click)="closeLightbox()">
        <div class="lightbox-content" (click)="$event.stopPropagation()">
          @if (selectedPhoto.is_video === 1) {
            <video
              [src]="getFileUrl(selectedPhoto.id)"
              controls
              autoplay
              class="lightbox-media"
            ></video>
          } @else {
            <img
              [src]="getFileUrl(selectedPhoto.id)"
              [alt]="selectedPhoto.file_name"
              class="lightbox-media"
            />
          }
          <div class="lightbox-info">
            <span>{{ selectedPhoto.file_name }}</span>
            @if (selectedPhoto.date_taken) {
              <span>{{ selectedPhoto.date_taken | date:'medium' }}</span>
            }
          </div>
          <button class="lightbox-close" (click)="closeLightbox()">&times;</button>
        </div>
      </div>
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

    /* ── Lightbox ── */
    .lightbox {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lightbox-content {
      position: relative;
      max-width: 95vw;
      max-height: 95vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .lightbox-media {
      max-width: 95vw;
      max-height: 85vh;
      object-fit: contain;
    }

    .lightbox-info {
      display: flex;
      gap: 16px;
      padding: 12px;
      color: #aaa;
      font-size: 0.85rem;
    }

    .lightbox-close {
      position: absolute;
      top: -40px;
      right: 0;
      background: none;
      border: none;
      color: #fff;
      font-size: 2rem;
      cursor: pointer;
      padding: 4px 12px;

      &:hover { color: #ccc; }
    }
  `],
})
export class TimelineComponent implements OnInit, OnDestroy {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  groups: TimelineGroup[] = [];
  loading = false;
  hasMore = true;
  selectedPhoto: PhotoSummary | null = null;

  // Date range filter — populated dynamically from collection stats
  minDate = '';
  maxDate = new Date().toISOString().slice(0, 7);
  fromDate = '';
  toDate = this.maxDate;
  activeYear: number | null = null;
  availableYears: number[] = [];

  private currentPage = 0;
  private readonly pageSize = 100;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly api: ApiService, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Fetch actual date range from collection stats
    this.api.getStats().subscribe({
      next: (stats) => {
        const earliestYear = stats.earliestDate
          ? new Date(stats.earliestDate).getFullYear()
          : new Date().getFullYear();
        const currentYear = new Date().getFullYear();

        this.minDate = `${earliestYear}-01`;
        this.fromDate = this.minDate;

        this.availableYears = [];
        for (let y = currentYear; y >= earliestYear; y--) {
          this.availableYears.push(y);
        }
      },
    });

    this.loadMore();

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeLightbox();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  ngOnDestroy(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }
  }

  onFromDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fromDate = input.value;
    this.activeYear = null;
    this.resetAndReload();
  }

  onToDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.toDate = input.value;
    this.activeYear = null;
    this.resetAndReload();
  }

  filterByYear(year: number): void {
    this.activeYear = year;
    this.fromDate = `${year}-01`;
    this.toDate = `${year}-12`;
    this.resetAndReload();
  }

  clearYearFilter(): void {
    this.activeYear = null;
    this.fromDate = this.minDate;
    this.toDate = this.maxDate;
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

    this.api.getTimeline(this.currentPage, this.pageSize).subscribe({
      next: (response) => {
        console.debug('[Timeline] API response received', {
          groupCount: response.groups.length,
          hasMore: response.hasMore,
          fromDate: this.fromDate,
          toDate: this.toDate,
        });

        for (const newGroup of response.groups) {
          // Client-side date filter (only when range is set)
          if (this.fromDate && this.toDate) {
            const groupMonth = newGroup.date.slice(0, 7);
            if (groupMonth < this.fromDate || groupMonth > this.toDate) {
              console.debug('[Timeline] Filtering out group', { date: newGroup.date, groupMonth, fromDate: this.fromDate, toDate: this.toDate });
              continue;
            }
          }

          const existing = this.groups.find((g) => g.date === newGroup.date);
          if (existing) {
            existing.photos.push(...newGroup.photos);
            existing.count += newGroup.count;
          } else {
            this.groups.push(newGroup);
          }
        }
        this.hasMore = response.hasMore;
        this.currentPage++;
        this.loading = false;
        console.debug('[Timeline] State after load', { groupsCount: this.groups.length, loading: this.loading });
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[Timeline] API error', err);
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

  openPhoto(photo: PhotoSummary): void {
    this.selectedPhoto = photo;
  }

  closeLightbox(): void {
    this.selectedPhoto = null;
  }

  getThumbnailUrl(id: number): string {
    return this.api.getThumbnailUrl(id);
  }

  getFileUrl(id: number): string {
    return this.api.getFileUrl(id);
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
